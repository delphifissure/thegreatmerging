/**
 * The Inngest SDK defaults to cloud mode unless INNGEST_DEV is set; under `next dev` the app
 * defaults to the local dev server instead, and leaves every other case to the SDK.
 */
import { describe, expect, it } from "vitest";
import { resolveIsDev } from "@/inngest/client";

describe("resolveIsDev", () => {
  it("uses the local dev server under next dev when INNGEST_DEV is unset", () => {
    expect(resolveIsDev({ NODE_ENV: "development" })).toBe(true);
  });

  it("defers to the SDK when INNGEST_DEV is set, in production, and in tests", () => {
    expect(resolveIsDev({ NODE_ENV: "development", INNGEST_DEV: "0" })).toBeUndefined();
    expect(resolveIsDev({ NODE_ENV: "development", INNGEST_DEV: "1" })).toBeUndefined();
    expect(resolveIsDev({ NODE_ENV: "production" })).toBeUndefined();
    expect(resolveIsDev({ NODE_ENV: "test" })).toBeUndefined();
  });
});
