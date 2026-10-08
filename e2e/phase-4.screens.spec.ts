import { expect, test } from '@playwright/test';
import { shoot } from './screens';

const PHASE = 'phase-4';

test.describe('phase 4: Library, News, Home', () => {
  test('screens', async ({ page }) => {
    const visit = (path: string, ready: () => Promise<void>) => async () => {
      await page.goto(path);
      await ready();
    };
    await shoot(page, PHASE, 'home', visit('/', async () => { await expect(page.getByRole('heading', { name: 'Latest advice' })).toBeVisible(); }));
    await shoot(page, PHASE, 'library', visit('/library', async () => { await expect(page.getByRole('heading', { name: 'M', exact: true })).toBeVisible(); }));
    await shoot(page, PHASE, 'library-indigenous', visit('/library?category=indigenous', async () => { await expect(page.getByText(/trees?$/).first()).toBeVisible(); }));
    await shoot(page, PHASE, 'species-mvule', visit('/library/mvule', async () => { await expect(page.getByRole('heading', { name: 'Growth over the years' })).toBeVisible(); }));
    await shoot(page, PHASE, 'news', visit('/news', async () => { await expect(page.getByRole('heading', { name: 'News & advice' })).toBeVisible(); }));
    await shoot(page, PHASE, 'news-article', visit('/news/plant-early-in-the-second-rains', async () => { await expect(page.getByRole('heading', { name: 'Plant early in the second rains' })).toBeVisible(); }));
  });

  // NFR-3.1: finding a nursery and starting a checkout each take ≤ 3 taps from Home
  test('three-tap rule', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.getByRole('link', { name: /Find nurseries/ }).first().click(); // 1
    // The list already shows in the sheet under the map: no toggle needed
    await page.getByRole('region', { name: 'Find nurseries' }).getByRole('list').getByRole('button').first().click(); // 2: the card is open
    await expect(page.getByRole('heading', { name: 'In stock' })).toBeVisible();
    await page.getByRole('link', { name: 'Order', exact: true }).click(); // 3: checkout starts (sign-in first for visitors)
    await expect(page).toHaveURL(/\/login\?next=%2Fnurseries%2F[0-9a-f-]+%2Forder/);
  });

  test('three-tap rule, map view', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.getByRole('link', { name: /Find nurseries/ }).first().click(); // 1
    await page.getByRole('list').getByRole('button').first().click(); // 2
    await page.getByRole('link', { name: 'Order', exact: true }).click(); // 3
    await expect(page).toHaveURL(/\/login\?next=%2Fnurseries%2F[0-9a-f-]+%2Forder/);
  });
});
