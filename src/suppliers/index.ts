import type { Env } from '../env';
import { HttpJsonAdapter, type HttpJsonConfig } from './http-json';
import type { SupplierAdapter, SupplierRow } from './types';

/** Supplier that has no API: orders are forwarded by hand (e.g. WhatsApp) from the admin panel. */
const manualAdapter: SupplierAdapter = {
  async placeOrder() {
    return { supplierOrderRef: null, status: 'manual' };
  },
  async getOrderStatus() {
    return null;
  },
  async listProducts() {
    return [];
  },
};

export function supplierApiKey(env: Env, code: string): string | undefined {
  const value = env[`SUPPLIER_${code.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`];
  return typeof value === 'string' && value ? value : undefined;
}

export function getAdapter(env: Env, supplier: SupplierRow, fetchFn?: typeof fetch): SupplierAdapter {
  switch (supplier.adapter) {
    case 'manual':
      return manualAdapter;
    case 'http_json':
      return new HttpJsonAdapter(JSON.parse(supplier.config) as HttpJsonConfig, supplierApiKey(env, supplier.code), fetchFn);
    default:
      throw new Error(`unknown supplier adapter: ${supplier.adapter}`);
  }
}

export const SUPPLIER_ADAPTERS = ['manual', 'http_json'] as const;
