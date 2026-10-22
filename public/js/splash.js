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

export function splashDone() {
  if (!active || closed) return;
  closed = true;
  splashProgress(1);
  const wait = Math.max(0, MIN - (performance.now() - start));
  setTimeout(() => {
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
