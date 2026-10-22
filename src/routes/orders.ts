import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { timingSafeEqual } from '../lib/crypto';
import { addEvent, createOrder, getOrderByNumber, getOrderItems, OrderError, type OrderItemRow, type OrderRow } from '../lib/orders';
import { getSettings } from '../lib/settings';
import { createCheckoutSession } from '../payments/stripe';

export const orders = new Hono<AppEnv>();

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const RECEIPT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

const orderSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2).max(100),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,20}$/),
    email: z.string().trim().email().max(200).nullish(),
    country: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/),
    city: z.string().trim().min(2).max(100),
    address: z.string().trim().min(5).max(500),
  }),
  items: z
    .array(z.object({ variantId: z.number().int().positive(), quantity: z.number().int().min(1).max(20) }))
    .min(1)
    .max(30),
  paymentMethod: z.enum(['bankak', 'card']),
  notes: z.string().trim().max(500).nullish(),
});

function customerView(order: OrderRow, items: OrderItemRow[]) {
  return {
    number: order.number,
    status: order.status,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    currency: order.currency,
    subtotal: order.subtotal,
    shipping: order.shipping,
    total: order.total,
    createdAt: order.created_at,
    customer: { name: order.customer_name, phone: order.customer_phone, city: order.city, address: order.address, country: order.country },
    items: items.map((i) => ({
      name: i.product_name,
      size: i.size,
      color: i.color,
      quantity: i.quantity,
      unitPrice: i.unit_price,
      trackingNumber: i.tracking_number,
    })),
  };
}

async function bankakInstructions(db: D1Database, order: OrderRow) {
  const s = await getSettings(db);
  return { accountName: s.bankak_account_name, accountNumber: s.bankak_account_number, amount: order.total, currency: order.currency, reference: order.number };
}

/** Loads the order named in the URL and checks the customer's access token (?token= or X-Order-Token). */
async function authorizedOrder(c: Context<AppEnv>): Promise<OrderRow | null> {
  const order = await getOrderByNumber(c.env.DB, c.req.param('number') ?? '');
  const token = c.req.query('token') ?? c.req.header('x-order-token') ?? '';
  if (!order || !token || !timingSafeEqual(token, order.access_token)) return null;
  return order;
}

async function startCardCheckout(c: Context<AppEnv>, order: OrderRow) {
  const key = c.env.STRIPE_SECRET_KEY;
  if (!key) throw new OrderError('card_unavailable', 'الدفع الإلكتروني غير مفعّل حالياً');
  const items = await getOrderItems(c.env.DB, order.id);
  const base = c.env.PUBLIC_URL.replace(/\/+$/, '');
  const back = `${base}/order/${order.number}?token=${order.access_token}`;
  const session = await createCheckoutSession(key, order, items, { success: `${back}&paid=1`, cancel: back });
  await c.env.DB.prepare("UPDATE orders SET payment_ref = ?, updated_at = datetime('now') WHERE id = ?").bind(session.id, order.id).run();
  return session.url;
}

orders.post('/', async (c) => {
  const parsed = orderSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_input', issues: parsed.error.issues }, 400);
  if (parsed.data.paymentMethod === 'card' && !c.env.STRIPE_SECRET_KEY) {
    return c.json({ error: 'card_unavailable', message: 'الدفع الإلكتروني غير مفعّل حالياً' }, 400);
  }

  try {
    const order = await createOrder(c.env.DB, parsed.data);
    const items = await getOrderItems(c.env.DB, order.id);
    const body: Record<string, unknown> = { order: customerView(order, items), accessToken: order.access_token };

    if (order.payment_method === 'bankak') body.bankak = await bankakInstructions(c.env.DB, order);
    if (order.payment_method === 'card') {
      try {
        body.checkoutUrl = await startCardCheckout(c, order);
      } catch (err) {
        // The order exists; the customer can retry payment from the order page.
        await addEvent(c.env.DB, order.id, 'payment:error', (err as Error).message.slice(0, 500));
        body.checkoutError = 'تعذّر بدء الدفع، حاول مرة أخرى من صفحة الطلب';
      }
    }
    return c.json(body, 201);
  } catch (err) {
    if (err instanceof OrderError) return c.json({ error: err.code, message: err.message }, err.status);
    throw err;
  }
});

orders.get('/:number', async (c) => {
  const order = await authorizedOrder(c);
  if (!order) return c.json({ error: 'not_found' }, 404);
  const items = await getOrderItems(c.env.DB, order.id);
  const body: Record<string, unknown> = { order: customerView(order, items) };
  if (order.payment_method === 'bankak' && order.payment_status !== 'paid') body.bankak = await bankakInstructions(c.env.DB, order);
  return c.json(body);
});

/** Retry card payment for an unpaid order. */
orders.post('/:number/checkout', async (c) => {
  const order = await authorizedOrder(c);
  if (!order) return c.json({ error: 'not_found' }, 404);
  if (order.payment_method !== 'card' || order.status !== 'pending_payment') return c.json({ error: 'not_payable' }, 409);
  try {
    return c.json({ checkoutUrl: await startCardCheckout(c, order) });
  } catch (err) {
    if (err instanceof OrderError) return c.json({ error: err.code, message: err.message }, err.status);
    await addEvent(c.env.DB, order.id, 'payment:error', (err as Error).message.slice(0, 500));
    return c.json({ error: 'checkout_failed', message: 'تعذّر بدء الدفع، حاول مرة أخرى' }, 502);
  }
});

/** Bankak: the customer uploads a screenshot of the transfer (multipart field "receipt", optional "transactionId"). */
orders.post('/:number/receipt', async (c) => {
  const order = await authorizedOrder(c);
  if (!order) return c.json({ error: 'not_found' }, 404);
  if (order.payment_method !== 'bankak' || !['pending_payment', 'awaiting_verification'].includes(order.status)) {
    return c.json({ error: 'not_payable' }, 409);
  }

  const form = await c.req.formData().catch(() => null);
  const file = form?.get('receipt');
  if (!file || typeof file === 'string') return c.json({ error: 'receipt_required', message: 'أرفق صورة إشعار التحويل' }, 400);
  const ext = RECEIPT_TYPES[file.type];
  if (!ext) return c.json({ error: 'invalid_file_type', message: 'الملف يجب أن يكون صورة أو PDF' }, 400);
  if (file.size > MAX_RECEIPT_BYTES) return c.json({ error: 'file_too_large', message: 'الحد الأقصى 5 ميجابايت' }, 400);

  const txId = String(form?.get('transactionId') ?? '').trim().slice(0, 100) || null;
  const key = `receipts/${order.number}/${Date.now()}.${ext}`;
  await c.env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE orders SET receipt_key = ?, payment_ref = COALESCE(?, payment_ref), payment_status = 'pending_verification',
         status = 'awaiting_verification', updated_at = datetime('now') WHERE id = ?`,
    ).bind(key, txId, order.id),
    c.env.DB.prepare('INSERT INTO order_events (order_id, type, message) VALUES (?, ?, ?)').bind(order.id, 'payment:receipt', txId ?? ''),
  ]);
  return c.json({ ok: true, status: 'awaiting_verification' });
});
