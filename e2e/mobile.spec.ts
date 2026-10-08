import { expect, test, type Page } from '@playwright/test';
import { registerBuyer, settle } from './helpers';

/**
 * The public site on phones (360 × 740 and 390 × 844): nothing scrolls sideways, every control is
 * at least 44 px to tap (links inside running text excepted), and no form field's text is under
 * 16 px (iPhones zoom into smaller ones).
 */
const PHONES = [{ width: 360, height: 740 }, { width: 390, height: 844 }];

interface Problems { overflow: number; smallTargets: string[]; smallInputs: string[] }

const audit = (page: Page): Promise<Problems> =>
  page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[aria-hidden="true"], .leaflet-container, .sr-only');
    };
    const name = (el: Element) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent).trim().slice(0, 40)}"`;
    // A link inside a sentence is exempt (WCAG 2.5.8 "inline" exception)
    const inline = (el: Element) => el.tagName === 'A' && el.closest('p, li > p, dd') !== null && getComputedStyle(el).display === 'inline';
    const smallTargets = [...document.querySelectorAll('a[href], button, [role="button"], input:not([type="hidden"]), select, summary')]
      .filter(el => visible(el) && !inline(el) && !(el instanceof HTMLInputElement && ['radio', 'checkbox'].includes(el.type) && el.closest('label')))
      .filter(el => { const r = el.getBoundingClientRect(); return Math.round(r.height) < 44 || Math.round(r.width) < 44; })
      .map(el => { const r = el.getBoundingClientRect(); return `${name(el)} ${String(Math.round(r.width))}×${String(Math.round(r.height))}`; });
    const smallInputs = [...document.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), select, textarea')]
      .filter(el => visible(el) && parseFloat(getComputedStyle(el).fontSize) < 16)
      .map(el => `${name(el)} ${getComputedStyle(el).fontSize}`);
    return { overflow, smallTargets: [...new Set(smallTargets)], smallInputs };
  });

const PAGES = ['/', '/nurseries', '/nurseries?view=list', '/library', '/library/mvule', '/news', '/free-seedlings', '/services', '/feedback', '/survey', '/login', '/register', '/forgot-password', '/credits', '/no-such-page'];

for (const phone of PHONES) {
  test.describe(`phones at ${String(phone.width)} px`, () => {
    test.use({ viewport: phone, hasTouch: true, isMobile: true });

    test('public pages fit the screen', async ({ page }) => {
      const report: Record<string, Problems> = {};
      for (const path of PAGES) {
        await page.goto(path);
        await settle(page, 1200);
        report[path] = await audit(page);
      }
      // The nursery card, a news article and a campaign (found through their lists)
      await page.goto('/nurseries?view=list');
      await page.getByRole('list').getByRole('link').or(page.getByRole('list').getByRole('button')).first().click();
      await settle(page, 1200);
      report['nursery card'] = await audit(page);
      await page.goto('/news');
      await page.locator('main a[href^="/news/"]').first().click();
      await settle(page, 1200);
      report['news article'] = await audit(page);
      await page.goto('/free-seedlings');
      await page.locator('main a[href^="/free-seedlings/"]').first().click();
      await settle(page, 1200);
      report.campaign = await audit(page);

      console.log(JSON.stringify(report, null, 1));
      for (const [where, p] of Object.entries(report)) expect.soft(p, where).toEqual({ overflow: 0, smallTargets: [], smallInputs: [] });
    });

    test('signed-in pages fit the screen', async ({ page }) => {
      await registerBuyer(page);
      const report: Record<string, Problems> = {};
      await page.goto('/nurseries?view=list');
      await page.getByRole('list').getByRole('link').or(page.getByRole('list').getByRole('button')).first().click();
      await page.getByRole('link', { name: 'Order' }).click();
      await settle(page, 1200);
      report.checkout = await audit(page);
      await page.goto('/orders');
      await settle(page, 1200);
      report.orders = await audit(page);
      console.log(JSON.stringify(report, null, 1));
      for (const [where, p] of Object.entries(report)) expect.soft(p, where).toEqual({ overflow: 0, smallTargets: [], smallInputs: [] });
    });
  });
}
