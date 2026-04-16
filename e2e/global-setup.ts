import { chromium } from '@playwright/test';

async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost/login');
  await page.waitForTimeout(1000);
  await page.getByLabel('Username').click();
  await page.getByLabel('Username').type('testuser', { delay: 30 });
  await page.getByLabel('Password').click();
  await page.getByLabel('Password').type('TestPass123!', { delay: 30 });
  await page.click('button:has-text("Sign in")');
  await page.waitForURL((url) => !url.pathname.includes('login'), { timeout: 10000 });

  // Save auth state for all tests to reuse
  await page.context().storageState({ path: 'auth-state.json' });
  await browser.close();
}

export default globalSetup;
