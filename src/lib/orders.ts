import type { Env } from '../env';
import { getAdapter } from '../suppliers';
import type { SupplierRow } from '../suppliers/types';
import { accessToken, orderNumber } from './ids';
import { currencyForRegion, PAYMENT_METHODS, regionForCountry, shippingFee, unitPrice, type Currency, type Region } from './pricing';
import { getSettings } from './settings';

export type PaymentMethod = 'cod' | 'bankak' | 'card';
export type PaymentStatus = 'unpaid' | 'pending_verification' | 'paid' | 'rejected' | 'refunded';
export type OrderStatus =
  | 'pending_payment' // bankak/card: waiting for the customer to pay
  | 'awaiting_verification' // bankak: receipt uploaded, admin must check it
  | 'confirmed' // ready to be sent to the supplier (COD, or payment received)
  | 'sent_to_supplier'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export const ORDER_STATUSES: OrderStatus[] = [
  'pending_payment',
  'awaiting_verification',
  'confirmed',
  'sent_to_supplier',
  'shipped',
  'delivered',
  'cancelled',
];

/** Transitions an admin may make by hand. Payment-driven transitions go through dedicated endpoints. */
export const ADMIN_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ['cancelled'],
  awaiting_verification: ['cancelled'],
  confirmed: ['sent_to_supplier', 'cancelled'],
  sent_to_supplier: ['shipped', 'delivered', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export interface OrderRow {
  id: number;
  number: string;
  access_token: string;
  region: Region;
  currency: Currency;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  status: OrderStatus;
  subtotal: number;
  shipping: number;
  total: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  country: string;
  city: string;
  address: string;
  notes: string | null;
  receipt_key: string | null;
  payment_ref: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: number;
  order_id: number;
  variant_id: number | null;
  supplier_id: number | null;
  product_name: string;
  sku: string;
  size: string | null;
  color: string | null;
  quantity: number;
  unit_price: number;
  supplier_order_ref: string | null;
  supplier_status: string | null;
  tracking_number: string | null;
}

export interface NewOrderInput {
  customer: { name: string; phone: string; email?: string | null; country: string; city: string; address: string };
  items: { variantId: number; quantity: number }[];
  paymentMethod: PaymentMethod;
  notes?: string | null;
}

export class OrderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

interface VariantForOrder {
  id: number;
  sku: string;
  size: string | null;
  color: string | null;
  price_usd: number;
  price_sdg: number | null;
  stock: number | null;
  product_name: string;
  supplier_id: number | null;
}

export async function addEvent(db: D1Database, orderId: number, type: string, message = ''): Promise<void> {
  await db.prepare('INSERT INTO order_events (order_id, type, message) VALUES (?, ?, ?)').bind(orderId, type, message).run();
}

export async function getOrderByNumber(db: D1Database, number: string): Promise<OrderRow | null> {
  return db.prepare('SELECT * FROM orders WHERE number = ?').bind(number).first<OrderRow>();
}

export async function getOrderItems(db: D1Database, orderId: number): Promise<OrderItemRow[]> {
  const { results } = await db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').bind(orderId).all<OrderItemRow>();
  return results;
}

export async function createOrder(db: D1Database, input: NewOrderInput): Promise<OrderRow> {
  const region = regionForCountry(input.customer.country);
  if (!PAYMENT_METHODS[region].includes(input.paymentMethod)) {
    throw new OrderError('payment_method_not_available', 'طريقة الدفع غير متاحة لهذه الدولة');
  }

  // Merge duplicate lines so stock checks see the real quantity.
  const quantities = new Map<number, number>();
  for (const item of input.items) quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
  const ids = [...quantities.keys()];

  const { results: variants } = await db
    .prepare(
      `SELECT v.id, v.sku, v.size, v.color, v.price_usd, v.price_sdg, v.stock, p.name AS product_name, p.supplier_id
       FROM variants v JOIN products p ON p.id = v.product_id
       WHERE v.active = 1 AND p.active = 1 AND v.id IN (${ids.map(() => '?').join(',')})`,
    )
    .bind(...ids)
    .all<VariantForOrder>();
  const byId = new Map(variants.map((v) => [v.id, v]));

  const settings = await getSettings(db);
  const lines: { variant: VariantForOrder; quantity: number; price: number }[] = [];
  for (const [id, quantity] of quantities) {
    const variant = byId.get(id);
    if (!variant) throw new OrderError('variant_unavailable', `المنتج رقم ${id} غير متوفر`, 409);
    if (variant.stock != null && variant.stock < quantity) {
      throw new OrderError('out_of_stock', `الكمية المطلوبة من ${variant.product_name} غير متوفرة`, 409);
    }
    lines.push({ variant, quantity, price: unitPrice(variant, region, settings) });
  }

  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const shipping = shippingFee(region, settings);
  const isCod = input.paymentMethod === 'cod';
  const number = orderNumber();
  const c = input.customer;

  const inserted = await db
    .prepare(
      `INSERT INTO orders (number, access_token, region, currency, payment_method, payment_status, status,
         subtotal, shipping, total, customer_name, customer_phone, customer_email, country, city, address, notes)
       VALUES (?, ?, ?, ?, ?, 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .bind(
      number,
      accessToken(),
      region,
      currencyForRegion(region),
      input.paymentMethod,
      isCod ? 'confirmed' : 'pending_payment',
      subtotal,
      shipping,
      subtotal + shipping,
      c.name,
      c.phone,
      c.email ?? null,
      c.country.toUpperCase(),
      c.city,
      c.address,
      input.notes ?? null,
    )
    .first<OrderRow>();
  if (!inserted) throw new Error('failed to insert order');

  const statements = lines.flatMap(({ variant, quantity, price }) => {
    const stmts = [
      db
        .prepare(
          `INSERT INTO order_items (order_id, variant_id, supplier_id, product_name, sku, size, color, quantity, unit_price)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(inserted.id, variant.id, variant.supplier_id, variant.product_name, variant.sku, variant.size, variant.color, quantity, price),
    ];
    if (variant.stock != null) {
      stmts.push(db.prepare('UPDATE variants SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL').bind(quantity, variant.id));
    }
    return stmts;
  });
  statements.push(
    db.prepare('INSERT INTO order_events (order_id, type, message) VALUES (?, ?, ?)').bind(inserted.id, 'created', `payment: ${input.paymentMethod}`),
  );
  await db.batch(statements);

  return inserted;
}

export async function setOrderStatus(db: D1Database, order: OrderRow, status: OrderStatus, message = ''): Promise<void> {
  const stmts = [
    db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, order.id),
    db.prepare('INSERT INTO order_events (order_id, type, message) VALUES (?, ?, ?)').bind(order.id, `status:${status}`, message),
  ];
  if (status === 'cancelled' && order.status !== 'cancelled') {
    // Give back reserved stock for variants that track it.
    stmts.push(
      db
        .prepare(
          `UPDATE variants SET stock = stock + (SELECT COALESCE(SUM(quantity), 0) FROM order_items oi WHERE oi.order_id = ? AND oi.variant_id = variants.id)
           WHERE stock IS NOT NULL AND id IN (SELECT variant_id FROM order_items WHERE order_id = ?)`,
        )
        .bind(order.id, order.id),
    );
  }
  await db.batch(stmts);
}

/** Marks an order as paid and confirmed. Idempotent. */
export async function markPaid(db: D1Database, order: OrderRow, paymentRef: string | null, message: string): Promise<boolean> {
  if (order.payment_status === 'paid' || order.status === 'cancelled') return false;
  await db.batch([
    db
      .prepare(
        `UPDATE orders SET payment_status = 'paid', status = 'confirmed', payment_ref = COALESCE(?, payment_ref), updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(paymentRef, order.id),
    db.prepare('INSERT INTO order_events (order_id, type, message) VALUES (?, ?, ?)').bind(order.id, 'payment:paid', message),
  ]);
  return true;
}

/**
 * Sends a confirmed order to its supplier(s). Items are grouped per supplier; groups already sent are skipped,
 * so this is safe to retry. The order moves to `sent_to_supplier` only when every group was sent via API;
 * manual suppliers (or items with no supplier) leave it `confirmed` for the admin to forward by hand.
 */
export async function forwardToSuppliers(env: Env, orderId: number, fetchFn?: typeof fetch): Promise<{ sent: number; manual: number; failed: number }> {
  const db = env.DB;
  const order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<OrderRow>();
  if (!order || order.status !== 'confirmed') return { sent: 0, manual: 0, failed: 0 };

  const items = await getOrderItems(db, orderId);
  const groups = new Map<number | null, OrderItemRow[]>();
  for (const item of items) {
    const list = groups.get(item.supplier_id) ?? [];
    list.push(item);
    groups.set(item.supplier_id, list);
  }

  let sent = 0;
  let manual = 0;
  let failed = 0;
  for (const [supplierId, groupItems] of groups) {
    if (groupItems.every((i) => i.supplier_order_ref)) {
      sent++;
      continue;
    }
    const supplier = supplierId == null ? null : await db.prepare('SELECT * FROM suppliers WHERE id = ?').bind(supplierId).first<SupplierRow>();
    if (!supplier || supplier.adapter === 'manual' || !supplier.active) {
      manual++;
      continue;
    }

    const refs = await db
      .prepare(
        `SELECT v.id, v.supplier_variant_ref, p.supplier_product_ref FROM variants v JOIN products p ON p.id = v.product_id
         WHERE v.id IN (${groupItems.map(() => '?').join(',')})`,
      )
      .bind(...groupItems.map((i) => i.variant_id ?? 0))
      .all<{ id: number; supplier_variant_ref: string | null; supplier_product_ref: string | null }>();
    const refById = new Map(refs.results.map((r) => [r.id, r]));

    try {
      const result = await getAdapter(env, supplier, fetchFn).placeOrder({
        orderNumber: order.number,
        customer: {
          name: order.customer_name,
          phone: order.customer_phone,
          email: order.customer_email,
          country: order.country,
          city: order.city,
          address: order.address,
        },
        notes: order.notes,
        lines: groupItems.map((i) => ({
          sku: i.sku,
          supplierVariantRef: refById.get(i.variant_id ?? 0)?.supplier_variant_ref ?? null,
          supplierProductRef: refById.get(i.variant_id ?? 0)?.supplier_product_ref ?? null,
          quantity: i.quantity,
          size: i.size,
          color: i.color,
        })),
      });
      await db.batch([
        ...groupItems.map((i) =>
          db.prepare('UPDATE order_items SET supplier_order_ref = ?, supplier_status = ? WHERE id = ?').bind(result.supplierOrderRef, result.status, i.id),
        ),
        db
          .prepare('INSERT INTO order_events (order_id, type, message) VALUES (?, ?, ?)')
          .bind(orderId, 'supplier:sent', `${supplier.name}: ${result.supplierOrderRef ?? ''}`),
      ]);
      sent++;
    } catch (err) {
      failed++;
      await addEvent(db, orderId, 'supplier:error', `${supplier.name}: ${(err as Error).message}`.slice(0, 500));
    }
  }

  if (failed === 0 && manual === 0 && sent > 0) {
    await setOrderStatus(db, order, 'sent_to_supplier', 'all items sent to suppliers');
  }
  return { sent, manual, failed };
}

/** Forwards the order in the background if all its suppliers have auto-forwarding on. */
export async function autoForward(env: Env, orderId: number): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS blocking FROM order_items oi LEFT JOIN suppliers s ON s.id = oi.supplier_id
     WHERE oi.order_id = ? AND (s.id IS NULL OR s.auto_forward = 0 OR s.adapter = 'manual')`,
  )
    .bind(orderId)
    .first<{ blocking: number }>();
  if (row && row.blocking > 0) return;
  await forwardToSuppliers(env, orderId);
}

/** Pulls supplier status for orders that are with suppliers; moves orders to shipped/delivered/cancelled. */
export async function syncSupplierStatuses(env: Env, fetchFn?: typeof fetch): Promise<number> {
  const db = env.DB;
  const { results } = await db
    .prepare(
      `SELECT oi.*, o.status AS order_status FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.status IN ('sent_to_supplier', 'shipped') AND oi.supplier_order_ref IS NOT NULL AND oi.supplier_id IS NOT NULL`,
    )
    .all<OrderItemRow & { order_status: OrderStatus }>();

  const suppliers = new Map<number, SupplierRow | null>();
  const checked = new Map<string, Awaited<ReturnType<ReturnType<typeof getAdapter>['getOrderStatus']>>>();
  let updated = 0;

  for (const item of results) {
    const supplierId = item.supplier_id!;
    if (!suppliers.has(supplierId)) {
      suppliers.set(supplierId, await db.prepare('SELECT * FROM suppliers WHERE id = ?').bind(supplierId).first<SupplierRow>());
    }
    const supplier = suppliers.get(supplierId);
    if (!supplier || !supplier.active) continue;

    const key = `${supplierId}:${item.supplier_order_ref}`;
    if (!checked.has(key)) {
      try {
        checked.set(key, await getAdapter(env, supplier, fetchFn).getOrderStatus(item.supplier_order_ref!));
      } catch (err) {
        checked.set(key, null);
        await addEvent(db, item.order_id, 'supplier:sync_error', (err as Error).message.slice(0, 500));
      }
    }
    const status = checked.get(key);
    if (!status) continue;
    if (status.status !== item.supplier_status || status.trackingNumber !== item.tracking_number) {
      await db
        .prepare('UPDATE order_items SET supplier_status = ?, tracking_number = COALESCE(?, tracking_number) WHERE id = ?')
        .bind(status.status, status.trackingNumber, item.id)
        .run();
      updated++;
    }
  }

  // Advance each order to the least-advanced state among its items.
  const orderIds = [...new Set(results.map((r) => r.order_id))];
  for (const orderId of orderIds) {
    const order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first<OrderRow>();
    if (!order) continue;
    const items = await getOrderItems(db, orderId);
    const mapped = items.map((i) => {
      const s = checked.get(`${i.supplier_id}:${i.supplier_order_ref}`);
      return s?.mapped ?? null;
    });
    let next: OrderStatus | null = null;
    if (mapped.every((m) => m === 'cancelled')) next = 'cancelled';
    else if (mapped.every((m) => m === 'delivered')) next = 'delivered';
    else if (mapped.every((m) => m === 'shipped' || m === 'delivered')) next = 'shipped';
    if (next && next !== order.status && ADMIN_TRANSITIONS[order.status].includes(next)) {
      await setOrderStatus(db, order, next, 'supplier status sync');
    }
  }
  return updated;
}

/** Cancels Bankak/card orders that were never paid within the configured time. */
export async function expireUnpaidOrders(db: D1Database): Promise<number> {
  const settings = await getSettings(db);
  const hours = settings.unpaid_order_ttl_hours > 0 ? settings.unpaid_order_ttl_hours : 48;
  const { results } = await db
    .prepare(`SELECT * FROM orders WHERE status = 'pending_payment' AND created_at < datetime('now', ?)`)
    .bind(`-${hours} hours`)
    .all<OrderRow>();
  for (const order of results) await setOrderStatus(db, order, 'cancelled', `not paid within ${hours}h`);
  return results.length;
}
