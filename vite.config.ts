import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import vueDevTools from 'vite-plugin-vue-devtools';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiTarget = (env.VITE_API_BASE_URL || 'http://127.0.0.1:8000')
    .replace(/\/api\/?$/, '');
  const ocrTarget = (env.VITE_OCR_API_URL || 'http://127.0.0.1:8787')
    .replace(/\/api\/?$/, '');
  return {
    plugins: [vue(), vueDevTools(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api/ocr': {
          target: ocrTarget,
          changeOrigin: true,
        },
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
