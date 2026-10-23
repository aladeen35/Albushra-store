// Splash screen controller: progress follows real loading steps; it leaves once the first page
// (and the 3D rack on the home page) is ready, after the logo animation has had time to play.
const el = document.getElementById('splash');
const root = document.documentElement;
const active = Boolean(el) && root.classList.contains('splash-on');
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const start = performance.now();
const MIN = reduce ? 300 : root.classList.contains('is-app') ? 1800 : 1300;
const MAX = 6000;
let progress = 0.08;
let closed = false;

if (active) root.classList.add('splash-lock');

export function splashProgress(p) {
  if (!active || closed || p <= progress) return;
  progress = Math.min(1, p);
  el.style.setProperty('--p', String(progress));
}

/** The splash logo travels to the header logo's place (GSAP), so the brand "lands" in the app. */
async function flyLogoHome() {
  if (reduce) return;
  const mark = el.querySelector('.splash-mark');
  const target = document.querySelector('#site-header .logo svg');
  if (!mark || !target) return;
  try {
    const { motion } = await import('./motion.js');
    const { gsap } = await Promise.race([motion(), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 800))]);
    const a = mark.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    if (!b.width) return;
    const others = el.querySelectorAll('.splash-word, .splash-tag, .splash-bar, .splash-ver, .splash-glow');
    gsap.to(others, { autoAlpha: 0, y: 12, duration: 0.25, ease: 'power2.in' });
    gsap.to(el.querySelector('.splash-bg'), { autoAlpha: 0, duration: 0.5, ease: 'power2.inOut', delay: 0.12 });
    target.style.opacity = '0';
    // The mark is drawn in white on the dark splash; it turns to the header's ink colour as it lands.
    gsap.to(mark.querySelectorAll('.hook, .body'), { stroke: '#151515', duration: 0.45, delay: 0.15 });
    await gsap.to(mark, {
      x: b.left + b.width / 2 - (a.left + a.width / 2),
      y: b.top + b.height / 2 - (a.top + a.height / 2),
      scale: b.width / a.width,
      duration: 0.6,
      ease: 'power3.inOut',
    });
    target.style.opacity = '';
  } catch {
    if (target) target.style.opacity = '';
  }
}

/** Resolves once the splash is gone (immediately when there is none). */
export function afterSplash() {
  if (!active || document.getElementById('splash')?.classList.contains('out') || !document.getElementById('splash')) return Promise.resolve();
  return new Promise((r) => window.addEventListener('splash-closed', () => r(), { once: true }));
}

export function splashDone() {
  if (!active || closed) return;
  closed = true;
  splashProgress(1);
  const wait = Math.max(0, MIN - (performance.now() - start));
  setTimeout(async () => {
    await flyLogoHome();
    el.classList.add('out');
    root.classList.remove('splash-lock');
    // Android app: status/navigation bars go from the splash green to the light app background.
    try {
      window.BushraApp?.systemBars('#F3F3F0', true);
    } catch {}
    window.dispatchEvent(new CustomEvent('splash-closed'));
    setTimeout(() => el.remove(), 320);
  }, wait + 120);
}

// ?splash=hold keeps the splash on screen (design review only).
const hold = new URLSearchParams(location.search).get('splash') === 'hold';
if (hold) closed = true;
if (active) {
  if (!hold) setTimeout(splashDone, MAX);
} else {
  el?.remove();
  try {
    window.BushraApp?.systemBars('#F3F3F0', true);
  } catch {}
}
