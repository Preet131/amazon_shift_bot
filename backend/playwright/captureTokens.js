import { chromium } from "playwright";
import { waitForOtp } from "../services/otpService.js";

/**
 * Uses Playwright to log into hiring.amazon.ca once.
 * Intercepts ALL JSON API responses and localStorage to capture
 * access_token / refresh_token / id_token.
 * If Amazon fires an OTP challenge, reads it via IMAP automatically.
 *
 * Returns { accessToken, refreshToken, idToken, cookies }
 */
export async function captureAmazonTokens(user) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  });
  const page = await context.newPage();

  const captured = { accessToken: null, refreshToken: null, idToken: null, cookies: [] };

  // ── Intercept network responses ────────────────────────────────────────────
  page.on("response", async (response) => {
    const ct = response.headers()["content-type"] || "";
    if (!ct.includes("application/json")) return;
    try {
      const data = await response.json();
      // Standard OAuth / Cognito field names
      if (data.access_token)  captured.accessToken  = data.access_token;
      if (data.accessToken)   captured.accessToken  = data.accessToken;
      if (data.refresh_token) captured.refreshToken = data.refresh_token;
      if (data.refreshToken)  captured.refreshToken = data.refreshToken;
      if (data.id_token)      captured.idToken      = data.id_token;
      // AWS Cognito wrapper
      if (data.AuthenticationResult) {
        captured.accessToken  = data.AuthenticationResult.AccessToken  ?? captured.accessToken;
        captured.refreshToken = data.AuthenticationResult.RefreshToken ?? captured.refreshToken;
        captured.idToken      = data.AuthenticationResult.IdToken      ?? captured.idToken;
      }
      if (captured.accessToken) console.log("✅ Token captured from:", response.url());
    } catch { /* not JSON */ }
  });

  // ── Navigate + fill login form ─────────────────────────────────────────────
  try {
    await page.goto("https://hiring.amazon.ca/app#/login", { waitUntil: "networkidle", timeout: 30_000 });

    // Email step
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 15_000 });
    await page.fill('input[type="email"], input[name="email"]', user.amazonEmail);
    await page.click('button[type="submit"]');

    // Password step
    await page.waitForSelector('input[type="password"]', { timeout: 10_000 });
    await page.fill('input[type="password"]', user.amazonPassword);
    await page.click('button[type="submit"]');

    // ── OTP step (optional) ──────────────────────────────────────────────────
    const otpSelector = 'input[name="code"], input[type="tel"], input[placeholder*="code" i]';
    const otpVisible = await page.locator(otpSelector).isVisible({ timeout: 8_000 }).catch(() => false);

    if (otpVisible) {
      console.log("📧 OTP screen detected – reading from email inbox...");
      const otp = await waitForOtp(user);
      await page.fill(otpSelector, otp);
      await page.click('button[type="submit"]');
    } else {
      console.log("✅ No OTP required.");
    }

    // Wait for post-login network to settle
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(3_000);

    // ── Fallback: check localStorage for tokens ──────────────────────────────
    if (!captured.accessToken) {
      const ls = await page.evaluate(() => ({ ...localStorage }));
      for (const [k, v] of Object.entries(ls)) {
        const kl = k.toLowerCase();
        if (!captured.accessToken  && kl.includes("access"))  captured.accessToken  = v;
        if (!captured.refreshToken && kl.includes("refresh")) captured.refreshToken = v;
        if (!captured.idToken      && kl.includes("id"))      captured.idToken      = v;
      }
    }

    captured.cookies = await context.cookies();
  } catch (err) {
    console.error("❌ captureAmazonTokens error:", err.message);
  } finally {
    await browser.close();
  }

  return captured;
}
