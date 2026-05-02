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
  const browser = await chromium.launch({ headless: false }); // keep it false for debugging
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 }
  });
  // Mask Playwright
  await context.addInitScript("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})");
  
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

    // Handle "I consent" button if it appears
    try {
      console.log("Looking for 'I consent' button...");
      const consentBtn = page.locator('button:has-text("I consent"), button:has-text("I Consent")');
      await consentBtn.waitFor({ state: 'visible', timeout: 8000 });
      await consentBtn.click();
      console.log("✅ Clicked 'I consent' button.");
    } catch (e) {
      console.log("No 'I consent' button found or needed, proceeding...");
    }

    // Email step
    const emailSelector = 'input[type="email"], input[name="email"], input[name="username"], input[id="signInFormUsername"], input#ap_email, input[autocomplete="username"]';
    try {
      await page.waitForSelector(emailSelector, { timeout: 10_000 });
      await page.fill(emailSelector, user.amazonEmail);
    } catch (e) {
      console.log("Specific email selector failed, trying generic text input...");
      // Fallback: Just grab the first visible text-like input
      const fallbackInput = page.locator('input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])').first();
      await fallbackInput.waitFor({ state: 'visible', timeout: 5000 });
      await fallbackInput.fill(user.amazonEmail);
    }
    
    // Click Next/Submit
    await page.click('button[type="submit"], input[type="submit"], input[name="signInSubmitButton"], button:has-text("Next"), button:has-text("Continue")');

    // Password step
    const passSelector = 'input[type="password"], input[name="password"], input#ap_password';
    try {
      await page.waitForSelector(passSelector, { timeout: 10_000 });
      await page.fill(passSelector, user.amazonPassword);
      await page.locator(passSelector).press("Enter");
    } catch (e) {
      console.log("Specific password selector failed, trying generic password input...");
      const fallbackPass = page.locator('input[type="password"]').first();
      await fallbackPass.waitFor({ state: 'visible', timeout: 2000 });
      await fallbackPass.fill(user.amazonPassword);
      await fallbackPass.press("Enter");
    }
    
    // Explicitly click sign in if Enter didn't work
    try {
      console.log("Attempting to click Sign In button...");
      const locators = [
        page.getByRole('button', { name: /sign in/i }),
        page.getByRole('button', { name: /login/i }),
        page.getByRole('button', { name: /submit/i }),
        page.locator('input[type="submit"]:visible').first(),
        page.locator('.a-button-input:visible').first()
      ];
      
      let clicked = false;
      for (const loc of locators) {
        if (await loc.isVisible().catch(() => false)) {
          await loc.click();
          clicked = true;
          console.log("Clicked button!");
          break;
        }
      }
      if (!clicked) console.log("Could not find a visible sign-in button.");
    } catch (e) { 
      console.log("Error while trying to click sign in.");
    }

    console.log("Submitted password.");

    // ── OTP step / Captcha Wait ──────────────────────────────────────────────
    console.log("Waiting for OTP screen, Captcha, or successful login (up to 60s)...");
    
    const sendCodeBtn = 'button:has-text("Send verification code"), input[name="sendCode"], button[name="mfaSubmit"]';
    const otpSelector = 'input[name="code"], input[name="mfaCode"], input#auth-mfa-otpcode, input[autocomplete="one-time-code"], input[type="tel"]';
    
    let otpVisible = false;
    for (let i = 0; i < 30; i++) {
      if (captured.accessToken) {
        console.log(`[Wait Loop ${i}] 🔑 Tokens captured behind the scenes!`);
        break;
      }
      
      // Check if the intermediate "Send verification code" screen appeared
      try {
        if (await page.locator(sendCodeBtn).isVisible()) {
          console.log(`[Wait Loop ${i}] Found 'Send verification code' screen, clicking it...`);
          await page.click(sendCodeBtn, { force: true });
          await page.waitForTimeout(2000);
        }
      } catch(e) {}
      
      try {
        otpVisible = await page.locator(otpSelector).isVisible();
        console.log(`[Wait Loop ${i}] Checked primary OTP selector visibility: ${otpVisible}`);
      } catch(e) {}
      
      // Fallback: check for any visible input that might be the OTP field
      if (!otpVisible) {
         try {
           const genericInput = page.locator('input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])').first();
           if (await genericInput.isVisible()) {
             // Let's assume if a generic input appears after password, it's the OTP field!
             console.log(`[Wait Loop ${i}] Found a generic input field, assuming it's the OTP box!`);
             otpVisible = true;
           }
         } catch(e) {}
      }
      
      if (otpVisible) break;
      
      await page.waitForTimeout(2000); // Check every 2 seconds
    }

    if (otpVisible) {
      console.log("📧 OTP screen detected – initiating IMAP to read from email inbox...");
      try {
        const otp = await waitForOtp(user);
        console.log(`✅ Extracted OTP from email: ${otp}`);
        
        console.log("Attempting to fill OTP box...");
        try {
          await page.fill(otpSelector, otp, { timeout: 3000 });
          await page.locator(otpSelector).press("Enter");
        } catch(e) {
          console.log("Failed to fill using primary selector, trying generic input...");
          const genericInput = page.locator('input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])').first();
          await genericInput.fill(otp);
          await genericInput.press("Enter");
        }
        
        console.log("✅ OTP submitted. Waiting for login to finish...");
      } catch (err) {
        console.log(`❌ Error fetching OTP: ${err.message}`);
      }
      
      // Wait a bit more for login to finish after entering OTP
      for (let i = 0; i < 15; i++) {
         if (captured.accessToken) break;
         await page.waitForTimeout(2000);
      }
    } else {
      console.log("✅ No OTP required or logged in successfully.");
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
