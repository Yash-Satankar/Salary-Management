import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['**/*.int.test.ts', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/modules/**/service.ts', 'src/modules/csv/**/*.ts'],
      exclude: ['**/*.test.ts'],
      thresholds: { lines: 85 },
    },
  },
});
