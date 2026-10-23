import { api, colorGroups, colorSwatch, currentRegion, esc, formatPrice, getCategories } from '../api.js';
import { cart } from '../cart.js';
import { haptic } from '../favorites.js';
import { icons } from '../icons.js';
import { spark } from '../motion.js';
import { createRack } from '../rack.js';
import { marquee, navigate, openCart } from '../ui.js';
import { favButton } from './catalog.js';
import { sizeRank } from './product.js';
import { slotFor } from './tryon.js';

export const FEATURES = [
  { icon: 'truck', title: 'شحن سريع', text: 'توصيل لجميع مدن السودان وخارجه' },
  { icon: 'shield', title: 'دفع آمن', text: 'بنكك داخل السودان وبطاقة خارجه' },
  { icon: 'medal', title: 'جودة عالية', text: 'خامات مختارة بعناية' },
  { icon: 'hanger', title: 'تشكيلة متنوعة', text: 'من التيشيرت إلى الجلابية' },
];

export function featuresMarkup() {
  return `<div class="features">${FEATURES.map((f) => `<div class="feature">${icons[f.icon]}<b>${f.title}</b><span>${f.text}</span></div>`).join('')}</div>`;
}

export async function categoryCircles(cats, region) {
  // One front image per category, taken from its newest product.
  const covers = await Promise.all(
    cats.map((c) =>
      api(`/products?category=${encodeURIComponent(c.slug)}&limit=1&region=${region}`)
        .then((d) => d.products[0]?.variants.find((v) => v.images?.length)?.images ?? d.products[0]?.images ?? [])
        .catch(() => []),
    ),
  );
  return `<div class="cat-grid stagger">${cats
    .map(
      (c, i) => `<a class="cat-card" style="--i:${i}" href="/c/${encodeURIComponent(c.slug)}" data-link>
        <span class="circle">${covers[i][0] ? `<img src="${esc(covers[i][0])}" alt="" loading="lazy">` : ''}</span>${esc(c.name)}</a>`,
    )
    .join('')}</div>`;
}

const lowerSections = () => `
    <section class="section"><div class="container">
      <h2 class="section-title">تسوق حسب القسم</h2>
      <div data-cats><div class="loading" style="min-height:160px"><div class="spinner"></div></div></div>
    </div></section>
    <section class="section" style="padding-top:0"><div class="container">${featuresMarkup()}</div></section>`;

export default async function home(main) {
  const [region, cats] = await Promise.all([currentRegion(), getCategories()]);
  const [storeMod, rackMod] = await Promise.all([import('../store3d.js').catch(() => null), import('../rack3d.js').catch(() => null)]);
  if (storeMod && rackMod?.webglAvailable()) {
    const cleanup = await storeHome(main, storeMod, region, cats).catch((err) => {
      console.warn('3D store unavailable, showing the rack', err);
      return null;
    });
    if (cleanup) return cleanup;
  }
  return rackHome(main, region, cats);
}

/** Fallback home: the single clothes rack with section chips. */
async function rackHome(main, region, cats) {
  main.innerHTML = `
    <section class="rack-section hero" aria-label="أحدث التصاميم">
      <div class="rack-filters" role="group" aria-label="تصفية حسب القسم">
        <button class="chip" aria-pressed="true" data-cat="">الكل</button>
        ${cats.map((c) => `<button class="chip" aria-pressed="false" data-cat="${esc(c.slug)}">${esc(c.name)}</button>`).join('')}
      </div>
      <div data-rack></div>
      ${marquee()}
    </section>${lowerSections()}`;

  const rack = await createRack(main.querySelector('[data-rack]'), { onOpen: (p) => navigate(`/p/${encodeURIComponent(p.slug)}`) });
  const load = async (cat) => {
    const r = await currentRegion();
    const data = await api(`/products?limit=14&region=${r}${cat ? `&category=${encodeURIComponent(cat)}` : ''}`).catch(() => ({ products: [] }));
    await rack.setProducts(data.products);
  };
  main.querySelector('.rack-filters').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    main.querySelectorAll('.rack-filters .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    load(chip.dataset.cat);
  });
  await load('');
  main.querySelector('[data-cats]').innerHTML = await categoryCircles(cats, region);

  const onRegion = () => load(main.querySelector('.rack-filters [aria-pressed="true"]')?.dataset.cat ?? '');
  window.addEventListener('region-change', onRegion);
  return () => {
    rack.destroy();
    window.removeEventListener('region-change', onRegion);
  };
}

const WIDE = () => window.matchMedia('(min-width: 900px)').matches;

/** Home as a 3D showroom: one fixture per section, a section bar, and a buy card for the picked piece. */
async function storeHome(main, { Store3D }, region, cats) {
  const lists = await Promise.all(
    cats.map((c) =>
      api(`/products?category=${encodeURIComponent(c.slug)}&limit=9&region=${region}`)
        .then((d) => d.products)
        .catch(() => []),
    ),
  );
  const sections = cats.map((c, i) => ({ ...c, products: lists[i] })).filter((s) => s.products.length);
  if (!sections.length) return null;

  main.innerHTML = `
    <section class="store" aria-label="معرض متجر البشرى">
      <div class="store-view" data-view>
        <div class="store-loading" data-loading><div class="spinner"></div><span>نجهّز المعرض…</span></div>
        <div class="store-head" data-head hidden></div>
        <p class="store-hint" data-hint>${icons.drag}<span>اسحب للتجول في المعرض، واضغط على أي قسم</span></p>
        <aside class="qv" data-qv hidden aria-live="polite" aria-label="القطعة المختارة"></aside>
        <div class="sr-only" data-sr></div>
      </div>
      <nav class="store-nav" aria-label="أقسام المعرض">
        <div class="store-pills">
          <button type="button" class="store-pill" data-go="" aria-pressed="true">${icons.store}<span>المعرض</span></button>
          ${sections.map((s) => `<button type="button" class="store-pill" data-go="${esc(s.slug)}" aria-pressed="false"><span>${esc(s.name)}</span></button>`).join('')}
        </div>
      </nav>
      ${marquee()}
    </section>${lowerSections()}`;

  const view = main.querySelector('[data-view]');
  const qv = main.querySelector('[data-qv]');
  const head = main.querySelector('[data-head]');
  const hint = main.querySelector('[data-hint]');
  const sr = main.querySelector('[data-sr]');
  let selected = null;

  const setPills = (slug) => {
    main.querySelectorAll('.store-pill').forEach((b) => {
      const on = b.dataset.go === (slug ?? '');
      b.setAttribute('aria-pressed', String(on));
      if (on) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });
  };

  const hideHint = () => hint.classList.add('gone');

  const store = new Store3D(view, {
    sections,
    onProgress: (p) => window.dispatchEvent(new CustomEvent('rack-progress', { detail: p })),
    onFocus(slug) {
      setPills(slug);
      const sec = sections.find((s) => s.slug === slug);
      head.hidden = !sec;
      if (sec) {
        head.innerHTML = `<h2>${esc(sec.name)}</h2><a class="btn small" href="/c/${encodeURIComponent(sec.slug)}" data-link>كل القطع (${sec.products.length}) ${icons.next}</a>`;
        sr.innerHTML = `<p>قطع قسم ${esc(sec.name)}:</p>${sec.products.map((p) => `<button type="button" data-sr-pick="${esc(p.slug)}">${esc(p.name)}</button>`).join('')}`;
      } else sr.innerHTML = '';
      const url = new URL(location.href);
      if (slug) url.searchParams.set('s', slug);
      else url.searchParams.delete('s');
      history.replaceState(history.state, '', url);
      hideHint();
    },
    onSelect(product, sec) {
      selected = product;
      renderCard(product, sec);
    },
    onDeselect() {
      selected = null;
      qv.classList.remove('open');
      setTimeout(() => {
        if (!selected) qv.hidden = true;
      }, 260);
    },
  });
  store.onInteract = hideHint;
  store.insets = () => (WIDE() ? { left: qv.offsetWidth ? qv.offsetWidth + 32 : 420 } : { bottom: Math.round(view.clientHeight * 0.5) });

  // Buy card for the picked piece (like a shop assistant handing it over).
  function renderCard(p, sec) {
    const groups = colorGroups(p);
    const state = { color: 0, size: null };
    const sizesOf = (g) => [...g.variants].sort((a, b) => sizeRank(a.size) - sizeRank(b.size));
    const single = () => sizesOf(groups[state.color]).length === 1;
    const wearable = Boolean(slotFor(p.category, p.name));
    const draw = () => {
      const g = groups[state.color];
      const sizes = sizesOf(g);
      if (single()) state.size = sizes[0].size;
      const chosen = g.variants.find((v) => v.size === state.size);
      qv.innerHTML = `
        <button type="button" class="icon-btn qv-close" data-qv-close aria-label="إغلاق">${icons.close}</button>
        <p class="qv-cat">${esc(sec.name)}</p>
        <div class="qv-title"><h2>${esc(p.name)}</h2>${favButton(p.slug, p.name)}</div>
        <p class="qv-price">${esc(formatPrice(chosen?.price ?? Math.min(...g.variants.map((v) => v.price)), p.currency))}${g.color ? ` <span>· ${esc(g.color)}</span>` : ''}</p>
        ${groups.length > 1 ? `<div class="qv-colors" role="group" aria-label="الألوان">${groups
          .map((cg, i) => `<button type="button" data-qv-color="${i}" aria-pressed="${i === state.color}" aria-label="${esc(cg.color ?? '')}"><i style="background:${colorSwatch(cg.color)}"></i></button>`)
          .join('')}</div>` : ''}
        <div class="opt-label">المقاس: <span>${esc(state.size ?? (single() ? 'مقاس واحد' : 'اختر المقاس'))}</span></div>
        <div class="sizes qv-sizes">${sizes
          .map((v) => `<button type="button" data-qv-size="${esc(v.size ?? '')}" aria-pressed="${v.size === state.size}" ${v.inStock ? '' : 'disabled'}>${esc(v.size ?? 'مقاس واحد')}</button>`)
          .join('')}</div>
        <p class="notice err" data-qv-err hidden>اختر المقاس أولاً</p>
        <button type="button" class="btn primary block" data-qv-add data-spark>${icons.bag} أضف إلى السلة</button>
        <div class="qv-done" data-qv-done hidden><span>${icons.check} أُضيفت إلى السلة</span><button type="button" class="text-link" data-qv-cart>عرض السلة</button></div>
        <div class="qv-links">
          <a href="/p/${encodeURIComponent(p.slug)}" data-link>التفاصيل الكاملة</a>
          ${wearable ? `<a href="/tryon?wear=${encodeURIComponent(p.slug)}" data-link>${icons.mannequin} جرّبها</a>` : ''}
        </div>`;
    };
    qv._state = { p, sec, groups, state, sizesOf, single, draw };
    draw();
    qv.hidden = false;
    requestAnimationFrame(() => qv.classList.add('open'));
  }

  qv.addEventListener('click', (e) => {
    const s = qv._state;
    if (!s) return;
    const { p, groups, state, draw } = s;
    if (e.target.closest('[data-qv-close]')) return store.deselect();
    const color = e.target.closest('[data-qv-color]');
    if (color) {
      state.color = Number(color.dataset.qvColor);
      if (!groups[state.color].variants.some((v) => v.size === state.size && v.inStock)) state.size = null;
      draw();
      store.setItemImage(p.slug, groups[state.color].images?.[0]);
      return;
    }
    const size = e.target.closest('[data-qv-size]');
    if (size) {
      state.size = size.dataset.qvSize || null;
      return draw();
    }
    if (e.target.closest('[data-qv-cart]')) return openCart();
    if (e.target.closest('[data-qv-add]')) {
      const g = groups[state.color];
      const variant = g.variants.length === 1 ? g.variants[0] : g.variants.find((v) => (v.size ?? '') === (state.size ?? ''));
      if (!variant) {
        qv.querySelector('[data-qv-err]').hidden = false;
        haptic(30);
        return;
      }
      cart.add(variant.id, 1);
      haptic();
      spark(e.target.closest('[data-qv-add]'));
      qv.querySelector('[data-qv-add]').classList.add('added');
      qv.querySelector('[data-qv-done]').hidden = false;
    }
  });

  main.querySelector('.store-pills').addEventListener('click', (e) => {
    const pill = e.target.closest('[data-go]');
    if (!pill) return;
    haptic(8);
    store.focus(pill.dataset.go || null);
  });
  sr.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sr-pick]');
    const item = b && store.items.find((i) => i.product.slug === b.dataset.srPick);
    if (item) store.select(item, store.insets());
  });
  const onKey = (e) => {
    if (e.key !== 'Escape' || document.querySelector('.overlay.open, dialog[open]')) return;
    if (selected) store.deselect();
    else store.focus(null);
  };
  window.addEventListener('keydown', onKey);
  const onFav = () => {
    if (qv._state && !qv.hidden) qv._state.draw();
  };
  window.addEventListener('favorites-change', onFav);
  const onRegion = async () => {
    // Prices change with the region: refresh the open card.
    if (!selected) return;
    const r = await currentRegion();
    const fresh = await api(`/products/${encodeURIComponent(selected.slug)}?region=${r}`).catch(() => null);
    if (fresh && qv._state) renderCard(fresh.product, qv._state.sec);
  };
  window.addEventListener('region-change', onRegion);

  // Let the splash go once the first fixture is dressed (or after a few seconds).
  await Promise.race([store.ready, new Promise((r) => setTimeout(r, 6000))]);
  main.querySelector('[data-loading]').classList.add('gone');
  const deep = new URLSearchParams(location.search).get('s');
  if (deep && sections.some((s) => s.slug === deep)) setTimeout(() => store.focus(deep), 400);
  categoryCircles(cats, region).then((html) => {
    const el = main.querySelector('[data-cats]');
    if (el) el.innerHTML = html;
  });

  return () => {
    store.destroy();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('favorites-change', onFav);
    window.removeEventListener('region-change', onRegion);
  };
}

