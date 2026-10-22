// Cart kept in localStorage as [{ variantId, quantity }]. Prices are always re-read from the server.

const KEY = 'bushra.cart';

function read() {
  try {
    const items = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(items) ? items.filter((i) => Number.isInteger(i.variantId) && i.quantity > 0) : [];
  } catch {
    return [];
  }
}

function write(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {}
  window.dispatchEvent(new CustomEvent('cart-change'));
}

export const cart = {
  items: read,
  count: () => read().reduce((n, i) => n + i.quantity, 0),
  add(variantId, quantity = 1) {
    const items = read();
    const line = items.find((i) => i.variantId === variantId);
    if (line) line.quantity = Math.min(line.quantity + quantity, 20);
    else items.push({ variantId, quantity });
    write(items);
  },
  set(variantId, quantity) {
    const items = read()
      .map((i) => (i.variantId === variantId ? { ...i, quantity: Math.min(quantity, 20) } : i))
      .filter((i) => i.quantity > 0);
    write(items);
  },
  remove(variantId) {
    write(read().filter((i) => i.variantId !== variantId));
  },
  clear() {
    write([]);
  },
};
