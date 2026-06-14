import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Cible de build compatible avec des Safari plus anciens (transpile ?? et ?. au besoin)
  build: { target: ['es2019', 'safari13', 'chrome87', 'firefox78'] },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // On RETIRE le service worker : il restait bloqué sur une vieille version (page blanche sur Safari).
      // Ce SW « autodestructeur » se désinscrit et vide les caches au prochain chargement → page fraîche partout.
      selfDestroying: true,
      injectRegister: null, // on enregistre nous-mêmes dans main.jsx
      manifest: {
        name: 'Livre de Quêtes',
        short_name: 'Quêtes',
        start_url: '/',
        display: 'standalone',
        background_color: '#1a1a2e',
        lang: 'fr-CA',
        scope: '/',
        description: 'App de gamification familiale — tâches, récompenses, aventure!',
        theme_color: '#1a1a2e',
        orientation: 'any',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ]
})
