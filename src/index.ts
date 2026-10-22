import { Hono } from 'hono';
import type { AppEnv, Env } from './env';
import { expireUnpaidOrders, syncSupplierStatuses } from './lib/orders';
import { admin } from './routes/admin';
import { catalog } from './routes/catalog';
import { orders } from './routes/orders';
import { payments } from './routes/payments';

export const app = new Hono<AppEnv>();

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'internal_error' }, 500);
});

app.get('/api/health', (c) => c.json({ ok: true }));
app.route('/api', catalog);
app.route('/api/orders', orders);
app.route('/api/payments', payments);
app.route('/api/admin', admin);
app.notFound((c) => c.json({ error: 'not_found' }, 404));

// Public product images stored in R2. Receipts are private and only served through the admin API.
app.get('/media/products/:file', async (c) => {
  const obj = await c.env.MEDIA.get(`products/${c.req.param('file')}`);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
      etag: obj.httpEtag,
    },
  });
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.all([syncSupplierStatuses(env), expireUnpaidOrders(env.DB)]));
  },
} satisfies ExportedHandler<Env>;
