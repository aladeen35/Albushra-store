// Client-side router for the storefront.
import { categories, products } from './pages/catalog.js';
import checkout, { order } from './pages/checkout.js';
import home from './pages/home.js';
import { about, contact, notFound } from './pages/info.js';
import product from './pages/product.js';
import { closeOverlay, renderFooter, renderHeader, setActiveNav } from './ui.js';

const ROUTES = [
  [/^\/$/, (m) => home(m)],
  [/^\/products\/?$/, (m, q) => products(m, { query: q })],
  [/^\/c\/([^/]+)\/?$/, (m, q, [slug]) => products(m, { slug: decodeURIComponent(slug), query: q })],
  [/^\/categories\/?$/, (m) => categories(m)],
  [/^\/p\/([^/]+)\/?$/, (m, q, [slug]) => product(m, { slug: decodeURIComponent(slug) })],
  [/^\/checkout\/?$/, (m) => checkout(m)],
  [/^\/order\/([^/]+)\/?$/, (m, q, [number]) => order(m, { number: decodeURIComponent(number), query: q })],
  [/^\/about\/?$/, (m) => about(m)],
  [/^\/contact\/?$/, (m) => contact(m)],
];

const main = document.getElementById('main');
let cleanup = null;
let renderId = 0;

async function render() {
  const id = ++renderId;
  cleanup?.();
  cleanup = null;
  closeOverlay();
  const { pathname, search } = window.location;
  const query = new URLSearchParams(search);
  setActiveNav(pathname);
  document.title = 'متجر البشرى | أناقتك .. على ذوقك';
  main.innerHTML = '<div class="loading"><div class="spinner" role="status" aria-label="جاري التحميل"></div></div>';
  try {
    for (const [pattern, handler] of ROUTES) {
      const match = pathname.match(pattern);
      if (match) {
        const result = await handler(main, query, match.slice(1));
        if (id === renderId) cleanup = typeof result === 'function' ? result : null;
        else if (typeof result === 'function') result();
        return;
      }
    }
    await notFound(main);
  } catch (err) {
    console.error(err);
    if (id === renderId) main.innerHTML = `<div class="container"><div class="empty"><p>تعذّر تحميل الصفحة. تحقق من الاتصال وحاول مرة أخرى.</p><button class="btn" onclick="location.reload()">إعادة المحاولة</button></div></div>`;
  }
}

function go(url, replace = false) {
  if (url === window.location.pathname + window.location.search) return;
  history[replace ? 'replaceState' : 'pushState']({}, '', url);
  window.scrollTo({ top: 0, behavior: 'instant' });
  render();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  go(a.getAttribute('href'));
});
window.addEventListener('navigate', (e) => go(e.detail, e.detail === '/404'));
window.addEventListener('popstate', render);

renderHeader();
renderFooter();
render();
