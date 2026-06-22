import fs from 'node:fs';

/**
 * Image type validation by magic bytes — mirrors the check in routes/attachments.ts
 * but scoped to the image formats Claude can read. Used by the recipe-photo
 * extraction endpoint so we never hand the watcher a non-image / spoofed file.
 */
const IMAGE_MAGIC_BYTES: Record<string, number[][]> = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // "RIFF" (WEBP container)
};

export const ALLOWED_IMAGE_MIME_TYPES = Object.keys(IMAGE_MAGIC_BYTES);

/** Map a mime type to the file extension the watcher recognizes. */
export const IMAGE_MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function verifyImageMagicBytes(filePath: string, mimeType: string): boolean {
  const signatures = IMAGE_MAGIC_BYTES[mimeType];
  if (!signatures) return false;
  const buf = Buffer.alloc(12);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buf, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  return signatures.some((sig) => sig.every((byte, i) => buf[i] === byte));
}
