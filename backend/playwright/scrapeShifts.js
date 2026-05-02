import { chromium } from "playwright";
import User from "../models/User.js";
import { ensureValidToken } from "../services/amazonAuthService.js";

function parseCookiesFromStoredValue(storedCookies) {
  if (!storedCookies) return [];
  let rawList = [];
  try {
    const parsed = JSON.parse(storedCookies);
    if (Array.isArray(parsed)) {
       if (parsed.length === 1 && parsed[0]?.name === "session") {
          // Handle raw string "k=v; k2=v2" format
          const rawString = parsed[0].value || "";
          rawList = rawString.split(';').filter(c => c.includes('=')).map(c => {
            const [name, ...val] = c.split('=');
            return { name: name.trim(), value: val.join('=').trim() };
          });
       } else {
          // Handle standard array format
          rawList = parsed;
       }
    }
  } catch(e) { return []; }

  // Clean every cookie to ensure it has name, value, path, and url
  return rawList.filter(c => c && c.name).map(c => {
     const cookie = {
        name: String(c.name).trim(),
        value: String(c.value || ""),
        path: c.path || "/",
        domain: c.domain || "hiring.amazon.ca"
     };
     // Force URL to satisfy Playwright's requirement
     const cleanDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
     cookie.url = `https://${cleanDomain}`;
     
     return cookie;
  });
}


async function dismissConsentPopup(page) {
  const selectors = [
    'button:has-text("I consent")',
    'button:has-text("I Consent")',
    'button:has-text("Accept all")',
    'button:has-text("Accept All")',
    'button:has-text("Accept")',
    "#onetrust-accept-btn-handler",
  ];
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await btn.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(400);
        return true;
      }
    } catch (e) {
      // Ignore errors if button isn't found
    }
  }
  return false;
}

/**
 * Scrapes available shifts for a user using their stored session.
 * Uses stored cookies + access token — never re-logs in or triggers OTP.
 *
 * @param {string} userId - Mongoose User _id
 * @returns {Array} shifts - array of shift objects
 */
export async function scrapeShifts(userId) {
  // 1. Ensure we have a valid (possibly silently refreshed) token
  await ensureValidToken(userId);

  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  if (process.env.USE_MOCK_AMAZON === "true") {
    console.log("🛠️  [Mock] Returning fake shifts...");
    const mockShifts = [
      {
        title: "Warehouse Associate (Mock)",
        location: "Toronto (Mock)",
        pay: 22.50,
        time: "10:00 AM - 6:00 PM",
        startTime: "10:00 AM",
        endTime: "6:00 PM"
      },
      {
        title: "Sortation Associate (Mock)",
        location: "Brampton (Mock)",
        pay: 21.00,
        time: "8:00 PM - 4:00 AM",
        startTime: "8:00 PM",
        endTime: "4:00 AM"
      },
      {
        title: "Delivery Station Staff (Mock)",
        location: "Mississauga (Mock)",
        pay: 19.50,
        time: "4:00 AM - 10:00 AM",
        startTime: "4:00 AM",
        endTime: "10:00 AM"
      }
    ];
    return mockShifts;
  }

  const headless = false;
  const browser = await chromium.launch({
    headless,
    channel: "chrome",
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 768 },
    locale: "en-CA",
    timezoneId: "America/Toronto",
  });

  // 2. Restore stored cookies so Amazon treats this as the same session
  // 2. Restore stored cookies so Amazon treats this as the same session
  if (user.amazonCookies) {
    const cookiesToAdd = parseCookiesFromStoredValue(user.amazonCookies);
    if (!cookiesToAdd.length) {
      console.warn("⚠️  No usable cookies found in stored session payload.");
    } else {
      console.log(`🔍 Attempting to inject ${cookiesToAdd.length} cookies...`);
      for (const cookie of cookiesToAdd) {
        try {
          // Add them one by one to prevent a single bad cookie from crashing the bot
          await context.addCookies([cookie]);
        } catch (e) {
          console.warn(`⏩ Skipping broken cookie [${cookie.name}]: ${e.message}`);
        }
      }
      const activeCookies = await context.cookies("https://hiring.amazon.ca");
      console.log(`✅ Injected ${activeCookies.length} valid cookies.`);
    }
  }


  const page = await context.newPage();

  // 3. Intercept JSON API responses that contain shift data
  const scrapedShifts = [];

  page.on("response", async (response) => {
    const url = response.url();
    const ct = response.headers()["content-type"] || "";
    if (!ct.includes("application/json")) return;

    // Look for responses that look like shift/job listings
    if (
      url.includes("shift") ||
      url.includes("schedule") ||
      url.includes("job") ||
      url.includes("opportunity")
    ) {
      try {
        const data = await response.json();
        // Flatten whatever shape the response is
        const list = Array.isArray(data)
          ? data
          : data.shifts || data.jobs || data.results || data.items || [];

        if (list.length) {
          console.log(`📦 Captured ${list.length} shifts from: ${url}`);
          scrapedShifts.push(...list);
        }
      } catch { /* not parseable */ }
    }
  });

  try {
    // 4. Navigate to the schedule / shifts page
    await page.goto("https://hiring.amazon.ca/app#/jobSearch", {
      waitUntil: "networkidle",
      timeout: 50_000,
    });

    // Fail fast with a clear error if CloudFront blocks automation traffic.
    const html = await page.content();
    const title = await page.title().catch(() => "");
    if (
      title.includes("403 ERROR") ||
      html.includes("Generated by cloudfront") ||
      html.includes("Request blocked. We can't connect to the server for this app or website at this time.")
    ) {
      throw new Error(
        "Amazon blocked this browser session (CloudFront 403). Refresh Session JSON in Profile and retry."
      );
    }

    // Clear cookie/consent overlays that can hide shift cards.
    await dismissConsentPopup(page);

    // Give lazy-loaded content time to settle
    await page.waitForTimeout(10_000);

    // 5. Fallback — try DOM scraping if API interception returned nothing
    if (!scrapedShifts.length) {
      const domShifts = await page.evaluate(() => {
        const selectors = [
          ".shift-card",
          "[data-testid='shift-card']",
          ".schedule-item",
          ".opportunity-card",
        ];

        for (const sel of selectors) {
          const cards = [...document.querySelectorAll(sel)];
          if (cards.length) {
            return cards.map((c) => ({
              title:    c.querySelector(".title, h3, h4")?.innerText?.trim(),
              location: c.querySelector(".location, [class*='location']")?.innerText?.trim(),
              pay:      c.querySelector(".pay, [class*='pay'], [class*='wage']")?.innerText?.trim(),
              time:     c.querySelector(".time, [class*='time'], [class*='hours']")?.innerText?.trim(),
            }));
          }
        }
        return [];
      });

      if (domShifts.length) {
        console.log(`📦 Captured ${domShifts.length} shifts via DOM`);
        scrapedShifts.push(...domShifts);
      }
    }
  } catch (err) {
    console.error("❌ scrapeShifts error:", err.message);
  } finally {
    await browser.close();
  }

  console.log(`✅ Total shifts found: ${scrapedShifts.length}`);
  return scrapedShifts;
}