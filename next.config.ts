import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo sits inside a folder with other projects; keep Turbopack's root here.
  turbopack: { root: __dirname },
};

export default nextConfig;
