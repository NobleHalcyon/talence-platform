import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@talence/domain", "@talence/ui"],
  turbopack: {
    root: repositoryRoot,
  },
  images: {
    // Canon requires direct provider-CDN delivery without paid image proxying.
    unoptimized: true,
  },
};

export default nextConfig;
