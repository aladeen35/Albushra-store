import { api, colorGroups, colorSwatch, currentRegion, esc, formatPrice } from '../api.js';
import { cart } from '../cart.js';
import { icons } from '../icons.js';
import { garmentLength, garmentMarkup, replay } from '../rack.js';
import { navigate, openCart, toast } from '../ui.js';

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const sizeRank = (s) => (SIZE_ORDER.includes(s) ? SIZE_ORDER.indexOf(s) : 100 + (Number(s) || 0));

export default async function product(main, { slug }) {
  let cleanup = () => {};
  let viewer = null;
  const render = async () => {
    viewer?.destroy();
    viewer = null;
    const region = await currentRegion();
    let data;
    try {
      data = await api(`/products/${encodeURIComponent(slug)}?region=${region}`);
    } catch (err) {
      if (err.status === 404) return navigate('/404');
      throw err;
    }
    const p = data.product;
    document.title = `${p.name} | متجر البشرى`;
    const siblings = p.category
      ? (await api(`/products?category=${encodeURIComponent(p.category)}&region=${region}&limit=12`).catch(() => ({ products: [] }))).products
      : [];
    let others = siblings.filter((s) => s.slug !== p.slug);
    if (others.length < 4) {
      // Not enough pieces in this section: fill the background rack with the newest items.
      const latest = (await api(`/products?region=${region}&limit=8`).catch(() => ({ products: [] }))).products;
      others = [...others, ...latest.filter((l) => l.slug !== p.slug && !others.some((o) => o.slug === l.slug))];
    }
    const index = siblings.findIndex((s) => s.slug === p.slug);
    const prev = siblings.length > 1 ? siblings[(index - 1 + siblings.length) % siblings.length] : null;
    const next = siblings.length > 1 ? siblings[(index + 1) % siblings.length] : null;

    const groups = colorGroups(p);
    const state = { color: 0, size: null, qty: 1, back: false };
    const sizesOf = (g) => [...g.variants].sort((a, b) => sizeRank(a.size) - sizeRank(b.size));
    const g0 = groups[0];
    const firstInStock = sizesOf(g0).find((v) => v.inStock);
    state.size = sizesOf(g0).length === 1 ? firstInStock?.size ?? null : null;

    // Blurred garments of the same section hang behind the main piece.
    const ghosts = others.slice(0, 4).map((o, i) => {
      const imgs = colorGroups(o)[0]?.images ?? o.images;
      const offset = [-1.0, 1.0, -1.85, 1.85][i];
      return `<div class="ghost" style="transform:translateX(calc(-50% + var(--w) * ${offset})) scale(${i < 2 ? 0.86 : 0.74})">${garmentMarkup(imgs[0], imgs[1], '')}</div>`;
    });

    main.innerHTML = `
      <section class="pdp">
        <div class="pdp-stage">
          <div class="rail"></div>
          <div class="pdp-backdrop" aria-hidden="true">${ghosts.join('')}</div>
          <div class="pdp-main"><div class="swing" data-garment-wrap>${garmentMarkup(g0.images[0], g0.images[1], p.name)}</div></div>
          ${groups.length > 1 ? `<div class="pdp-thumbs" role="group" aria-label="الألوان">${groups
            .map((g, i) => `<button type="button" data-color="${i}" aria-pressed="${i === 0}" aria-label="${esc(g.color)}"><img src="${esc(g.images[0])}" alt=""></button>`)
            .join('')}</div>` : ''}
          ${prev ? `<a class="rack-arrow prev" href="/p/${encodeURIComponent(prev.slug)}" data-link aria-label="المنتج السابق">${icons.prev}</a>` : ''}
          ${next ? `<a class="rack-arrow next" href="/p/${encodeURIComponent(next.slug)}" data-link aria-label="المنتج التالي">${icons.next}</a>` : ''}
        </div>
        <div class="pdp-info">
          <h1>${esc(p.name)}</h1>
          <p class="price" data-price></p>
          <div class="toggle" role="group" aria-label="جهة العرض">
            <button type="button" data-side="front" aria-pressed="true">أمام</button>
            <button type="button" data-side="back" aria-pressed="false">خلف</button>
          </div>
          <div><button type="button" class="details-btn" data-scroll>${icons.info} تفاصيل المنتج</button></div>
          <div class="pdp-options" id="options">
            ${groups.length > 1 || g0.color ? `<div><div class="opt-label">اللون: <span data-color-name>${esc(g0.color ?? '')}</span></div>
              <div class="color-tags">${groups
                .map((g, i) => `<button type="button" class="color-tag" data-color="${i}" aria-pressed="${i === 0}"><i style="background:${colorSwatch(g.color)}"></i>${esc(g.color ?? '')}</button>`)
                .join('')}</div></div>` : ''}
            <div><div class="opt-label">المقاس: <span data-size-name>اختر المقاس</span></div><div class="sizes" data-sizes></div></div>
            <div class="buy-row">
              <div class="qty"><button type="button" data-qty="1" aria-label="زيادة">+</button><output data-qty-out>1</output><button type="button" data-qty="-1" aria-label="إنقاص">−</button></div>
              <button class="btn primary" type="button" data-add>${icons.bag} أضف إلى السلة</button>
            </div>
            <p class="notice err" data-error hidden></p>
            <details class="details" open><summary>وصف المنتج</summary><p>${esc(p.description || '—')}</p></details>
            <details class="details"><summary>الشحن والدفع</summary><p>داخل السودان: الدفع عبر تطبيق بنكك ثم رفع صورة الإشعار. خارج السودان: الدفع الآمن بالبطاقة. يتم تجهيز الطلب وشحنه بعد تأكيد الدفع.</p></details>
          </div>
        </div>
      </section>`;

    // Real 3D cloth when the device supports WebGL; the CSS garment stays as the fallback.
    const stageEl = main.querySelector('.pdp-stage');
    const mod = await import('../rack3d.js').catch(() => null);
    if (mod?.webglAvailable()) {
      try {
        viewer = new mod.GarmentViewer(stageEl);
        stageEl.classList.add('is-3d');
        viewer.onRotate = (angle) => setSideUi(Math.cos(angle) < 0);
        await viewer.show(g0.images[0], g0.images[1]);
        main.querySelector('.pdp-main')?.remove();
      } catch (err) {
        console.warn('3D viewer unavailable', err);
        viewer?.destroy();
        viewer = null;
        stageEl.classList.remove('is-3d');
      }
    }

    const garment = () => main.querySelector('.pdp-main .garment');
    const fitStage = async () => {
      if (viewer) return;
      const stage = main.querySelector('.pdp-stage');
      const len = await garmentLength(groups[state.color].images[0]);
      const w = main.querySelector('.pdp-main')?.offsetWidth ?? 300;
      if (stage) stage.style.height = `${Math.round(40 + len * w + 30)}px`;
    };
    fitStage();
    const renderSizes = () => {
      const g = groups[state.color];
      main.querySelector('[data-sizes]').innerHTML = sizesOf(g)
        .map((v) => `<button type="button" data-size="${esc(v.size ?? '')}" aria-pressed="${v.size === state.size}" ${v.inStock ? '' : 'disabled'}>${esc(v.size ?? 'مقاس واحد')}</button>`)
        .join('');
      const selected = g.variants.find((v) => v.size === state.size);
      const prices = g.variants.map((v) => v.price);
      main.querySelector('[data-price]').textContent = selected ? formatPrice(selected.price, p.currency) : formatPrice(Math.min(...prices), p.currency);
      main.querySelector('[data-size-name]').textContent = state.size ?? 'اختر المقاس';
    };
    const setColor = (i) => {
      if (i === state.color) return;
      state.color = i;
      const g = groups[i];
      if (!g.variants.some((v) => v.size === state.size && v.inStock)) state.size = null;
      main.querySelectorAll('[data-color]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.color) === i)));
      const name = main.querySelector('[data-color-name]');
      if (name) name.textContent = g.color ?? '';
      if (viewer) {
        viewer.show(g.images[0], g.images[1], true);
      } else {
        const el = garment();
        el.querySelector('.front').src = g.images[0];
        el.querySelector('.back').src = g.images[1] || g.images[0];
        replay(el, 'spin');
        replay(main.querySelector('[data-garment-wrap]'), 'arrive-swing');
      }
      renderSizes();
      fitStage();
    };
    function setSideUi(back) {
      state.back = back;
      main.querySelectorAll('[data-side]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.side === 'back') === back)));
    }
    const setSide = (back) => {
      setSideUi(back);
      if (viewer) viewer.showBack(back);
      else garment().classList.toggle('show-back', back);
    };

    main.querySelector('.pdp').addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-scroll]')) return main.querySelector('#options').scrollIntoView({ behavior: 'smooth', block: 'center' });
      const color = t.closest('[data-color]');
      if (color) return setColor(Number(color.dataset.color));
      const side = t.closest('[data-side]');
      if (side) return setSide(side.dataset.side === 'back');
      if (t.closest('.pdp-main')) return setSide(!state.back);
      const size = t.closest('[data-size]');
      if (size) {
        state.size = size.dataset.size || null;
        main.querySelector('[data-error]').hidden = true;
        return renderSizes();
      }
      const qty = t.closest('[data-qty]');
      if (qty) {
        state.qty = Math.max(1, Math.min(20, state.qty + Number(qty.dataset.qty)));
        main.querySelector('[data-qty-out]').textContent = String(state.qty);
        return;
      }
      if (t.closest('[data-add]')) {
        const g = groups[state.color];
        const variant = g.variants.length === 1 ? g.variants[0] : g.variants.find((v) => (v.size ?? '') === (state.size ?? ''));
        const err = main.querySelector('[data-error]');
        if (!variant) {
          err.textContent = 'اختر المقاس أولاً';
          err.hidden = false;
          return;
        }
        cart.add(variant.id, state.qty);
        toast('تمت الإضافة إلى السلة');
        openCart();
      }
    });
    renderSizes();
  };

  await render();
  const onRegion = () => render();
  window.addEventListener('region-change', onRegion);
  cleanup = () => {
    window.removeEventListener('region-change', onRegion);
    viewer?.destroy();
  };
  return () => cleanup();
}
