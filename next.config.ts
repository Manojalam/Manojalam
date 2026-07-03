import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // TipTap v3 ships as native ESM — transpilePackages is NOT needed and
  // can actually break it. Remove to allow Next.js to handle it natively.
};

export default nextConfig;
