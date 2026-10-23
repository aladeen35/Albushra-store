import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { publicProduct, variantsFor, type ProductRow } from '../lib/catalog';
import { currencyForRegion, PAYMENT_METHODS, regionForCountry, unitPrice, type Region } from '../lib/pricing';
import { getSettings } from '../lib/settings';

export const catalog = new Hono<AppEnv>();

function regionParam(value: string | undefined): Region {
  if (value === 'sd' || value === 'intl') return value;
  return value && value.length === 2 ? regionForCountry(value) : 'sd';
}

/** Store info the storefront needs on first load. */
catalog.get('/config', async (c) => {
  const s = await getSettings(c.env.DB);
  const card = Boolean(c.env.STRIPE_SECRET_KEY);
  const cf = (c.req.raw as { cf?: { country?: string } }).cf;
  return c.json({
    storeName: c.env.STORE_NAME,
    detectedCountry: cf?.country ?? null,
    whatsappNumber: s.whatsapp_number || null,
    regions: {
      sd: {
        currency: currencyForRegion('sd'),
        shipping: s.shipping_sd_sdg,
        paymentMethods: PAYMENT_METHODS.sd,
      },
      intl: {
        currency: currencyForRegion('intl'),
        shipping: s.shipping_intl_usd,
        paymentMethods: card ? PAYMENT_METHODS.intl : [],
      },
    },
  });
});

catalog.get('/categories', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, slug, name, display FROM categories ORDER BY sort_order, name').all();
  return c.json({ categories: results });
});

catalog.get('/products', async (c) => {
  const region = regionParam(c.req.query('region'));
  const category = c.req.query('category');
  const q = c.req.query('q')?.trim();
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 24, 1), 100);
  const offset = Math.max(Number(c.req.query('offset')) || 0, 0);

  const where = ['p.active = 1'];
  const params: unknown[] = [];
  if (category) {
    where.push('c.slug = ?');
    params.push(category);
  }
  if (q) {
    where.push('(p.name LIKE ? OR p.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, c.slug AS category_slug FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
  )
    .bind(...params, limit, offset)
    .all<ProductRow>();

  const settings = await getSettings(c.env.DB);
  const variants = await variantsFor(c.env.DB, results.map((p) => p.id));
  const products = results
    .map((p) => publicProduct(p, variants.get(p.id) ?? [], region, settings))
    .filter((p) => p.variants.length > 0);
  return c.json({ products, limit, offset });
});

catalog.get('/products/:slug', async (c) => {
  const region = regionParam(c.req.query('region'));
  const product = await c.env.DB.prepare(
    'SELECT p.*, c.slug AS category_slug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.slug = ? AND p.active = 1',
  )
    .bind(c.req.param('slug'))
    .first<ProductRow>();
  if (!product) return c.json({ error: 'not_found' }, 404);
  const settings = await getSettings(c.env.DB);
  const variants = await variantsFor(c.env.DB, [product.id]);
  return c.json({ product: publicProduct(product, variants.get(product.id) ?? [], region, settings) });
});

/** Cart lookup: current price and details for the given variant ids (?ids=1,2,3). */
catalog.get('/variants', async (c) => {
  const region = regionParam(c.req.query('region'));
  const ids = (c.req.query('ids') ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 50);
  if (ids.length === 0) return c.json({ variants: [] });
  const { results } = await c.env.DB.prepare(
    `SELECT v.id, v.size, v.color, v.price_usd, v.price_sdg, v.stock, v.images AS variant_images, p.slug, p.name, p.images
     FROM variants v JOIN products p ON p.id = v.product_id
     WHERE v.active = 1 AND p.active = 1 AND v.id IN (${ids.map(() => '?').join(',')})`,
  )
    .bind(...ids)
    .all<{ id: number; size: string | null; color: string | null; price_usd: number; price_sdg: number | null; stock: number | null; variant_images: string | null; slug: string; name: string; images: string }>();
  const settings = await getSettings(c.env.DB);
  return c.json({
    currency: currencyForRegion(region),
    variants: results.map((v) => ({
      id: v.id,
      slug: v.slug,
      name: v.name,
      size: v.size,
      color: v.color,
      image: (JSON.parse(v.variant_images ?? v.images) as string[])[0] ?? (JSON.parse(v.images) as string[])[0] ?? null,
      price: unitPrice(v, region, settings),
      inStock: v.stock == null || v.stock > 0,
    })),
  });
});
