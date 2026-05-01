import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({
    headless: false // 👈 so you can SEE what's happening
  });

  const page = await browser.newPage();

  await page.goto("https://hiring.amazon.ca/");

  // wait for page to load properly
  await page.waitForTimeout(5000);

  console.log("Page loaded");

  await browser.close();
})();