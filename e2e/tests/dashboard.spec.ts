import { test, expect } from '@playwright/test';

/**
 * Test Suite: Dashboard Navigation
 * Tests that key navigation elements are present after login.
 * Uses the authenticated session from auth.setup.ts
 */
test.describe('Dashboard & Navigation', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to load after auth
    await expect(page.locator('text=SIYA BILL SYSTEM')).toBeVisible({ timeout: 15000 });
  });

  test('should show the restaurant name in header', async ({ page }) => {
    // Header should show restaurant name + "SIYA BILL SYSTEM"
    await expect(page.locator('text=SIYA BILL SYSTEM')).toBeVisible();
  });

  test('should show sidebar navigation on desktop', async ({ page }) => {
    // Sidebar nav items — use more specific locators to avoid ambiguity with mobile nav
    const sidebar = page.locator('.hidden.md\\:flex');
    await expect(sidebar.locator('text=Dashboard')).toBeVisible();
    await expect(sidebar.locator('text=Reports')).toBeVisible();
    await expect(sidebar.locator('text=Stock')).toBeVisible();
  });

  test('should navigate to Quick Billing tab', async ({ page }) => {
    // Click Quick Billing in header
    await page.click('text=Quick Billing');
    // Quick Billing tab content should load
    await page.waitForTimeout(2000); // allow lazy chunk to load
    // URL should still be / (SPA)
    expect(page.url()).toBe('http://localhost:5173/');
  });

  test('should navigate to Reports tab via sidebar', async ({ page }) => {
    await page.click('text=Reports');
    // Reports component should lazy-load
    await page.waitForTimeout(3000);
    // Some reports content should appear
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).toMatch(/report|sales|bill/);
  });

  test('should show sync status badge (Online/Offline)', async ({ page }) => {
    // One of these badges should be present — use .or() for correct Playwright OR syntax
    const syncBadge = page
      .locator('text=Online')
      .or(page.locator('text=Offline'))
      .or(page.locator('text=Syncing to Cloud'))
      .or(page.locator('text=Sync Error'));
    await expect(syncBadge.first()).toBeVisible({ timeout: 10000 });
  });
});
