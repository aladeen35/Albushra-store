// Wishlist kept on the device: product slugs, newest first.
const KEY = 'bushra.favorites';

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export const favorites = {
  list: read,
  has: (slug) => read().includes(slug),
  toggle(slug) {
    const list = read();
    const on = !list.includes(slug);
    const next = on ? [slug, ...list] : list.filter((s) => s !== slug);
    try {
      localStorage.setItem(KEY, JSON.stringify(next.slice(0, 100)));
    } catch {}
    window.dispatchEvent(new CustomEvent('favorites-change'));
    return on;
  },
};

/** Short vibration for confirmations (Android app / supporting browsers). */
export function haptic(ms = 12) {
  try {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) navigator.vibrate?.(ms);
  } catch {}
}
