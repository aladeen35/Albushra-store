// API access, region/currency state and formatting helpers.

const REGION_KEY = 'bushra.region';

export async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: options.body && !(options.body instanceof FormData) ? { 'content-type': 'application/json', ...options.headers } : options.headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'حدث خطأ، حاول مرة أخرى');
    err.status = res.status;
    err.code = data.error;
    err.data = data;
    throw err;
  }
  return data;
}

let configPromise;
export function getConfig() {
  configPromise ??= api('/config').catch(() => ({ regions: { sd: { currency: 'SDG', paymentMethods: ['bankak'] }, intl: { currency: 'USD', paymentMethods: [] } } }));
  return configPromise;
}

let categoriesPromise;
export function getCategories() {
  categoriesPromise ??= api('/categories').then((d) => d.categories).catch(() => []);
  return categoriesPromise;
}

export function getRegion() {
  try {
    const saved = localStorage.getItem(REGION_KEY);
    if (saved === 'sd' || saved === 'intl') return saved;
  } catch {}
  return null;
}

export function setRegion(region) {
  try {
    localStorage.setItem(REGION_KEY, region);
  } catch {}
  window.dispatchEvent(new CustomEvent('region-change', { detail: region }));
}

/** Region to price in: the shopper's choice, else Cloudflare's country guess, else Sudan. */
export async function currentRegion() {
  const saved = getRegion();
  if (saved) return saved;
  const config = await getConfig();
  return config.detectedCountry && config.detectedCountry !== 'SD' ? 'intl' : 'sd';
}

export function formatPrice(amount, currency) {
  if (amount == null) return '';
  if (currency === 'USD') return `$${(amount / 100).toLocaleString('en-US', { minimumFractionDigits: amount % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
  return `${amount.toLocaleString('en-US')} ج.س`;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

const COLORS = {
  أسود: '#1d1d1f', أبيض: '#f4f4f1', أصفر: '#f6c516', وردي: '#f3a6bf', أخضر: '#2f9e35', بيج: '#e4d6bd', أزرق: '#4f78b4',
  كحلي: '#1d2a4a', أحمر: '#c4202b', رمادي: '#9a9a9a', بني: '#7a5130', ذهبي: '#c9a24a', زيتي: '#5b6b2f', نبيتي: '#6d1a2a',
  سماوي: '#8ec9f0', برتقالي: '#f08a24', بنفسجي: '#6a3fa0', كريمي: '#f1e7cf', عنابي: '#7b1f2b',
};
export function colorSwatch(name) {
  return COLORS[(name || '').trim()] || 'linear-gradient(135deg,#ddd,#999)';
}

/** Groups a product's variants by color, keeping sizes and the color's images together. */
export function colorGroups(product) {
  const groups = new Map();
  for (const v of product.variants) {
    const key = v.color || '—';
    if (!groups.has(key)) groups.set(key, { color: v.color, images: v.images?.length ? v.images : product.images, variants: [] });
    groups.get(key).variants.push(v);
  }
  return [...groups.values()];
}
