/**
 * Avatar images are stored inline in `data.json` and embedded into every export
 * snapshot. A phone photo dropped in as the avatar is several megabytes of
 * base64 that is only ever displayed in a 36px circle (144px at 4x), so it is
 * downscaled once on selection instead of being carried around at full size.
 */

const RASTER_DATA_URL = /^data:image\/(png|jpe?g|webp|avif|bmp);/i;

/** Avatars render at 36 CSS px (144 device px at 4x); 256 leaves headroom. */
export const AVATAR_MAX_SIZE = 256;

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => reject(new Error('avatar decode failed')), { once: true });
    image.src = source;
  });
}

/**
 * Downscale an embedded raster image to `maxSize` on its longest edge and
 * re-encode it as WebP (JPEG when the runtime cannot encode WebP). Anything
 * that is not an inline raster data URL — vault paths, http URLs, SVG — is
 * returned untouched, and a result that is not smaller than the input is
 * discarded.
 */
export async function downscaleDataImage(
  source: string,
  maxSize: number,
  quality = 0.9,
): Promise<string> {
  if (!source || !RASTER_DATA_URL.test(source)) return source;

  let image: HTMLImageElement;
  try {
    image = await loadImage(source);
  } catch {
    return source;
  }

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return source;

  const scale = Math.min(1, maxSize / Math.max(width, height));
  // Already small enough in both pixels and bytes: keep the original encoding.
  if (scale === 1 && source.length <= 60_000) return source;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) return source;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const webp = canvas.toDataURL('image/webp', quality);
  const encoded = webp.startsWith('data:image/webp')
    ? webp
    : canvas.toDataURL('image/jpeg', quality);

  return encoded.length < source.length ? encoded : source;
}

export function compressAvatar(source: string): Promise<string> {
  return downscaleDataImage(source, AVATAR_MAX_SIZE, 0.92);
}
