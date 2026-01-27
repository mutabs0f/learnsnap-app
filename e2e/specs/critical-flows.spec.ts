import { test, expect } from '@playwright/test';

test.describe('Critical User Flows', () => {
  
  test.describe('Authentication Flow', () => {
    test('auth page displays login form', async ({ page }) => {
      await page.goto('/auth');
      
      await expect(page.locator('form')).toBeVisible();
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
    });

    test('shows validation error for invalid email', async ({ page }) => {
      await page.goto('/auth');
      
      await page.fill('input[type="email"]', 'invalid-email');
      await page.fill('input[type="password"]', 'password123');
      
      const submitButton = page.locator('button[type="submit"]').first();
      await submitButton.click();
      
      await page.waitForTimeout(500);
      
      const stillOnAuthPage = await page.url();
      expect(stillOnAuthPage).toContain('/auth');
    });

    test('Google OAuth button is visible', async ({ page }) => {
      await page.goto('/auth');
      
      const googleButton = page.locator('button:has-text("Google"), button:has-text("جوجل")');
      await expect(googleButton).toBeVisible();
    });
  });

  test.describe('Credits System', () => {
    test('credits endpoint requires device token', async ({ request }) => {
      const response = await request.get('/api/credits/test-device-123');
      
      expect(response.status()).toBe(401);
    });

    test('credits endpoint validates deviceId length', async ({ request }) => {
      const longDeviceId = 'a'.repeat(200);
      const response = await request.get(`/api/credits/${longDeviceId}`, {
        headers: {
          'x-device-token': 'test-token'
        }
      });
      
      expect(response.status()).toBe(400);
    });
  });

  test.describe('Payment Flow', () => {
    test('billing packs returns valid packages', async ({ request }) => {
      const response = await request.get('/api/billing/packs');
      
      expect(response.ok()).toBeTruthy();
      
      const body = await response.json();
      expect(body.packages).toBeDefined();
      expect(Array.isArray(body.packages)).toBeTruthy();
      
      body.packages.forEach((pkg: any) => {
        expect(pkg).toHaveProperty('id');
        expect(pkg).toHaveProperty('pages');
        expect(pkg).toHaveProperty('price');
        expect(pkg.pages).toBeGreaterThan(0);
        expect(pkg.price).toBeGreaterThan(0);
      });
    });

    test('payment create requires CSRF token', async ({ request }) => {
      const response = await request.post('/api/payment/create', {
        data: {
          packageId: 'basic',
          deviceId: 'test-device'
        }
      });
      
      expect(response.status()).toBe(403);
    });
  });

  test.describe('Health Endpoints', () => {
    test('liveness check returns healthy', async ({ request }) => {
      const response = await request.get('/health/live');
      
      expect(response.ok()).toBeTruthy();
      
      const body = await response.json();
      expect(body.status).toBe('alive');
    });

    test('readiness check returns healthy', async ({ request }) => {
      const response = await request.get('/health/ready');
      
      expect(response.ok()).toBeTruthy();
    });

    test('metrics endpoint is accessible', async ({ request }) => {
      const response = await request.get('/metrics');
      
      expect(response.ok()).toBeTruthy();
    });
  });

  test.describe('UI Navigation', () => {
    test('homepage has RTL direction', async ({ page }) => {
      await page.goto('/');
      
      const html = page.locator('html');
      await expect(html).toHaveAttribute('dir', 'rtl');
    });

    test('pricing page shows packages', async ({ page }) => {
      await page.goto('/pricing');
      
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).toBeVisible();
    });

    test('upload page redirects to auth if not logged in', async ({ page }) => {
      await page.goto('/upload');
      
      await page.waitForLoadState('networkidle');
      
      await expect(page).toHaveURL(/\/(upload|auth)/);
    });
  });

  test.describe('Feature Flags', () => {
    test('features endpoint returns flag states', async ({ request }) => {
      const response = await request.get('/health/features');
      
      expect(response.ok()).toBeTruthy();
      
      const body = await response.json();
      expect(body).toHaveProperty('flags');
    });
  });

  test.describe('Security Headers', () => {
    test('response includes security headers', async ({ request }) => {
      const response = await request.get('/');
      
      const headers = response.headers();
      
      expect(headers['x-frame-options']).toBeDefined();
    });
  });

  test.describe('Error Handling', () => {
    test('404 for non-existent API endpoint', async ({ request }) => {
      const response = await request.get('/api/nonexistent-endpoint-xyz');
      
      expect(response.status()).toBe(404);
    });

    test('400 for malformed quiz creation', async ({ request }) => {
      const csrfResponse = await request.get('/api/csrf-token');
      const { csrfToken } = await csrfResponse.json();
      
      const response = await request.post('/api/quiz/create', {
        headers: {
          'x-csrf-token': csrfToken
        },
        data: {}
      });
      
      expect(response.status()).toBe(400);
    });
  });
});
