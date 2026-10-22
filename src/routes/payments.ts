import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { addEvent, autoForward, getOrderByNumber, markPaid } from '../lib/orders';
import { verifyWebhook } from '../payments/stripe';

export const payments = new Hono<AppEnv>();

payments.post('/stripe/webhook', async (c) => {
  const secret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: 'not_configured' }, 503);
  const payload = await c.req.text();
  const event = await verifyWebhook(payload, c.req.header('stripe-signature'), secret);
  if (!event) return c.json({ error: 'invalid_signature' }, 400);

  const obj = event.data.object as {
    id?: string;
    payment_status?: string;
    amount_total?: number;
    currency?: string;
    metadata?: Record<string, string>;
  };
  const number = obj.metadata?.order_number;
  if (!number) return c.json({ received: true });
  const order = await getOrderByNumber(c.env.DB, number);
  if (!order) return c.json({ received: true });

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    if (obj.payment_status !== 'paid') return c.json({ received: true }); // async methods confirm later
    if (obj.amount_total !== order.total || obj.currency?.toUpperCase() !== order.currency) {
      await addEvent(c.env.DB, order.id, 'payment:mismatch', `stripe ${obj.amount_total} ${obj.currency} vs ${order.total} ${order.currency}`);
      return c.json({ received: true });
    }
    if (order.status === 'cancelled') {
      await addEvent(c.env.DB, order.id, 'payment:after_cancel', `stripe ${event.id}: paid after the order was cancelled, refund or reopen`);
      return c.json({ received: true });
    }
    if (await markPaid(c.env.DB, order, obj.id ?? null, `stripe ${event.id}`)) {
      c.executionCtx.waitUntil(autoForward(c.env, order.id));
    }
  } else if (event.type === 'checkout.session.async_payment_failed') {
    await addEvent(c.env.DB, order.id, 'payment:failed', `stripe ${event.id}`);
  }
  return c.json({ received: true });
});
