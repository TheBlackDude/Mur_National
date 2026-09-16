import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// VITE_BASE is "/" on a custom domain or Netlify, "/<repo>/" on a bare github.io URL.
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'apple-touch-icon.png', 'frames/*.png'],
      manifest: {
        name: "Fier d'être Guinéen — Mur National",
        short_name: 'Fier Guinéen',
        description: 'Le Mur National de la Fierté, Semaine de l’Indépendance An 68',
        lang: 'fr',
        theme_color: '#3273AC',
        background_color: '#F5F7FA',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Keep the shell offline-capable; never cache Firebase traffic.
        navigateFallback: `${base}index.html`,
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        // Screen-only and install-only assets stay out of every phone's precache (~700 KB on 3G).
        globIgnores: ['**/logo-68-lg.png', '**/armoiries.svg', '**/qr-selfie.svg', '**/icon-512.png', '**/node_modules/**'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*thumbs.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'thumbs', expiration: { maxEntries: 300, maxAgeSeconds: 86400 } },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2019',
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/database', 'firebase/storage', 'firebase/functions'],
        },
      },
    },
  },
})
