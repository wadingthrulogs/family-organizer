import { chromium } from '@playwright/test';

/**
 * Default dashboard config for tests — matches the app's DEFAULT_DASHBOARD_CONFIG.
 * Kept in sync with frontend/src/types/dashboard.ts so tests always run against
 * a known baseline, regardless of any mutations from previous runs.
 */
const DEFAULT_DASHBOARD_CONFIG = {
  slots: [
    { widgetId: 'clock',         layout: { i: 'slot-0', x: 0, y: 0, w: 4, h: 2, minW: 2, minH: 2 } },
    { widgetId: 'weather',       layout: { i: 'slot-1', x: 4, y: 0, w: 4, h: 2, minW: 3, minH: 2 } },
    { widgetId: 'overdueChores', layout: { i: 'slot-2', x: 8, y: 0, w: 4, h: 2, minW: 3, minH: 2 } },
    { widgetId: 'events',        layout: { i: 'slot-3', x: 0, y: 2, w: 8, h: 3, minW: 5, minH: 3 } },
    { widgetId: 'tasks',         layout: { i: 'slot-4', x: 8, y: 2, w: 4, h: 3, minW: 3, minH: 2 } },
  ],
};

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

  // Reset the test account's dashboard + kiosk configs to a known baseline
  // before any tests run. Individual tests are free to mutate state; this
  // ensures every test run starts from the same layout.
  const resetRes = await page.request.patch('http://localhost/api/v1/settings/me', {
    data: {
      dashboardConfig: DEFAULT_DASHBOARD_CONFIG,
      kioskConfig: DEFAULT_DASHBOARD_CONFIG,
    },
  });
  if (!resetRes.ok()) {
    const body = await resetRes.text();
    throw new Error(`Failed to reset dashboard config: ${resetRes.status()} ${body}`);
  }

  // Clear localStorage on the Playwright page so the first page load after
  // login reads the freshly-reset server config (via the sync effect) rather
  // than any stale localStorage copy from a prior run. We seed the correct
  // dashboard-config into localStorage so hasStoredDashboardConfig() returns
  // true on test pages — otherwise the sync effect pulls server which is
  // also reset, but we want deterministic behavior.
  await page.goto('http://localhost/');
  await page.evaluate((cfg) => {
    localStorage.setItem('dashboard-config', JSON.stringify(cfg));
    localStorage.setItem('kiosk-config', JSON.stringify(cfg));
  }, DEFAULT_DASHBOARD_CONFIG);

  // Save auth state (cookies + localStorage) for all tests to reuse
  await page.context().storageState({ path: 'auth-state.json' });
  await browser.close();
}

export default globalSetup;
