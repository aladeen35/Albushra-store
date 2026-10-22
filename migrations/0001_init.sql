-- Money is stored as integers: USD in cents, SDG in whole pounds.

CREATE TABLE suppliers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,            -- used for the API key secret: SUPPLIER_<CODE>_API_KEY
  name        TEXT NOT NULL,
  adapter     TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'http_json'
  config      TEXT NOT NULL DEFAULT '{}',      -- adapter settings as JSON (base URL, paths, ...)
  auto_forward INTEGER NOT NULL DEFAULT 1,     -- send confirmed orders to the supplier automatically
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE products (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  supplier_id  INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_product_ref TEXT,
  images       TEXT NOT NULL DEFAULT '[]',     -- JSON array of URLs
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (supplier_id, supplier_product_ref)
);
CREATE INDEX idx_products_category ON products(category_id);

CREATE TABLE variants (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku           TEXT NOT NULL UNIQUE,
  size          TEXT,
  color         TEXT,
  price_usd     INTEGER NOT NULL,              -- selling price, cents
  price_sdg     INTEGER,                       -- optional fixed SDG price; otherwise converted from USD
  cost_usd      INTEGER,                       -- supplier cost, cents (for margin reports)
  supplier_variant_ref TEXT,
  stock         INTEGER,                       -- NULL = unlimited / managed by supplier
  active        INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_variants_product ON variants(product_id);

CREATE TABLE orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  number          TEXT NOT NULL UNIQUE,        -- shown to the customer, e.g. BSH-7K2M9Q
  access_token    TEXT NOT NULL,               -- lets the customer track the order / upload a receipt
  region          TEXT NOT NULL,               -- 'sd' (inside Sudan) | 'intl'
  currency        TEXT NOT NULL,               -- 'SDG' | 'USD'
  payment_method  TEXT NOT NULL,               -- 'cod' | 'bankak' | 'card'
  payment_status  TEXT NOT NULL,               -- 'unpaid' | 'pending_verification' | 'paid' | 'rejected' | 'refunded'
  status          TEXT NOT NULL,               -- see src/lib/orders.ts
  subtotal        INTEGER NOT NULL,
  shipping        INTEGER NOT NULL,
  total           INTEGER NOT NULL,
  customer_name   TEXT NOT NULL,
  customer_phone  TEXT NOT NULL,
  customer_email  TEXT,
  country         TEXT NOT NULL,               -- ISO 3166-1 alpha-2
  city            TEXT NOT NULL,
  address         TEXT NOT NULL,
  notes           TEXT,
  receipt_key     TEXT,                        -- R2 key of the Bankak receipt
  payment_ref     TEXT,                        -- Stripe session id, Bankak transaction id, ...
  admin_note      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);

CREATE TABLE order_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id    INTEGER REFERENCES variants(id) ON DELETE SET NULL,
  supplier_id   INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  product_name  TEXT NOT NULL,
  sku           TEXT NOT NULL,
  size          TEXT,
  color         TEXT,
  quantity      INTEGER NOT NULL,
  unit_price    INTEGER NOT NULL,              -- in the order currency
  supplier_order_ref TEXT,
  supplier_status    TEXT,
  tracking_number    TEXT
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE order_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  message    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_order_events_order ON order_events(order_id);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('usd_to_sdg', '2500'),                -- exchange rate used to show SDG prices
  ('sdg_rounding', '500'),               -- round SDG prices up to this step
  ('shipping_sd_sdg', '5000'),           -- delivery fee inside Sudan (SDG)
  ('shipping_intl_usd', '1500'),         -- shipping fee outside Sudan (USD cents)
  ('bankak_account_name', ''),
  ('bankak_account_number', ''),
  ('unpaid_order_ttl_hours', '48'),
  ('whatsapp_number', '');
