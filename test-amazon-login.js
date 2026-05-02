import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log("Navigating...");
  await page.goto("https://hiring.amazon.ca/app#/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(10000); // Wait longer for SPA redirect
  
  console.log("Looking for consent button...");
  try {
    const consentBtn = page.locator('button:has-text("I consent"), button:has-text("I Consent")');
    await consentBtn.waitFor({ state: 'visible', timeout: 8000 });
    await consentBtn.click();
    console.log("Clicked consent.");
  } catch (e) {
    console.log("No consent button.");
  }

  await page.waitForTimeout(5000); // let animations or redirects finish
  await page.screenshot({ path: "test-after-consent.png" });

  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("input")).map(i => ({
      id: i.id,
      name: i.name,
      type: i.type,
      placeholder: i.placeholder
    }));
  });
  console.log("Inputs found:", inputs);
  
  const buttons = await page.evaluate(() => Array.from(document.querySelectorAll("button")).map(b => b.innerText.trim()));
  console.log("Buttons:", buttons);

  await browser.close();
})();
