import { api, currentRegion, esc, formatPrice } from '../api.js';
import { favorites } from '../favorites.js';
import { icons } from '../icons.js';
import { productCard } from './catalog.js';

const STATUS = {
  pending_payment: ['بانتظار الدفع', 'amber'],
  awaiting_verification: ['جاري مراجعة الدفع', 'amber'],
  confirmed: ['تم تأكيد الدفع', 'green'],
  sent_to_supplier: ['قيد التجهيز', 'green'],
  shipped: ['تم الشحن', 'green'],
  delivered: ['تم التسليم', 'green'],
  cancelled: ['ملغي', 'red'],
};

function skeletonCards(n) {
  return Array.from({ length: n }, () => '<div class="card skeleton-card" aria-hidden="true"><span class="sk sk-img"></span><span class="sk sk-line"></span><span class="sk sk-line short"></span></div>').join('');
}

export async function favoritesPage(main) {
  document.title = 'المفضلة | متجر البشرى';
  const render = async () => {
    const slugs = favorites.list();
    main.innerHTML = `
      <div class="container page-head"><h1>المفضلة</h1><p>${slugs.length ? `${slugs.length} قطعة محفوظة` : 'احفظ القطع التي أعجبتك لتعود إليها لاحقاً.'}</p></div>
      <section class="section" style="padding-top:12px"><div class="container"><div class="product-grid stagger" data-grid aria-busy="true">${slugs.length ? skeletonCards(Math.min(slugs.length, 6)) : ''}</div></div></section>`;
    const grid = main.querySelector('[data-grid]');
    if (!slugs.length) {
      grid.outerHTML = `<div class="empty">${icons.heart}<p>لا توجد قطع في المفضلة بعد</p><a class="btn" href="/products" data-link>تصفح المنتجات</a></div>`;
      return;
    }
    const region = await currentRegion();
    const items = await Promise.all(slugs.map((s) => api(`/products/${encodeURIComponent(s)}?region=${region}`).then((d) => d.product).catch(() => null)));
    grid.innerHTML = items.filter(Boolean).map((p, i) => productCard(p, i)).join('') || '<p class="empty" style="grid-column:1/-1">القطع المحفوظة لم تعد متوفرة.</p>';
    grid.removeAttribute('aria-busy');
  };
  await render();
  window.addEventListener('favorites-change', render);
  return () => window.removeEventListener('favorites-change', render);
}

export async function ordersPage(main) {
  document.title = 'طلباتي | متجر البشرى';
  let saved = [];
  try {
    saved = JSON.parse(localStorage.getItem('bushra.orders') || '[]');
  } catch {}
  main.innerHTML = `
    <div class="container page-head"><h1>طلباتي</h1><p>طلباتك من هذا الجهاز وحالتها.</p></div>
    <section class="section" style="padding-top:12px"><div class="container stack-list" data-list aria-busy="true">
      ${saved.length ? saved.map(() => '<div class="order-card skeleton-card" aria-hidden="true"><span class="sk sk-line"></span><span class="sk sk-line short"></span></div>').join('') : ''}
    </div></section>`;
  const list = main.querySelector('[data-list]');
  if (!saved.length) {
    list.outerHTML = `<div class="empty">${icons.receipt}<p>لم تطلب أي شيء من هذا الجهاز بعد</p><a class="btn" href="/products" data-link>ابدأ التسوق</a></div>`;
    return;
  }
  const rows = await Promise.all(
    saved.map((o) =>
      api(`/orders/${encodeURIComponent(o.number)}?token=${encodeURIComponent(o.token)}`)
        .then((d) => ({ ...o, order: d.order }))
        .catch(() => null),
    ),
  );
  list.innerHTML = rows
    .filter(Boolean)
    .map((r, i) => {
      const o = r.order;
      const [label, tone] = STATUS[o.status] ?? [o.status, ''];
      const count = o.items.reduce((n, it) => n + it.quantity, 0);
      return `<a class="order-card" style="--i:${i}" href="/order/${encodeURIComponent(o.number)}?token=${encodeURIComponent(r.token)}" data-link>
        <div class="order-top"><b dir="ltr">${esc(o.number)}</b><span class="status-pill ${tone}">${label}</span></div>
        <div class="order-meta"><span>${count} ${count > 1 ? 'قطع' : 'قطعة'} · ${esc(o.items.map((it) => it.name).join('، '))}</span></div>
        <div class="order-bottom"><span>${new Date(o.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString('ar-EG', { dateStyle: 'medium' })}</span><b>${formatPrice(o.total, o.currency)}</b></div>
      </a>`;
    })
    .join('') || '<p class="empty">تعذّر تحميل الطلبات.</p>';
  list.removeAttribute('aria-busy');
}
