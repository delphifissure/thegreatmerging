/**
 * Application-level AES-256-GCM for PHQ-9, GAD-7 and OCI-R response and score values.
 *
 * Wire format (bytea): version(1) || iv(12) || authTag(16) || ciphertext.
 * The key comes from FIELD_ENCRYPTION_KEY (32 bytes, base64) in the platform secret store.
 * Associated data binds each ciphertext to its column context so a value cannot be
 * transplanted between users or instruments.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export type EncryptionContext = {
  user_id: string;
  instrument_key: string;
  field: string;
};

let cachedKey: Buffer | undefined;
let cachedRaw: string | undefined;

export function loadKey(raw = process.env.FIELD_ENCRYPTION_KEY): Buffer {
  if (cachedKey && cachedRaw === raw) return cachedKey;
  if (!raw) throw new Error("FIELD_ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes");
  cachedKey = key;
  cachedRaw = raw;
  return key;
}

function aad(ctx: EncryptionContext): Buffer {
  return Buffer.from(`the-plan:v${VERSION}:${ctx.user_id}:${ctx.instrument_key}:${ctx.field}`, "utf8");
}

export function encryptNumber(value: number, ctx: EncryptionContext, key = loadKey()): Buffer {
  if (!Number.isFinite(value)) throw new Error("cannot encrypt a non-finite number");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(ctx));
  const plaintext = Buffer.from(String(value), "utf8");
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, ct]);
}

export function decryptNumber(blob: Buffer, ctx: EncryptionContext, key = loadKey()): number {
  if (blob.length < 1 + IV_BYTES + TAG_BYTES) throw new Error("ciphertext too short");
  const version = blob[0];
  if (version !== VERSION) throw new Error(`unsupported ciphertext version ${version}`);
  const iv = blob.subarray(1, 1 + IV_BYTES);
  const tag = blob.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const ct = blob.subarray(1 + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(aad(ctx));
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  const n = Number(pt);
  if (!Number.isFinite(n)) throw new Error("decrypted payload is not a number");
  return n;
}

/** Constant-time comparison for share tokens and similar secrets. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function generateKeyBase64(): string {
  return randomBytes(32).toString("base64");
}
