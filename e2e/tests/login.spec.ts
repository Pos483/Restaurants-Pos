import { test, expect } from '@playwright/test';

/**
 * Test Suite: Login Flow
 * Tests that the login screen is shown, credentials work, and user reaches dashboard.
 * 
 * Prerequisites: TEST_EMAIL and TEST_PASSWORD must be set (handled in auth.setup.ts)
 */
test.describe('Login Flow', () => {

  // This test runs WITHOUT the authenticated state (tests the login page itself)
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should show login screen when not authenticated', async ({ page }) => {
    await page.goto('/');
    // Login screen should be visible
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('should reject invalid credentials', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('input[type="email"]');

    await page.fill('input[type="email"]', 'wrong@test.com');
    await page.fill('input[type="password"]', 'wrongpassword123');
    await page.click('button[type="submit"]');

    // Should show an error message (not navigate away)
    await page.waitForTimeout(3000);
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('should show Siya Bill branding on login page', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('input[type="email"]');
    // Branding should be visible somewhere on login screen
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toContain('siya');
  });
});
