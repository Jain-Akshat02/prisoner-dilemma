import type { NextConfig } from "next";

const nextConfig: NextConfig = {
   turbopack: {
    root: __dirname,
  },
  /* config options here */
  reactCompiler: true,
};

export default nextConfig;
