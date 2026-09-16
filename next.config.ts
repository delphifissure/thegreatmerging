import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prompt files are read from disk at runtime by lib/prompts.ts; include them in serverless bundles.
  outputFileTracingIncludes: {
    "/**": ["./prompts/**/*", "./config/**/*"],
  },
  // Native or browser-launching packages stay external to the server bundle.
  serverExternalPackages: ["postgres", "playwright", "@playwright/test"],
};

export default nextConfig;
