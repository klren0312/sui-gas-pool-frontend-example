import { defineConfig } from '@farmfe/core';

export default defineConfig({
  plugins: ['@farmfe/plugin-react'],
  server: {
    proxy: {
      '/v1': {
        target: 'http://localhost:9527',
        changeOrigin: true,
      }
    }
  }
});
