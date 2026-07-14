import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  /* Run tests in parallel */
  fullyParallel: false,
  /* Fail build on test failure */
  forbidOnly: !!process.env.CI,
  /* Retry once on failure */
  retries: 1,
  /* Single worker for stability */
  workers: 1,
  /* Reporter */
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],

  use: {
    /* Base URL for all tests */
    baseURL: 'http://localhost:5173',
    /* Collect traces on failure */
    trace: 'on-first-retry',
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    /* Video on retry */
    video: 'on-first-retry',
    /* Viewport */
    viewport: { width: 1280, height: 800 },
  },

  projects: [
    /* Setup: login once and save storage state */
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    /* All other tests reuse the authenticated session */
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  /* Start dev server automatically before tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
