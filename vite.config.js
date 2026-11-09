import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    // 글꼴을 CSS 안에 글자로 박아 넣으면 CSS가 750KB가 되어 첫 화면이 하얗게 멈춤.
    // 글꼴은 따로 파일로 두면 브라우저가 화면에 쓰인 글자 묶음만 골라 받음.
    assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined)
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 개인정보처리방침은 앱 화면이 아니라 그 파일 그대로 보여야 함
      workbox: {
        navigateFallbackDenylist: [/^\/privacy/],
        // PDF 그리기(약 1.6MB)는 설치 때 미리 받지 않고, 가정통신문 목록을 열 때만 받음
        globIgnores: ['**/pdf-*.js', '**/pdf.worker*'],
        importScripts: ['push-sw.js'], // 푸시 알림 받기
        // 글꼴은 한 번 받으면 기기에 저장해 두고 다음부터 바로 씀
        runtimeCaching: [{
          urlPattern: ({ request }) => request.destination === 'font',
          handler: 'CacheFirst',
          options: { cacheName: 'fonts', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 365 } }
        }]
      },
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'BacoClass',
        short_name: 'BacoClass',
        description: '수행평가, 가정통신문, 급식을 한눈에',
        lang: 'ko',
        theme_color: '#34406a',
        background_color: '#f4ede6',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
})
