/**
 * Browser-side image resizing (research R12, FR-068).
 *
 * Every product photo is resized **before** it is uploaded, for two reasons
 * that both matter more than convenience:
 *
 *   1. Cloudflare Workers allow roughly 10 ms of CPU per request. Decoding and
 *      re-encoding a 4 MB phone photo server-side is not close to affordable.
 *   2. Supabase's free tier gives 1 GB of storage. Two thousand products at
 *      four photos each leaves about 125 KB per photo — a phone camera JPEG is
 *      thirty times that.
 *
 * The browser does both jobs for free, on hardware the business does not pay
 * for, before a byte crosses the network.
 */

/** Long edge of the full-size image. Wider than any layout renders it. */
const FULL_MAX_EDGE = 1200;

/** Long edge of the grid thumbnail. */
const THUMB_MAX_EDGE = 400;

/** WebP quality. 0.82 is where artefacts stop being visible on a phone. */
const QUALITY = 0.82;

export interface ResizedImage {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

function scaledSize(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const ratio = maxEdge / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

async function drawToWebp(source: ImageBitmap, maxEdge: number): Promise<Blob> {
  const { width, height } = scaledSize(source.width, source.height, maxEdge);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas_unavailable');

  context.drawImage(source, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', QUALITY),
  );

  if (!blob) throw new Error('encode_failed');
  return blob;
}

/**
 * Produces the pair of images stored for one photo: a full-size WebP and a
 * thumbnail. Both are re-encoded, which also strips the EXIF block — a phone
 * photo of a shelf otherwise carries the GPS coordinates of the warehouse.
 */
export async function resizeForUpload(file: File): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(file);

  try {
    const [full, thumb] = await Promise.all([
      drawToWebp(bitmap, FULL_MAX_EDGE),
      drawToWebp(bitmap, THUMB_MAX_EDGE),
    ]);

    const { width, height } = scaledSize(bitmap.width, bitmap.height, FULL_MAX_EDGE);
    return { full, thumb, width, height };
  } finally {
    bitmap.close();
  }
}
