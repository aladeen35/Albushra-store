import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/index';
import { hmacSha256Hex } from '../src/lib/crypto';
import { expireUnpaidOrders, syncSupplierStatuses } from '../src/lib/orders';
import { unitPrice } from '../src/lib/pricing';
import { verifyWebhook } from '../src/payments/stripe';
import { adminHeaders, createCtx, createEnv, json } from './helpers';

type Env = ReturnType<typeof createEnv>;

let env: Env;
let bg: ReturnType<typeof createCtx>;

async function call(path: string, init: RequestInit = {}) {
  const res = await app.request(path, init, env, bg.ctx);
  await bg.flush();
  return res;
}

async function adminPost(path: string, body: unknown) {
  return call(path, { method: 'POST', headers: adminHeaders, body: JSON.stringify(body) });
}

async function createSupplier(adapter: 'manual' | 'http_json', config: Record<string, unknown> = {}) {
  const res = await adminPost('/api/admin/suppliers', { code: adapter === 'manual' ? 'MANUAL' : 'MAIN', name: `Supplier ${adapter}`, adapter, config });
  return ((await res.json()) as { supplier: { id: number } }).supplier.id;
}

async function createProduct(supplierId: number | null, stock: number | null = null) {
  const res = await adminPost('/api/admin/products', {
    name: 'جلابية قطن',
    description: 'جلابية رجالية',
    supplierId,
    supplierProductRef: 'P-1',
    variants: [
      { sku: 'JL-M-W', size: 'M', color: 'أبيض', priceUsd: 2000, costUsd: 1200, supplierVariantRef: 'V-1', stock },
      { sku: 'JL-L-W', size: 'L', color: 'أبيض', priceUsd: 2200, priceSdg: 60000 },
    ],
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { product: { slug: string; variants: { id: number }[] } }).product;
}

const sdCustomer = { name: 'أحمد علي', phone: '+249912345678', country: 'SD', city: 'بورتسودان', address: 'حي الثورة، شارع 5' };
const intlCustomer = { name: 'Sara M', phone: '+966500000000', email: 'sara@example.com', country: 'SA', city: 'الرياض', address: 'حي النخيل 12' };

async function placeOrder(body: Record<string, unknown>) {
  const res = await call('/api/orders', { method: 'POST', headers: json, body: JSON.stringify(body) });
  return { res, data: (await res.json()) as any };
}

beforeEach(() => {
  env = createEnv();
  bg = createCtx();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pricing', () => {
  it('converts USD to SDG and rounds up to the configured step', () => {
    const s = { usd_to_sdg: 2500, sdg_rounding: 500 };
    expect(unitPrice({ price_usd: 2000, price_sdg: null }, 'sd', s)).toBe(50000);
    expect(unitPrice({ price_usd: 2010, price_sdg: null }, 'sd', s)).toBe(50500);
    expect(unitPrice({ price_usd: 2000, price_sdg: 45000 }, 'sd', s)).toBe(45000);
    expect(unitPrice({ price_usd: 2000, price_sdg: 45000 }, 'intl', s)).toBe(2000);
  });
});

describe('admin auth', () => {
  it('rejects requests without the admin token', async () => {
    expect((await call('/api/admin/orders')).status).toBe(401);
    expect((await call('/api/admin/orders', { headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
    expect((await call('/api/admin/orders', { headers: adminHeaders })).status).toBe(200);
  });
});

describe('catalog', () => {
  it('shows prices in the shopper currency and hides cost data', async () => {
    const product = await createProduct(null);
    const sd = (await (await call(`/api/products/${encodeURIComponent(product.slug)}?region=sd`)).json()) as any;
    expect(sd.product.currency).toBe('SDG');
    expect(sd.product.variants.map((v: any) => v.price)).toEqual([50000, 60000]);
    expect(JSON.stringify(sd)).not.toContain('cost');

    const intl = (await (await call('/api/products?region=SA')).json()) as any;
    expect(intl.products[0].currency).toBe('USD');
    expect(intl.products[0].minPrice).toBe(2000);
  });
});

describe('cart lookup', () => {
  it('returns current prices for variant ids', async () => {
    const product = await createProduct(null);
    const ids = product.variants.map((v) => v.id).join(',');
    const data = (await (await call(`/api/variants?ids=${ids}&region=sd`)).json()) as any;
    expect(data.currency).toBe('SDG');
    expect(data.variants.map((v: any) => v.price).sort()).toEqual([50000, 60000]);
  });
});

describe('orders', () => {
  it('Sudan order: totals computed on the server, waits for Bankak payment', async () => {
    const product = await createProduct(null);
    const { res, data } = await placeOrder({
      customer: sdCustomer,
      items: [{ variantId: product.variants[0]!.id, quantity: 2 }],
      paymentMethod: 'bankak',
    });
    expect(res.status).toBe(201);
    expect(data.order).toMatchObject({ status: 'pending_payment', currency: 'SDG', subtotal: 100000, shipping: 5000, total: 105000 });

    const view = await call(`/api/orders/${data.order.number}?token=${data.accessToken}`);
    expect(view.status).toBe(200);
    expect((await call(`/api/orders/${data.order.number}?token=nope`)).status).toBe(404);
  });

  it('rejects payment methods that do not match the country', async () => {
    const product = await createProduct(null);
    const items = [{ variantId: product.variants[0]!.id, quantity: 1 }];
    // Cash on delivery is no longer offered anywhere.
    expect((await placeOrder({ customer: sdCustomer, items, paymentMethod: 'cod' })).res.status).toBe(400);
    expect((await placeOrder({ customer: intlCustomer, items, paymentMethod: 'bankak' })).res.status).toBe(400);
    // Card is disabled until Stripe keys are configured.
    expect((await placeOrder({ customer: sdCustomer, items, paymentMethod: 'card' })).res.status).toBe(400);
  });

  it('tracks stock and returns it when an order is cancelled', async () => {
    const product = await createProduct(null, 3);
    const variantId = product.variants[0]!.id;
    const { data } = await placeOrder({ customer: sdCustomer, items: [{ variantId, quantity: 2 }], paymentMethod: 'bankak' });
    const tooMany = await placeOrder({ customer: sdCustomer, items: [{ variantId, quantity: 2 }], paymentMethod: 'bankak' });
    expect(tooMany.res.status).toBe(409);

    const cancel = await adminPost(`/api/admin/orders/${data.order.number}/status`, { status: 'cancelled' });
    expect(cancel.status).toBe(200);
    const stock = await env.DB.prepare('SELECT stock FROM variants WHERE id = ?').bind(variantId).first<{ stock: number }>();
    expect(stock?.stock).toBe(3);
  });

  it('Bankak: receipt upload, admin approval, then automatic forwarding to the supplier API', async () => {
    const supplierFetch = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://supplier.test/api/orders');
      expect((init.headers as Record<string, string>).authorization).toBe('Bearer sup-key');
      const body = JSON.parse(init.body as string);
      expect(body.lines[0]).toMatchObject({ sku: 'JL-M-W', supplierVariantRef: 'V-1', supplierProductRef: 'P-1', quantity: 1 });
      return Response.json({ id: 'SUP-77', status: 'received' });
    });
    vi.stubGlobal('fetch', supplierFetch);
    env.SUPPLIER_MAIN_API_KEY = 'sup-key';
    const supplierId = await createSupplier('http_json', { baseUrl: 'https://supplier.test/api' });
    const product = await createProduct(supplierId);
    await call('/api/admin/settings', { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ bankak_account_number: '1234567', bankak_account_name: 'البشرى' }) });

    const { data } = await placeOrder({ customer: sdCustomer, items: [{ variantId: product.variants[0]!.id, quantity: 1 }], paymentMethod: 'bankak' });
    expect(data.order.status).toBe('pending_payment');
    expect(data.bankak).toMatchObject({ accountNumber: '1234567', amount: 55000, reference: data.order.number });

    const form = new FormData();
    form.set('receipt', new File([new Uint8Array([1, 2, 3])], 'r.png', { type: 'image/png' }));
    form.set('transactionId', 'TX-555');
    const upload = await call(`/api/orders/${data.order.number}/receipt?token=${data.accessToken}`, { method: 'POST', body: form });
    expect(upload.status).toBe(200);
    expect(env.MEDIA.objects.size).toBe(1);

    const receipt = await call(`/api/admin/orders/${data.order.number}/receipt`, { headers: adminHeaders });
    expect(receipt.headers.get('content-type')).toBe('image/png');

    expect(supplierFetch).not.toHaveBeenCalled();
    await adminPost(`/api/admin/orders/${data.order.number}/verify-payment`, { approve: true });
    expect(supplierFetch).toHaveBeenCalledTimes(1);

    const detail = (await (await call(`/api/admin/orders/${data.order.number}`, { headers: adminHeaders })).json()) as any;
    expect(detail.order).toMatchObject({ status: 'sent_to_supplier', payment_status: 'paid', payment_ref: 'TX-555' });
    expect(detail.items[0].supplier_order_ref).toBe('SUP-77');
    expect(detail.order.access_token).toBeUndefined();

    // Supplier reports shipment -> order follows.
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 'shipped', tracking_number: 'TRK1' })));
    await syncSupplierStatuses(env);
    const after = (await (await call(`/api/admin/orders/${data.order.number}`, { headers: adminHeaders })).json()) as any;
    expect(after.order.status).toBe('shipped');
    expect(after.items[0].tracking_number).toBe('TRK1');
  });

  it('Bankak: rejected receipt lets the customer upload again', async () => {
    const product = await createProduct(null);
    const { data } = await placeOrder({ customer: sdCustomer, items: [{ variantId: product.variants[0]!.id, quantity: 1 }], paymentMethod: 'bankak' });
    const form = new FormData();
    form.set('receipt', new File([new Uint8Array([1])], 'r.jpg', { type: 'image/jpeg' }));
    await call(`/api/orders/${data.order.number}/receipt?token=${data.accessToken}`, { method: 'POST', body: form });
    await adminPost(`/api/admin/orders/${data.order.number}/verify-payment`, { approve: false, note: 'المبلغ ناقص' });
    const view = (await (await call(`/api/orders/${data.order.number}?token=${data.accessToken}`)).json()) as any;
    expect(view.order).toMatchObject({ status: 'pending_payment', paymentStatus: 'rejected' });
  });

  it('cancels unpaid orders after the configured time', async () => {
    const product = await createProduct(null);
    const { data } = await placeOrder({ customer: sdCustomer, items: [{ variantId: product.variants[0]!.id, quantity: 1 }], paymentMethod: 'bankak' });
    expect(await expireUnpaidOrders(env.DB)).toBe(0);
    await env.DB.prepare("UPDATE orders SET created_at = datetime('now', '-3 days') WHERE number = ?").bind(data.order.number).run();
    expect(await expireUnpaidOrders(env.DB)).toBe(1);
  });
});

describe('card payments (Stripe)', () => {
  const secret = 'whsec_test';

  async function signed(payload: string, t = Math.floor(Date.now() / 1000)) {
    return `t=${t},v1=${await hmacSha256Hex(secret, `${t}.${payload}`)}`;
  }

  it('verifies webhook signatures', async () => {
    const payload = JSON.stringify({ id: 'evt_1', type: 'x', data: { object: {} } });
    expect(await verifyWebhook(payload, await signed(payload), secret)).not.toBeNull();
    expect(await verifyWebhook(payload, await signed(payload + ' '), secret)).toBeNull();
    expect(await verifyWebhook(payload, await signed(payload, 1000), secret)).toBeNull();
    expect(await verifyWebhook(payload, undefined, secret)).toBeNull();
  });

  it('creates a checkout session and confirms the order from the webhook', async () => {
    env.STRIPE_SECRET_KEY = 'sk_test';
    env.STRIPE_WEBHOOK_SECRET = secret;
    const stripeFetch = vi.fn(async (_url: string, init: RequestInit) => {
      const form = new URLSearchParams(init.body as string);
      expect(form.get('line_items[0][price_data][currency]')).toBe('usd');
      expect(form.get('line_items[0][price_data][unit_amount]')).toBe('2000');
      return Response.json({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' });
    });
    vi.stubGlobal('fetch', stripeFetch);
    const product = await createProduct(null);
    const { data } = await placeOrder({ customer: intlCustomer, items: [{ variantId: product.variants[0]!.id, quantity: 1 }], paymentMethod: 'card' });
    expect(data.checkoutUrl).toBe('https://checkout.stripe.test/cs_1');
    expect(data.order).toMatchObject({ status: 'pending_payment', currency: 'USD', total: 3500 });

    const webhook = async (amount: number) => {
      const payload = JSON.stringify({
        id: 'evt_2',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_1', payment_status: 'paid', amount_total: amount, currency: 'usd', metadata: { order_number: data.order.number } } },
      });
      return call('/api/payments/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': await signed(payload) }, body: payload });
    };

    await webhook(100); // wrong amount: ignored
    let view = (await (await call(`/api/orders/${data.order.number}?token=${data.accessToken}`)).json()) as any;
    expect(view.order.paymentStatus).toBe('unpaid');

    expect((await webhook(3500)).status).toBe(200);
    view = (await (await call(`/api/orders/${data.order.number}?token=${data.accessToken}`)).json()) as any;
    expect(view.order).toMatchObject({ paymentStatus: 'paid', status: 'confirmed' });
  });
});
