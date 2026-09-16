/**
 * lib/hash: deterministic JSON (sorted keys), sha256 input hashing for memoization, and share tokens.
 */
import { describe, expect, it } from "vitest";
import { hashInput, hashToken, randomToken, sha256Hex, stableStringify } from "@/lib/hash";

describe("stableStringify", () => {
  it("is independent of key order at every level", () => {
    const a = { b: 1, a: { d: 2, c: [{ z: 1, y: 2 }] } };
    const b = { a: { c: [{ y: 2, z: 1 }], d: 2 }, b: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(stableStringify(a)).toBe('{"a":{"c":[{"y":2,"z":1}],"d":2},"b":1}');
  });

  it("depends on array order", () => {
    expect(stableStringify({ items: [1, 2] })).not.toBe(stableStringify({ items: [2, 1] }));
  });

  it("drops undefined-valued keys and keeps nulls", () => {
    expect(stableStringify({ a: undefined, b: null, c: 1 })).toBe('{"b":null,"c":1}');
    expect(stableStringify({ a: undefined })).toBe("{}");
  });

  it("keeps scalars, dates and buffers intact", () => {
    expect(stableStringify("x")).toBe('"x"');
    expect(stableStringify(3)).toBe("3");
    expect(stableStringify(true)).toBe("true");
    expect(stableStringify(null)).toBe("null");
    const d = new Date("2026-09-15T00:00:00.000Z");
    expect(stableStringify({ d })).toBe('{"d":"2026-09-15T00:00:00.000Z"}');
    expect(stableStringify(Buffer.from("hi"))).toBe(JSON.stringify(Buffer.from("hi")));
  });
});

describe("hashInput", () => {
  it("is equal for equal values regardless of key order and different otherwise", () => {
    const h1 = hashInput({ role: "prober", input: { b: 2, a: 1 } });
    const h2 = hashInput({ input: { a: 1, b: 2 }, role: "prober" });
    const h3 = hashInput({ role: "prober", input: { a: 1, b: 3 } });
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("equals the sha256 of the stable string", () => {
    const v = { x: [1, { y: "z" }] };
    expect(hashInput(v)).toBe(sha256Hex(stableStringify(v)));
  });
});

describe("hashToken", () => {
  it("is deterministic and equal to sha256Hex of the token", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toBe(sha256Hex("abc"));
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashToken("abd")).not.toBe(hashToken("abc"));
  });
});

describe("randomToken", () => {
  it("is 32 random bytes in base64url by default (43 characters)", () => {
    const t = randomToken();
    expect(t).toHaveLength(43);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("honours the byte count", () => {
    expect(randomToken(16)).toHaveLength(22);
    expect(randomToken(48)).toHaveLength(64);
  });

  it("does not repeat", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(randomToken());
    expect(seen.size).toBe(200);
  });
});
