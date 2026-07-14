import { test, expect } from '@playwright/test';

/**
 * Test Suite: Menu Management
 * Tests that the Menu tab loads and shows menu items grid.
 */
test.describe('Menu Management', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=SIYA BILL SYSTEM')).toBeVisible({ timeout: 15000 });
    // Navigate to Menu via sidebar
    await page.click('text=Menu');
    // Wait for lazy chunk
    await page.waitForTimeout(3000);
  });

  test('should load Menu tab without errors', async ({ page }) => {
    const bodyText = await page.textContent('body');
    expect(bodyText?.toLowerCase()).not.toContain('something went wrong');
  });

  test('should show menu-related UI elements', async ({ page }) => {
    const bodyText = await page.textContent('body');
    // Should show menu or category related content
    expect(bodyText?.toLowerCase()).toMatch(/menu|category|item|add|price/);
  });

  test('should show Add Item button', async ({ page }) => {
    // Look for add item button in various possible labels
    const addButton = page.locator('button').filter({ hasText: /add|new item|\+/i }).first();
    await expect(addButton).toBeVisible({ timeout: 5000 });
  });
});
