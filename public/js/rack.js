// 3D clothes rail: garments hang from a chrome rail; the selected one comes forward and turns
// a full circle (showing its back on the way) each time the shopper moves along the rail.
import { colorGroups, esc, formatPrice } from './api.js';
import { hangerSvg, icons } from './icons.js';

const PERSPECTIVE = 1500;
const ACTIVE_Z = 230;
const ACTIVE_SCALE = PERSPECTIVE / (PERSPECTIVE - ACTIVE_Z);
const RAIL_Y = 46;

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// How far below the hanger a garment image reaches, as a multiple of its width (long abayas ~1.55, tees ~0.98).
const lengthCache = new Map();
export function garmentLength(url) {
  if (!url) return Promise.resolve(1.1);
  if (!lengthCache.has(url)) {
    lengthCache.set(
      url,
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const w = 40;
            const h = Math.round((w * img.naturalHeight) / img.naturalWidth) || 64;
            const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, w, h);
            const { data } = ctx.getImageData(0, 0, w, h);
            let bottom = h;
            outer: for (let y = h - 1; y >= 0; y--) {
              for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 20) break outer;
              bottom = y;
            }
            resolve(bottom / w);
          } catch {
            resolve(1.6); // cross-origin image: assume a long garment
          }
        };
        img.onerror = () => resolve(1.1);
        img.src = url;
      }),
    );
  }
  return lengthCache.get(url);
}

export function garmentMarkup(front, back, alt) {
  return `<div class="garment">
    <img class="face front" src="${esc(front)}" alt="${esc(alt)}" draggable="false" loading="lazy" decoding="async">
    ${hangerSvg}
    <img class="face back" src="${esc(back || front)}" alt="" draggable="false" loading="lazy" decoding="async">
  </div>`;
}

/** Restarts a CSS animation class on an element. */
export function replay(el, cls) {
  if (!el || reduceMotion()) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

export class Rack {
  constructor(root, { onOpen, autoplay = true } = {}) {
    this.root = root;
    this.onOpen = onOpen;
    this.products = [];
    this.active = 0;
    this.autoplay = autoplay && !reduceMotion();
    this.root.innerHTML = `
      <div class="rack" tabindex="0" role="listbox" aria-label="الملابس المعروضة على الرف" aria-roledescription="رف ملابس">
        <div class="rail"></div>
        <div class="rack-stage"></div>
        <button class="rack-arrow prev" type="button" aria-label="القطعة السابقة">${icons.prev}</button>
        <button class="rack-arrow next" type="button" aria-label="القطعة التالية">${icons.next}</button>
      </div>
      <div class="rack-caption" aria-live="polite"></div>`;
    this.rack = root.querySelector('.rack');
    this.stage = root.querySelector('.rack-stage');
    this.caption = root.querySelector('.rack-caption');
    root.querySelector('.prev').addEventListener('click', () => this.go(this.active - 1, true));
    root.querySelector('.next').addEventListener('click', () => this.go(this.active + 1, true));
    this.bindGestures();
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  setProducts(products, currency) {
    this.products = products;
    this.currency = currency;
    this.active = Math.min(Math.floor(products.length / 2), 2);
    this.lengths = products.map(() => 1.1);
    this.stage.innerHTML = products
      .map((p, i) => {
        const [first] = colorGroups(p);
        const imgs = first?.images?.length ? first.images : p.images;
        return `<div class="rack-item" role="option" data-i="${i}" aria-label="${esc(p.name)}">
          <div class="swing">${garmentMarkup(imgs[0], imgs[1], p.name)}</div>
          <div class="price-tag"><span>${esc(formatPrice(p.minPrice, p.currency))}</span></div>
        </div>`;
      })
      .join('');
    this.items = [...this.stage.querySelectorAll('.rack-item')];
    this.items.forEach((el, i) =>
      el.addEventListener('click', () => {
        if (this.dragged) return;
        if (i === this.active) this.onOpen?.(this.products[i]);
        else this.go(i, true);
      }),
    );
    if (!products.length) this.stage.innerHTML = '<div class="rack-empty">لا توجد منتجات في هذا القسم بعد</div>';
    this.layout();
    this.renderCaption();
    this.arrive(this.items?.[this.active]);
    this.startAutoplay();
    const token = (this.loadToken = {});
    products.forEach((p, i) => {
      const [first] = colorGroups(p);
      garmentLength((first?.images?.length ? first.images : p.images)[0]).then((len) => {
        if (this.loadToken !== token) return;
        this.lengths[i] = len;
        this.fitHeight();
      });
    });
  }

  /** Sizes the rack to the longest garment near the front, so short pieces don't leave a gap. */
  fitHeight() {
    if (!this.items?.length) return;
    const w = this.items[0].offsetWidth;
    const n = this.items.length;
    let need = 0;
    this.items.forEach((_, i) => {
      let d = Math.abs(i - this.active);
      d = Math.min(d, n - d);
      if (d <= 1) need = Math.max(need, this.lengths[i] * (d === 0 ? ACTIVE_SCALE : 0.95));
    });
    this.rack.style.height = `${Math.round(RAIL_Y + need * w + 26)}px`;
  }

  go(index, user = false) {
    if (!this.products.length) return;
    const n = this.products.length;
    const next = ((index % n) + n) % n;
    if (user) this.stopAutoplay();
    if (next === this.active) return;
    this.active = next;
    this.layout();
    this.renderCaption();
    this.arrive(this.items[next]);
  }

  arrive(item) {
    if (!item) return;
    replay(item.querySelector('.garment'), 'spin');
    replay(item, 'arrive');
  }

  layout() {
    if (!this.items) return;
    const w = this.items[0]?.offsetWidth || 260;
    const n = this.items.length;
    this.items.forEach((el, i) => {
      // Shortest distance around the rail so the loop wraps smoothly.
      let d = i - this.active;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
      const ad = Math.abs(d);
      const sign = Math.sign(d);
      // RTL: items after the active one sit to its left.
      const x = ad === 0 ? 0 : -sign * (w * 0.92 + (ad - 1) * w * 0.52);
      const z = ad === 0 ? ACTIVE_Z : -(80 + (ad - 1) * 90);
      const ry = ad === 0 ? 0 : -sign * 38;
      el.style.transform = `translate3d(${x}px, 0, ${z}px) rotateY(${ry}deg)`;
      el.style.filter = ad === 0 ? 'none' : `brightness(${1 - Math.min(ad, 4) * 0.035}) blur(${ad >= 2 ? (ad - 1) * 0.8 : 0}px)`;
      el.classList.toggle('is-active', ad === 0);
      el.classList.toggle('is-hidden', ad > 4);
      el.setAttribute('aria-selected', String(ad === 0));
    });
    this.fitHeight();
  }

  renderCaption() {
    const p = this.products[this.active];
    if (!p) {
      this.caption.innerHTML = '';
      return;
    }
    const colors = colorGroups(p).length;
    this.caption.innerHTML = `
      <h2>${esc(p.name)}</h2>
      <p class="meta"><b>${esc(formatPrice(p.minPrice, p.currency))}</b>${colors > 1 ? ` · ${colors} ألوان` : ''}</p>
      <a class="btn" href="/p/${encodeURIComponent(p.slug)}" data-link>${icons.bag} تسوق الآن</a>`;
  }

  bindGestures() {
    let startX = 0;
    let startY = 0;
    let tracking = false;
    this.rack.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.rack-arrow')) return;
      tracking = true;
      this.dragged = false;
      startX = e.clientX;
      startY = e.clientY;
    });
    this.rack.addEventListener('pointerup', (e) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - startY)) {
        this.dragged = true;
        // RTL: dragging to the right pulls the next garment (on the left) into the centre.
        this.go(this.active + (dx > 0 ? 1 : -1), true);
        setTimeout(() => (this.dragged = false), 50);
      }
    });
    this.rack.addEventListener('pointercancel', () => (tracking = false));
    this.rack.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') this.go(this.active + 1, true);
      else if (e.key === 'ArrowRight') this.go(this.active - 1, true);
      else if (e.key === 'Enter') this.onOpen?.(this.products[this.active]);
      else return;
      e.preventDefault();
    });
    this.rack.addEventListener('mouseenter', () => (this.hover = true));
    this.rack.addEventListener('mouseleave', () => (this.hover = false));
  }

  startAutoplay() {
    this.stopAutoplay();
    if (!this.autoplay || this.products.length < 2) return;
    this.timer = setInterval(() => {
      if (!this.hover && !document.hidden) this.go(this.active + 1);
    }, 6500);
  }

  stopAutoplay() {
    clearInterval(this.timer);
    this.timer = null;
  }

  destroy() {
    this.stopAutoplay();
    window.removeEventListener('resize', this.onResize);
  }
}
