import { test, expect } from '@playwright/test';

async function enterEditMode(page) {
  await page.click('button[aria-label="Dashboard settings"]');
  await page.getByText('Edit dashboard').click();
  // Close the settings sheet so it doesn't block widget interaction
  await page.keyboard.press('Escape');
  await page.waitForSelector('.widget-drag-handle', { timeout: 5000 });
}

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.react-grid-item', { timeout: 15000 });
  });

  test('loads and shows widgets', async ({ page }) => {
    const widgets = page.locator('.react-grid-item');
    await expect(widgets.first()).toBeVisible();
    await page.screenshot({ path: 'results/dashboard-loaded.png' });
  });

  test('enter edit mode and see drag handles', async ({ page }) => {
    await enterEditMode(page);
    await expect(page.locator('.widget-drag-handle').first()).toBeVisible();
    await page.screenshot({ path: 'results/dashboard-edit-mode.png' });
  });

  // Run the remove test BEFORE the drag tests — subsequent drags leave the
  // dashboard in states where RGL's drag placeholder can intercept clicks on
  // adjacent widget strips, making the remove button unreachable.
  test('remove widget shows undo pill', async ({ page }) => {
    await enterEditMode(page);

    const removeBtns = page.locator('button[aria-label*="Remove"]');
    const count = await removeBtns.count();
    if (count === 0) {
      test.skip(true, 'No widgets to remove');
    }
    // dispatchEvent skips the pointer event chain entirely, which is
    // necessary because react-draggable on the parent .widget-drag-handle
    // intercepts pointerdown and can absorb regular clicks under force:true.
    await removeBtns.last().dispatchEvent('click');
    await expect(page.getByText('Undo')).toBeVisible({ timeout: 3000 });

    await page.screenshot({ path: 'results/widget-removed-undo.png' });
  });

  test('drag widget does not shrink other widgets', async ({ page }) => {
    await enterEditMode(page);

    const widgets = page.locator('.react-grid-item');
    const countBefore = await widgets.count();
    const boxesBefore = [];
    for (let i = 0; i < countBefore; i++) {
      boxesBefore.push(await widgets.nth(i).boundingBox());
    }
    await page.screenshot({ path: 'results/before-drag.png' });

    const handle = page.locator('.widget-drag-handle').first();
    const hBox = await handle.boundingBox();
    if (hBox) {
      await handle.hover();
      await page.mouse.down();
      await page.mouse.move(hBox.x + 200, hBox.y, { steps: 10 });
      await page.mouse.up();
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'results/after-drag.png' });

    for (let i = 0; i < countBefore; i++) {
      const afterBox = await widgets.nth(i).boundingBox();
      if (boxesBefore[i] && afterBox) {
        expect(afterBox.height).toBeGreaterThan(boxesBefore[i].height * 0.85);
        expect(afterBox.width).toBeGreaterThan(boxesBefore[i].width * 0.85);
      }
    }
  });

  test('drag widget to far right edge stays stable', async ({ page }) => {
    await enterEditMode(page);
    await page.screenshot({ path: 'results/before-edge-drag.png' });

    const vp = page.viewportSize()!;
    const handle = page.locator('.widget-drag-handle').first();
    const hBox = await handle.boundingBox();
    if (hBox) {
      await handle.hover();
      await page.mouse.down();
      await page.mouse.move(vp.width * 0.9, hBox.y, { steps: 20 });
      await page.mouse.up();
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'results/after-edge-drag.png' });

    const widgets = page.locator('.react-grid-item');
    const count = await widgets.count();
    for (let i = 0; i < count; i++) {
      const box = await widgets.nth(i).boundingBox();
      if (box) {
        expect(box.width).toBeGreaterThan(50);
        expect(box.height).toBeGreaterThan(50);
      }
    }
  });

  test('layout persists across tab navigation', async ({ page }) => {
    // Regression guard for the portrait/md layout-wipe bug. Drag a widget,
    // navigate away, come back, and confirm the widget is in the same place.
    // Landscape project writes slot.layout; portrait project writes slot.mdLayout.
    await enterEditMode(page);

    const firstWidget = page.locator('.react-grid-item').first();
    const handle = page.locator('.widget-drag-handle').first();

    const boxBeforeDrag = await firstWidget.boundingBox();
    expect(boxBeforeDrag).not.toBeNull();

    const hBox = await handle.boundingBox();
    if (!hBox) throw new Error('drag handle not found');

    // Drag the widget to a clearly different position (200px right, 120px down)
    await handle.hover();
    await page.mouse.down();
    await page.mouse.move(hBox.x + 250, hBox.y + 120, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    const boxAfterDrag = await firstWidget.boundingBox();
    expect(boxAfterDrag).not.toBeNull();
    // Confirm the drag actually moved the widget (x OR y changed > 50px)
    const actuallyMoved =
      Math.abs((boxAfterDrag!.x ?? 0) - (boxBeforeDrag!.x ?? 0)) > 50 ||
      Math.abs((boxAfterDrag!.y ?? 0) - (boxBeforeDrag!.y ?? 0)) > 50;
    expect(actuallyMoved).toBeTruthy();
    await page.screenshot({ path: 'results/persist-after-drag.png' });

    // Reload the page — same remount flow that previously wiped mdLayout
    // in portrait. The sync effect runs fresh on mount, so this exercises
    // the hasStoredDashboardConfig guard + mdLayout read path.
    await page.reload();
    await page.waitForSelector('.react-grid-item', { timeout: 10000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'results/persist-after-navigate.png' });

    // Widget should be in the same position (within a few px tolerance for
    // sub-pixel rendering differences)
    const boxAfterNav = await page.locator('.react-grid-item').first().boundingBox();
    expect(boxAfterNav).not.toBeNull();
    const dx = Math.abs((boxAfterNav!.x ?? 0) - (boxAfterDrag!.x ?? 0));
    const dy = Math.abs((boxAfterNav!.y ?? 0) - (boxAfterDrag!.y ?? 0));
    expect(dx).toBeLessThan(10);
    expect(dy).toBeLessThan(10);
  });
});

test.describe('Tasks Page', () => {
  test('loads tasks page', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.locator('h1:has-text("Tasks")')).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'results/tasks-page.png' });
  });

  test('quick-add creates a task', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForSelector('h1', { timeout: 10000 });
    const input = page.locator('input[enterkeyhint="send"]');
    await input.click();
    await input.type('E2E test task ' + Date.now(), { delay: 30 });
    await page.click('button:has-text("Add")');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'results/tasks-after-add.png' });
  });
});

test.describe('Calendar Page', () => {
  test('loads calendar view', async ({ page }) => {
    await page.goto('/calendar');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'results/calendar-page.png' });
    const body = await page.textContent('body');
    expect(body?.length).toBeGreaterThan(100);
  });
});
