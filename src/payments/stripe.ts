import { hmacSha256Hex, timingSafeEqual } from '../lib/crypto';
import type { OrderItemRow, OrderRow } from '../lib/orders';

/**
 * Stripe Checkout for customers outside Sudan. Uses the REST API directly (no SDK) so it runs on Workers.
 * The Stripe account must be registered in a supported country; see README.
 */
export async function createCheckoutSession(
  secretKey: string,
  order: OrderRow,
  items: OrderItemRow[],
  urls: { success: string; cancel: string },
  fetchFn: typeof fetch = fetch,
): Promise<{ id: string; url: string }> {
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', urls.success);
  form.set('cancel_url', urls.cancel);
  form.set('client_reference_id', order.number);
  form.set('metadata[order_number]', order.number);
  form.set('payment_intent_data[metadata][order_number]', order.number);
  if (order.customer_email) form.set('customer_email', order.customer_email);

  const currency = order.currency.toLowerCase();
  const lines = items.map((i) => ({
    name: [i.product_name, i.size, i.color].filter(Boolean).join(' - '),
    amount: i.unit_price,
    quantity: i.quantity,
  }));
  if (order.shipping > 0) lines.push({ name: 'الشحن', amount: order.shipping, quantity: 1 });
  lines.forEach((line, n) => {
    form.set(`line_items[${n}][quantity]`, String(line.quantity));
    form.set(`line_items[${n}][price_data][currency]`, currency);
    form.set(`line_items[${n}][price_data][unit_amount]`, String(line.amount));
    form.set(`line_items[${n}][price_data][product_data][name]`, line.name);
  });

  const res = await fetchFn('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secretKey}`,
      'content-type': 'application/x-www-form-urlencoded',
      'idempotency-key': `checkout-${order.number}-${order.updated_at}`,
    },
    body: form.toString(),
  });
  const data = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
  if (!res.ok || !data.id || !data.url) throw new Error(`stripe: ${data.error?.message ?? res.status}`);
  return { id: data.id, url: data.url };
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/** Verifies the Stripe-Signature header (v1 HMAC-SHA256) and returns the parsed event, or null if invalid. */
export async function verifyWebhook(
  payload: string,
  header: string | undefined,
  secret: string,
  toleranceSeconds = 300,
  now = Math.floor(Date.now() / 1000),
): Promise<StripeEvent | null> {
  if (!header) return null;
  let timestamp = '';
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2);
    if (k === 't' && v) timestamp = v;
    if (k === 'v1' && v) signatures.push(v);
  }
  const ts = Number(timestamp);
  if (!timestamp || !Number.isFinite(ts) || signatures.length === 0) return null;
  if (Math.abs(now - ts) > toleranceSeconds) return null;
  const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`);
  if (!signatures.some((s) => timingSafeEqual(s, expected))) return null;
  try {
    return JSON.parse(payload) as StripeEvent;
  } catch {
    return null;
  }
}
