import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The shared contract package is published as TypeScript source.
  transpilePackages: ['@acme/shared'],
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
