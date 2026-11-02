import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 개인정보처리방침은 앱 화면이 아니라 그 파일 그대로 보여야 함
      workbox: {
        navigateFallbackDenylist: [/^\/privacy/],
        // PDF 그리기(약 1.6MB)는 설치 때 미리 받지 않고, 가정통신문 목록을 열 때만 받음
        globIgnores: ['**/pdf-*.js', '**/pdf.worker*'],
        importScripts: ['push-sw.js'] // 푸시 알림 받기
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
