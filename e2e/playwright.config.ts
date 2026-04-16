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
    viewport: { width: 1920, height: 1080 },
    storageState: 'auth-state.json',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  outputDir: 'results',
});
