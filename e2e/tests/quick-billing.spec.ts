import { test, expect } from '@playwright/test';

/**
 * Test Suite: Quick Billing Flow
 * Tests that Quick Billing tab loads and key UI elements are present.
 */
test.describe('Quick Billing', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=SIYA BILL SYSTEM')).toBeVisible({ timeout: 15000 });
    // Navigate to Quick Billing
    await page.click('text=Quick Billing');
    // Wait for lazy chunk to load
    await page.waitForTimeout(2500);
  });

  test('should load Quick Billing tab without errors', async ({ page }) => {
    // No error UI should be shown
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).not.toContain('something went wrong');
    expect(bodyText?.toLowerCase()).not.toContain('error boundary');
  });

  test('should show billing-related UI elements', async ({ page }) => {
    const bodyText = await page.textContent('body');
    // Should contain billing-related terms
    expect(bodyText?.toLowerCase()).toMatch(/bill|amount|total|item|menu/);
  });

  test('should not crash on rapid tab switches', async ({ page }) => {
    // Switch between tabs rapidly
    await page.click('text=Dashboard');
    await page.waitForTimeout(500);
    await page.click('text=Quick Billing');
    await page.waitForTimeout(500);
    await page.click('text=Dashboard');
    await page.waitForTimeout(1000);

    // App should still be functional
    await expect(page.locator('text=SIYA BILL SYSTEM')).toBeVisible();
  });
});
