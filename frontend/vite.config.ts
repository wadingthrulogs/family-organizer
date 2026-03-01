import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    plugins: [react()],
    server: {
      port: 4173,
      proxy: {
        '/api': {
          target: env.VITE_API_BASE ?? 'http://localhost:3000',
          changeOrigin: true,
        },
        '/ws': {
          target: env.VITE_WS_BASE ?? 'ws://localhost:3000',
          ws: true,
        },
      },
    },
    build: {
      sourcemap: mode !== 'production',
    },
  };
});
