import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// base './' : GitHub Pages 하위 경로(/repo-name/)에서도 그대로 동작
export default defineConfig({
  base: './',
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'data.json'],
      manifest: {
        name: '커피 당번',
        short_name: '커피 당번',
        description: '우리 팀 커피 당번을 공평하게',
        lang: 'ko',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#FAF6F0',
        theme_color: '#3E2723',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'],
        // Pretendard(CDN)도 오프라인에서 쓰이도록 캐시
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'cdn-fonts', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  test: { include: ['src/**/*.test.ts'] },
})
