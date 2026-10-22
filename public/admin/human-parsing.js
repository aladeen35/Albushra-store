// Keeps only the clothes in a product photo: a human-parsing model labels every pixel (face, hair,
// arms, legs, shoes… or top, trousers, dress…) and everything that is not clothing is removed.
// Works for photos on a model or on a mannequin. Runs in the admin's browser; the model
// (SegFormer B2 fine-tuned for clothes, ~27 MB quantised) downloads once and is cached by the browser.

const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js';
const MODEL = 'Xenova/segformer_b2_clothes';

/** Labels of the model that count as the garment being sold. */
export const CLOTHING = new Set(['Upper-clothes', 'Dress', 'Skirt', 'Pants', 'Belt', 'Scarf']);

let segmenter;

function load(onProgress) {
  segmenter ??= import(/* @vite-ignore */ TRANSFORMERS).then(({ pipeline }) =>
    pipeline('image-segmentation', MODEL, {
      dtype: 'q8',
      progress_callback: (p) => {
        if (p.status === 'progress' && p.total) onProgress?.(p.loaded / p.total);
      },
    }),
  );
  segmenter.catch(() => (segmenter = null));
  return segmenter;
}

/**
 * Merges the model's per-label masks into one keep-mask (1 = clothing) at w×h, then grows it by
 * `grow` pixels so garment edges are decided by the background removal, not by the coarser model.
 * `segments` is the pipeline output: [{ label, mask: { width, height, data } }].
 */
export function combineMasks(segments, w, h, grow = 3) {
  const keep = new Uint8Array(w * h);
  for (const seg of segments) {
    if (!CLOTHING.has(seg.label)) continue;
    const { width: mw, height: mh, data } = seg.mask;
    const channels = data.length / (mw * mh);
    for (let y = 0; y < h; y++) {
      const my = Math.min(mh - 1, Math.floor((y * mh) / h));
      for (let x = 0; x < w; x++) {
        const mx = Math.min(mw - 1, Math.floor((x * mw) / w));
        if (data[(my * mw + mx) * channels] > 127) keep[y * w + x] = 1;
      }
    }
  }
  if (grow > 0) {
    // Separable max filter (square dilation).
    const tmp = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (let d = -grow; d <= grow && !v; d++) {
          const xx = x + d;
          if (xx >= 0 && xx < w && keep[y * w + xx]) v = 1;
        }
        tmp[y * w + x] = v;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (let d = -grow; d <= grow && !v; d++) {
          const yy = y + d;
          if (yy >= 0 && yy < h && tmp[yy * w + x]) v = 1;
        }
        keep[y * w + x] = v;
      }
    }
  }
  return keep;
}

/** Returns a keep-mask for the canvas (1 = clothing), or throws if the model can't be loaded. */
export async function clothesMask(canvas, onProgress) {
  const seg = await load(onProgress);
  const { RawImage } = await import(/* @vite-ignore */ TRANSFORMERS);
  const image = RawImage.fromCanvas ? RawImage.fromCanvas(canvas) : await RawImage.fromURL(canvas.toDataURL('image/png'));
  const segments = await seg(image);
  const keep = combineMasks(segments, canvas.width, canvas.height);
  if (!keep.some(Boolean)) throw new Error('no_clothes_found');
  return keep;
}
