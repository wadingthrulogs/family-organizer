import { test, expect } from '@playwright/test';

/**
 * One settings sheet drives three displays, and each keeps its layout in its
 * own localStorage key and its own UserPreference column. "Reset layout" used
 * to write the dashboard's key whichever display you were on, so resetting the
 * guest wall display silently replaced the family dashboard's layout too.
 *
 * These assert that each display's reset stays in its own lane.
 */

type Slots = { dashboard: number | null; kiosk: number | null; guest: number | null };

const localSlots = (page: import('@playwright/test').Page): Promise<Slots> =>
  page.evaluate(() => {
    const read = (k: string) => {
      try {
        const v = JSON.parse(localStorage.getItem(k) ?? 'null');
        return v && Array.isArray(v.slots) ? v.slots.length : null;
      } catch {
        return null;
      }
    };
    return { dashboard: read('dashboard-config'), kiosk: read('kiosk-config'), guest: read('guest-config') };
  });

const serverSlots = (page: import('@playwright/test').Page): Promise<Slots> =>
  page.evaluate(async () => {
    const d = await (await fetch('/api/v1/settings/me', { credentials: 'include' })).json();
    const n = (v: { slots?: unknown[] } | null) => (v && Array.isArray(v.slots) ? v.slots.length : null);
    return { dashboard: n(d.dashboardConfig), kiosk: n(d.kioskConfig), guest: n(d.guestConfig) };
  });

/** Make the dashboard distinguishable from its default (5 slots) by adding one. */
async function addAWidgetToTheDashboard(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForSelector('.react-grid-item', { timeout: 15000 });
  const before = await page.locator('.react-grid-item').count();

  await page.click('button[aria-label="Dashboard settings"]');
  await page.getByRole('button', { name: /Edit dashboard/ }).click();
  await page.getByRole('button', { name: /Add widget/ }).click();
  await page.getByRole('button', { name: /Grocery/ }).first().click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await expect(page.locator('.react-grid-item')).toHaveCount(before + 1);
  return before + 1;
}

test.describe('Reset layout stays on the display you are on', () => {
  test('resetting the guest display leaves the dashboard alone', async ({ page }) => {
    const dashboardCount = await addAWidgetToTheDashboard(page);

    await page.goto('/guest');
    await page.waitForSelector('.react-grid-item', { timeout: 15000 });

    await page.locator('button[aria-label="Dashboard settings"], button:has-text("⚙")').last().click();
    await page.getByRole('button', { name: /Edit guest display/ }).click();
    await page.getByRole('button', { name: /Reset guest display layout/ }).click();
    await page.waitForTimeout(1500);

    const local = await localSlots(page);
    const server = await serverSlots(page);
    expect(local.dashboard, 'guest reset must not touch dashboard-config').toBe(dashboardCount);
    expect(server.dashboard, 'guest reset must not touch the dashboardConfig preference').toBe(dashboardCount);
    expect(local.guest, 'guest reset should write the guest default').toBeGreaterThan(0);

    await page.goto('/');
    await page.waitForSelector('.react-grid-item', { timeout: 15000 });
    await expect(page.locator('.react-grid-item')).toHaveCount(dashboardCount);
  });

  test('the sheet names the display it is acting on', async ({ page }) => {
    await page.goto('/guest');
    await page.waitForSelector('.react-grid-item', { timeout: 15000 });
    await page.locator('button[aria-label="Dashboard settings"], button:has-text("⚙")').last().click();

    await expect(page.getByText('Guest Display Settings')).toBeVisible();
    await page.getByRole('button', { name: /Edit guest display/ }).click();
    await expect(page.getByText(/your dashboard is untouched/i)).toBeVisible();
  });
});
