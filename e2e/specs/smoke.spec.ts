import { test, expect } from '@playwright/test';

test.describe('LearnSnap Smoke Tests', () => {
  
  test('homepage loads correctly', async ({ page }) => {
    await page.goto('/');
    
    await expect(page.locator('h1')).toBeVisible();
    
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
  });

  test('health endpoint returns healthy', async ({ request }) => {
    const response = await request.get('/health');
    
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    expect(body.status).toBe('healthy');
  });

  test('CSRF token endpoint works', async ({ request }) => {
    const response = await request.get('/api/csrf-token');
    
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    expect(body.csrfToken).toBeDefined();
    expect(body.csrfToken.length).toBeGreaterThan(0);
  });

  test('billing packs endpoint returns packages', async ({ request }) => {
    const response = await request.get('/api/billing/packs');
    
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    expect(body.packages).toBeDefined();
    expect(body.packages.length).toBeGreaterThan(0);
  });

  test('auth page loads', async ({ page }) => {
    await page.goto('/auth');
    
    await expect(page.locator('form')).toBeVisible();
  });

  test('upload page loads', async ({ page }) => {
    await page.goto('/upload');
    
    await expect(page).toHaveURL(/\/(upload|auth)/);
  });

  test('pricing page loads', async ({ page }) => {
    await page.goto('/pricing');
    
    await expect(page.locator('body')).toBeVisible();
  });
});
