// Client-side router for the storefront.
import { splashDone, splashProgress } from './splash.js';
import { favorites, haptic } from './favorites.js';
import { icons } from './icons.js';
import { favoritesPage, ordersPage } from './pages/account.js';
import { categories, products } from './pages/catalog.js';
import checkout, { order } from './pages/checkout.js';
import home from './pages/home.js';
import { about, contact, notFound } from './pages/info.js';
import product from './pages/product.js';
import { closeOverlay, renderFooter, renderHeader, renderTabbar, setActiveNav, toast } from './ui.js';

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
  [/^\/favorites\/?$/, (m) => favoritesPage(m)],
  [/^\/orders\/?$/, (m) => ordersPage(m)],
];

const main = document.getElementById('main');
let cleanup = null;
let renderId = 0;

async function render() {
  const id = ++renderId;
  cleanup?.();
  cleanup = null;
  closeOverlay();
  document.body.classList.remove('has-buybar');
  const { pathname, search } = window.location;
  const query = new URLSearchParams(search);
  setActiveNav(pathname);
  document.title = 'متجر البشرى | أناقتك .. على ذوقك';
  main.innerHTML = '<div class="page-skeleton" aria-busy="true" aria-label="جاري التحميل"><span class="sk sk-hero"></span><span class="sk sk-line"></span><span class="sk sk-line short"></span></div>';
  try {
    for (const [pattern, handler] of ROUTES) {
      const match = pathname.match(pattern);
      if (match) {
        const result = await handler(main, query, match.slice(1));
        if (id === renderId) cleanup = typeof result === 'function' ? result : null;
        else if (typeof result === 'function') result();
        enter(id);
        return;
      }
    }
    await notFound(main);
    enter(id);
  } catch (err) {
    console.error(err);
    if (id === renderId) main.innerHTML = `<div class="container"><div class="empty"><p>تعذّر تحميل الصفحة. تحقق من الاتصال وحاول مرة أخرى.</p><button class="btn" onclick="location.reload()">إعادة المحاولة</button></div></div>`;
    enter(id);
  }
}

/** Page entrance (fade/slide) once content is in place; first render also lets the splash go. */
function enter(id) {
  if (id !== renderId) return;
  main.classList.remove('page-enter');
  void main.offsetWidth;
  main.classList.add('page-enter');
  splashDone();
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

// Favourite (heart) buttons anywhere on the page.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-fav]');
  if (!btn) return;
  e.preventDefault();
  const on = favorites.toggle(btn.dataset.fav);
  document.querySelectorAll(`[data-fav="${CSS.escape(btn.dataset.fav)}"]`).forEach((b) => {
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', (on ? 'إزالة من المفضلة' : 'أضف إلى المفضلة') + b.getAttribute('aria-label').replace(/^[^:]*/, ''));
    b.innerHTML = on ? icons.heartFill : icons.heart;
    b.classList.remove('pop');
    void b.offsetWidth;
    b.classList.add('pop');
  });
  haptic();
  toast(on ? 'أُضيفت إلى المفضلة' : 'أُزيلت من المفضلة');
});

// Splash progress: fonts, then the 3D rack's garments as they are prepared.
splashProgress(0.18);
document.fonts?.ready.then(() => splashProgress(0.35));
window.addEventListener('rack-progress', (e) => splashProgress(0.35 + 0.6 * e.detail));

renderHeader();
renderTabbar();
renderFooter();
render();

// Installable web app (PWA) with offline shell. Not needed inside the Android app, which bundles everything.
if ('serviceWorker' in navigator && !document.documentElement.classList.contains('is-app') && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
