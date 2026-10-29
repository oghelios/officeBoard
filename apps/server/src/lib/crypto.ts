import crypto from 'node:crypto';
import fs from 'node:fs';
import { config } from '../config.js';

let key: Buffer | null = null;

/** 32-byte key from APP_SECRET, or a random key persisted in the data directory. */
function getKey(): Buffer {
  if (key) return key;
  if (process.env.APP_SECRET) {
    key = crypto.createHash('sha256').update(process.env.APP_SECRET).digest();
    return key;
  }
  if (fs.existsSync(config.secretKeyFile)) {
    key = Buffer.from(fs.readFileSync(config.secretKeyFile, 'utf8').trim(), 'base64');
  } else {
    key = crypto.randomBytes(32);
    fs.writeFileSync(config.secretKeyFile, key.toString('base64'), { mode: 0o600 });
  }
  return key;
}

/** AES-256-GCM; output is base64(iv | tag | ciphertext). */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decrypt(encoded: string): string {
  const buf = Buffer.from(encoded, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
