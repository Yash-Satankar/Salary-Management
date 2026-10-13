import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts'],
    globalSetup: ['src/test/integration/global-setup.ts'],
    // One Postgres container is shared by all files, so files must not truncate each other's data.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
