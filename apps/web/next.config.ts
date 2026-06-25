import type { NextConfig } from 'next';

const isProd = process.env['NODE_ENV'] === 'production';

const nextConfig: NextConfig = {
  // Required for Docker standalone deployment
  output: isProd ? 'standalone' : undefined,

  env: {
    NEXT_PUBLIC_API_URL: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001',
  },

  compiler: {
    // Remove console.log in production; keep console.error and console.warn
    removeConsole: isProd ? { exclude: ['error', 'warn'] } : false,
  },

  // CORS is handled server-side in NestJS (WEB_ORIGINS env).
  // Rewrites proxy /api/backend/* to the NestJS API in dev to avoid CORS preflight for non-auth fetches.
  async rewrites() {
    if (isProd) return [];
    return [
      {
        source: '/api/backend/:path*',
        destination: `${process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'}/:path*`,
      },
    ];
  },
};

export default nextConfig;
