export interface StoreSettings {
  usd_to_sdg: number;
  sdg_rounding: number;
  shipping_sd_sdg: number;
  shipping_intl_usd: number;
  bankak_account_name: string;
  bankak_account_number: string;
  unpaid_order_ttl_hours: number;
  whatsapp_number: string;
}

const NUMERIC: (keyof StoreSettings)[] = [
  'usd_to_sdg',
  'sdg_rounding',
  'shipping_sd_sdg',
  'shipping_intl_usd',
  'unpaid_order_ttl_hours',
];

export const SETTING_KEYS = [
  ...NUMERIC,
  'bankak_account_name',
  'bankak_account_number',
  'whatsapp_number',
] as (keyof StoreSettings)[];

export function isNumericSetting(key: string): boolean {
  return (NUMERIC as string[]).includes(key);
}

export async function getSettings(db: D1Database): Promise<StoreSettings> {
  const { results } = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const out: Record<string, string | number> = {};
  for (const { key, value } of results) {
    out[key] = isNumericSetting(key) ? Number(value) : value;
  }
  return out as unknown as StoreSettings;
}
