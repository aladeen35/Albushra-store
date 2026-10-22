export interface SupplierRow {
  id: number;
  code: string;
  name: string;
  adapter: string;
  config: string;
  auto_forward: number;
  active: number;
}

export interface SupplierOrderLine {
  sku: string;
  supplierVariantRef: string | null;
  supplierProductRef: string | null;
  quantity: number;
  size: string | null;
  color: string | null;
}

export interface SupplierOrderRequest {
  orderNumber: string;
  customer: {
    name: string;
    phone: string;
    email: string | null;
    country: string;
    city: string;
    address: string;
  };
  lines: SupplierOrderLine[];
  notes: string | null;
}

export interface SupplierOrderResult {
  /** Supplier's own order id, used for status sync. Null for manual suppliers. */
  supplierOrderRef: string | null;
  status: string;
}

export interface SupplierOrderStatus {
  status: string;
  trackingNumber: string | null;
  /** Mapped to our order status when the supplier reports a terminal or shipping state. */
  mapped: 'shipped' | 'delivered' | 'cancelled' | null;
}

export interface SupplierProduct {
  ref: string;
  name: string;
  description: string;
  images: string[];
  variants: {
    ref: string;
    sku: string;
    size: string | null;
    color: string | null;
    costUsdCents: number;
    stock: number | null;
  }[];
}

export interface SupplierAdapter {
  placeOrder(req: SupplierOrderRequest): Promise<SupplierOrderResult>;
  getOrderStatus(supplierOrderRef: string): Promise<SupplierOrderStatus | null>;
  listProducts(): Promise<SupplierProduct[]>;
}
