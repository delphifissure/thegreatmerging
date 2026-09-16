/**
 * lib/crypto: AES-256-GCM for mental-health values. Wire format version(1) || iv(12) || tag(16) || ct,
 * with the (user_id, instrument_key, field) context bound as associated data.
 */
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { decryptNumber, encryptNumber, generateKeyBase64, loadKey, safeEqual, type EncryptionContext } from "@/lib/crypto";

const key = randomBytes(32);
const otherKey = randomBytes(32);
const ctx: EncryptionContext = { user_id: "11111111-1111-4111-8111-111111111111", instrument_key: "phq9", field: "single:phq9_1" };

describe("encryptNumber / decryptNumber", () => {
  it("round-trips integers, negatives and non-integers", () => {
    for (const v of [0, 3, 27, -2, 3.5, 1e6]) {
      expect(decryptNumber(encryptNumber(v, ctx, key), ctx, key)).toBe(v);
    }
  });

  it("produces the documented wire layout with a fresh IV every time", () => {
    const a = encryptNumber(12, ctx, key);
    const b = encryptNumber(12, ctx, key);
    expect(a.length).toBe(1 + 12 + 16 + "12".length);
    expect(a[0]).toBe(1);
    expect(a.equals(b)).toBe(false);
    expect(a.subarray(1, 13).equals(b.subarray(1, 13))).toBe(false);
  });

  it("fails with the wrong key", () => {
    const blob = encryptNumber(7, ctx, key);
    expect(() => decryptNumber(blob, ctx, otherKey)).toThrow();
  });

  it("fails when the ciphertext is tampered with", () => {
    const blob = encryptNumber(7, ctx, key);
    const tamperedCt = Buffer.from(blob);
    tamperedCt[tamperedCt.length - 1] ^= 0x01;
    expect(() => decryptNumber(tamperedCt, ctx, key)).toThrow();
    const tamperedTag = Buffer.from(blob);
    tamperedTag[1 + 12] ^= 0x01;
    expect(() => decryptNumber(tamperedTag, ctx, key)).toThrow();
    const tamperedIv = Buffer.from(blob);
    tamperedIv[1] ^= 0x01;
    expect(() => decryptNumber(tamperedIv, ctx, key)).toThrow();
  });

  it("fails to decrypt under a different context (user, instrument or field)", () => {
    const blob = encryptNumber(7, ctx, key);
    expect(() => decryptNumber(blob, { ...ctx, user_id: "22222222-2222-4222-8222-222222222222" }, key)).toThrow();
    expect(() => decryptNumber(blob, { ...ctx, instrument_key: "gad7" }, key)).toThrow();
    expect(() => decryptNumber(blob, { ...ctx, field: "single:phq9_2" }, key)).toThrow();
    expect(decryptNumber(blob, { ...ctx }, key)).toBe(7);
  });

  it("rejects an unsupported version byte", () => {
    const blob = Buffer.from(encryptNumber(7, ctx, key));
    blob[0] = 2;
    expect(() => decryptNumber(blob, ctx, key)).toThrow(/unsupported ciphertext version 2/);
  });

  it("rejects a blob shorter than the header", () => {
    expect(() => decryptNumber(Buffer.alloc(1 + 12 + 16 - 1), ctx, key)).toThrow(/too short/);
  });

  it("rejects non-finite numbers and keys of the wrong length", () => {
    expect(() => encryptNumber(Number.NaN, ctx, key)).toThrow(/non-finite/);
    expect(() => encryptNumber(Number.POSITIVE_INFINITY, ctx, key)).toThrow(/non-finite/);
    expect(() => encryptNumber(1, ctx, randomBytes(16))).toThrow();
    expect(() => encryptNumber(1, ctx, randomBytes(64))).toThrow();
  });
});

describe("loadKey", () => {
  const original = process.env.FIELD_ENCRYPTION_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.FIELD_ENCRYPTION_KEY;
    else process.env.FIELD_ENCRYPTION_KEY = original;
  });

  it("throws when the variable is missing", () => {
    delete process.env.FIELD_ENCRYPTION_KEY;
    expect(() => loadKey()).toThrow(/FIELD_ENCRYPTION_KEY is not set/);
    expect(() => loadKey("")).toThrow(/FIELD_ENCRYPTION_KEY is not set/);
  });

  it("requires exactly 32 decoded bytes", () => {
    expect(() => loadKey(randomBytes(16).toString("base64"))).toThrow(/exactly 32 bytes/);
    expect(() => loadKey(randomBytes(33).toString("base64"))).toThrow(/exactly 32 bytes/);
    const k = loadKey(randomBytes(32).toString("base64"));
    expect(k.length).toBe(32);
  });

  it("a generated key is 32 bytes and the default-key path round-trips", () => {
    const generated = generateKeyBase64();
    expect(Buffer.from(generated, "base64").length).toBe(32);
    process.env.FIELD_ENCRYPTION_KEY = generated;
    expect(loadKey()).toHaveLength(32);
    expect(decryptNumber(encryptNumber(9, ctx), ctx)).toBe(9);
  });

  // KNOWN LIBRARY BUG (lib/crypto.ts loadKey): the cache is reused whenever the argument equals the
  // current environment value, without checking which raw value the cached key was derived from.
  // After loadKey(explicit) any loadKey() returns the explicit key instead of the environment key
  // (and a changed FIELD_ENCRYPTION_KEY is never picked up within a process).
  it("loadKey() follows the current FIELD_ENCRYPTION_KEY even after a call with an explicit key", () => {
    const explicit = randomBytes(32).toString("base64");
    expect(loadKey(explicit).equals(Buffer.from(explicit, "base64"))).toBe(true);
    const generated = generateKeyBase64();
    process.env.FIELD_ENCRYPTION_KEY = generated;
    expect(loadKey().equals(Buffer.from(generated, "base64"))).toBe(true);
  });
});

describe("safeEqual", () => {
  it("is true only for identical strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("", "")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
    expect(safeEqual("ab", "abc")).toBe(false);
  });
});
