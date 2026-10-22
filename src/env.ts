export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS?: Fetcher;
  STORE_NAME: string;
  PUBLIC_URL: string;
  ADMIN_TOKEN?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  // Supplier API keys are read dynamically: SUPPLIER_<CODE>_API_KEY
  [key: string]: unknown;
}

export type AppEnv = { Bindings: Env };
