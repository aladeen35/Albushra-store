// Turns a garment photo into what the 3D renderer needs:
//  - a cut-out texture (white/light studio backgrounds are removed; transparent PNGs are used as-is)
//  - a low-res height field that gives the garment real volume (inflated from its silhouette)
//  - a fabric normal map taken from the photo's own folds and texture
// Everything runs in the browser on a canvas; results are cached per URL.

// Longest side of the texture; phones get smaller textures to save GPU memory.
const SMALL_SCREEN = typeof window !== 'undefined' && window.innerWidth < 700;
const MAX_TEX = SMALL_SCREEN ? 640 : 1024;
export const GRID_COLS = 56;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${url}`));
    img.src = url;
  });
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Background colour(s) from the image border: usually one studio colour; two when the picture has a
 * fake "transparent" checkerboard printed into it (common on free PNG sites).
 */
function borderColors(data, w, h) {
  const px = [];
  const take = (x, y) => {
    const i = (y * w + x) * 4;
    px.push([data[i], data[i + 1], data[i + 2]]);
  };
  const step = Math.max(1, Math.floor(Math.min(w, h) / 160));
  for (let x = 0; x < w; x += step) {
    take(x, 0);
    take(x, 1);
    take(x, h - 1);
  }
  for (let y = 0; y < h; y += step) {
    take(0, y);
    take(w - 1, y);
  }
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const median = (list) => [0, 1, 2].map((k) => list.map((c) => c[k]).sort((a, b) => a - b)[list.length >> 1]);
  const ls = px.map(lum).sort((a, b) => a - b);
  const lo = ls[Math.floor(ls.length * 0.1)];
  const hi = ls[Math.floor(ls.length * 0.9)];
  if (hi - lo > 8 && lo > 150) {
    const mid = (lo + hi) / 2;
    const dark = px.filter((c) => lum(c) < mid);
    const light = px.filter((c) => lum(c) >= mid);
    if (dark.length > px.length * 0.2 && light.length > px.length * 0.2) return [median(light), median(dark)];
  }
  return [median(px)];
}

/**
 * Removes a plain light background (white, off-white, light grey) by flood-filling from the image border.
 * The fill stops at edges, so white garments with a visible outline survive; holes inside the garment
 * (e.g. a white print) are kept because they are not connected to the border.
 * `tolerance` ≈ how far (0–255) a pixel may be from the background colour and still count as background.
 */
export function removeBackground(imageData, tolerance = 26, { mannequin = false } = {}) {
  const { data, width: w, height: h } = imageData;
  const colors = borderColors(data, w, h);
  const checker = colors.length > 1;
  const n = w * h;
  const dist = new Uint8Array(n);
  const lum = new Float32Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    let d = 255;
    for (const [br, bg, bb] of colors) d = Math.min(d, Math.max(Math.abs(data[i] - br), Math.abs(data[i + 1] - bg), Math.abs(data[i + 2] - bb)));
    dist[p] = d;
    lum[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  // Edge strength (Sobel on luminance) stops the fill at garment outlines.
  const edge = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const gx = lum[p - w + 1] + 2 * lum[p + 1] + lum[p + w + 1] - lum[p - w - 1] - 2 * lum[p - 1] - lum[p + w - 1];
      const gy = lum[p + w - 1] + 2 * lum[p + w] + lum[p + w + 1] - lum[p - w - 1] - 2 * lum[p - w] - lum[p - w + 1];
      edge[p] = Math.min(255, Math.sqrt(gx * gx + gy * gy) / 4);
    }
  }
  // Outlines block the fill. Thickening them by 2px closes small gaps, which matters for white
  // garments on white backgrounds where the outline is faint. Soft shadows have no sharp edge and
  // are filled (removed) normally.
  // A printed checkerboard is full of sharp square edges; only strong edges count there.
  const EDGE = checker ? 40 : 3;
  const barrier = new Uint8Array(n);
  const R = 2;
  for (let p = 0; p < n; p++) {
    if (edge[p] < EDGE) continue;
    const x = p % w;
    const y = (p - x) / w;
    for (let dy = -R; dy <= R; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -R; dx <= R; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < w) barrier[yy * w + xx] = 1;
      }
    }
  }
  const bgMask = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const seed = (p) => {
    if (!bgMask[p] && !barrier[p] && dist[p] <= tolerance * 1.5) {
      bgMask[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
    for (const q of nb) {
      if (q < 0 || q >= n || bgMask[q] || barrier[q]) continue;
      if (dist[q] <= tolerance) {
        bgMask[q] = 1;
        queue[tail++] = q;
      }
    }
  }
  // The thickened outline also covers a little background: peel off barrier pixels that are
  // background-coloured and touch the background (two passes = the 2px thickening).
  for (let pass = 0; pass < R; pass++) {
    const peel = [];
    for (let p = 0; p < n; p++) {
      if (!barrier[p] || bgMask[p] || dist[p] > tolerance * 0.6 || edge[p] >= EDGE) continue;
      const x = p % w;
      if ((x > 0 && bgMask[p - 1]) || (x < w - 1 && bgMask[p + 1]) || (p >= w && bgMask[p - w]) || (p + w < n && bgMask[p + w])) peel.push(p);
    }
    for (const p of peel) bgMask[p] = 1;
  }
  if (mannequin) {
    // Display mannequins are white/light grey and unsaturated. Grow the background into such
    // pixels (head, hands, feet) wherever they touch it; the garment's colour stops the growth.
    // Not suitable for white garments, which look the same as the mannequin.
    const isMannequin = (q) => {
      const i = q * 4;
      const mx = Math.max(data[i], data[i + 1], data[i + 2]);
      const mn = Math.min(data[i], data[i + 1], data[i + 2]);
      return mx - mn < 24 && lum[q] > 140;
    };
    head = 0;
    tail = 0;
    for (let p = 0; p < n; p++) if (bgMask[p]) queue[tail++] = p;
    while (head < tail) {
      const p = queue[head++];
      const x = p % w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of nb) {
        if (q < 0 || q >= n || bgMask[q] || !isMannequin(q)) continue;
        bgMask[q] = 1;
        queue[tail++] = q;
      }
    }
  }

  // Keep the garment itself: the largest connected piece plus any large secondary pieces.
  // Drops leftovers such as a hat above a removed mannequin head or watermark specks.
  {
    const label = new Int32Array(n);
    const sizes = [0];
    for (let p = 0; p < n; p++) {
      if (bgMask[p] || label[p]) continue;
      const id = sizes.length;
      let size = 0;
      head = 0;
      tail = 0;
      queue[tail++] = p;
      label[p] = id;
      while (head < tail) {
        const c = queue[head++];
        size++;
        const x = c % w;
        const nb = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w];
        for (const q of nb) {
          if (q < 0 || q >= n || bgMask[q] || label[q]) continue;
          label[q] = id;
          queue[tail++] = q;
        }
      }
      sizes.push(size);
    }
    const biggest = Math.max(...sizes);
    for (let p = 0; p < n; p++) if (!bgMask[p] && sizes[label[p]] < biggest * 0.15) bgMask[p] = 1;
  }

  // Edge clean-up: drop light halo pixels left from the background or its shadow, then
  // "defringe" the outline by giving edge pixels the colour of the fabric just inside them,
  // so no white rim shows against the page.
  const touches = (p) => {
    const x = p % w;
    return (x > 0 && bgMask[p - 1]) || (x < w - 1 && bgMask[p + 1]) || (p >= w && bgMask[p - w]) || (p + w < n && bgMask[p + w]);
  };
  const halo = [];
  for (let p = 0; p < n; p++) if (!bgMask[p] && touches(p) && dist[p] <= tolerance * 1.4) halo.push(p);
  for (const p of halo) bgMask[p] = 1;
  const edgePx = [];
  for (let p = 0; p < n; p++) if (!bgMask[p] && touches(p)) edgePx.push(p);
  const isEdge = new Uint8Array(n);
  for (const p of edgePx) isEdge[p] = 1;
  for (const p of edgePx) {
    const x = p % w;
    let r = 0;
    let g = 0;
    let b = 0;
    let cnt = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const q = p + dy * w + dx;
        if (q < 0 || q >= n || x + dx < 0 || x + dx >= w || bgMask[q] || isEdge[q]) continue;
        r += data[q * 4];
        g += data[q * 4 + 1];
        b += data[q * 4 + 2];
        cnt++;
      }
    }
    if (cnt) {
      data[p * 4] = r / cnt;
      data[p * 4 + 1] = g / cnt;
      data[p * 4 + 2] = b / cnt;
    }
  }
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    if (bgMask[p]) data[i + 3] = 0;
    else if (isEdge[p]) data[i + 3] = 170;
  }
  return imageData;
}

/** True when the picture already has a transparent background. */
export function hasTransparency(data, w, h) {
  let transparent = 0;
  let checked = 0;
  const step = Math.max(1, Math.floor((w * h) / 4000));
  for (let p = 0; p < w * h; p += step, checked++) if (data[p * 4 + 3] < 200) transparent++;
  return transparent / checked > 0.04;
}

/** Crops to the garment's bounding box plus a small margin. */
function cropToContent(src) {
  const w = src.width;
  const h = src.height;
  const { data } = src.getContext('2d').getImageData(0, 0, w, h);
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 <= x0 || y1 <= y0) return src;
  const m = Math.round(Math.max(x1 - x0, y1 - y0) * 0.02);
  x0 = Math.max(0, x0 - m);
  y0 = Math.max(0, y0 - m);
  x1 = Math.min(w - 1, x1 + m);
  y1 = Math.min(h - 1, y1 + m);
  const out = canvas(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext('2d').drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** Loads a photo; true if it already has a transparent background (nothing to remove). */
export async function isCutout(url) {
  const img = await loadImage(url);
  const w = Math.min(200, img.naturalWidth);
  const h = Math.round((w * img.naturalHeight) / img.naturalWidth);
  const ctx = canvas(w, h).getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return hasTransparency(ctx.getImageData(0, 0, w, h).data, w, h);
}

/**
 * Loads a photo and returns a cropped, background-free canvas.
 * options.mannequin: also remove a plain white mannequin (colour-based).
 * options.keep: async (canvas) => Uint8Array mask (1 = keep), e.g. clothes from a human-parsing model,
 *               used to drop a model's face, hair, arms and legs.
 */
export async function cutout(url, tolerance, options = {}) {
  const img = await loadImage(url);
  const scale = Math.min(1, MAX_TEX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const c = canvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h); // throws on cross-origin images without CORS
  const keep = options.keep ? await options.keep(c) : null;
  if (!hasTransparency(imageData.data, w, h)) removeBackground(imageData, tolerance, options);
  if (keep) {
    for (let p = 0; p < w * h; p++) if (!keep[p]) imageData.data[p * 4 + 3] = 0;
  }
  ctx.putImageData(imageData, 0, 0);
  return cropToContent(c);
}

/** Two-pass chamfer distance transform (distance to the nearest outside cell). */
function distanceField(mask, cols, rows) {
  const INF = 1e9;
  const d = new Float32Array(cols * rows);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] > 0.5 ? INF : 0;
  const D1 = 1;
  const D2 = Math.SQRT2;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) v = Math.min(v, 1);
      if (x > 0) v = Math.min(v, d[i - 1] + D1);
      if (y > 0) v = Math.min(v, d[i - cols] + D1);
      if (x > 0 && y > 0) v = Math.min(v, d[i - cols - 1] + D2);
      if (x < cols - 1 && y > 0) v = Math.min(v, d[i - cols + 1] + D2);
      d[i] = v;
    }
  }
  for (let y = rows - 1; y >= 0; y--) {
    for (let x = cols - 1; x >= 0; x--) {
      const i = y * cols + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x < cols - 1) v = Math.min(v, d[i + 1] + D1);
      if (y < rows - 1) v = Math.min(v, d[i + cols] + D1);
      if (x < cols - 1 && y < rows - 1) v = Math.min(v, d[i + cols + 1] + D2);
      if (x > 0 && y < rows - 1) v = Math.min(v, d[i + cols - 1] + D2);
      d[i] = v;
    }
  }
  return d;
}

/**
 * Builds the garment's shape data from its cut-out:
 *  heights: how far the front surface stands out (world units, garment width = 1)
 *  mask:    coverage per grid cell (0..1)
 *  top/bottom/shoulder: where the hanger goes and how long the piece is
 */
export function analyze(cut) {
  const aspect = cut.height / cut.width;
  const cols = GRID_COLS;
  const rows = Math.max(8, Math.round(cols * aspect));
  const small = canvas(cols, rows);
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(cut, 0, 0, cols, rows);
  const px = sctx.getImageData(0, 0, cols, rows).data;
  const mask = new Float32Array(cols * rows);
  const lum = new Float32Array(cols * rows);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = px[i * 4 + 3] / 255;
    lum[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  }
  const dist = distanceField(mask, cols, rows);
  let maxD = 1;
  for (const v of dist) if (v > maxD) maxD = v;

  // Garments on a hanger are mostly flat panels with rounded edges: a quick rise near the outline,
  // then a gentle dome. Thickness is relative to the garment width.
  const plateau = Math.max(2.5, maxD * 0.55);
  const thickness = 0.1;
  const heights = new Float32Array(cols * rows);
  for (let i = 0; i < heights.length; i++) {
    if (!dist[i]) continue;
    // dist 1 = the outermost ring of the garment: zero thickness there, so front and back meet
    // at the silhouette with no gap when the garment turns.
    const t = Math.min((dist[i] - 1) / plateau, 1);
    const edge = Math.sqrt(1 - (1 - t) * (1 - t)); // circular profile at the rim
    const dome = 0.25 * Math.min((dist[i] - 1) / Math.max(1, maxD - 1), 1);
    // Darker areas in the photo are usually folds/creases: push them in slightly.
    const fold = (lum[i] - 0.5) * 0.15;
    heights[i] = thickness * (0.7 * edge + dome) * (1 + fold);
  }

  // Top of the garment (where the hanger sits) and its shoulder width.
  let topRow = 0;
  while (topRow < rows - 1 && !rowHas(mask, cols, topRow)) topRow++;
  let bottomRow = rows - 1;
  while (bottomRow > 0 && !rowHas(mask, cols, bottomRow)) bottomRow--;
  const shoulderRow = Math.min(rows - 1, topRow + Math.round(rows * 0.06));
  let left = cols;
  let right = 0;
  for (let x = 0; x < cols; x++) {
    if (mask[shoulderRow * cols + x] > 0.5) {
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  // Body width (25th percentile of row spans below the neckline) sets the real-world scale, so a pair
  // of jeans isn't drawn as wide as a T-shirt with its sleeves out.
  const spans = [];
  for (let r = topRow + Math.round((bottomRow - topRow) * 0.12); r <= bottomRow; r++) {
    let l = -1;
    let rt = -1;
    for (let x = 0; x < cols; x++) {
      if (mask[r * cols + x] > 0.5) {
        if (l < 0) l = x;
        rt = x;
      }
    }
    if (l >= 0) spans.push((rt - l + 1) / cols);
  }
  spans.sort((a, b) => a - b);
  const body = spans.length ? spans[Math.floor(spans.length * 0.25)] : 0.6;
  return {
    cols,
    rows,
    aspect,
    mask,
    heights,
    body,
    top: topRow / (rows - 1),
    bottom: bottomRow / (rows - 1),
    shoulder: right > left ? (right - left) / (cols - 1) : 0.6,
  };
}

function rowHas(mask, cols, row) {
  for (let x = 0; x < cols; x++) if (mask[row * cols + x] > 0.5) return true;
  return false;
}

/** Fabric normal map from the photo's fine detail (weave, seams, wrinkles). */
export function normalMap(cut, strength = 2.2) {
  const w = Math.min(SMALL_SCREEN ? 256 : 512, cut.width);
  const h = Math.round((w * cut.height) / cut.width);
  const c = canvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(cut, 0, 0, w, h);
  const src = ctx.getImageData(0, 0, w, h);
  const L = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    L[p] = ((0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2]) / 255) * (src.data[i + 3] / 255);
  }
  const out = ctx.createImageData(w, h);
  const at = (x, y) => L[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * w + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

/**
 * A plain back for garments without a back photo: the front's average fabric colour with its
 * large-scale shading (no print). Textures are stored as seen from the front, like the geometry.
 */
export function plainBack(cut) {
  const w = cut.width;
  const h = cut.height;
  const c = canvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  // Average colour of the fabric (ignore transparent pixels).
  const tiny = canvas(32, Math.max(8, Math.round((32 * h) / w)));
  const tctx = tiny.getContext('2d', { willReadFrequently: true });
  tctx.drawImage(cut, 0, 0, tiny.width, tiny.height);
  const td = tctx.getImageData(0, 0, tiny.width, tiny.height).data;
  const hist = new Map();
  for (let i = 0; i < td.length; i += 4) {
    if (td[i + 3] < 200) continue;
    const key = ((td[i] >> 4) << 8) | ((td[i + 1] >> 4) << 4) | (td[i + 2] >> 4);
    hist.set(key, (hist.get(key) ?? 0) + 1);
  }
  let best = 0;
  let bestN = -1;
  for (const [k, v] of hist) if (v > bestN) [best, bestN] = [k, v];
  const base = `rgb(${((best >> 8) & 15) * 16 + 8}, ${((best >> 4) & 15) * 16 + 8}, ${(best & 15) * 16 + 8})`;
  ctx.save();
  ctx.drawImage(cut, 0, 0); // silhouette
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // Keep the soft folds from the front photo, without the print.
  ctx.globalCompositeOperation = 'multiply';
  ctx.filter = `blur(${Math.round(w / 40)}px) grayscale(1) contrast(0.7) brightness(1.1)`;
  ctx.drawImage(cut, 0, 0);
  ctx.restore();
  return c;
}

const cache = new Map();

/** Everything the renderer needs for one garment (front photo, optional back photo). */
export function prepareGarment(frontUrl, backUrl) {
  const key = `${frontUrl}|${backUrl ?? ''}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      (async () => {
        const front = await cutout(frontUrl);
        let back = null;
        if (backUrl && backUrl !== frontUrl) {
          try {
            const raw = await cutout(backUrl);
            // Back photos are taken from behind: mirror so the texture lines up with the front's geometry.
            back = canvas(front.width, front.height);
            const bctx = back.getContext('2d');
            bctx.translate(back.width, 0);
            bctx.scale(-1, 1);
            bctx.drawImage(raw, 0, 0, back.width, back.height);
          } catch {}
        }
        back ??= plainBack(front);
        return { front, back, normal: normalMap(front), shape: analyze(front) };
      })(),
    );
  }
  return cache.get(key);
}
