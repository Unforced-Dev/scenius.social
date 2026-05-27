import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@atproto/tap", "thread-stream", "pino", "postgres"],
};

export default nextConfig;
