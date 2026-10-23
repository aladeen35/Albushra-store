// Motion layer: GSAP (+ScrollTrigger, MotionPath, Flip) and Lenis smooth scrolling, loaded lazily.
// Click sparks, magnetic buttons and shiny text are vanilla ports of React Bits components
// (https://github.com/DavidHDev/react-bits, © David Haz, MIT + Commons Clause), used here as part
// of this website only.
// Everything is skipped or reduced to instant state changes under prefers-reduced-motion.

export const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let modPromise;
/** The GSAP/Lenis module (cached). */
export function motion() {
  modPromise ??= import('/vendor/motion.min.js');
  return modPromise;
}

let lenis = null;

/** Smooth wheel scrolling (Lenis) synced with ScrollTrigger; touch keeps native scrolling. */
export async function initSmoothScroll() {
  if (reduceMotion() || lenis) return;
  const { gsap, ScrollTrigger, Lenis } = await motion();
  lenis = new Lenis({ duration: 1.1, smoothWheel: true, syncTouch: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  document.documentElement.classList.add('lenis');
}

/** Scroll to top after a route change (Lenis keeps its own position). */
export function resetScroll() {
  if (lenis) lenis.scrollTo(0, { immediate: true });
  else window.scrollTo({ top: 0, behavior: 'instant' });
}

/** Stops page scrolling while a drawer/dialog is open. */
export function lockScroll(locked) {
  if (!lenis) return;
  if (locked) lenis.stop();
  else lenis.start();
}

/**
 * Scroll-triggered entrances for a freshly rendered page (cards, category circles, features,
 * section titles). Uses the skill's "stagger list" preset: 0.42s, 60ms stagger, back.out(1.4).
 */
export async function revealPage(root) {
  if (reduceMotion()) return;
  const { gsap, ScrollTrigger } = await motion();
  document.documentElement.classList.add('gsap-ready');
  ScrollTrigger.getAll().forEach((t) => t.vars.id === 'reveal' && t.kill());
  const targets = root.querySelectorAll('.product-grid > .card:not(.skeleton-card), .cat-card, .feature, .section-title, .order-card, .reveal');
  if (!targets.length) return;
  gsap.set(targets, { autoAlpha: 0, y: 26, scale: 0.97 });
  ScrollTrigger.batch(targets, {
    id: 'reveal',
    start: 'top 92%',
    once: true,
    onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, scale: 1, duration: 0.42, ease: 'back.out(1.4)', stagger: 0.06, overwrite: true, clearProps: 'transform' }),
  });
  ScrollTrigger.refresh();
}

/** Word-by-word reveal of the rack caption when the selected garment changes (Arabic-safe: whole words). */
export async function revealWords(el) {
  if (!el || reduceMotion()) return;
  const { gsap } = await motion();
  const h = el.querySelector('h2, h1');
  if (h && !h.dataset.split) {
    h.dataset.split = '1';
    h.innerHTML = h.textContent
      .split(/(\s+)/)
      .map((w) => (w.trim() ? `<span class="word"><span>${w.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</span></span>` : w))
      .join('');
  }
  gsap.fromTo(el.querySelectorAll('.word > span'), { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, ease: 'power3.out', stagger: 0.05 });
  gsap.fromTo(el.querySelectorAll('.meta, .btn'), { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out', delay: 0.15, stagger: 0.06 });
}

// ---------- Click spark (port of React Bits "ClickSpark") ----------

let sparkCanvas;
let sparkCtx;
const bursts = [];
let sparkRaf = 0;

function ensureSparkCanvas() {
  if (sparkCanvas) return;
  sparkCanvas = document.createElement('canvas');
  sparkCanvas.className = 'spark-layer';
  sparkCanvas.setAttribute('aria-hidden', 'true');
  document.body.append(sparkCanvas);
  sparkCtx = sparkCanvas.getContext('2d');
  const fit = () => {
    const r = Math.min(window.devicePixelRatio || 1, 2);
    sparkCanvas.width = innerWidth * r;
    sparkCanvas.height = innerHeight * r;
    sparkCtx.setTransform(r, 0, 0, r, 0, 0);
  };
  fit();
  window.addEventListener('resize', fit);
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function drawSparks(now) {
  sparkCtx.clearRect(0, 0, innerWidth, innerHeight);
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    const t = (now - b.start) / 520;
    if (t >= 1) {
      bursts.splice(i, 1);
      continue;
    }
    const e = easeOut(t);
    for (const s of b.sparks) {
      const dist = e * s.reach;
      const len = 9 * (1 - e) * s.scale;
      const x1 = b.x + Math.cos(s.angle) * dist;
      const y1 = b.y + Math.sin(s.angle) * dist + 40 * t * t;
      const x2 = x1 + Math.cos(s.angle) * len;
      const y2 = y1 + Math.sin(s.angle) * len;
      sparkCtx.strokeStyle = s.color;
      sparkCtx.globalAlpha = 1 - t;
      sparkCtx.lineWidth = 2.2;
      sparkCtx.lineCap = 'round';
      sparkCtx.beginPath();
      sparkCtx.moveTo(x1, y1);
      sparkCtx.lineTo(x2, y2);
      sparkCtx.stroke();
    }
    // Soft ring.
    sparkCtx.globalAlpha = (1 - t) * 0.5;
    sparkCtx.strokeStyle = b.sparks[0].color;
    sparkCtx.lineWidth = 1.5;
    sparkCtx.beginPath();
    sparkCtx.arc(b.x, b.y, 6 + e * 26, 0, Math.PI * 2);
    sparkCtx.stroke();
  }
  sparkCtx.globalAlpha = 1;
  sparkRaf = bursts.length ? requestAnimationFrame(drawSparks) : 0;
}

/** Burst of brand-coloured sparks at a point (or the centre of an element). */
export function spark(target, colors = ['#3cc420', '#1d7d1a', '#b5f28f', '#151515']) {
  if (reduceMotion()) return;
  ensureSparkCanvas();
  let x = target.x;
  let y = target.y;
  if (target instanceof Element) {
    const r = target.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height / 2;
  }
  const count = 10;
  bursts.push({
    x,
    y,
    start: performance.now(),
    sparks: Array.from({ length: count }, (_, i) => ({
      angle: (i / count) * Math.PI * 2 + Math.random() * 0.4,
      reach: 26 + Math.random() * 22,
      scale: 0.7 + Math.random() * 0.6,
      color: colors[i % colors.length],
    })),
  });
  if (bursts.length > 24) bursts.shift();
  if (!sparkRaf) sparkRaf = requestAnimationFrame(drawSparks);
}

// ---------- Magnet (port of React Bits "Magnet") ----------

/** Elements with [data-magnet] lean toward a nearby mouse pointer (desktop only). */
export async function initMagnets() {
  if (reduceMotion() || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const { gsap } = await motion();
  const tracked = new WeakMap();
  window.addEventListener(
    'pointermove',
    (e) => {
      for (const el of document.querySelectorAll('[data-magnet]')) {
        let q = tracked.get(el);
        if (!q) {
          q = { x: gsap.quickTo(el, 'x', { duration: 0.5, ease: 'elastic.out(1, 0.4)' }), y: gsap.quickTo(el, 'y', { duration: 0.5, ease: 'elastic.out(1, 0.4)' }) };
          tracked.set(el, q);
        }
        const r = el.getBoundingClientRect();
        const pad = Number(el.dataset.magnet) || 60;
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const near = Math.abs(dx) < r.width / 2 + pad && Math.abs(dy) < r.height / 2 + pad;
        q.x(near ? dx * 0.28 : 0);
        q.y(near ? dy * 0.28 : 0);
      }
    },
    { passive: true },
  );
}
