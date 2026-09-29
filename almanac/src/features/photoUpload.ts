import { api } from '../lib/api.ts';
import type { Angle, PhotoSet } from '../../shared/types.ts';
import type { ISODate } from '../../shared/dates.ts';

/**
 * Upload one progress photo. The original file is sent byte-for-byte; the only
 * derived image is a small thumbnail for grids, made here in the browser.
 * Nothing is beautified, resized, or re-encoded on the original.
 */
export async function uploadPhoto(file: Blob, opts: { month: string; date: ISODate; angle: Angle }): Promise<PhotoSet> {
  const form = new FormData();
  form.set('month', opts.month);
  form.set('date', opts.date);
  form.set('angle', opts.angle);
  let dims: { width: number; height: number } | null = null;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    dims = { width: bmp.width, height: bmp.height };
    const thumb = await makeThumb(bmp, 520);
    bmp.close();
    if (thumb) form.set('thumb', thumb, 'thumb.jpg');
  } catch {
    /* formats the browser can't decode (e.g. some HEIC) still upload; the grid shows the original */
  }
  if (dims) {
    form.set('width', String(dims.width));
    form.set('height', String(dims.height));
  }
  const name = file instanceof File ? file.name : `${opts.angle}.jpg`;
  form.set('file', file, name);
  return api.upload<PhotoSet>('/photos', form);
}

export async function makeThumb(bmp: ImageBitmap, max: number): Promise<Blob | null> {
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  return new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.82));
}

export const ANGLES: { key: Angle; label: string }[] = [
  { key: 'front', label: 'Front' },
  { key: 'side', label: 'Side' },
  { key: 'back', label: 'Back' },
];

export const CONSISTENCY = [
  'Same location',
  'Same lighting',
  'Same distance from the camera',
  'Same camera height',
  'Same pose',
  'Similar time of day',
];
