// Parametric display mannequin (matte white, faceless, on a round base) drawn as SVG.
// Each body shape changes the widths at shoulders, chest, waist, hips and thighs; the returned
// anchors tell the try-on where garments sit.

export const BODIES = {
  'm-slim': { g: 'm', label: 'نحيف', sh: 68, ch: 58, wa: 48, hi: 56, th: 30 },
  'm-regular': { g: 'm', label: 'متوسط', sh: 78, ch: 68, wa: 58, hi: 64, th: 34 },
  'm-athletic': { g: 'm', label: 'رياضي', sh: 90, ch: 80, wa: 58, hi: 64, th: 37 },
  'm-plus': { g: 'm', label: 'ممتلئ', sh: 86, ch: 86, wa: 84, hi: 86, th: 43 },
  'f-slim': { g: 'f', label: 'نحيفة', sh: 60, ch: 56, wa: 42, hi: 62, th: 30 },
  'f-regular': { g: 'f', label: 'متوسطة', sh: 64, ch: 62, wa: 49, hi: 72, th: 34 },
  'f-curvy': { g: 'f', label: 'منحنيات', sh: 66, ch: 70, wa: 50, hi: 88, th: 40 },
  'f-plus': { g: 'f', label: 'ممتلئة', sh: 74, ch: 80, wa: 74, hi: 92, th: 45 },
};

export const VIEW = { w: 400, h: 940 };
const CX = 200;

/** Smooth path through points (Catmull-Rom → cubic Bézier). */
function smooth(points, closed = false) {
  const p = closed ? [points[points.length - 1], ...points, points[0], points[1]] : [points[0], ...points, points[points.length - 1]];
  let d = `M${p[1][0].toFixed(1)} ${p[1][1].toFixed(1)}`;
  for (let i = 1; i < p.length - 2; i++) {
    const [x0, y0] = p[i - 1];
    const [x1, y1] = p[i];
    const [x2, y2] = p[i + 1];
    const [x3, y3] = p[i + 2];
    d += ` C${(x1 + (x2 - x0) / 6).toFixed(1)} ${(y1 + (y2 - y0) / 6).toFixed(1)} ${(x2 - (x3 - x1) / 6).toFixed(1)} ${(y2 - (y3 - y1) / 6).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }
  return closed ? `${d} Z` : d;
}

export function anchors(bodyKey) {
  const b = BODIES[bodyKey] ?? BODIES['m-regular'];
  const f = b.g === 'f';
  return {
    ...b,
    headCx: CX,
    headCy: f ? 86 : 84,
    headRx: f ? 31 : 35,
    headRy: f ? 41 : 45,
    neck: f ? 14 : 17,
    neckY: 158,
    shoulderY: 178,
    chestY: f ? 262 : 250,
    waistY: f ? 338 : 350,
    hipY: f ? 438 : 428,
    crotchY: 478,
    kneeY: 662,
    ankleY: 852,
    footY: 880,
  };
}

/** SVG markup (inner content) of the mannequin; ids are prefixed so several can share a page. */
export function mannequinSvg(bodyKey, id = 'mq') {
  const a = anchors(bodyKey);
  const { sh, ch, wa, hi, th } = a;
  const f = a.g === 'f';
  const side = (s) => [
    [CX + s * a.neck, 150],
    [CX + s * (a.neck + 16), 168],
    [CX + s * (sh - 10), 172],
    [CX + s * sh, 190],
    [CX + s * (sh - 7), 224],
    [CX + s * (ch + (f ? 4 : 0)), a.chestY],
    [CX + s * (ch * 0.5 + wa * 0.5), (a.chestY + a.waistY) / 2],
    [CX + s * wa, a.waistY],
    [CX + s * (wa * 0.4 + hi * 0.6), (a.waistY + a.hipY) / 2],
    [CX + s * hi, a.hipY],
    [CX + s * (hi - 2), a.crotchY],
  ];
  const right = side(1);
  const left = side(-1).reverse();
  const torso = smooth([...right, [CX + 14, a.crotchY + 18], [CX - 14, a.crotchY + 18], ...left], true);

  const leg = (s) => {
    const k = hi * 0.42;
    const outer = [
      [CX + s * (hi - 1), a.crotchY - 30],
      [CX + s * (k + th * 1.05), 545],
      [CX + s * (k + th * 0.62), a.kneeY],
      [CX + s * (k + th * 0.6), 735],
      [CX + s * (k + 12), a.ankleY],
    ];
    const inner = [
      [CX + s * (k - 10), a.ankleY],
      [CX + s * (k - th * 0.45), 735],
      [CX + s * (k - th * 0.45), a.kneeY],
      [CX + s * 6, a.crotchY + 30],
      [CX + s * 2, a.crotchY - 6],
    ];
    return { path: smooth([...outer, ...inner], true), foot: [CX + s * (k + 2), a.footY - 10] };
  };
  const arm = (s) => {
    const sx = CX + s * (sh - 6);
    const pts = [
      [sx, 186, 19],
      [CX + s * (sh + 18), 300, 16],
      [CX + s * (sh + 30), 405, 13],
      [CX + s * (sh + 40), 560, 10],
    ];
    const outer = pts.map(([x, y, w]) => [x + s * w, y]);
    const inner = pts.map(([x, y, w]) => [x - s * w, y]).reverse();
    return { path: smooth([...outer, ...inner], true), hand: [CX + s * (sh + 42), 584] };
  };
  const L = leg(-1);
  const R = leg(1);
  const AL = arm(-1);
  const AR = arm(1);
  const skin = `url(#${id}-skin)`;
  return `
    <defs>
      <linearGradient id="${id}-skin" x1="0" x2="1">
        <stop offset="0" stop-color="#c7c5be"/><stop offset=".22" stop-color="#e9e7e1"/><stop offset=".5" stop-color="#f8f7f3"/>
        <stop offset=".8" stop-color="#e2e0d9"/><stop offset="1" stop-color="#c2c0b9"/>
      </linearGradient>
      <radialGradient id="${id}-head" cx=".42" cy=".35" r=".75"><stop offset="0" stop-color="#fbfaf7"/><stop offset=".6" stop-color="#e6e4dd"/><stop offset="1" stop-color="#c9c7c0"/></radialGradient>
      <radialGradient id="${id}-base" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfcdc6"/></radialGradient>
      <radialGradient id="${id}-shadow"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    </defs>
    <ellipse cx="${CX}" cy="${a.footY + 22}" rx="150" ry="20" fill="url(#${id}-shadow)"/>
    <ellipse cx="${CX}" cy="${a.footY + 14}" rx="118" ry="15" fill="url(#${id}-base)" stroke="#bdbbb4" stroke-width="1"/>
    <g class="mq-body" stroke="rgba(0,0,0,.08)" stroke-width="1">
      <path d="${AL.path}" fill="${skin}"/><ellipse cx="${AL.hand[0]}" cy="${AL.hand[1]}" rx="11" ry="20" fill="${skin}"/>
      <path d="${AR.path}" fill="${skin}"/><ellipse cx="${AR.hand[0]}" cy="${AR.hand[1]}" rx="11" ry="20" fill="${skin}"/>
      <path d="${L.path}" fill="${skin}"/><path d="${R.path}" fill="${skin}"/>
      <ellipse cx="${L.foot[0]}" cy="${L.foot[1]}" rx="20" ry="11" fill="${skin}"/><ellipse cx="${R.foot[0]}" cy="${R.foot[1]}" rx="20" ry="11" fill="${skin}"/>
      <path d="${torso}" fill="${skin}"/>
      ${f ? `<path d="M${CX - ch + 10} ${a.chestY - 6} Q${CX - ch / 2} ${a.chestY + 22} ${CX - 6} ${a.chestY - 4} M${CX + 6} ${a.chestY - 4} Q${CX + ch / 2} ${a.chestY + 22} ${CX + ch - 10} ${a.chestY - 6}" fill="none" stroke="rgba(0,0,0,.07)" stroke-width="3"/>` : ''}
      <rect x="${CX - a.neck}" y="118" width="${a.neck * 2}" height="44" rx="${a.neck * 0.8}" fill="${skin}"/>
      <ellipse cx="${a.headCx}" cy="${a.headCy}" rx="${a.headRx}" ry="${a.headRy}" fill="url(#${id}-head)"/>
    </g>`;
}
