import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,

  // Packages that need to run outside the bundler (native modules)
  serverExternalPackages: ["neo4j-driver", "pdf-parse"],

  // Allow large file uploads through the dev server proxy.
  // Default is 10MB which causes 400 errors when uploading large PDFs.
  // Individual file limit: 100MB. Frontend uploads files ONE AT A TIME.
  experimental: {
    proxyClientMaxBodySize: '100mb',
  },
};

export default nextConfig;
