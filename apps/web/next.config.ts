import type { NextConfig } from 'next';

const DEFAULT_API_ORIGIN = 'http://localhost:4000';
const apiOrigin = (process.env.API_ORIGIN ?? DEFAULT_API_ORIGIN).replace(/\/$/, '');

if (!process.env.API_ORIGIN && process.env.VERCEL) {
  throw new Error('API_ORIGIN must be set to the API URL (e.g. https://acme-api.onrender.com)');
}

const nextConfig: NextConfig = {
  // The shared contract package is published as TypeScript source.
  transpilePackages: ['@acme/shared'],
  // Same-origin by design: the browser only calls /api/* on this origin and Next proxies it to
  // the Express API, so the session cookie is first-party and no CORS setup is needed.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
