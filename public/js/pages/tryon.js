// "جرّبها" — try-on studio merged with the wishlist.
// A mannequin in the shopper's body shape; favourites hang on a rack below. Tapping a piece makes it
// fly (GSAP MotionPath) onto the mannequin, where it settles like fabric. Slots: hat, top, outer
// (jacket/hoodie), bottom (trousers) and full-length (jalabiya/abaya, replaces top + bottom).
import { api, colorGroups, currentRegion, esc, formatPrice } from '../api.js';
import { cart } from '../cart.js';
import { favorites, haptic } from '../favorites.js';
import { analyze, cutout } from '../garment-image.js';
import { icons } from '../icons.js';
import { motion, reduceMotion, spark } from '../motion.js';
import { anchors, BODIES, mannequinSvg, VIEW } from '../tryon/mannequin.js';
import { openCart, openPanel, toast } from '../ui.js';
import { afterSplash } from '../splash.js';
import { productCard } from './catalog.js';

const BODY_KEY = 'bushra.body';
const OUTFIT_KEY = 'bushra.outfit';
const SLOTS = ['bottom', 'top', 'outer', 'full', 'hat']; // back-to-front drawing order
const SLOT_NAMES = { hat: 'الرأس', top: 'علوي', outer: 'جاكيت', bottom: 'بنطلون', full: 'جلابية / عباية' };

export function slotFor(category) {
  if (category === 'hats') return 'hat';
  if (category === 'pants') return 'bottom';
  if (category === 'jalabiyas' || category === 'abayas') return 'full';
  if (category === 'jackets' || category === 'hoodies') return 'outer';
  return 'top';
}

const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};

/** Where a garment sits on the mannequin (SVG units), from its own measured shape. */
export function placement(slot, shape, a) {
  const aspect = shape.aspect;
  let w;
  let y;
  if (slot === 'hat') {
    w = a.headRx * 2.35;
    const h = w * aspect;
    y = a.headCy - a.headRy * 0.35 - h * shape.bottom;
  } else if (slot === 'bottom') {
    w = (a.wa * 2 * 1.14) / Math.max(0.3, shape.shoulder);
    y = a.waistY - 12 - w * aspect * shape.top;
  } else {
    // Outerwear is cut roomier so it reads as worn over the top.
    const ease = slot === 'outer' ? 1.4 : slot === 'full' ? 1.2 : 1.12;
    const torso = slot === 'full' ? Math.max(a.ch, a.hi * 0.9) : a.ch;
    w = (torso * 2 * ease) / Math.max(0.2, shape.body);
    y = a.neckY - 10 - w * aspect * shape.top;
  }
  return { x: VIEW.w / 2 - w / 2, y, w, h: w * aspect };
}

const prepared = new Map();
/** Cut-out (as a blob URL) and shape for a product's first colour, cached. */
function prepare(item) {
  if (!prepared.has(item.slug)) {
    prepared.set(
      item.slug,
      cutout(item.front).then(
        (canvas) =>
          new Promise((resolve) =>
            canvas.toBlob((blob) => resolve({ url: URL.createObjectURL(blob), shape: analyze(canvas) }), 'image/png'),
          ),
      ),
    );
  }
  return prepared.get(item.slug);
}

function toItem(p, suggested = false) {
  const g = colorGroups(p)[0];
  const imgs = g?.images?.length ? g.images : p.images;
  return { slug: p.slug, name: p.name, category: p.category, front: imgs[0], price: p.minPrice, currency: p.currency, variants: g?.variants ?? p.variants, suggested };
}

export default async function tryon(main, { query }) {
  document.title = 'جرّبها | متجر البشرى';
  const wearSlug = query?.get('wear');
  if (wearSlug && !favorites.has(wearSlug)) favorites.toggle(wearSlug);
  let body = store.get(BODY_KEY, null);
  const outfit = store.get(OUTFIT_KEY, {});
  const worn = {}; // slot -> { item, el }
  let items = [];

  main.innerHTML = `
    <section class="tryon">
      <div class="container tryon-head">
        <div><h1>جرّبها</h1><p>اضغط على أي قطعة من الرف لتلبسها للمانيكان، واجمع طقماً كاملاً.</p></div>
        <div class="tryon-actions">
          <button class="btn small" type="button" data-body>${icons.hanger}<span data-body-label>شكل الجسم</span></button>
          <button class="btn small" type="button" data-undress>خلع الكل</button>
        </div>
      </div>
      <div class="tryon-stage" data-stage>
        <div class="stage-light" aria-hidden="true"></div>
        <svg class="tryon-svg" viewBox="0 0 ${VIEW.w} ${VIEW.h}" role="img" aria-label="المانيكان">
          <g class="mq" data-mq></g>
          <g class="layers">${SLOTS.map((s) => `<g data-slot="${s}"></g>`).join('')}</g>
        </svg>
        <p class="sr-only" aria-live="polite" data-live></p>
      </div>
      <div class="tryon-outfit container" data-outfit></div>
      <div class="tryon-rack" data-lenis-prevent>
        <div class="tryon-rail" aria-hidden="true"></div>
        <ul class="tryon-items" data-items aria-label="القطع المتاحة للتجربة"><li class="tryon-loading"><div class="spinner"></div></li></ul>
      </div>
      <section class="section container" style="padding-top:28px">
        <h2 class="section-title">المفضلة</h2>
        <div class="product-grid" data-grid></div>
      </section>
    </section>`;

  const svg = main.querySelector('.tryon-svg');
  const mq = main.querySelector('[data-mq]');
  const live = main.querySelector('[data-live]');

  const drawMannequin = () => {
    mq.innerHTML = mannequinSvg(body, 'mqs');
    const b = BODIES[body];
    main.querySelector('[data-body-label]').textContent = `${b.g === 'f' ? 'امرأة' : 'رجل'} · ${b.label}`;
  };

  const rackButton = (slug) => main.querySelector(`[data-wear="${CSS.escape(slug)}"]`);

  const renderOutfit = () => {
    const list = SLOTS.slice().reverse().filter((s) => worn[s]);
    const total = list.reduce((n, s) => n + (worn[s].item.price || 0), 0);
    const currency = list[0] ? worn[list[0]].item.currency : 'SDG';
    main.querySelector('[data-outfit]').innerHTML = list.length
      ? `<div class="outfit-chips" data-lenis-prevent>${list.map((s) => `<a class="outfit-chip" href="/p/${encodeURIComponent(worn[s].item.slug)}" data-link><small>${SLOT_NAMES[s]}</small>${esc(worn[s].item.name)}</a>`).join('')}</div>
         <div class="outfit-total"><span>الطقم: <b>${formatPrice(total, currency)}</b></span><button class="btn primary small" type="button" data-order>${icons.bag} اطلب الطقم · ${formatPrice(total, currency)}</button></div>`
      : '<p class="outfit-empty">المانيكان بانتظارك… اختر قطعة من الرف بالأسفل.</p>';
    live.textContent = list.length ? `يرتدي المانيكان: ${list.map((s) => worn[s].item.name).join('، ')}` : 'المانيكان بلا ملابس';
    main.querySelectorAll('[data-wear]').forEach((b) => b.setAttribute('aria-pressed', String(Object.values(worn).some((w) => w.item.slug === b.dataset.wear))));
    store.set(OUTFIT_KEY, Object.fromEntries(Object.entries(worn).map(([s, w]) => [s, w.item.slug])));
  };

  const setImage = (el, p) => {
    el.setAttribute('x', p.x);
    el.setAttribute('y', p.y);
    el.setAttribute('width', p.w);
    el.setAttribute('height', p.h);
  };

  /** Fly an image between two screen rectangles along an arc. */
  const fly = async (url, from, to, { back = false } = {}) => {
    if (reduceMotion()) return;
    const { gsap } = await motion();
    const flyer = document.createElement('img');
    flyer.src = url;
    flyer.className = 'tryon-flyer';
    Object.assign(flyer.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
    document.body.append(flyer);
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const s0 = Math.max(0.12, from.width / to.width);
    gsap.set(flyer, { x: dx, y: dy, scale: s0, rotation: back ? 0 : -16, transformPerspective: 900 });
    const lift = Math.min(dy, 0) - 140;
    await gsap
      .timeline()
      .to(flyer, { duration: 0.95, ease: 'power2.inOut', motionPath: { path: [{ x: dx, y: dy }, { x: dx * 0.4, y: lift }, { x: 0, y: 0 }], curviness: 1.25 }, scale: 1, rotation: 0 })
      .to(flyer, { rotationY: back ? -360 : 360, duration: 0.95, ease: 'power1.inOut' }, 0)
      .then(() => flyer.remove());
  };

  const swingHanger = async (slug) => {
    const btn = rackButton(slug);
    if (!btn || reduceMotion()) return;
    const { gsap } = await motion();
    gsap.fromTo(btn.querySelector('.tryon-hanger'), { rotation: -14 }, { rotation: 0, duration: 1.4, ease: 'elastic.out(1, 0.25)', transformOrigin: '50% 0%' });
  };

  const take = async (slot, animate) => {
    const w = worn[slot];
    if (!w) return;
    delete worn[slot];
    const btn = rackButton(w.item.slug);
    if (animate && btn) {
      // The piece flies from the mannequin back to its hanger on the rack.
      const onBody = w.el.getBoundingClientRect();
      const hanger = btn.querySelector('img').getBoundingClientRect();
      fly(w.el.getAttribute('href'), onBody, hanger, { back: true }).catch(() => {});
    }
    w.el.remove();
    swingHanger(w.item.slug);
  };

  const wear = async (item, { animate = true } = {}) => {
    const slot = slotFor(item.category);
    if (worn[slot]?.item.slug === item.slug) {
      await take(slot, animate);
      renderOutfit();
      return;
    }
    const btn = rackButton(item.slug);
    btn?.classList.add('is-loading');
    let data;
    try {
      data = await prepare(item);
    } catch {
      btn?.classList.remove('is-loading');
      toast('تعذّر تجهيز صورة هذه القطعة للتجربة');
      return;
    }
    btn?.classList.remove('is-loading');
    // One full-length piece or separate top/bottom pieces.
    if (slot === 'full') for (const s of ['top', 'outer', 'bottom']) await take(s, animate);
    if (slot === 'top' || slot === 'bottom' || slot === 'outer') await take('full', animate);
    await take(slot, animate);

    const el = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    el.setAttribute('href', data.url);
    el.setAttribute('preserveAspectRatio', 'none');
    el.classList.add('worn');
    setImage(el, placement(slot, data.shape, anchors(body)));
    el.dataset.slug = item.slug;
    svg.querySelector(`[data-slot="${slot}"]`).append(el);
    worn[slot] = { item, el, shape: data.shape };
    renderOutfit();

    if (!animate || reduceMotion()) return;
    el.style.opacity = '0';
    const from = btn?.querySelector('img')?.getBoundingClientRect();
    const to = el.getBoundingClientRect();
    if (from) await fly(data.url, from, to);
    el.style.opacity = '';
    haptic();
    spark({ x: to.left + to.width / 2, y: to.top + Math.min(40, to.height / 4) });
    swingHanger(item.slug);
    const { gsap } = await motion();
    // Fabric settles onto the body; the mannequin rocks slightly on its base.
    gsap.fromTo(el, { scaleY: 1.07, scaleX: 0.95, y: -12, transformOrigin: '50% 0%' }, { scaleY: 1, scaleX: 1, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.45)' });
    gsap.fromTo(mq, { rotation: 1.2, transformOrigin: '50% 100%' }, { rotation: 0, duration: 1.1, ease: 'elastic.out(1, 0.3)' });
  };

  const relayout = async () => {
    const a = anchors(body);
    const { gsap } = reduceMotion() ? {} : await motion();
    for (const s of SLOTS) {
      const w = worn[s];
      if (!w) continue;
      const p = placement(s, w.shape, a);
      if (gsap) gsap.to(w.el, { attr: { x: p.x, y: p.y, width: p.w, height: p.h }, duration: 0.6, ease: 'power3.inOut' });
      else setImage(w.el, p);
    }
  };

  const chooseBody = () =>
    new Promise((resolve) => {
      const keys = Object.keys(BODIES);
      const { panel, close } = openPanel(
        `<div class="drawer-head"><h2>اختر شكل الجسم</h2>${body ? `<button class="icon-btn" data-close aria-label="إغلاق">${icons.close}</button>` : ''}</div>
         <div class="drawer-body" data-lenis-prevent>
           <p style="margin-top:0;color:var(--muted)">نلبس القطع على مانيكان قريب من جسمك ليعطيك تصوراً أدق.</p>
           ${['m', 'f'].map((g) => `<h3 class="body-group">${g === 'm' ? 'رجال' : 'نساء'}</h3><div class="body-grid">${keys
             .filter((k) => BODIES[k].g === g)
             .map((k) => `<button type="button" class="body-option" data-pick="${k}" aria-pressed="${k === body}"><svg viewBox="0 70 400 880" aria-hidden="true">${mannequinSvg(k, `pick-${k}`)}</svg><span>${BODIES[k].label}</span></button>`)
             .join('')}</div>`).join('')}
         </div>`,
        'drawer start body-drawer',
      );
      panel.addEventListener('click', (e) => {
        const pick = e.target.closest('[data-pick]');
        if (!pick) return;
        body = pick.dataset.pick;
        store.set(BODY_KEY, body);
        haptic();
        close();
        resolve(body);
      });
    });

  main.querySelector('[data-body]').addEventListener('click', async () => {
    await chooseBody();
    drawMannequin();
    relayout();
  });
  main.querySelector('[data-undress]').addEventListener('click', async () => {
    for (const s of SLOTS.slice().reverse()) await take(s, true);
    renderOutfit();
  });
  main.querySelector('[data-items]').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-wear]');
    if (!btn) return;
    const item = items.find((i) => i.slug === btn.dataset.wear);
    if (item) wear(item);
  });
  main.querySelector('[data-outfit]').addEventListener('click', (e) => {
    if (e.target.closest('[data-order]')) orderOutfit();
  });

  const orderOutfit = () => {
    const list = SLOTS.filter((s) => worn[s]).map((s) => worn[s].item);
    const { panel, close } = openPanel(
      `<div class="drawer-head"><h2>اطلب الطقم</h2><button class="icon-btn" data-close aria-label="إغلاق">${icons.close}</button></div>
       <div class="drawer-body" data-lenis-prevent>${list
         .map(
           (it) => `<div class="cart-line"><span class="thumb"><img src="${esc(it.front)}" alt=""></span><div><h3>${esc(it.name)}</h3>
             ${it.variants.length > 1 ? `<label class="sub">المقاس <select data-size-for="${esc(it.slug)}">${it.variants.filter((v) => v.inStock).map((v) => `<option value="${v.id}">${esc(v.size ?? 'مقاس واحد')}</option>`).join('')}</select></label>` : `<span class="sub">مقاس واحد</span>`}
             </div><b class="line-price">${formatPrice(it.price, it.currency)}</b></div>`,
         )
         .join('')}</div>
       <div class="drawer-foot"><button class="btn primary block" data-add-all>${icons.bag} أضف القطع إلى السلة</button></div>`,
      'drawer',
    );
    panel.querySelector('[data-add-all]').addEventListener('click', (e) => {
      for (const it of list) {
        const sel = panel.querySelector(`[data-size-for="${CSS.escape(it.slug)}"]`);
        const id = sel ? Number(sel.value) : it.variants[0]?.id;
        if (id) cart.add(id, 1);
      }
      spark(e.currentTarget);
      haptic();
      close();
      toast('أُضيف الطقم إلى السلة');
      setTimeout(openCart, 350);
    });
  };

  // Body shape: ask on first visit, once the splash has gone (the rack keeps loading meanwhile).
  if (!body || !BODIES[body]) {
    body = 'm-regular';
    afterSplash().then(async () => {
      if (!main.isConnected) return;
      await chooseBody();
      drawMannequin();
      relayout();
    });
  }
  drawMannequin();

  // Rack: favourites first, then suggestions so there is always something to try.
  const region = await currentRegion();
  const favSlugs = favorites.list();
  const favProducts = (await Promise.all(favSlugs.map((s) => api(`/products/${encodeURIComponent(s)}?region=${region}`).then((d) => d.product).catch(() => null)))).filter(Boolean);
  const latest = (await api(`/products?region=${region}&limit=60`).catch(() => ({ products: [] }))).products;
  const suggestions = [];
  for (const slot of ['hat', 'top', 'outer', 'bottom', 'full']) {
    for (const p of latest) {
      if (suggestions.length >= 10) break;
      if (slotFor(p.category) === slot && !favSlugs.includes(p.slug) && suggestions.filter((x) => slotFor(x.category) === slot).length < 2) suggestions.push(p);
    }
  }
  items = [...favProducts.map((p) => toItem(p)), ...suggestions.map((p) => toItem(p, true))];
  main.querySelector('[data-items]').innerHTML = items
    .map(
      (it, i) => `<li${i === favProducts.length && favProducts.length ? ' class="rack-divider"' : ''}>
        <button type="button" class="tryon-item" data-wear="${esc(it.slug)}" aria-pressed="false" aria-label="جرّب ${esc(it.name)}" data-spark>
          <span class="tryon-hanger">${icons.hanger}<img src="${esc(it.front)}" alt="" loading="lazy"></span>
          <span class="tryon-name">${esc(it.name)}</span>
          ${it.suggested ? '<span class="tryon-tag">مقترحة</span>' : `<span class="tryon-tag fav">${icons.heartFill}</span>`}
        </button></li>`,
    )
    .join('');
  main.querySelector('[data-grid]').innerHTML = favProducts.length
    ? favProducts.map((p, i) => productCard(p, i)).join('')
    : `<div class="empty" style="grid-column:1/-1">${icons.heart}<p>لا توجد قطع في المفضلة بعد. اضغط ♡ على أي منتج لتظهر هنا وعلى الرف.</p><a class="btn" href="/products" data-link>تصفح المنتجات</a></div>`;

  // Restore the saved outfit instantly, then wear the requested piece with the full animation.
  for (const slug of Object.values(outfit)) {
    const it = items.find((i) => i.slug === slug);
    if (it && it.slug !== wearSlug) await wear(it, { animate: false });
  }
  renderOutfit();
  if (wearSlug) {
    const it = items.find((i) => i.slug === wearSlug);
    if (it) {
      rackButton(it.slug)?.scrollIntoView({ inline: 'center', block: 'nearest' });
      setTimeout(() => wear(it), 450);
    }
  }

}
