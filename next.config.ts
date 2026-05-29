import type { NextConfig } from "next";
import path from "path";
import { buildSecurityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    return [
      {
        // Apply the baseline security headers to every route.
        source: "/:path*",
        headers: buildSecurityHeaders(isProd),
      },
    ];
  },
};

export default nextConfig;
