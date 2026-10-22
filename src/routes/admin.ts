import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireAdmin } from '../lib/auth';
import { slugify, type ProductRow, type VariantRow } from '../lib/catalog';
import {
  ADMIN_TRANSITIONS,
  autoForward,
  forwardToSuppliers,
  getOrderByNumber,
  getOrderItems,
  markPaid,
  ORDER_STATUSES,
  setOrderStatus,
  type OrderStatus,
} from '../lib/orders';
import { getSettings, isNumericSetting, SETTING_KEYS } from '../lib/settings';
import { getAdapter, SUPPLIER_ADAPTERS } from '../suppliers';
import type { SupplierRow } from '../suppliers/types';

export const admin = new Hono<AppEnv>();
admin.use('*', requireAdmin);

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };

function badRequest(issues: unknown) {
  return { error: 'invalid_input', issues };
}

// ---------- Orders ----------

admin.get('/orders', async (c) => {
  const status = c.req.query('status');
  const q = c.req.query('q')?.trim();
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 50, 1), 200);
  const offset = Math.max(Number(c.req.query('offset')) || 0, 0);
  const where: string[] = [];
  const params: unknown[] = [];
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(number LIKE ? OR customer_phone LIKE ? OR customer_name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT id, number, status, payment_method, payment_status, currency, total, customer_name, customer_phone, country, city, created_at
     FROM orders ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ? OFFSET ?`,
  )
    .bind(...params, limit, offset)
    .all();
  return c.json({ orders: results, limit, offset });
});

admin.get('/orders/:number', async (c) => {
  const order = await getOrderByNumber(c.env.DB, c.req.param('number'));
  if (!order) return c.json({ error: 'not_found' }, 404);
  const items = await getOrderItems(c.env.DB, order.id);
  const { results: events } = await c.env.DB.prepare('SELECT type, message, created_at FROM order_events WHERE order_id = ? ORDER BY id')
    .bind(order.id)
    .all();
  const { access_token: _token, ...rest } = order;
  return c.json({ order: rest, items, events, allowedTransitions: ADMIN_TRANSITIONS[order.status] });
});

admin.get('/orders/:number/receipt', async (c) => {
  const order = await getOrderByNumber(c.env.DB, c.req.param('number'));
  if (!order?.receipt_key) return c.json({ error: 'not_found' }, 404);
  const obj = await c.env.MEDIA.get(order.receipt_key);
  if (!obj) return c.json({ error: 'not_found' }, 404);
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream', 'cache-control': 'private, no-store' } });
});

admin.post('/orders/:number/status', async (c) => {
  const parsed = z
    .object({ status: z.enum(ORDER_STATUSES as [OrderStatus, ...OrderStatus[]]), note: z.string().max(500).optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(badRequest(parsed.error.issues), 400);
  const order = await getOrderByNumber(c.env.DB, c.req.param('number'));
  if (!order) return c.json({ error: 'not_found' }, 404);
  if (!ADMIN_TRANSITIONS[order.status].includes(parsed.data.status)) {
    return c.json({ error: 'invalid_transition', from: order.status, allowed: ADMIN_TRANSITIONS[order.status] }, 409);
  }
  await setOrderStatus(c.env.DB, order, parsed.data.status, parsed.data.note ?? 'admin');
  return c.json({ ok: true });
});

/** Approve or reject a Bankak transfer after checking the receipt. */
admin.post('/orders/:number/verify-payment', async (c) => {
  const parsed = z.object({ approve: z.boolean(), note: z.string().max(500).optional() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(badRequest(parsed.error.issues), 400);
  const order = await getOrderByNumber(c.env.DB, c.req.param('number'));
  if (!order) return c.json({ error: 'not_found' }, 404);
  if (order.payment_method !== 'bankak' || !['pending_payment', 'awaiting_verification'].includes(order.status)) {
    return c.json({ error: 'not_verifiable', status: order.status }, 409);
  }

  if (parsed.data.approve) {
    await markPaid(c.env.DB, order, null, `bankak verified${parsed.data.note ? `: ${parsed.data.note}` : ''}`);
    c.executionCtx.waitUntil(autoForward(c.env, order.id));
  } else {
    // Back to pending_payment so the customer can upload a correct receipt.
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE orders SET payment_status = 'rejected', status = 'pending_payment', updated_at = datetime('now') WHERE id = ?",
      ).bind(order.id),
      c.env.DB.prepare('INSERT INTO order_events (order_id, type, message) VALUES (?, ?, ?)').bind(order.id, 'payment:rejected', parsed.data.note ?? ''),
    ]);
  }
  return c.json({ ok: true });
});

admin.post('/orders/:number/forward', async (c) => {
  const order = await getOrderByNumber(c.env.DB, c.req.param('number'));
  if (!order) return c.json({ error: 'not_found' }, 404);
  if (order.status !== 'confirmed') return c.json({ error: 'not_confirmed', status: order.status }, 409);
  return c.json(await forwardToSuppliers(c.env, order.id));
});

admin.post('/orders/:number/note', async (c) => {
  const parsed = z.object({ note: z.string().max(2000) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(badRequest(parsed.error.issues), 400);
  const order = await getOrderByNumber(c.env.DB, c.req.param('number'));
  if (!order) return c.json({ error: 'not_found' }, 404);
  await c.env.DB.prepare("UPDATE orders SET admin_note = ?, updated_at = datetime('now') WHERE id = ?").bind(parsed.data.note, order.id).run();
  return c.json({ ok: true });
});

// ---------- Categories ----------

const categorySchema = z.object({ name: z.string().trim().min(1).max(100), slug: z.string().trim().max(100).optional(), sortOrder: z.number().int().optional() });

admin.post('/categories', async (c) => {
  const parsed = categorySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(badRequest(parsed.error.issues), 400);
  const { name, slug, sortOrder } = parsed.data;
  const row = await c.env.DB.prepare('INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, ?) RETURNING *')
    .bind(name, slug || slugify(name), sortOrder ?? 0)
    .first();
  return c.json({ category: row }, 201);
});

admin.put('/categories/:id', async (c) => {
  const parsed = categorySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(badRequest(parsed.error.issues), 400);
  const { name, slug, sortOrder } = parsed.data;
  const row = await c.env.DB.prepare('UPDATE categories SET name = ?, slug = ?, sort_order = ? WHERE id = ? RETURNING *')
    .bind(name, slug || slugify(name), sortOrder ?? 0, Number(c.req.param('id')))
    .first();
  return row ? c.json({ category: row }) : c.json({ error: 'not_found' }, 404);
});

admin.delete('/categories/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

// ---------- Products ----------

const variantSchema = z.object({
  sku: z.string().trim().min(1).max(100),
  size: z.string().trim().max(50).nullish(),
  color: z.string().trim().max(50).nullish(),
  priceUsd: z.number().int().positive(), // cents
  priceSdg: z.number().int().positive().nullish(),
  costUsd: z.number().int().nonnegative().nullish(),
  supplierVariantRef: z.string().max(200).nullish(),
  stock: z.number().int().nonnegative().nullish(),
  active: z.boolean().optional(),
  images: z.array(z.string().url().or(z.string().startsWith('/'))).max(10).nullish(),
});

const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(200).optional(),
  description: z.string().max(5000).optional(),
  categoryId: z.number().int().positive().nullish(),
  supplierId: z.number().int().positive().nullish(),
  supplierProductRef: z.string().max(200).nullish(),
  images: z.array(z.string().url().or(z.string().startsWith('/'))).max(20).optional(),
  active: z.boolean().optional(),
});

function bindVariant(db: D1Database, productId: number, v: z.infer<typeof variantSchema>) {
  return db
    .prepare(
      `INSERT INTO variants (product_id, sku, size, color, price_usd, price_sdg, cost_usd, supplier_variant_ref, stock, active, images)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .bind(productId, v.sku, v.size ?? null, v.color ?? null, v.priceUsd, v.priceSdg ?? null, v.costUsd ?? null, v.supplierVariantRef ?? null, v.stock ?? null, v.active === false ? 0 : 1, v.images?.length ? JSON.stringify(v.images) : null);
}

async function productWithVariants(db: D1Database, id: number) {
  const product = await db.prepare('SELECT * FROM products WHERE id = ?').bind(id).first<ProductRow>();
  if (!product) return null;
  const { results } = await db.prepare('SELECT * FROM variants WHERE product_id = ? ORDER BY id').bind(id).all<VariantRow>();
  return {
    ...product,
    images: JSON.parse(product.images) as string[],
    variants: results.map((v) => ({ ...v, images: v.images ? (JSON.parse(v.images) as string[]) : [] })),
  };
}

admin.get('/products', async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 50, 1), 200);
  const offset = Math.max(Number(c.req.query('offset')) || 0, 0);
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM variants v WHERE v.product_id = p.id) AS variant_count
     FROM products p ORDER BY p.id DESC LIMIT ? OFFSET ?`,
  )
    .bind(limit, offset)
    .all();
  return c.json({ products: results, limit, offset });
});

admin.get('/products/:id', async (c) => {
  const product = await productWithVariants(c.env.DB, Number(c.req.param('id')));
  return product ? c.json({ product }) : c.json({ error: 'not_found' }, 404);
});

admin.post('/products', async (c) => {
  const parsed = productSchema.extend({ variants: z.array(variantSchema).min(1).max(100) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(badRequest(parsed.error.issues), 400);
  const p = parsed.data;
  const db = c.env.DB;
  const product = await db
    .prepare(
      `INSERT INTO products (slug, name, description, category_id, supplier_id, supplier_product_ref, images, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(p.slug || slugify(p.name), p.name, p.description ?? '', p.categoryId ?? null, p.supplierId ?? null, p.supplierProductRef ?? null, JSON.stringify(p.images ?? []), p.active === false ? 0 : 1)
    .first<{ id: number }>();
  try {
    await db.batch(p.variants.map((v) => bindVariant(db, product!.id, v)));
  } catch (err) {
    await db.prepare('DELETE FROM products WHERE id = ?').bind(product!.id).run();
    throw err;
  }
  return c.json({ product: await productWithVariants(db, product!.id) }, 201);
});

admin.put('/products/:id', async (c) => {
  const parsed = productSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(badRequest(parsed.error.issues), 400);
  const p = parsed.data;
  const id = Number(c.req.param('id'));
  const res = await c.env.DB.prepare(
    `UPDATE products SET slug = ?, name = ?, description = ?, category_id = ?, supplier_id = ?, supplier_product_ref = ?, images = ?, active = ?,
       updated_at = datetime('now') WHERE id = ?`,
  )
    .bind(p.slug || slugify(p.name), p.name, p.description ?? '', p.categoryId ?? null, p.supplierId ?? null, p.supplierProductRef ?? null, JSON.stringify(p.images ?? []), p.active === false ? 0 : 1, id)
    .run();
  if (!res.meta.changes) return c.json({ error: 'not_found' }, 404);
  return c.json({ product: await productWithVariants(c.env.DB, id) });
});

/** Products are hidden rather than deleted so past orders keep their references. */
admin.delete('/products/:id', async (c) => {
  await c.env.DB.prepare("UPDATE products SET active = 0, updated_at = datetime('now') WHERE id = ?").bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

admin.post('/products/:id/variants', async (c) => {
  const parsed = variantSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(badRequest(parsed.error.issues), 400);
  const variant = await bindVariant(c.env.DB, Number(c.req.param('id')), parsed.data).first();
  return c.json({ variant }, 201);
});

admin.put('/variants/:id', async (c) => {
  const parsed = variantSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(badRequest(parsed.error.issues), 400);
  const v = parsed.data;
  const variant = await c.env.DB.prepare(
    `UPDATE variants SET sku = ?, size = ?, color = ?, price_usd = ?, price_sdg = ?, cost_usd = ?, supplier_variant_ref = ?, stock = ?, active = ?, images = ?
     WHERE id = ? RETURNING *`,
  )
    .bind(v.sku, v.size ?? null, v.color ?? null, v.priceUsd, v.priceSdg ?? null, v.costUsd ?? null, v.supplierVariantRef ?? null, v.stock ?? null, v.active === false ? 0 : 1, v.images?.length ? JSON.stringify(v.images) : null, Number(c.req.param('id')))
    .first();
  return variant ? c.json({ variant }) : c.json({ error: 'not_found' }, 404);
});

/** Upload a product image to R2; returns the URL to put in product.images. */
admin.post('/media', async (c) => {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return c.json({ error: 'file_required' }, 400);
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return c.json({ error: 'invalid_file_type' }, 400);
  if (file.size > 10 * 1024 * 1024) return c.json({ error: 'file_too_large' }, 400);
  const key = `products/${crypto.randomUUID()}.${ext}`;
  await c.env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  return c.json({ url: `/media/${key}` }, 201);
});

// ---------- Suppliers ----------

const supplierSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{2,30}$/),
  name: z.string().trim().min(1).max(100),
  adapter: z.enum(SUPPLIER_ADAPTERS),
  config: z.record(z.string(), z.unknown()).optional(),
  autoForward: z.boolean().optional(),
  active: z.boolean().optional(),
});

admin.get('/suppliers', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM suppliers ORDER BY id').all<SupplierRow>();
  return c.json({ suppliers: results.map((s) => ({ ...s, config: JSON.parse(s.config) })) });
});

admin.post('/suppliers', async (c) => {
  const parsed = supplierSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(badRequest(parsed.error.issues), 400);
  const s = parsed.data;
  const row = await c.env.DB.prepare('INSERT INTO suppliers (code, name, adapter, config, auto_forward, active) VALUES (?, ?, ?, ?, ?, ?) RETURNING *')
    .bind(s.code.toUpperCase(), s.name, s.adapter, JSON.stringify(s.config ?? {}), s.autoForward === false ? 0 : 1, s.active === false ? 0 : 1)
    .first();
  return c.json({ supplier: row }, 201);
});

admin.put('/suppliers/:id', async (c) => {
  const parsed = supplierSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(badRequest(parsed.error.issues), 400);
  const s = parsed.data;
  const row = await c.env.DB.prepare('UPDATE suppliers SET code = ?, name = ?, adapter = ?, config = ?, auto_forward = ?, active = ? WHERE id = ? RETURNING *')
    .bind(s.code.toUpperCase(), s.name, s.adapter, JSON.stringify(s.config ?? {}), s.autoForward === false ? 0 : 1, s.active === false ? 0 : 1, Number(c.req.param('id')))
    .first();
  return row ? c.json({ supplier: row }) : c.json({ error: 'not_found' }, 404);
});

/**
 * Imports (or refreshes) the supplier's catalog. Selling price = cost × (1 + markupPercent / 100).
 * New products are created hidden (active = 0) so they can be reviewed before going live.
 */
admin.post('/suppliers/:id/import', async (c) => {
  const parsed = z
    .object({ markupPercent: z.number().min(0).max(1000).default(50), categoryId: z.number().int().positive().nullish() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(badRequest(parsed.error.issues), 400);
  const db = c.env.DB;
  const supplier = await db.prepare('SELECT * FROM suppliers WHERE id = ?').bind(Number(c.req.param('id'))).first<SupplierRow>();
  if (!supplier) return c.json({ error: 'not_found' }, 404);

  const products = await getAdapter(c.env, supplier).listProducts();
  const factor = 1 + parsed.data.markupPercent / 100;
  let created = 0;
  let updated = 0;
  for (const sp of products) {
    const existing = await db.prepare('SELECT id FROM products WHERE supplier_id = ? AND supplier_product_ref = ?').bind(supplier.id, sp.ref).first<{ id: number }>();
    let productId: number;
    if (existing) {
      productId = existing.id;
      await db.prepare("UPDATE products SET images = ?, updated_at = datetime('now') WHERE id = ?").bind(JSON.stringify(sp.images), productId).run();
      updated++;
    } else {
      const row = await db
        .prepare(
          `INSERT INTO products (slug, name, description, category_id, supplier_id, supplier_product_ref, images, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0) RETURNING id`,
        )
        .bind(`${slugify(sp.name)}-${supplier.code.toLowerCase()}-${slugify(sp.ref)}`, sp.name, sp.description, parsed.data.categoryId ?? null, supplier.id, sp.ref, JSON.stringify(sp.images))
        .first<{ id: number }>();
      productId = row!.id;
      created++;
    }
    // Cost and stock follow the supplier; existing selling prices are kept so manual pricing is not overwritten.
    await db.batch(
      sp.variants.map((v) =>
        db
          .prepare(
            `INSERT INTO variants (product_id, sku, size, color, price_usd, cost_usd, supplier_variant_ref, stock)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(sku) DO UPDATE SET cost_usd = excluded.cost_usd, stock = excluded.stock, supplier_variant_ref = excluded.supplier_variant_ref`,
          )
          .bind(productId, v.sku, v.size, v.color, Math.ceil(v.costUsdCents * factor), v.costUsdCents, v.ref, v.stock),
      ),
    );
  }
  return c.json({ created, updated, total: products.length });
});

// ---------- Settings ----------

admin.get('/settings', async (c) => c.json({ settings: await getSettings(c.env.DB) }));

admin.put('/settings', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return c.json(badRequest('expected an object'), 400);
  const stmts = [];
  for (const [key, value] of Object.entries(body)) {
    if (!(SETTING_KEYS as string[]).includes(key)) return c.json(badRequest(`unknown setting: ${key}`), 400);
    if (isNumericSetting(key) && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
      return c.json(badRequest(`${key} must be a non-negative number`), 400);
    }
    if (!isNumericSetting(key) && typeof value !== 'string') return c.json(badRequest(`${key} must be a string`), 400);
    stmts.push(c.env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, String(value)));
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ settings: await getSettings(c.env.DB) });
});

// ---------- Dashboard ----------

admin.get('/summary', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT status, COUNT(*) AS count FROM orders GROUP BY status').all<{ status: string; count: number }>();
  const needsAction = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM orders WHERE status IN ('awaiting_verification', 'confirmed')",
  ).first<{ n: number }>();
  return c.json({ byStatus: Object.fromEntries(results.map((r) => [r.status, r.count])), needsAction: needsAction?.n ?? 0 });
});
