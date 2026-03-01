import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const KEY_BYTE_LENGTH = 32;
const IV_BYTE_LENGTH = 12;
const TAG_BYTE_LENGTH = 16;

let cachedKey: Buffer | null = null;

function decodeKey(source: string) {
  const base64 = Buffer.from(source, 'base64');
  if (base64.length === KEY_BYTE_LENGTH) {
    return base64;
  }
  const utf8 = Buffer.from(source, 'utf-8');
  if (utf8.length === KEY_BYTE_LENGTH) {
    return utf8;
  }
  throw new Error('ENCRYPTION_KEY must be 32 bytes when decoded');
}

function getKey(raw?: string) {
  if (raw) {
    return decodeKey(raw);
  }
  if (cachedKey) {
    return cachedKey;
  }
  const envKey = process.env.ENCRYPTION_KEY;
  if (!envKey) {
    throw new Error('ENCRYPTION_KEY is not configured');
  }
  cachedKey = decodeKey(envKey);
  return cachedKey;
}

export function encryptSecret(plain: string, keyOverride?: string) {
  const key = getKey(keyOverride);
  const iv = randomBytes(IV_BYTE_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

export function decryptSecret(payload: Buffer, keyOverride?: string) {
  if (!payload || payload.length < IV_BYTE_LENGTH + TAG_BYTE_LENGTH + 1) {
    throw new Error('Encrypted payload is too short');
  }
  const key = getKey(keyOverride);
  const iv = payload.subarray(0, IV_BYTE_LENGTH);
  const tag = payload.subarray(IV_BYTE_LENGTH, IV_BYTE_LENGTH + TAG_BYTE_LENGTH);
  const ciphertext = payload.subarray(IV_BYTE_LENGTH + TAG_BYTE_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
