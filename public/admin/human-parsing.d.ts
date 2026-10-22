export const CLOTHING: Set<string>;
export function combineMasks(
  segments: { label: string; mask: { width: number; height: number; data: ArrayLike<number> } }[],
  w: number,
  h: number,
  grow?: number,
): Uint8Array;
export function clothesMask(canvas: HTMLCanvasElement, onProgress?: (p: number) => void): Promise<Uint8Array>;
