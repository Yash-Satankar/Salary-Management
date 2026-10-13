import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/server.ts', migrate: 'src/db/migrate.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // The shared package is consumed as TypeScript source, so it must be bundled into the API build.
  noExternal: [/^@acme\/shared/],
});
