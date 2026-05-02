import { chromium } from "playwright";
import { ensureValidToken } from "../services/amazonAuthService.js";

function parseCookiesFromUser(user) {
  if (!user?.amazonCookies) return [];
  try {
    const parsed = JSON.parse(user.amazonCookies);
    if (
      Array.isArray(parsed) &&
      parsed.length === 1 &&
      parsed[0]?.name === "session" &&
      typeof parsed[0]?.value === "string" &&
      parsed[0].value.includes("=")
    ) {
      return parsed[0].value
        .split(";")
        .filter(Boolean)
        .map((c) => {
          const parts = c.split("=");
          return {
            name: parts[0].trim(),
            value: parts.slice(1).join("=").trim(),
            // Preserve host-only behavior for manual document.cookie imports.
            url: "https://hiring.amazon.ca",
            path: "/",
          };
        });
    }
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c) => c && typeof c === "object" && c.name && c.value != null)
      .map((c) => {
        const cookie = {
          ...c,
          name: String(c.name).trim(),
          value: String(c.value),
        };
        if (!cookie.path) cookie.path = "/";
        if (!cookie.url && !cookie.domain) cookie.url = "https://hiring.amazon.ca";
        return cookie;
      });
  } catch {
    return [];
  }
}

function normalizeTimeValue(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function timeWithinWindow(label, start, end) {
  if (!start || !end) return true;
  const t = normalizeTimeValue(label);
  const from = normalizeTimeValue(start);
  const to = normalizeTimeValue(end);
  return t.includes(from) || t.includes(to);
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
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await btn.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(400);
      return true;
    }
  }
  return false;
}

async function clickFirstVisible(page, selectors, timeout = 3000) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible({ timeout }).catch(() => false)) {
      await loc.click({ timeout });
      return true;
    }
  }
  return false;
}

async function fillFirstVisible(page, selectors, value) {
  if (value == null || value === "") return false;
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
      await loc.fill(String(value));
      return true;
    }
  }
  return false;
}

async function submitContinue(page) {
  return clickFirstVisible(page, [
    'button:has-text("Continue")',
    'button:has-text("Next")',
    'button:has-text("Save and continue")',
    'button:has-text("Submit")',
    'button[type="submit"]',
    'input[type="submit"]',
  ]);
}

/**
 * Best-effort 6-screen real UI flow.
 * Returns { statusCode, body } where statusCode is inferred from API responses or UI outcome.
 */
export async function runPlaywrightAutoApplyFlow(user, shift) {
  const accessToken = await ensureValidToken(user._id);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });
  await context.addCookies(parseCookiesFromUser(user));

  const page = await context.newPage();
  await page.setExtraHTTPHeaders({ Authorization: `Bearer ${accessToken}` });

  let networkStatus = null;
  page.on("response", async (response) => {
    const url = response.url().toLowerCase();
    if (
      url.includes("apply") ||
      url.includes("application") ||
      url.includes("offer") ||
      url.includes("interview") ||
      url.includes("background")
    ) {
      const s = response.status();
      if ([200, 201, 401, 409].includes(s)) networkStatus = s;
    }
  });

  try {
    await page.goto("https://hiring.amazon.ca/app#/schedule", {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    // Consent/cookie overlays can block Apply/Create Application buttons.
    await dismissConsentPopup(page);

    // 0) Open matching shift and click "Create Application" immediately.
    const shiftTitle = String(shift?.title || "").trim();
    const shiftLocation = String(shift?.location || "").trim();
    if (shiftTitle || shiftLocation) {
      const matchExpr = `${shiftTitle} ${shiftLocation}`.trim();
      const card = page
        .locator(
          `.shift-card:has-text("${matchExpr}"), [data-testid*="shift"]:has-text("${matchExpr}"), .opportunity-card:has-text("${matchExpr}")`
        )
        .first();
      if (await card.isVisible({ timeout: 5000 }).catch(() => false)) {
        await card.click().catch(() => {});
      }
    }

    const created = await clickFirstVisible(page, [
      'button:has-text("Create Application")',
      'button:has-text("Apply")',
      'a:has-text("Create Application")',
      'a:has-text("Apply")',
    ], 7000);
    if (!created) {
      return { statusCode: 409, body: { msg: "Could not open create-application flow" } };
    }

    // 1) Screen 1: gender + work authorization
    await fillFirstVisible(page, ['select[name*="gender"]', 'input[name*="gender"]'], user.autoApplyProfile?.gender);
    await fillFirstVisible(
      page,
      ['select[name*="work"]', 'input[name*="work"]', 'textarea[name*="work"]'],
      user.autoApplyProfile?.workAuthorization
    );
    await clickFirstVisible(page, [
      'label:has-text("Yes")',
      'input[type="radio"][value="yes"]',
    ]).catch(() => {});
    await submitContinue(page);

    // 2) Screen 2: assessment replay
    const replay = user.autoApplyProfile?.assessmentReplay || {};
    if (replay && typeof replay === "object") {
      for (const [k, v] of Object.entries(replay)) {
        if (v == null) continue;
        const key = String(k).replace(/"/g, '\\"');
        const val = String(v);
        const radio = page.locator(`input[name="${key}"][value="${val}"]`).first();
        if (await radio.isVisible({ timeout: 300 }).catch(() => false)) {
          await radio.check().catch(() => {});
          continue;
        }
        await fillFirstVisible(
          page,
          [`input[name="${key}"]`, `textarea[name="${key}"]`, `select[name="${key}"]`],
          val
        );
      }
    }
    await submitContinue(page);

    // 3) Screen 3: accept job offer
    await clickFirstVisible(page, [
      'input[type="checkbox"][name*="accept"]',
      'label:has-text("I accept")',
      'label:has-text("Accept offer")',
      'button:has-text("Accept")',
    ]).catch(() => {});
    await submitContinue(page);

    // 4) Screen 4: BGC data
    await fillFirstVisible(page, ['input[name*="sin"]', 'input[id*="sin"]'], user.autoApplyProfile?.sinEncrypted);
    await fillFirstVisible(page, ['input[name*="dob"]', 'input[type="date"]'], user.autoApplyProfile?.dob);
    const addressHistory = user.autoApplyProfile?.addressHistory;
    if (Array.isArray(addressHistory) && addressHistory.length) {
      await fillFirstVisible(
        page,
        ['textarea[name*="address"]', 'textarea[id*="address"]'],
        JSON.stringify(addressHistory)
      );
    }
    await submitContinue(page);

    // 5) Screen 5: interview slot selection
    const pref = user.autoApplyProfile?.interviewPreference || "earliest";
    const winStart = user.autoApplyProfile?.interviewWindow?.start;
    const winEnd = user.autoApplyProfile?.interviewWindow?.end;
    const slots = page.locator('[data-testid*="slot"], .interview-slot, button:has-text("AM"), button:has-text("PM")');
    const slotCount = await slots.count().catch(() => 0);
    if (slotCount > 0) {
      let selected = false;
      if (pref === "preferred_window" && winStart && winEnd) {
        for (let i = 0; i < slotCount; i += 1) {
          const slot = slots.nth(i);
          const txt = (await slot.textContent().catch(() => "")) || "";
          if (timeWithinWindow(txt, winStart, winEnd)) {
            await slot.click().catch(() => {});
            selected = true;
            break;
          }
        }
      }
      if (!selected) await slots.first().click().catch(() => {});
    }
    await submitContinue(page);

    // 6) Screen 6: confirm final submission
    await clickFirstVisible(page, [
      'button:has-text("Confirm")',
      'button:has-text("Submit application")',
      'button:has-text("Finish")',
      'button:has-text("Done")',
    ], 4000).catch(() => {});

    await page.waitForTimeout(1500);
    if (networkStatus === 401) return { statusCode: 401, body: { msg: "Token expired during apply flow" } };
    if (networkStatus === 409) return { statusCode: 409, body: { msg: "Shift no longer available" } };
    if (networkStatus === 200 || networkStatus === 201) {
      return { statusCode: networkStatus, body: { msg: "Application submitted" } };
    }

    // Final UI heuristic fallback
    const successVisible = await page
      .locator('text=/application submitted|you\'re all set|thank you/i')
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    if (successVisible) return { statusCode: 201, body: { msg: "Application submitted (ui-confirmed)" } };

    return { statusCode: 500, body: { msg: "Apply flow finished without a definitive status" } };
  } catch (err) {
    return { statusCode: 500, body: { msg: err.message } };
  } finally {
    await browser.close();
  }
}
