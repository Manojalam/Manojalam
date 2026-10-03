import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: { "/api/export-pdf": ["./node_modules/@sparticuz/chromium/bin/**"] },
  // TipTap v3 ships as native ESM — transpilePackages is NOT needed and
  // can actually break it. Remove to allow Next.js to handle it natively.
};

export default nextConfig;
