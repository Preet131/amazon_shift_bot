import { chromium } from "playwright";
import User from "../models/User.js";
import { ensureValidToken } from "../services/amazonAuthService.js";

/**
 * Scrapes available shifts for a user using their stored session.
 * Uses stored cookies + access token — never re-logs in or triggers OTP.
 *
 * @param {string} userId - Mongoose User _id
 * @returns {Array} shifts - array of shift objects
 */
export async function scrapeShifts(userId) {
  // 1. Ensure we have a valid (possibly silently refreshed) token
  const accessToken = await ensureValidToken(userId);

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

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  });

  // 2. Restore stored cookies so Amazon treats this as the same session
  if (user.amazonCookies) {
    try {
      const parsed = JSON.parse(user.amazonCookies);
      
      // If it's the raw string we injected ("cookie1=val1; cookie2=val2") wrapped in our fake session object:
      if (Array.isArray(parsed) && parsed.length === 1 && parsed[0].name === "session" && parsed[0].value.includes("=")) {
        const rawString = parsed[0].value;
        const formattedCookies = rawString.split(';').filter(Boolean).map(c => {
          const parts = c.split('=');
          return {
            name: parts[0].trim(),
            value: parts.slice(1).join('=').trim(),
            domain: '.amazon.ca',
            path: '/'
          };
        });
        await context.addCookies(formattedCookies);
      } else {
        await context.addCookies(parsed);
      }
    } catch {
      console.warn("⚠️  Could not parse stored cookies. They might be invalid or empty.");
    }
  }

  const page = await context.newPage();

  // 3. Inject token into every outgoing request header
  await page.setExtraHTTPHeaders({
    Authorization: `Bearer ${accessToken}`,
  });

  // 4. Intercept JSON API responses that contain shift data
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
    // 5. Navigate to the schedule / shifts page
    await page.goto("https://hiring.amazon.ca/app#/schedule", {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    // Give lazy-loaded content time to settle
    await page.waitForTimeout(5_000);

    // 6. Fallback — try DOM scraping if API interception returned nothing
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