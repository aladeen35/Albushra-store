import type {
  SupplierAdapter,
  SupplierOrderRequest,
  SupplierOrderResult,
  SupplierOrderStatus,
  SupplierProduct,
} from './types';

/**
 * Generic JSON REST adapter. Endpoint paths and the auth header are configurable per supplier
 * (suppliers.config), so most simple supplier APIs only need configuration. Suppliers whose
 * payloads differ get their own adapter file implementing SupplierAdapter.
 *
 * Expected supplier API shape (defaults):
 *   POST {baseUrl}/orders            body: SupplierOrderRequest   -> { id, status }
 *   GET  {baseUrl}/orders/{id}                                    -> { status, tracking_number }
 *   GET  {baseUrl}/products                                       -> { products: SupplierProduct[] }
 */
export interface HttpJsonConfig {
  baseUrl: string;
  authHeader?: string; // default: Authorization (value "Bearer <key>")
  authScheme?: string; // default: Bearer; empty string sends the raw key
  ordersPath?: string;
  orderStatusPath?: string; // "{id}" is replaced with the supplier order id
  productsPath?: string;
  statusMap?: Record<string, 'shipped' | 'delivered' | 'cancelled'>;
}

const DEFAULT_STATUS_MAP: Record<string, 'shipped' | 'delivered' | 'cancelled'> = {
  shipped: 'shipped',
  in_transit: 'shipped',
  delivered: 'delivered',
  cancelled: 'cancelled',
  canceled: 'cancelled',
};

export class HttpJsonAdapter implements SupplierAdapter {
  constructor(
    private readonly config: HttpJsonConfig,
    private readonly apiKey: string | undefined,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    if (!config.baseUrl) throw new Error('http_json supplier requires config.baseUrl');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.apiKey) {
      const scheme = this.config.authScheme ?? 'Bearer';
      headers[(this.config.authHeader ?? 'Authorization').toLowerCase()] = scheme ? `${scheme} ${this.apiKey}` : this.apiKey;
    }
    const url = this.config.baseUrl.replace(/\/+$/, '') + path;
    const res = await this.fetchFn(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`supplier ${method} ${path} failed: ${res.status} ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async placeOrder(req: SupplierOrderRequest): Promise<SupplierOrderResult> {
    const data = await this.request<{ id?: string | number; status?: string }>('POST', this.config.ordersPath ?? '/orders', req);
    if (data.id == null) throw new Error('supplier did not return an order id');
    return { supplierOrderRef: String(data.id), status: data.status ?? 'received' };
  }

  async getOrderStatus(ref: string): Promise<SupplierOrderStatus | null> {
    const path = (this.config.orderStatusPath ?? '/orders/{id}').replace('{id}', encodeURIComponent(ref));
    const data = await this.request<{ status?: string; tracking_number?: string | null }>('GET', path);
    if (!data.status) return null;
    const map = { ...DEFAULT_STATUS_MAP, ...this.config.statusMap };
    return {
      status: data.status,
      trackingNumber: data.tracking_number ?? null,
      mapped: map[data.status.toLowerCase()] ?? null,
    };
  }

  async listProducts(): Promise<SupplierProduct[]> {
    const data = await this.request<{ products?: SupplierProduct[] }>('GET', this.config.productsPath ?? '/products');
    return data.products ?? [];
  }
}
