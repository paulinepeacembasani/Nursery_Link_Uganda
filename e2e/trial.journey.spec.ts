import { expect, test } from '@playwright/test';
import { TRIAL } from './env';
import { adminPage, randomMtnPhone, settle } from './helpers';

/**
 * Trial mode end to end: no SMS code at sign-up, no payment step, and the admin and buyer sides
 * linked through one order. Opt-in (the API must run with the switches off):
 *   E2E_TRIAL=1 npx playwright test e2e/trial.journey.spec.ts
 */
const DIR = 'docs/screenshots/trial';

test.describe('trial mode', () => {
  test.skip(!TRIAL, 'Set E2E_TRIAL=1 to run the API in trial mode');

  test('sign up without a code, order without paying, admin dispatches, buyer confirms, completed', async ({ page, browser }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 375, height: 812 });

    // Sign up: straight in, no code screen
    await page.goto('/register?next=/nurseries');
    await page.getByLabel('Full name').fill('Nalubega Joan');
    await page.getByLabel(/Phone number/).fill(randomMtnPhone());
    await page.getByLabel('Password', { exact: true }).fill('seedlings-2026');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL(u => u.pathname === '/nurseries');
    await expect(page.getByRole('heading', { name: 'Enter the code we sent you' })).toHaveCount(0);

    // Order from Mukono Town Nursery, collecting it
    await page.goto('/nurseries?q=Mukono%20Town&view=list');
    await page.getByRole('main').getByRole('list').getByRole('button', { name: /Mukono Town Nursery/ }).click();
    await page.getByRole('link', { name: 'Order', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'How many seedlings?' })).toBeVisible();
    const more = page.getByRole('button', { name: /^More / }).first();
    for (let i = 0; i < 3; i++) await more.click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByText("I'll collect").click();
    await page.getByRole('button', { name: 'Next' }).click();

    // No payment step: a note and "Place order"
    await expect(page.getByRole('heading', { name: 'No payment needed' })).toBeVisible();
    // No payment choices or paying number at checkout
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expect(page.getByLabel('Paying phone number')).toHaveCount(0);
    await settle(page, 300);
    await page.screenshot({ path: `${DIR}/checkout-place-order-mobile.png`, fullPage: true });
    await page.getByRole('button', { name: /^Place order · UGX / }).click();
    await expect(page.getByText('Confirmed — nursery notified').first()).toBeVisible();
    const orderId = /\/orders\/([0-9a-f-]+)/.exec(page.url())?.[1] ?? '';
    await settle(page);
    await page.screenshot({ path: `${DIR}/order-confirmed-mobile.png`, fullPage: true });

    // The admin sees it, marked as a trial order, and dispatches it
    const admin = await adminPage(browser);
    await admin.goto('/orders');
    await expect(admin.getByText('Confirmed (trial, no payment)').first()).toBeVisible();
    await admin.goto(`/orders/${orderId}`);
    await expect(admin.getByText('No payment (trial)')).toBeVisible();
    await admin.getByRole('button', { name: 'Mark dispatched' }).click();
    await admin.getByRole('dialog').getByLabel(/Reason/).fill('Nursery called: ready to collect');
    await admin.getByRole('dialog').getByRole('button', { name: 'Mark dispatched' }).click();
    await expect(admin.getByText('Nursery called: ready to collect')).toBeVisible();
    await settle(admin, 300);
    await admin.screenshot({ path: `${DIR}/admin-order-desktop.png`, fullPage: true });

    // The buyer collects and confirms; the order completes
    await page.reload();
    await expect(page.getByText('Ready to collect').first()).toBeVisible();
    await page.getByRole('button', { name: 'Confirm delivery' }).click();
    await page.getByRole('button', { name: 'Yes, confirm delivery' }).click();
    await expect.poll(async () => {
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
      return page.getByText('Completed', { exact: true }).first().isVisible();
    }, { timeout: 30_000, intervals: [1000] }).toBe(true);
    await settle(page);
    await page.screenshot({ path: `${DIR}/order-completed-mobile.png`, fullPage: true });
    await admin.reload();
    await expect(admin.getByText('Completed').first()).toBeVisible();
    await admin.context().close();
  });
});
