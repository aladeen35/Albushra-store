import { currencyForRegion, unitPrice, type Region } from './pricing';
import type { StoreSettings } from './settings';

export interface ProductRow {
  id: number;
  slug: string;
  name: string;
  description: string;
  category_id: number | null;
  supplier_id: number | null;
  supplier_product_ref: string | null;
  images: string;
  active: number;
  created_at: string;
  updated_at: string;
  category_slug?: string | null;
}

export interface VariantRow {
  id: number;
  product_id: number;
  sku: string;
  size: string | null;
  color: string | null;
  price_usd: number;
  price_sdg: number | null;
  cost_usd: number | null;
  supplier_variant_ref: string | null;
  stock: number | null;
  active: number;
  images: string | null;
}

/** Shape sent to shoppers: prices in the shopper's currency, no cost/supplier data. */
export function publicProduct(product: ProductRow, variants: VariantRow[], region: Region, settings: StoreSettings) {
  const active = variants.filter((v) => v.active);
  const prices = active.map((v) => unitPrice(v, region, settings));
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    categoryId: product.category_id,
    category: product.category_slug ?? null,
    // images[0] is the front of the garment, images[1] the back.
    images: JSON.parse(product.images) as string[],
    currency: currencyForRegion(region),
    minPrice: prices.length ? Math.min(...prices) : null,
    variants: active.map((v, n) => ({
      id: v.id,
      sku: v.sku,
      size: v.size,
      color: v.color,
      price: prices[n]!,
      inStock: v.stock == null || v.stock > 0,
      // Color-specific images; when empty the product images apply.
      images: v.images ? (JSON.parse(v.images) as string[]) : [],
    })),
  };
}

export async function variantsFor(db: D1Database, productIds: number[]): Promise<Map<number, VariantRow[]>> {
  const map = new Map<number, VariantRow[]>();
  if (productIds.length === 0) return map;
  const { results } = await db
    .prepare(`SELECT * FROM variants WHERE product_id IN (${productIds.map(() => '?').join(',')}) ORDER BY id`)
    .bind(...productIds)
    .all<VariantRow>();
  for (const v of results) {
    const list = map.get(v.product_id) ?? [];
    list.push(v);
    map.set(v.product_id, list);
  }
  return map;
}

export function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `item-${Date.now().toString(36)}`;
}
