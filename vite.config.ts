import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/app-icon.svg'],
      manifest: {
        name: 'PDF в PNG',
        short_name: 'PDF в PNG',
        description: 'Преобразуйте страницы PDF в PNG локально в браузере.',
        theme_color: '#f7f8fc',
        background_color: '#f7f8fc',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icons/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: '/index.html'
      }
    })
  ],
  build: { target: 'es2022', sourcemap: false }
});
