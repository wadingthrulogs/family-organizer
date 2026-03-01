import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [...configDefaults.exclude, 'dist/**'],
    pool: 'threads',
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 1,
      },
    },
  },
});
