import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [...configDefaults.exclude, 'dist/**'],
    // Test files share one SQLite database, so they must run one at a time.
    // (Vitest 4 removed `poolOptions`; these are the equivalent settings.)
    pool: 'threads',
    maxWorkers: 1,
    fileParallelism: false,
  },
});
