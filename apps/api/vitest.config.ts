import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    hookTimeout: 30000,
    testTimeout: 30000,
    // Todos os arquivos de teste compartilham o mesmo Postgres local e
    // rodam migrações/TRUNCATE no beforeAll — precisa ser sequencial.
    fileParallelism: false,
  },
});
