// Generates the demo garment illustrations in public/demo/ (front + back of each piece).
// Real products use uploaded photos instead; these only fill the store until then.
// Run: node scripts/garments.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../public/demo/', import.meta.url);
mkdirSync(OUT, { recursive: true });

// All garments share a 400x640 canvas with the hanger point at (200, 40).
const W = 400;
const H = 640;

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v + (amount < 0 ? v * amount : (255 - v) * amount))));
  const r = ch(n >> 16);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function svg(silhouette, body, extra = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="cyl" x1="0" x2="1">
    <stop offset="0" stop-color="#000" stop-opacity=".30"/>
    <stop offset=".16" stop-color="#000" stop-opacity=".06"/>
    <stop offset=".42" stop-color="#fff" stop-opacity=".10"/>
    <stop offset=".6" stop-color="#fff" stop-opacity=".04"/>
    <stop offset=".86" stop-color="#000" stop-opacity=".08"/>
    <stop offset="1" stop-color="#000" stop-opacity=".34"/>
  </linearGradient>
  <linearGradient id="top" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity=".12"/>
    <stop offset=".5" stop-color="#fff" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity=".14"/>
  </linearGradient>
  <filter id="noise" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
    <feComponentTransfer><feFuncA type="linear" slope=".07"/></feComponentTransfer>
  </filter>
  <filter id="soft"><feGaussianBlur stdDeviation="3"/></filter>
  <clipPath id="clip">${silhouette}</clipPath>
  ${extra}
</defs>
${body}
<g clip-path="url(#clip)">
  <rect width="${W}" height="${H}" fill="url(#cyl)"/>
  <rect width="${W}" height="${H}" fill="url(#top)"/>
  <rect width="${W}" height="${H}" filter="url(#noise)"/>
</g>
</svg>`;
}

const fold = (d, o = 0.14) => `<path d="${d}" fill="none" stroke="#000" stroke-opacity="${o}" stroke-width="7" stroke-linecap="round" filter="url(#soft)"/>`;
const hilite = (d, o = 0.18) => `<path d="${d}" fill="none" stroke="#fff" stroke-opacity="${o}" stroke-width="6" stroke-linecap="round" filter="url(#soft)"/>`;
const stitch = (d, color = '#000', o = 0.25) => `<path d="${d}" fill="none" stroke="${color}" stroke-opacity="${o}" stroke-width="1.6" stroke-dasharray="5 4"/>`;

// Hanger-and-leaf mark used as a print.
function mark(x, y, s, color, leaf) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M0 -38 c0 -12 14 -14 16 -4 c2 9 -9 11 -16 20" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"/>
    <path d="M0 -22 L-52 12 Q-56 18 -48 18 L48 18 Q56 18 52 12 Z" fill="none" stroke="${color}" stroke-width="8" stroke-linejoin="round"/>
    <path d="M14 -34 q14 -18 30 -14 q-6 18 -30 14 z" fill="${leaf}"/>
  </g>`;
}

// ---------- T-shirt ----------
function tshirt({ color, print = 'mark', ink = '#111', side }) {
  const front = side === 'front';
  const neckFront = 'M165 40 C182 64 218 64 235 40';
  const neckBack = 'M165 40 C182 48 218 48 235 40';
  const body = `M165 40 L105 60 L55 150 L95 172 L118 138 L116 380 Q200 390 284 380 L282 138 L305 172 L345 150 L295 60 L235 40 ${
    front ? 'C218 64 182 64 165 40' : 'C218 48 182 48 165 40'
  } Z`;
  const inner = 'M165 40 C182 48 218 48 235 40 C218 64 182 64 165 40 Z';
  let printSvg = '';
  if (front && print === 'mark') printSvg = mark(200, 205, 1.15, ink, '#3cc420');
  if (front && print === 'type') {
    printSvg = `<g font-family="Impact, 'Arial Black', sans-serif" font-weight="900" fill="${ink}" text-anchor="middle">
      <text x="200" y="168" font-size="44" textLength="150" lengthAdjust="spacingAndGlyphs">AL BUSHRA</text>
      <text x="200" y="214" font-size="44" textLength="150" lengthAdjust="spacingAndGlyphs">ORIGINAL</text>
      <text x="200" y="260" font-size="44" textLength="96" lengthAdjust="spacingAndGlyphs">CLUB.</text></g>`;
  }
  if (!front && print === 'type') printSvg = `<text x="200" y="110" font-family="Impact, sans-serif" font-size="20" fill="${ink}" text-anchor="middle">BSH — 2026</text>`;
  if (!front && print === 'mark') printSvg = mark(200, 104, 0.45, ink, '#3cc420');
  return svg(
    `<path d="${body}"/><path d="${inner}"/>`,
    `${front ? `<path d="${inner}" fill="${shade(color, -0.45)}"/>` : ''}
     <path d="${body}" fill="${color}"/>
     <path d="${front ? neckFront : neckBack}" fill="none" stroke="${shade(color, -0.18)}" stroke-width="9"/>
     <path d="M55 150 L95 172" stroke="${shade(color, -0.15)}" stroke-width="10"/>
     <path d="M345 150 L305 172" stroke="${shade(color, -0.15)}" stroke-width="10"/>
     ${stitch('M60 142 L99 163')}${stitch('M340 142 L301 163')}${stitch('M118 372 Q200 382 282 372')}
     ${printSvg}
     ${fold('M135 200 Q150 280 138 360')}${fold('M268 190 Q252 270 262 360', 0.1)}${fold('M118 140 Q124 150 126 170', 0.22)}${fold('M282 140 Q276 150 274 170', 0.22)}
     ${hilite('M185 300 Q200 330 190 370', 0.12)}`,
  );
}

// ---------- Hoodie ----------
function hoodie({ color, side }) {
  const dark = shade(color, -0.35);
  const body =
    'M150 62 L108 76 Q86 96 80 150 L66 330 L104 340 L120 170 L118 388 L282 388 L280 170 L296 340 L334 330 L320 150 Q314 96 292 76 L250 62 Z';
  const front = side === 'front';
  const hoodBack = 'M140 78 Q138 18 200 14 Q262 18 260 78 Q230 92 200 92 Q170 92 140 78 Z';
  const hoodFront = 'M148 72 Q150 26 200 24 Q250 26 252 72 Q226 104 200 108 Q174 104 148 72 Z';
  return svg(
    `<path d="${body}"/><path d="${hoodBack}"/>`,
    `<path d="${hoodBack}" fill="${shade(color, -0.08)}"/>
     <path d="${body}" fill="${color}"/>
     <rect x="118" y="374" width="164" height="26" rx="4" fill="${shade(color, -0.12)}"/>
     <path d="M66 330 L104 340 L102 356 L64 346 Z" fill="${shade(color, -0.12)}"/>
     <path d="M334 330 L296 340 L298 356 L336 346 Z" fill="${shade(color, -0.12)}"/>
     ${front
       ? `<path d="${hoodFront}" fill="${dark}"/>
          <path d="${hoodFront}" fill="none" stroke="${shade(color, -0.1)}" stroke-width="10"/>
          <path d="M186 104 L182 182" stroke="#eee" stroke-width="5" stroke-linecap="round"/><circle cx="182" cy="186" r="5" fill="#ddd"/>
          <path d="M214 104 L218 182" stroke="#eee" stroke-width="5" stroke-linecap="round"/><circle cx="218" cy="186" r="5" fill="#ddd"/>
          <path d="M140 280 L260 280 L278 362 L122 362 Z" fill="${shade(color, -0.04)}"/>
          <path d="M140 280 Q150 320 124 352" fill="none" stroke="${dark}" stroke-width="4"/>
          <path d="M260 280 Q250 320 276 352" fill="none" stroke="${dark}" stroke-width="4"/>
          ${mark(200, 245, 0.55, '#fff', '#3cc420')}`
       : `${fold('M150 60 Q200 110 250 60', 0.25)}${mark(200, 200, 1, shade(color, 0.85), '#3cc420')}`}
     ${fold('M140 190 Q150 260 140 340')}${fold('M262 190 Q252 260 262 340', 0.1)}${fold('M96 180 Q90 250 86 320', 0.16)}${fold('M304 180 Q310 250 314 320', 0.16)}`,
  );
}

// ---------- Varsity jacket ----------
function varsity({ color, sleeve, accent, side }) {
  const body = 'M118 70 L120 170 L118 392 L282 392 L280 170 L282 70 L240 50 L160 50 Z';
  const lSleeve = 'M160 50 L118 70 Q90 90 84 150 L68 340 L106 348 L122 170 Z';
  const rSleeve = 'M240 50 L282 70 Q310 90 316 150 L332 340 L294 348 L278 170 Z';
  const front = side === 'front';
  const rib = (x, y, w, h, extra = '') =>
    `<g ${extra}><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>
      <rect x="${x}" y="${y + h * 0.3}" width="${w}" height="${h * 0.14}" fill="${accent}"/>
      <rect x="${x}" y="${y + h * 0.56}" width="${w}" height="${h * 0.14}" fill="${sleeve}"/></g>`;
  return svg(
    `<path d="${body}"/><path d="${lSleeve}"/><path d="${rSleeve}"/>`,
    `<path d="${lSleeve}" fill="${sleeve}"/><path d="${rSleeve}" fill="${sleeve}"/>
     <path d="${body}" fill="${color}"/>
     ${rib(118, 368, 164, 30)}
     ${rib(66, 334, 42, 26, 'transform="rotate(5 87 347)"')}${rib(292, 334, 42, 26, 'transform="rotate(-5 313 347)"')}
     ${front
       ? `<path d="M160 50 Q200 66 240 50 L232 70 Q200 84 168 70 Z" fill="${shade(color, -0.3)}"/>
          <path d="M160 50 L168 70 L198 150 L200 392" fill="none" stroke="${accent}" stroke-width="0"/>
          <path d="M156 48 L196 150" stroke="${color}" stroke-width="16"/><path d="M156 48 L196 150" stroke="${accent}" stroke-width="4"/>
          <path d="M244 48 L204 150" stroke="${color}" stroke-width="16"/><path d="M244 48 L204 150" stroke="${accent}" stroke-width="4"/>
          <path d="M200 150 L200 370" stroke="#000" stroke-opacity=".4" stroke-width="2"/>
          ${[170, 210, 250, 290, 330].map((y) => `<circle cx="207" cy="${y}" r="5" fill="#ddd" stroke="#888"/>`).join('')}
          <g transform="translate(235 150)"><rect x="-22" y="-26" width="44" height="52" rx="6" fill="${sleeve}" stroke="${accent}" stroke-width="3"/>
            <text x="0" y="16" font-family="Georgia, serif" font-weight="900" font-size="42" fill="${color}" text-anchor="middle">B</text></g>
          <path d="M140 260 L150 330" stroke="${sleeve}" stroke-width="4"/><path d="M260 260 L250 330" stroke="${sleeve}" stroke-width="4"/>`
       : `<path d="M160 50 Q200 60 240 50 L240 62 Q200 72 160 62 Z" fill="${accent}"/>
          <g font-family="Georgia, serif" font-weight="900" fill="${sleeve}" text-anchor="middle" stroke="${accent}" stroke-width="2">
            <text x="200" y="170" font-size="38" textLength="140" lengthAdjust="spacingAndGlyphs">BUSHRA</text><text x="200" y="270" font-size="100" textLength="110" lengthAdjust="spacingAndGlyphs">93</text></g>`}
     ${fold('M134 190 Q142 270 134 350')}${fold('M266 190 Q258 270 266 350', 0.1)}${fold('M98 160 Q92 240 88 320', 0.14)}${fold('M302 160 Q308 240 312 320', 0.14)}`,
  );
}

// ---------- Denim jacket ----------
function denim({ color, side }) {
  const body = 'M150 52 L112 70 Q88 92 82 150 L68 336 L104 344 L120 172 L118 380 L282 380 L280 172 L296 344 L332 336 L318 150 Q312 92 288 70 L250 52 Z';
  const front = side === 'front';
  const thread = '#d98b2b';
  return svg(
    `<path d="${body}"/>`,
    `<path d="${body}" fill="${color}"/>
     <rect x="118" y="352" width="164" height="30" fill="${shade(color, -0.1)}"/>${stitch('M118 356 L282 356', thread, 0.8)}${stitch('M118 378 L282 378', thread, 0.8)}
     ${front
       ? `<path d="M150 52 L176 104 L200 80 L224 104 L250 52 Q200 70 150 52 Z" fill="${shade(color, -0.35)}"/>
          <path d="M150 52 L136 92 L176 112 L198 82 Z" fill="${shade(color, -0.05)}" stroke="${shade(color, -0.25)}"/>
          <path d="M250 52 L264 92 L224 112 L202 82 Z" fill="${shade(color, -0.05)}" stroke="${shade(color, -0.25)}"/>
          <path d="M200 82 L200 380" stroke="${shade(color, -0.3)}" stroke-width="3"/>${stitch('M208 90 L208 380', thread, 0.8)}
          ${[120, 170, 220, 270, 320].map((y) => `<circle cx="214" cy="${y}" r="5.5" fill="#c9a24a" stroke="#7a5a1a"/>`).join('')}
          <path d="M136 140 L184 140 L184 196 L160 206 L136 196 Z" fill="${shade(color, 0.04)}" stroke="${shade(color, -0.25)}"/>${stitch('M140 160 L180 160', thread, 0.8)}
          <path d="M264 140 L216 140 L216 196 L240 206 L264 196 Z" fill="${shade(color, 0.04)}" stroke="${shade(color, -0.25)}"/>${stitch('M220 160 L260 160', thread, 0.8)}
          <circle cx="160" cy="150" r="4" fill="#c9a24a"/><circle cx="240" cy="150" r="4" fill="#c9a24a"/>
          ${stitch('M130 230 L150 352', thread, 0.6)}${stitch('M270 230 L250 352', thread, 0.6)}`
       : `<path d="M150 52 Q200 66 250 52 L250 64 Q200 78 150 64 Z" fill="${shade(color, -0.3)}"/>
          <path d="M120 170 L200 210 L280 170" fill="none" stroke="${shade(color, -0.25)}" stroke-width="2"/>${stitch('M120 178 L200 218 L280 178', thread, 0.8)}
          ${stitch('M160 218 L156 352', thread, 0.7)}${stitch('M240 218 L244 352', thread, 0.7)}`}
     ${hilite('M150 240 Q160 300 152 340', 0.2)}${hilite('M250 240 Q240 300 248 340', 0.15)}${fold('M96 170 Q90 240 86 320', 0.14)}${fold('M304 170 Q310 240 314 320', 0.14)}`,
  );
}

// ---------- Jeans ----------
function jeans({ color, side }) {
  const body = 'M128 40 L272 40 L282 560 L214 560 L200 214 L186 560 L118 560 Z';
  const front = side === 'front';
  const thread = '#d98b2b';
  return svg(
    `<path d="${body}"/>`,
    `<path d="${body}" fill="${color}"/>
     <rect x="128" y="40" width="144" height="24" fill="${shade(color, -0.08)}"/>${stitch('M128 62 L272 62', thread, 0.8)}
     ${[146, 178, 222, 254].map((x) => `<rect x="${x}" y="36" width="7" height="30" rx="2" fill="${shade(color, -0.15)}"/>`).join('')}
     <rect x="118" y="528" width="68" height="32" fill="${shade(color, 0.1)}"/><rect x="214" y="528" width="68" height="32" fill="${shade(color, 0.1)}"/>
     ${front
       ? `<circle cx="206" cy="52" r="6" fill="#c9a24a" stroke="#7a5a1a"/>
          <path d="M206 64 L206 150 Q206 176 186 186" fill="none" stroke="${shade(color, -0.3)}" stroke-width="2"/>${stitch('M214 66 L214 150 Q212 180 190 192', thread, 0.8)}
          <path d="M132 66 Q170 76 176 112" fill="none" stroke="${shade(color, -0.3)}" stroke-width="3"/>
          <path d="M268 66 Q230 76 224 112" fill="none" stroke="${shade(color, -0.3)}" stroke-width="3"/>
          ${hilite('M150 230 Q160 300 152 380', 0.28)}${hilite('M250 230 Q240 300 248 380', 0.24)}`
       : `<path d="M140 110 L182 106 L184 160 L162 172 L142 160 Z" fill="none" stroke="${shade(color, -0.3)}" stroke-width="2"/>
          <path d="M260 110 L218 106 L216 160 L238 172 L258 160 Z" fill="none" stroke="${shade(color, -0.3)}" stroke-width="2"/>
          ${stitch('M146 118 L178 115', thread, 0.8)}${stitch('M254 118 L222 115', thread, 0.8)}
          <rect x="226" y="72" width="32" height="20" rx="2" fill="#a0784a"/>`}
     ${fold('M150 420 Q160 440 150 470', 0.18)}${fold('M250 420 Q240 440 250 470', 0.18)}${fold('M200 214 L200 240', 0.3)}
     ${stitch('M124 70 L120 520', thread, 0.5)}${stitch('M276 70 L280 520', thread, 0.5)}`,
  );
}

// ---------- Abaya ----------
function abaya({ color, trim, side }) {
  const body = 'M160 44 L116 64 Q80 90 64 160 L28 360 Q60 382 104 372 L126 220 L96 600 Q200 620 304 600 L274 220 L296 372 Q340 382 372 360 L336 160 Q320 90 284 64 L240 44 Z';
  const front = side === 'front';
  const band = (d) =>
    `<path d="${d}" fill="none" stroke="${trim}" stroke-width="12" stroke-opacity=".9"/><path d="${d}" fill="none" stroke="${color}" stroke-width="5" stroke-dasharray="3 6"/>`;
  return svg(
    `<path d="${body}"/>`,
    `<path d="${body}" fill="${color}"/>
     ${front
       ? `<path d="M160 44 C180 70 220 70 240 44" fill="none" stroke="${trim}" stroke-width="8"/>
          <path d="M200 66 L200 604" stroke="#000" stroke-opacity=".5" stroke-width="3"/>
          ${band('M192 70 L184 604')}${band('M208 70 L216 604')}`
       : `<path d="M160 44 C180 52 220 52 240 44" fill="none" stroke="${trim}" stroke-width="8"/>
          <path d="M130 120 Q200 170 270 120" fill="none" stroke="${trim}" stroke-width="10" stroke-opacity=".9"/>
          ${[150, 175, 200, 225, 250].map((x, i) => `<circle cx="${x}" cy="${136 + Math.abs(2 - i) * -6 + 12}" r="5" fill="${trim}"/>`).join('')}`}
     ${band('M36 350 Q62 372 102 362')}${band('M364 350 Q338 372 298 362')}
     ${band('M100 588 Q200 608 300 588')}
     ${fold('M150 260 Q140 420 128 590', 0.25)}${fold('M250 260 Q260 420 272 590', 0.2)}${fold('M90 200 Q70 280 54 350', 0.2)}${fold('M310 200 Q330 280 346 350', 0.2)}
     ${hilite('M170 300 Q166 450 160 590', 0.1)}${hilite('M232 300 Q236 450 242 590', 0.08)}`,
  );
}

// ---------- Sudanese jalabiya ----------
function jalabiya({ color, embroidery, side }) {
  const body = 'M166 42 L120 60 Q92 80 80 140 L48 330 Q78 348 112 338 L128 200 L118 600 Q200 614 282 600 L272 200 L288 338 Q322 348 352 330 L320 140 Q308 80 280 60 L234 42 Z';
  const front = side === 'front';
  return svg(
    `<path d="${body}"/>`,
    `<path d="${body}" fill="${color}"/>
     ${front
       ? `<path d="M166 42 C182 66 218 66 234 42" fill="${shade(color, -0.2)}"/>
          <path d="M166 42 C182 66 218 66 234 42" fill="none" stroke="${embroidery}" stroke-width="5"/>
          <path d="M200 60 L200 150" stroke="${shade(color, -0.3)}" stroke-width="3"/>
          <path d="M190 62 L190 154 L210 154 L210 62" fill="none" stroke="${embroidery}" stroke-width="3"/>
          ${[80, 100, 120, 140].map((y) => `<circle cx="200" cy="${y}" r="3.5" fill="${embroidery}"/>`).join('')}
          <path d="M132 300 L132 370" stroke="${shade(color, -0.3)}" stroke-width="3"/><path d="M268 300 L268 370" stroke="${shade(color, -0.3)}" stroke-width="3"/>`
       : `<path d="M166 42 C182 50 218 50 234 42" fill="none" stroke="${embroidery}" stroke-width="5"/>`}
     ${stitch('M54 322 Q80 338 110 330', embroidery, 0.8)}${stitch('M346 322 Q320 338 290 330', embroidery, 0.8)}
     ${stitch('M122 590 Q200 604 278 590', embroidery, 0.8)}
     ${fold('M160 220 Q150 420 146 590', 0.12)}${fold('M240 220 Q250 420 254 590', 0.1)}${fold('M96 170 Q80 250 66 320', 0.14)}${fold('M304 170 Q320 250 334 320', 0.14)}
     ${fold('M128 202 Q132 214 136 230', 0.2)}${fold('M272 202 Q268 214 264 230', 0.2)}`,
  );
}

// ---------- Hats (drawn at the top of the canvas; the cut-out crops them) ----------
function taqiya({ color, thread, side }) {
  const dome = 'M110 150 Q108 62 200 56 Q292 62 290 150 Z';
  const front = side === 'front';
  const zig = Array.from({ length: 12 }, (_, i) => `${116 + i * 14.5},${i % 2 ? 133 : 143}`).join(' ');
  return svg(
    `<path d="${dome}"/>`,
    `<path d="${dome}" fill="${color}"/>
     <rect x="110" y="122" width="180" height="28" fill="${shade(color, -0.04)}"/>
     <polyline points="${zig}" fill="none" stroke="${thread}" stroke-width="3"/>
     ${stitch('M110 124 L290 124', thread, 0.9)}${stitch('M110 148 L290 148', thread, 0.9)}
     ${front ? `${[150, 175, 200, 225, 250].map((x) => `<circle cx="${x}" cy="100" r="5" fill="none" stroke="${thread}" stroke-width="2.5"/>`).join('')}
       <path d="M150 85 Q200 70 250 85" fill="none" stroke="${thread}" stroke-width="2.5"/>` : `<path d="M140 95 Q200 80 260 95" fill="none" stroke="${thread}" stroke-width="2.5"/>`}
     ${fold('M130 140 Q140 100 160 75', 0.08)}${hilite('M170 70 Q200 62 230 70', 0.35)}`,
  );
}

function cap({ color, side }) {
  const crown = 'M118 150 Q116 60 200 54 Q284 60 282 150 Z';
  const brim = 'M86 148 Q200 128 314 148 Q316 168 300 176 Q200 160 100 176 Q84 168 86 148 Z';
  const front = side === 'front';
  return svg(
    `<path d="${crown}"/>${front ? `<path d="${brim}"/>` : ''}`,
    `<path d="${crown}" fill="${color}"/>
     <path d="M200 56 L200 150" stroke="${shade(color, -0.25)}" stroke-width="2"/>
     <path d="M200 56 Q160 80 150 150" fill="none" stroke="${shade(color, -0.25)}" stroke-width="2"/>
     <path d="M200 56 Q240 80 250 150" fill="none" stroke="${shade(color, -0.25)}" stroke-width="2"/>
     <circle cx="200" cy="56" r="7" fill="${shade(color, -0.3)}"/>
     ${front
       ? `<path d="${brim}" fill="${shade(color, -0.12)}"/>${stitch('M96 152 Q200 136 304 152', '#fff', 0.6)}${mark(200, 118, 0.42, '#fff', '#b5f28f')}`
       : `<path d="M170 150 Q200 112 230 150 Z" fill="${shade(color, -0.45)}"/><rect x="176" y="140" width="48" height="8" rx="3" fill="${shade(color, 0.2)}"/>`}
     ${hilite('M150 80 Q200 64 250 80', 0.25)}`,
  );
}


// ---------- Formal shirt (long sleeves) ----------
function shirt({ color, side }) {
  const front = side === 'front';
  const body = 'M160 46 L118 64 Q96 80 90 130 L72 352 L102 358 L122 170 L120 400 Q200 412 280 400 L278 170 L298 358 L328 352 L310 130 Q304 80 282 64 L240 46 Z';
  const line = shade(color, -0.22);
  return svg(
    `<path d="${body}"/>`,
    `<path d="${body}" fill="${color}"/>
     <path d="M72 352 L102 358 L100 384 L70 378 Z" fill="${shade(color, -0.06)}" stroke="${line}" stroke-width="2"/>
     <path d="M328 352 L298 358 L300 384 L330 378 Z" fill="${shade(color, -0.06)}" stroke="${line}" stroke-width="2"/>
     ${front
       ? `<path d="M160 46 Q200 60 240 46 L232 40 Q200 50 168 40 Z" fill="${shade(color, -0.12)}"/>
          <path d="M160 46 L180 92 L200 64 Z" fill="${shade(color, 0.12)}" stroke="${line}" stroke-width="2"/>
          <path d="M240 46 L220 92 L200 64 Z" fill="${shade(color, 0.12)}" stroke="${line}" stroke-width="2"/>
          <rect x="192" y="64" width="16" height="340" fill="${shade(color, -0.03)}" stroke="${line}" stroke-width="1.5"/>
          ${[90, 140, 190, 240, 290, 340, 385].map((y) => `<circle cx="200" cy="${y}" r="4.5" fill="${shade(color, 0.3)}" stroke="${line}"/>`).join('')}
          <path d="M224 132 L262 132 L262 172 L243 180 L224 172 Z" fill="none" stroke="${line}" stroke-width="2"/>`
       : `<path d="M160 46 Q200 56 240 46 L240 58 Q200 68 160 58 Z" fill="${shade(color, -0.1)}"/>
          <path d="M122 104 Q200 116 278 104" fill="none" stroke="${line}" stroke-width="2"/>
          ${fold('M200 112 L200 200', 0.12)}`}
     ${fold('M140 190 Q150 280 138 380')}${fold('M262 190 Q252 280 264 380', 0.1)}${fold('M100 170 Q94 260 86 340', 0.16)}${fold('M300 170 Q306 260 314 340', 0.16)}`,
  );
}

// ---------- Blazer (suit jacket with shirt and tie) ----------
function blazer({ color, tie, side }) {
  const front = side === 'front';
  const body = 'M158 46 L114 64 Q92 82 86 134 L70 350 L104 358 L122 176 L118 404 Q160 414 200 404 Q240 414 282 404 L278 176 L296 358 L330 350 L314 134 Q308 82 286 64 L242 46 Z';
  const edge = shade(color, -0.35);
  return svg(
    `<path d="${body}"/>`,
    `<path d="${body}" fill="${color}"/>
     ${front
       ? `<path d="M170 46 L200 214 L230 46 Q200 58 170 46 Z" fill="#f6f6f2"/>
          <path d="M196 58 L204 58 L209 70 L205 190 L200 200 L195 190 L191 70 Z" fill="${tie}"/>
          <path d="M160 46 L140 74 L156 98 L144 112 L196 236 L176 70 Z" fill="${shade(color, -0.12)}" stroke="${edge}" stroke-width="2"/>
          <path d="M240 46 L260 74 L244 98 L256 112 L204 236 L224 70 Z" fill="${shade(color, -0.12)}" stroke="${edge}" stroke-width="2"/>
          <path d="M200 236 L200 404" stroke="${edge}" stroke-width="2.5"/>
          <circle cx="206" cy="270" r="6" fill="${edge}"/><circle cx="206" cy="320" r="6" fill="${edge}"/>
          <path d="M130 310 L180 306 L180 318 L130 322 Z" fill="${shade(color, -0.1)}" stroke="${edge}"/>
          <path d="M270 310 L220 306 L220 318 L270 322 Z" fill="${shade(color, -0.1)}" stroke="${edge}"/>
          <path d="M226 160 L262 156 L262 164 L226 168 Z" fill="${shade(color, -0.1)}" stroke="${edge}"/>
          <path d="M232 158 L240 140 L248 150 L256 138 L258 156 Z" fill="#3cc420"/>
          ${[96, 108, 304, 316].map((x) => `<circle cx="${x}" cy="${x < 200 ? 336 : 336}" r="3" fill="${edge}"/>`).join('')}`
       : `<path d="M160 46 Q200 58 240 46 L240 60 Q200 72 160 60 Z" fill="${shade(color, -0.15)}"/>
          <path d="M200 70 L200 404" stroke="${edge}" stroke-width="2" stroke-opacity=".5"/><path d="M200 330 L200 404" stroke="${edge}" stroke-width="3"/>`}
     ${fold('M136 190 Q146 280 136 390')}${fold('M264 190 Q254 280 266 390', 0.1)}${fold('M96 170 Q90 260 82 340', 0.16)}${fold('M304 170 Q310 260 318 340', 0.16)}`,
  );
}

// ---------- Formal trousers ----------
function trousers({ color, side }) {
  const body = 'M128 48 L272 48 L286 420 L214 420 L200 156 L186 420 L114 420 Z';
  const line = shade(color, -0.3);
  return svg(
    `<path d="${body}"/>`,
    `<path d="${body}" fill="${color}"/>
     <rect x="128" y="48" width="144" height="22" fill="${shade(color, -0.12)}"/>
     ${[140, 172, 228, 260].map((x) => `<rect x="${x}" y="46" width="6" height="26" fill="${shade(color, -0.2)}"/>`).join('')}
     ${side === 'front'
       ? `<path d="M200 70 L200 150" stroke="${line}" stroke-width="2"/><path d="M144 76 Q160 100 150 120" fill="none" stroke="${line}" stroke-width="2"/><path d="M256 76 Q240 100 250 120" fill="none" stroke="${line}" stroke-width="2"/>`
       : `<path d="M150 92 L182 92" stroke="${line}" stroke-width="3"/><path d="M218 92 L250 92" stroke="${line}" stroke-width="3"/>`}
     ${hilite('M152 120 L150 418', 0.16)}${hilite('M248 120 L250 418', 0.16)}${fold('M196 160 L190 418', 0.12)}${fold('M204 160 L210 418', 0.12)}`,
  );
}

// ---------- Kids dress ----------
function kidsDress({ color, dots, side }) {
  const body = 'M168 44 L146 58 L126 108 L150 124 L162 150 L112 392 Q200 414 288 392 L238 150 L250 124 L274 108 L254 58 L232 44 Q200 62 168 44 Z';
  // Polka dots in staggered rows that widen with the skirt.
  const dotted = [];
  for (let row = 0, y = 186; y < 384; row++, y += 30) {
    const half = 34 + (y - 160) * 0.36;
    for (let x = 200 - half + (row % 2) * 15; x <= 200 + half; x += 30) dotted.push(`<circle cx="${x.toFixed(1)}" cy="${y}" r="6" fill="${dots}" opacity=".9"/>`);
  }
  return svg(
    `<path d="${body}"/>`,
    `<path d="${body}" fill="${color}"/><g clip-path="url(#clip)">${dotted.join('')}</g>
     <path d="M156 150 Q200 162 244 150 L246 166 Q200 178 154 166 Z" fill="${shade(color, -0.25)}"/>
     ${side === 'front' ? `<path d="M186 160 q-22 -16 -26 2 q4 16 26 4 z M214 160 q22 -16 26 2 q-4 16 -26 4 z" fill="${shade(color, -0.3)}"/><circle cx="200" cy="162" r="6" fill="${shade(color, -0.35)}"/>
       <path d="M168 44 Q200 70 232 44" fill="none" stroke="#fff" stroke-width="6"/>` : `${[70, 95, 120].map((y) => `<circle cx="200" cy="${y}" r="4" fill="#fff"/>`).join('')}`}
     ${fold('M170 190 Q150 300 140 390', 0.12)}${fold('M230 190 Q250 300 262 390', 0.12)}${fold('M200 200 L200 400', 0.08)}`,
  );
}

// ---------- Shoes (side view; the back image is the other side) ----------
function shoe(kind, { color, sole = '#f4f4f1', accent = '#3cc420' }, side) {
  const m = side === 'back' ? ' transform="matrix(-1 0 0 1 400 0)"' : '';
  const shapes = {
    sneaker: {
      upper: 'M46 196 Q34 150 50 116 Q58 102 82 104 Q112 122 150 118 Q156 96 178 94 Q198 98 206 112 L300 148 Q352 160 366 180 Q372 190 370 196 Z',
      sole: 'M38 194 L372 194 Q378 214 360 228 L66 230 Q38 228 38 194 Z',
      extra: `<path d="M48 120 Q56 108 80 108 L84 150 Q60 156 50 150 Z" fill="${shade(color, -0.12)}"/>
        <path d="M86 184 Q200 184 296 150 Q306 146 312 150" fill="none" stroke="${accent}" stroke-width="11" stroke-linecap="round"/>
        <path d="M300 150 q14 -18 30 -14 q-6 18 -30 14 z" fill="${accent}"/>
        ${[0, 1, 2, 3, 4].map((i) => `<path d="M${190 + i * 22} ${108 + i * 8} l-10 18" stroke="${sole === '#ffffff' ? '#cfcfcf' : sole}" stroke-width="5" stroke-linecap="round"/>`).join('')}
        <path d="M300 160 Q340 166 362 184" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="3"/>
        <path d="M40 206 L372 206" stroke="#000" stroke-opacity=".12" stroke-width="3"/>`,
    },
    oxford: {
      upper: 'M40 196 Q40 162 80 154 L170 140 Q210 112 250 108 L300 110 Q318 116 322 140 L330 166 Q360 176 368 196 Z',
      sole: 'M36 194 L370 194 Q372 210 360 214 L300 214 L296 226 L250 226 L246 214 L52 214 Q34 210 36 194 Z',
      extra: `<path d="M120 160 Q140 148 176 144" fill="none" stroke="${shade(color, -0.35)}" stroke-width="3"/>
        <path d="M176 144 Q214 132 238 120" fill="none" stroke="${shade(color, -0.35)}" stroke-width="3"/>
        ${[196, 212, 228].map((x, i) => `<path d="M${x} ${136 - i * 5} L${x + 18} ${132 - i * 5}" stroke="#222" stroke-width="4" stroke-linecap="round"/>`).join('')}
        ${hilite('M70 170 Q120 158 170 150', 0.4)}`,
    },
    markoob: {
      upper: 'M30 196 Q34 182 60 176 Q100 150 160 142 L250 136 Q296 136 312 160 L330 176 L352 182 L360 196 Z',
      sole: 'M26 194 L364 194 Q366 208 352 212 L46 212 Q24 208 26 194 Z',
      extra: `<path d="M30 196 Q20 176 44 178" fill="${color}"/>
        <path d="M90 170 Q180 140 300 160" fill="none" stroke="${accent}" stroke-width="3" stroke-dasharray="6 5"/>
        <path d="M120 166 Q180 150 250 156" fill="none" stroke="${accent}" stroke-width="3" stroke-dasharray="2 4"/>
        ${[140, 180, 220].map((x) => `<path d="M${x} 158 l8 -10 l8 10 l-8 10 z" fill="${accent}"/>`).join('')}
        ${hilite('M70 176 Q140 152 220 146', 0.35)}`,
    },
  }[kind];
  return svg(
    `<path d="${shapes.upper}"${m}/><path d="${shapes.sole}"${m}/>`,
    `<g${m}><path d="${shapes.upper}" fill="${color}"/><path d="${shapes.sole}" fill="${sole}"/>${shapes.extra}</g>`,
  );
}

const PIECES = {
  'taqiya-white': (s) => taqiya({ color: '#f6f5f0', thread: '#b9ab86', side: s }),
  'cap-green': (s) => cap({ color: '#2f9e35', side: s }),
  'cap-black': (s) => cap({ color: '#1d1d1f', side: s }),
  'shirt-white': (s) => shirt({ color: '#f7f7f4', side: s }),
  'shirt-sky': (s) => shirt({ color: '#bcd8f2', side: s }),
  'blazer-navy': (s) => blazer({ color: '#1d2a4a', tie: '#7b1f2b', side: s }),
  'blazer-charcoal': (s) => blazer({ color: '#3a3b3f', tie: '#1f6b2a', side: s }),
  'trousers-grey': (s) => trousers({ color: '#5d6066', side: s }),
  'trousers-navy': (s) => trousers({ color: '#232d45', side: s }),
  'kids-tee-sky': (s) => tshirt({ color: '#8ec9f0', print: 'mark', ink: '#1d2a4a', side: s }),
  'kids-tee-orange': (s) => tshirt({ color: '#f39a3b', print: 'mark', ink: '#fff', side: s }),
  'kids-dress-pink': (s) => kidsDress({ color: '#f3a6bf', dots: '#fff', side: s }),
  'kids-dress-yellow': (s) => kidsDress({ color: '#f6d046', dots: '#fff7d6', side: s }),
  'kids-jalabiya': (s) => jalabiya({ color: '#dff0fb', embroidery: '#6ba3cf', side: s }),
  'sneaker-white': (s) => shoe('sneaker', { color: '#f2f2ef', sole: '#ffffff', accent: '#3cc420' }, s),
  'sneaker-black': (s) => shoe('sneaker', { color: '#232326', sole: '#f2f2ef', accent: '#3cc420' }, s),
  'oxford-brown': (s) => shoe('oxford', { color: '#6b3a1f', sole: '#2a1a12' }, s),
  'oxford-black': (s) => shoe('oxford', { color: '#1c1c1e', sole: '#3a2a20' }, s),
  'markoob-tan': (s) => shoe('markoob', { color: '#c48a4a', sole: '#5a3a1e', accent: '#7a1f1f' }, s),
  'markoob-red': (s) => shoe('markoob', { color: '#8a2a22', sole: '#3a2216', accent: '#e6c46a' }, s),
  'tee-yellow': (s) => tshirt({ color: '#f6c516', print: 'type', ink: '#111', side: s }),
  'tee-white': (s) => tshirt({ color: '#f4f4f1', print: 'mark', ink: '#111', side: s }),
  'tee-black': (s) => tshirt({ color: '#1d1d1f', print: 'mark', ink: '#f2f2f2', side: s }),
  'tee-pink': (s) => tshirt({ color: '#f3a6bf', print: 'type', ink: '#2a1a20', side: s }),
  'hoodie-black': (s) => hoodie({ color: '#202022', side: s }),
  'hoodie-green': (s) => hoodie({ color: '#2f9e35', side: s }),
  'hoodie-beige': (s) => hoodie({ color: '#e4d6bd', side: s }),
  'varsity-black': (s) => varsity({ color: '#1b1b1d', sleeve: '#f1efe9', accent: '#c4202b', side: s }),
  'varsity-green': (s) => varsity({ color: '#1f6b2a', sleeve: '#f1efe9', accent: '#f6c516', side: s }),
  'denim-blue': (s) => denim({ color: '#5b86c0', side: s }),
  'jeans-blue': (s) => jeans({ color: '#3f64a0', side: s }),
  'jeans-black': (s) => jeans({ color: '#2b2c30', side: s }),
  'abaya-black': (s) => abaya({ color: '#141416', trim: '#c9a24a', side: s }),
  'abaya-navy': (s) => abaya({ color: '#1d2a4a', trim: '#d8c08a', side: s }),
  'jalabiya-white': (s) => jalabiya({ color: '#f5f3ee', embroidery: '#c9c2b0', side: s }),
  'jalabiya-beige': (s) => jalabiya({ color: '#e6d8bd', embroidery: '#9c8250', side: s }),
};

for (const [name, draw] of Object.entries(PIECES)) {
  for (const side of ['front', 'back']) writeFileSync(new URL(`${name}-${side}.svg`, OUT), draw(side).replace(/\n\s*/g, '\n'));
}
console.log(`wrote ${Object.keys(PIECES).length * 2} files`);
