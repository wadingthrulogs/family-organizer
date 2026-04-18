import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  globalSetup: './global-setup.ts',
  use: {
    baseURL: 'http://localhost',
    screenshot: 'on',
    trace: 'retain-on-failure',
    storageState: 'auth-state.json',
  },
  projects: [
    {
      name: 'chromium-landscape',
      use: {
        browserName: 'chromium',
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      // Matches the Pi wall-display mounted in portrait (1080x1920).
      // Exercises the md breakpoint (8 cols) where mdLayout persistence lives.
      name: 'chromium-portrait',
      use: {
        browserName: 'chromium',
        viewport: { width: 1080, height: 1920 },
      },
    },
  ],
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  outputDir: 'results',
});
