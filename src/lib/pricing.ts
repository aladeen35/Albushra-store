import type { StoreSettings } from './settings';

export type Region = 'sd' | 'intl';
export type Currency = 'SDG' | 'USD';

export function regionForCountry(country: string): Region {
  return country.toUpperCase() === 'SD' ? 'sd' : 'intl';
}

export function currencyForRegion(region: Region): Currency {
  return region === 'sd' ? 'SDG' : 'USD';
}

/** Unit price of a variant in the region's currency (SDG whole pounds or USD cents). */
export function unitPrice(
  variant: { price_usd: number; price_sdg: number | null },
  region: Region,
  settings: Pick<StoreSettings, 'usd_to_sdg' | 'sdg_rounding'>,
): number {
  if (region === 'intl') return variant.price_usd;
  if (variant.price_sdg != null) return variant.price_sdg;
  const raw = (variant.price_usd / 100) * settings.usd_to_sdg;
  const step = settings.sdg_rounding > 0 ? settings.sdg_rounding : 1;
  return Math.ceil(raw / step) * step;
}

export function shippingFee(region: Region, settings: Pick<StoreSettings, 'shipping_sd_sdg' | 'shipping_intl_usd'>): number {
  return region === 'sd' ? settings.shipping_sd_sdg : settings.shipping_intl_usd;
}

export const PAYMENT_METHODS: Record<Region, readonly ('cod' | 'bankak' | 'card')[]> = {
  sd: ['cod', 'bankak'],
  intl: ['card'],
};
