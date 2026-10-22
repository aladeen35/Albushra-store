import { api, colorGroups, colorSwatch, currentRegion, esc, formatPrice, getCategories } from '../api.js';
import { favorites } from '../favorites.js';
import { icons } from '../icons.js';
import { createRack, garmentMarkup } from '../rack.js';
import { navigate } from '../ui.js';
import { categoryCircles } from './home.js';

export function favButton(slug, name) {
  const on = favorites.has(slug);
  return `<button type="button" class="fav-btn" data-fav="${esc(slug)}" aria-pressed="${on}" aria-label="${on ? 'إزالة من المفضلة' : 'أضف إلى المفضلة'}: ${esc(name)}">${on ? icons.heartFill : icons.heart}</button>`;
}

export function productCard(p, i = 0) {
  const groups = colorGroups(p);
  const imgs = groups[0]?.images?.length ? groups[0].images : p.images;
  return `<article class="card" style="--i:${i}">
    <a class="card-link" href="/p/${encodeURIComponent(p.slug)}" data-link>
      ${garmentMarkup(imgs[0], imgs[1], p.name)}
      <h3>${esc(p.name)}</h3>
      <span class="price">${esc(formatPrice(p.minPrice, p.currency))}</span>
      ${groups.length > 1 ? `<span class="swatches" aria-label="${groups.length} ألوان">${groups.map((g) => `<i style="background:${colorSwatch(g.color)}" title="${esc(g.color)}"></i>`).join('')}</span>` : ''}
    </a>
    ${favButton(p.slug, p.name)}
  </article>`;
}

export function skeletonGrid(n = 8) {
  return Array.from({ length: n }, () => '<div class="card skeleton-card" aria-hidden="true"><span class="sk sk-img"></span><span class="sk sk-line"></span><span class="sk sk-line short"></span></div>').join('');
}

/** /products, /products?q=…, /c/:slug */
export async function products(main, { slug, query }) {
  const cats = await getCategories();
  const cat = slug ? cats.find((c) => c.slug === slug) : null;
  if (slug && !cat) return navigate('/404');
  const q = query.get('q') ?? '';
  const title = cat ? cat.name : q ? `نتائج البحث عن «${q}»` : 'جميع المنتجات';
  document.title = `${title} | متجر البشرى`;

  main.innerHTML = `
    <section class="rack-section">
      <div class="container page-head" style="text-align:center"><h1>${esc(title)}</h1></div>
      <div class="rack-filters" role="navigation" aria-label="الأقسام">
        <a class="chip" href="/products" data-link aria-pressed="${!cat}">الكل</a>
        ${cats.map((c) => `<a class="chip" href="/c/${encodeURIComponent(c.slug)}" data-link aria-pressed="${c.slug === slug}">${esc(c.name)}</a>`).join('')}
      </div>
      <div data-rack></div>
    </section>
    <section class="section" style="padding-top:36px"><div class="container"><div class="product-grid stagger" data-grid aria-busy="true">${skeletonGrid(8)}</div></div></section>`;

  const rack = await createRack(main.querySelector('[data-rack]'), { onOpen: (p) => navigate(`/p/${encodeURIComponent(p.slug)}`), autoplay: false });
  const load = async () => {
    const region = await currentRegion();
    const params = new URLSearchParams({ region, limit: '60' });
    if (slug) params.set('category', slug);
    if (q) params.set('q', q);
    const data = await api(`/products?${params}`).catch(() => ({ products: [] }));
    rack.setProducts(data.products.slice(0, 12));
    main.querySelector('[data-grid]').innerHTML = data.products.length
      ? data.products.map((p, i) => productCard(p, i)).join('')
      : '<p class="empty" style="grid-column:1/-1">لا توجد منتجات مطابقة.</p>';
    main.querySelector('[data-grid]').removeAttribute('aria-busy');
  };
  await load();
  window.addEventListener('region-change', load);
  return () => {
    rack.destroy();
    window.removeEventListener('region-change', load);
  };
}

export async function categories(main) {
  document.title = 'الأقسام | متجر البشرى';
  const [cats, region] = await Promise.all([getCategories(), currentRegion()]);
  main.innerHTML = `<section class="section"><div class="container">
    <h1 class="section-title">الأقسام</h1>${await categoryCircles(cats, region)}</div></section>`;
}
