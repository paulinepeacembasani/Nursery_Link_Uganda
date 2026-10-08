import { expect, test, type Page } from '@playwright/test';
import { lastSms, registerBuyer, settle, settlePayment } from './helpers';

const DIR = 'docs/screenshots/phase-5';
test.use({ geolocation: { latitude: 0.3533, longitude: 32.7553 }, permissions: ['geolocation'] });

/** From the map: open Mukono Town Nursery and start an order. */
const startOrder = async (page: Page) => {
  await page.goto('/nurseries?q=Mukono%20Town&view=list');
  await expect(page.getByRole('heading', { name: '1 nursery' })).toBeVisible();
  await page.getByRole('main').getByRole('list').getByRole('button', { name: /Mukono Town Nursery/ }).click();
  await page.getByRole('link', { name: 'Order', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'How many seedlings?' })).toBeVisible();
};

const chooseSeedlings = async (page: Page, shots = false) => {
  // Nothing chosen: says what to do instead of disabling the button
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Choose at least one tree to order.')).toBeVisible();
  const more = page.getByRole('button', { name: /^More / }).first();
  for (let i = 0; i < 3; i++) await more.click();
  if (shots) await page.screenshot({ path: `${DIR}/checkout-seedlings-${page.viewportSize()?.width === 375 ? 'mobile' : 'desktop'}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next' }).click();
};

const chooseDelivery = async (page: Page, shots = false) => {
  await expect(page.getByRole('heading', { name: 'How will you get them?' })).toBeVisible();
  // FR-25: a delivery needs a point and an address
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Choose the delivery point on the map.')).toBeVisible();
  await expect(page.getByText(/Tell the rider where to come/)).toBeVisible();
  await page.getByRole('button', { name: 'Use my location' }).click();
  const dialog = page.getByRole('dialog', { name: 'Use your location?' });
  if (await dialog.isVisible()) await page.getByRole('button', { name: 'Use my location' }).last().click();
  await page.getByLabel('Address or landmark').fill('Behind Mukono market, blue gate');
  await settle(page, 1200);
  if (shots) await page.screenshot({ path: `${DIR}/checkout-delivery-${page.viewportSize()?.width === 375 ? 'mobile' : 'desktop'}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Your quote' })).toBeVisible();
};

const pay = async (page: Page, shots = false) => {
  await expect(page.getByText(/Delivery · [\d.]+ km by road/)).toBeVisible();
  await page.getByRole('main').getByText('MTN MoMo', { exact: true }).click();
  if (shots) await page.screenshot({ path: `${DIR}/checkout-pay-${page.viewportSize()?.width === 375 ? 'mobile' : 'desktop'}.png`, fullPage: true });
  await page.getByRole('button', { name: /^Pay UGX / }).click();
  await expect(page.getByRole('heading', { name: 'Check your phone and approve the payment' })).toBeVisible();
  return /\/orders\/([0-9a-f-]+)/.exec(page.url())?.[1] ?? '';
};

test.describe('phase 5: ordering', () => {
  test('buyer registers, orders with delivery, pays, and sees "Paid — nursery notified"', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await registerBuyer(page);
    await startOrder(page);
    await chooseSeedlings(page, true);
    await chooseDelivery(page, true);
    const orderId = await pay(page, true);
    await settle(page);
    await page.screenshot({ path: `${DIR}/waiting-mobile.png`, fullPage: true });

    await settlePayment(page, orderId, 'successful');
    await expect(page.getByText('Order placed')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Paid — nursery notified').first()).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${DIR}/paid-mobile.png`, fullPage: true });

    // The nursery's SMS map link opens the order map, without an account
    // Texts go out through the background job queue: wait for the nursery's order SMS
    let sms = '';
    await expect.poll(async () => (sms = await lastSms(page, '+256700100114')), { timeout: 20_000 }).toContain(`Map: `);
    const link = new URL(/Map: (\S+)\. Reply/.exec(sms)?.[1] ?? 'http://x/');
    await page.goto(`${link.pathname}${link.search}`);
    await expect(page.getByRole('heading', { name: 'Seedlings to prepare' })).toBeVisible();
    await settle(page, 1200);
    await page.screenshot({ path: `${DIR}/order-map-mobile.png`, fullPage: true });

    await page.goto('/orders');
    await expect(page.getByText('Paid — nursery notified').first()).toBeVisible();
    await page.screenshot({ path: `${DIR}/my-orders-mobile.png`, fullPage: true });

    // The nursery replies "<code> 1" by SMS (through the real inbound webhook): on the way
    const code = /order ([A-Z0-9]{6}):/.exec(sms)?.[1] ?? '';
    const reply = await page.request.post('/api/v1/webhooks/sms/inbound', { form: { from: '+256700100114', text: `${code} 1` } });
    expect(reply.ok()).toBe(true);
    await page.goto(`/orders/${orderId}`);
    await expect(page.getByText('On the way').first()).toBeVisible();
    await page.getByRole('button', { name: 'Confirm delivery' }).click();
    await expect(page.getByRole('dialog', { name: 'Did your seedlings arrive in good condition?' })).toBeVisible();
    await settle(page, 300);
    await page.screenshot({ path: `${DIR}/confirm-delivery-mobile.png` });
    await page.getByRole('button', { name: 'Yes, confirm delivery' }).click();
    // The payout runs in the background job queue; the order completes when the nursery is paid
    await expect.poll(async () => {
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible();
      return page.getByText('Completed', { exact: true }).first().isVisible();
    }, { timeout: 30_000, intervals: [1000] }).toBe(true);
    await settle(page);
    await page.screenshot({ path: `${DIR}/completed-mobile.png`, fullPage: true });
  });

  test('payment failure: nothing charged, try again', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await registerBuyer(page, 'Okello James');
    await startOrder(page);
    await chooseSeedlings(page, true);
    await chooseDelivery(page, true);
    const orderId = await pay(page, true);
    await settlePayment(page, orderId, 'failed');
    await expect(page.getByRole('heading', { name: "The payment didn't go through" })).toBeVisible({ timeout: 15_000 });
    await settle(page);
    await page.screenshot({ path: `${DIR}/failed-desktop.png`, fullPage: true });
    // Try again keeps everything the buyer chose and goes straight back to the quote
    await page.getByRole('link', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Your quote' })).toBeVisible();
    await expect(page.getByLabel('Paying phone number')).not.toHaveValue('');
  });
});
