import { test as setup, expect } from '@playwright/test';
import path from 'path';

// Path where authenticated storage state will be saved
const authFile = path.join(__dirname, '.auth/user.json');

/**
 * Login setup fixture.
 * Runs once before all tests; saves session so tests don't need to log in.
 * 
 * ⚠️  Set TEST_EMAIL and TEST_PASSWORD environment variables before running:
 *   $env:TEST_EMAIL="your@email.com"; $env:TEST_PASSWORD="yourpassword"
 */
setup('authenticate', async ({ page }) => {
  const email    = process.env.TEST_EMAIL    || '';
  const password = process.env.TEST_PASSWORD || '';

  if (!email || !password) {
    throw new Error(
      '❌ TEST_EMAIL and TEST_PASSWORD environment variables must be set.\n' +
      '   PowerShell: $env:TEST_EMAIL="your@email.com"; $env:TEST_PASSWORD="pass"'
    );
  }

  await page.goto('/');

  // Wait for login form
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });

  // Fill credentials
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  // Submit
  await page.click('button[type="submit"]');

  // Wait for dashboard to appear (confirms login success)
  await expect(page.locator('text=SIYA BILL SYSTEM')).toBeVisible({ timeout: 15000 });

  // Save storage state (cookies + localStorage)
  await page.context().storageState({ path: authFile });
});
