/**
 * Next.js instrumentation hook: refuse to start if any instrument named in
 * config/flag_rules.json fails to load (empty license note, empty items, bad key).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertRegistryHealthy } = await import("@/instruments/registry");
    assertRegistryHealthy();
    const { allColorModules } = await import("@/lib/color/config");
    allColorModules();
  }
}
