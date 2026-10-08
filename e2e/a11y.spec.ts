import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { adminPage, registerBuyer, settle } from './helpers';

/**
 * Accessibility pass: axe-core (WCAG 2.1 A and AA) on every screen, in the states people actually
 * see them (open card, open dialog, filled forms), at phone and desktop widths. Every violation
 * on every screen is collected first and reported together, so one run shows all that needs fixing.
 */
type Found = { screen: string; id: string; impact: string; help: string; targets: string[] };
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const scan = async (page: Page, screen: string, found: Found[]) => {
  await settle(page, 500);
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  for (const v of violations) {
    found.push({ screen, id: v.id, impact: v.impact ?? '?', help: v.help, targets: v.nodes.slice(0, 4).map(n => n.target.join(' ')) });
  }
};

const report = (found: Found[]) =>
  found.map(f => `\n[${f.impact}] ${f.screen}: ${f.id} (${f.help})\n    ${f.targets.join('\n    ')}`).join('');

const WIDTHS = [{ width: 375, height: 812 }, { width: 1280, height: 800 }];

test.describe('accessibility (axe, WCAG 2.1 AA)', () => {
  test.use({ geolocation: { latitude: 0.3533, longitude: 32.7553 }, permissions: ['geolocation'] });

  test('public site', async ({ page }) => {
    test.setTimeout(600_000);
    const found: Found[] = [];
    const species = (await (await page.request.get('/api/v1/species?limit=1')).json()) as { data: { slug: string }[] };
    const news = (await (await page.request.get('/api/v1/news?limit=1')).json()) as { data: { slug: string }[] };
    const campaigns = (await (await page.request.get('/api/v1/campaigns?limit=1')).json()) as { data: { id: string }[] };
    const paths = ['/', '/nurseries?view=list', '/nurseries', '/library', `/library/${species.data[0]?.slug ?? ''}`, '/news', '/services', `/news/${news.data[0]?.slug ?? ''}`,
      '/free-seedlings', `/free-seedlings/${campaigns.data[0]?.id ?? ''}`, '/login', '/register', '/forgot-password', '/credits', '/no-such-page'];
    for (const size of WIDTHS) {
      await page.setViewportSize(size);
      const w = String(size.width);
      for (const path of paths) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await scan(page, `${path} @${w}`, found);
      }
      // Nursery card, the tree drawer and directions
      await page.goto('/nurseries?view=list&q=Mukono%20Town');
      await page.getByRole('main').getByRole('list').getByRole('button', { name: /Mukono Town Nursery/ }).click();
      await expect(page.getByRole('heading', { name: 'In stock' })).toBeVisible();
      await scan(page, `nursery card @${w}`, found);
      await page.getByRole('button', { name: 'Sort by nearest' }).or(page.getByRole('button', { name: 'Get directions' })).last().click();
      await scan(page, `nursery card action @${w}`, found);
    }
    expect(found, report(found)).toEqual([]);
  });

  test('signed-in buyer: checkout and orders', async ({ page }) => {
    test.setTimeout(180_000);
    const found: Found[] = [];
    await page.setViewportSize(WIDTHS[0] ?? { width: 375, height: 812 });
    await registerBuyer(page, 'Akello Grace');
    await page.goto('/nurseries?q=Mukono%20Town&view=list');
    await page.getByRole('main').getByRole('list').getByRole('button', { name: /Mukono Town Nursery/ }).click();
    await page.getByRole('link', { name: 'Order', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'How many seedlings?' })).toBeVisible();
    await scan(page, 'checkout: seedlings', found);
    await page.getByRole('button', { name: /^More / }).first().click();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('heading', { name: 'How will you get them?' })).toBeVisible();
    await scan(page, 'checkout: delivery', found);
    await page.getByRole('button', { name: 'Next' }).click(); // shows the inline errors
    await scan(page, 'checkout: delivery errors', found);
    await page.goto('/orders');
    await scan(page, 'my orders (empty)', found);
    expect(found, report(found)).toEqual([]);
  });

  test('admin console', async ({ browser }) => {
    test.setTimeout(900_000);
    const found: Found[] = [];
    const page = await adminPage(browser);
    const first = async (api: string) => ((await (await page.request.get(api)).json()) as { data: { id: string }[] }).data[0]?.id ?? '';
    const nursery = await first('/api/v1/nurseries?limit=1');
    const species = await first('/api/v1/species?limit=1');
    const campaign = await first('/api/v1/campaigns?limit=1');
    const paths = ['/', '/insights', '/nurseries', `/nurseries/${nursery}`, '/nurseries/new', `/inventory?nursery=${nursery}`, '/species', `/species/${species}`, '/news', '/news/new', '/service-requests',
      '/delivery-rates', '/campaigns', `/campaigns/${campaign}`, `/campaigns/${campaign}/applications`, '/orders', '/payouts?status=all', '/audit-log', '/shadow'];
    // Every screen at desktop width (where admins mostly work), and the busiest ones on a phone
    const phone = new Set(['/', '/nurseries', `/nurseries/${nursery}`, '/orders', '/shadow']);
    for (const size of WIDTHS) {
      await page.setViewportSize(size);
      for (const path of paths.filter(p => size.width > 400 || phone.has(p))) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await scan(page, `admin ${path} @${String(size.width)}`, found);
      }
    }
    // A dialog and an expanded audit entry
    await page.goto('/audit-log');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // A fresh database may have no entries yet (this spec runs first)
    const diff = page.getByRole('button', { name: /^Show changes/ }).first();
    if (await diff.count()) {
      await diff.click();
      await scan(page, 'admin audit diff', found);
    }
    await page.goto('/news/new');
    await page.getByRole('button', { name: 'Save' }).click();
    await scan(page, 'admin news form errors', found);
    await page.context().close();
    expect(found, report(found)).toEqual([]);
  });
});
