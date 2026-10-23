import { api, currentRegion, esc, formatPrice, getCategories, getConfig, setRegion } from './api.js';
import { cart } from './cart.js';
import { icons, logoMark } from './icons.js';
import { lockScroll } from './motion.js';

export const NAV = [
  { href: '/', label: 'الرئيسية' },
  { href: '/products', label: 'المنتجات' },
  { href: '/categories', label: 'الأقسام' },
  { href: '/about', label: 'من نحن' },
  { href: '/contact', label: 'اتصل بنا' },
];

export function logo(cls = '') {
  return `<a class="logo ${cls}" href="/" data-link aria-label="متجر البشرى — الرئيسية">${logoMark}<span class="wordmark">متجر <em>البشرى</em></span></a>`;
}

export function marquee() {
  const words = ['خدمة مميزة', 'جودة عالية', 'شحن سريع لجميع المناطق', 'أحدث الموديلات', 'عبايات وجلاليب سودانية', 'متجر البشرى'];
  const group = `<div class="marquee-group" aria-hidden="true">${words.map((w) => `<span>${w}</span>${icons.hanger}`).join('')}</div>`;
  return `<div class="marquee"><p class="sr-only">${words.join(' • ')}</p><div class="marquee-track">${group}${group}${group}${group}</div></div>`;
}

export function renderHeader() {
  const header = document.getElementById('site-header');
  header.innerHTML = `
    <div class="container header-top">
      <div class="header-side">
        <button class="icon-btn" type="button" data-open="menu" aria-label="القائمة">${icons.menu}</button>
        <a class="text-link hide-md" href="/about" data-link>من نحن</a>
      </div>
      ${logo()}
      <div class="header-side end">
        <button class="region-btn hide-sm" type="button" data-open="region" aria-label="تغيير بلد الشحن والعملة"><span class="dot"></span><span data-region-label>…</span></button>
        <a class="text-link hide-md" href="/contact" data-link>اتصل بنا</a>
        <button class="icon-btn" type="button" data-open="search" aria-label="بحث">${icons.search}</button>
        <button class="icon-btn hide-tabbar" type="button" data-open="cart" aria-label="السلة">${icons.cart}<span class="badge" data-cart-count></span></button>
      </div>
    </div>
    <nav class="main-nav" aria-label="القائمة الرئيسية"><ul>${NAV.map((n) => `<li><a href="${n.href}" data-link>${n.label}</a></li>`).join('')}</ul></nav>`;

  header.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open]');
    if (!btn) return;
    const what = btn.dataset.open;
    if (what === 'menu') openMenu();
    if (what === 'cart') openCart();
    if (what === 'search') openSearch();
    if (what === 'region') openRegion();
  });
  window.addEventListener('scroll', () => header.classList.toggle('scrolled', window.scrollY > 8), { passive: true });
  updateCartBadge();
  updateRegionLabel();
  window.addEventListener('cart-change', updateCartBadge);
  window.addEventListener('region-change', updateRegionLabel);
}

const TABS = [
  { href: '/', label: 'الرئيسية', icon: 'home', match: (p) => p === '/' },
  { href: '/categories', label: 'الأقسام', icon: 'grid', match: (p) => p.startsWith('/categories') || p.startsWith('/c/') || p.startsWith('/products') || p.startsWith('/p/') },
  { href: '/tryon', label: 'جرّبها', icon: 'mannequin', match: (p) => p.startsWith('/tryon') || p.startsWith('/favorites') },
  { action: 'cart', label: 'السلة', icon: 'bag', match: (p) => p.startsWith('/checkout') },
  { href: '/orders', label: 'طلباتي', icon: 'receipt', match: (p) => p.startsWith('/orders') || p.startsWith('/order/') },
];

/** App-style bottom navigation (phones and the installed app). */
export function renderTabbar() {
  const bar = document.getElementById('tabbar');
  if (!bar) return;
  bar.innerHTML = `<ul>${TABS.map((t, i) => {
    const inner = `<span class="tab-icon">${icons[t.icon]}${t.action === 'cart' ? '<span class="badge" data-cart-count></span>' : ''}${t.href === '/tryon' ? '<span class="badge" data-fav-count></span>' : ''}</span><span class="tab-label">${t.label}</span>`;
    return `<li>${t.href ? `<a href="${t.href}" data-link data-tab="${i}">${inner}</a>` : `<button type="button" data-tab="${i}" data-open-cart aria-haspopup="dialog">${inner}</button>`}</li>`;
  }).join('')}</ul>`;
  bar.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-cart]')) openCart();
  });
  updateCartBadge();
  updateFavBadge();
  window.addEventListener('favorites-change', updateFavBadge);
}

function updateFavBadge() {
  let n = 0;
  try {
    n = JSON.parse(localStorage.getItem('bushra.favorites') || '[]').length;
  } catch {}
  document.querySelectorAll('[data-fav-count]').forEach((el) => (el.textContent = n ? String(n) : ''));
}

export function setActiveNav(path) {
  document.querySelectorAll('#tabbar [data-tab]').forEach((el) => {
    const on = TABS[Number(el.dataset.tab)].match(path);
    if (on) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  document.querySelectorAll('.main-nav a').forEach((a) => {
    const href = a.getAttribute('href');
    const on = href === '/' ? path === '/' : path.startsWith(href) || (href === '/products' && path.startsWith('/p/'));
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function updateCartBadge() {
  const n = cart.count();
  document.querySelectorAll('[data-cart-count]').forEach((el) => (el.textContent = n ? String(n) : ''));
}

async function updateRegionLabel() {
  const region = await currentRegion();
  document.querySelectorAll('[data-region-label]').forEach((el) => (el.textContent = region === 'sd' ? 'السودان · ج.س' : 'خارج السودان · $'));
}

export async function renderFooter() {
  const [cats, config] = await Promise.all([getCategories(), getConfig()]);
  const wa = config.whatsappNumber;
  document.getElementById('site-footer').innerHTML = `
    <div class="container">
      <div class="cols">
        <div>${logo('small')}<p class="tagline">أناقتك .. على ذوقك</p></div>
        <div><h3>الأقسام</h3><ul>${cats.map((c) => `<li><a href="/c/${encodeURIComponent(c.slug)}" data-link>${esc(c.name)}</a></li>`).join('')}</ul></div>
        <div><h3>المتجر</h3><ul>${NAV.map((n) => `<li><a href="${n.href}" data-link>${n.label}</a></li>`).join('')}</ul></div>
        <div><h3>تواصل معنا</h3><ul>
          ${wa ? `<li><a href="https://wa.me/${esc(wa.replace(/\D/g, ''))}" target="_blank" rel="noopener">واتساب: <span dir="ltr">${esc(wa)}</span></a></li>` : ''}
          <li><a href="/contact" data-link>صفحة التواصل</a></li>
        </ul></div>
      </div>
      <div class="bottom"><span>© ${new Date().getFullYear()} متجر البشرى. جميع الحقوق محفوظة.</span><span class="pay-badges"><span>بنكك</span><span>Visa</span><span>Mastercard</span></span></div>
    </div>`;
}

// ---------- Overlays ----------

let closeCurrent = null;

function overlay(html, cls) {
  closeCurrent?.();
  const root = document.getElementById('overlays');
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const panel = document.createElement('div');
  panel.className = cls;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('data-lenis-prevent', ''); // drawers scroll natively while the page stays put
  panel.innerHTML = html;
  lockScroll(true);
  root.append(scrim, panel);
  const previous = document.activeElement;
  requestAnimationFrame(() => {
    scrim.classList.add('open');
    panel.classList.add('open');
    panel.querySelector('input, button, a')?.focus();
  });
  const onKey = (e) => e.key === 'Escape' && close();
  function close() {
    scrim.classList.remove('open');
    panel.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    lockScroll(false);
    setTimeout(() => {
      scrim.remove();
      panel.remove();
    }, 300);
    closeCurrent = null;
    previous?.focus?.();
  }
  scrim.addEventListener('click', close);
  panel.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || e.target.closest('a[data-link]')) close();
  });
  document.addEventListener('keydown', onKey);
  closeCurrent = close;
  return { panel, close };
}

export function closeOverlay() {
  closeCurrent?.();
}

/** Android back button: close an open drawer/dialog first (returns true when handled). */
window.__appBack = () => {
  if (!closeCurrent) return false;
  closeCurrent();
  return true;
};

async function openMenu() {
  const cats = await getCategories();
  overlay(
    `<div class="drawer-head">${logo('small')}<button class="icon-btn" data-close aria-label="إغلاق">${icons.close}</button></div>
     <div class="drawer-body">
       <ul class="menu-list">${NAV.map((n) => `<li><a href="${n.href}" data-link>${n.label}</a></li>`).join('')}</ul>
       <ul class="menu-list sub">${cats.map((c) => `<li><a href="/c/${encodeURIComponent(c.slug)}" data-link>${esc(c.name)}</a></li>`).join('')}</ul>
     </div>
     <div class="drawer-foot"><button class="btn block small" data-region-switch>${icons.globe} <span data-region-label></span></button></div>`,
    'drawer start',
  ).panel.querySelector('[data-region-switch]').addEventListener('click', openRegion);
  updateRegionLabel();
}

function openSearch() {
  const { panel, close } = overlay(
    `<form role="search"><label class="sr-only" for="q">ابحث في المتجر</label>
      <input id="q" type="search" name="q" placeholder="ابحث عن تيشيرت، عباية، جلابية…" autocomplete="off">
      <button class="btn dark" type="submit">${icons.search}<span class="hide-sm">بحث</span></button>
      <button class="icon-btn" type="button" data-close aria-label="إغلاق">${icons.close}</button></form>`,
    'search-panel',
  );
  panel.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = new FormData(e.target).get('q').toString().trim();
    close();
    navigate(q ? `/products?q=${encodeURIComponent(q)}` : '/products');
  });
}

async function openRegion() {
  const region = await currentRegion();
  const { panel, close } = overlay(
    `<div class="drawer-head"><h2>بلد الشحن</h2><button class="icon-btn" data-close aria-label="إغلاق">${icons.close}</button></div>
     <div class="drawer-body"><p>تتغير العملة وطريقة الدفع حسب مكان التوصيل.</p>
       <div class="region-cards" style="grid-template-columns:1fr">
         <button class="region-card" data-r="sd" aria-pressed="${region === 'sd'}"><b>داخل السودان</b><span>الأسعار بالجنيه السوداني · الدفع عبر بنكك</span></button>
         <button class="region-card" data-r="intl" aria-pressed="${region === 'intl'}"><b>خارج السودان</b><span>الأسعار بالدولار · الدفع بالبطاقة</span></button>
       </div></div>`,
    'drawer start',
  );
  panel.querySelectorAll('[data-r]').forEach((b) =>
    b.addEventListener('click', () => {
      setRegion(b.dataset.r);
      close();
    }),
  );
}

export async function openCart() {
  const { panel } = overlay(
    `<div class="drawer-head"><h2>سلة المشتريات</h2><button class="icon-btn" data-close aria-label="إغلاق">${icons.close}</button></div>
     <div class="drawer-body" data-cart-body><div class="loading"><div class="spinner"></div></div></div>
     <div class="drawer-foot" data-cart-foot hidden></div>`,
    'drawer',
  );
  const render = async () => {
    if (!panel.isConnected) return window.removeEventListener('cart-change', render);
    const items = cart.items();
    const body = panel.querySelector('[data-cart-body]');
    const foot = panel.querySelector('[data-cart-foot]');
    if (!items.length) {
      body.innerHTML = `<div class="empty">${icons.bag}<p>السلة فارغة</p><a class="btn small" href="/products" data-link>تصفح المنتجات</a></div>`;
      foot.hidden = true;
      return;
    }
    const region = await currentRegion();
    const data = await api(`/variants?region=${region}&ids=${items.map((i) => i.variantId).join(',')}`).catch(() => ({ variants: [] }));
    const byId = new Map(data.variants.map((v) => [v.id, v]));
    let subtotal = 0;
    body.innerHTML = items
      .map((i) => {
        const v = byId.get(i.variantId);
        if (!v) return '';
        subtotal += v.price * i.quantity;
        return `<div class="cart-line" data-id="${v.id}">
          <a class="thumb" href="/p/${encodeURIComponent(v.slug)}" data-link><img src="${esc(v.image)}" alt=""></a>
          <div><h3>${esc(v.name)}</h3><div class="sub">${[v.color, v.size && `مقاس ${v.size}`].filter(Boolean).map(esc).join(' · ')}</div>
            <div class="qty" style="margin-top:6px"><button data-q="1" aria-label="زيادة">+</button><output>${i.quantity}</output><button data-q="-1" aria-label="إنقاص">−</button></div></div>
          <div style="text-align:end"><div class="line-price">${formatPrice(v.price * i.quantity, data.currency)}</div><button class="remove" data-remove>حذف</button></div>
        </div>`;
      })
      .join('');
    foot.hidden = false;
    foot.innerHTML = `<div class="totals"><div class="grand"><span>المجموع</span><span>${formatPrice(subtotal, data.currency)}</span></div>
      <small style="color:var(--muted)">الشحن يُحسب في صفحة الدفع</small></div>
      <a class="btn primary block" href="/checkout" data-link>إتمام الطلب</a>`;
  };
  panel.addEventListener('click', (e) => {
    const line = e.target.closest('.cart-line');
    if (!line) return;
    const id = Number(line.dataset.id);
    const current = cart.items().find((i) => i.variantId === id)?.quantity ?? 0;
    if (e.target.closest('[data-q]')) cart.set(id, current + Number(e.target.closest('[data-q]').dataset.q));
    if (e.target.closest('[data-remove]')) cart.remove(id);
  });
  window.addEventListener('cart-change', render);
  render();
}

let toastTimer;
export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.innerHTML = `${icons.check}<span>${esc(message)}</span>`;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

export function navigate(url) {
  window.dispatchEvent(new CustomEvent('navigate', { detail: url }));
}

export { overlay as openPanel };
