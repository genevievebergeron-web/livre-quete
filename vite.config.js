import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Cible de build compatible avec des Safari plus anciens (transpile ?? et ?. au besoin)
  build: {
    target: ['es2019', 'safari13', 'chrome87', 'firefox78'],
    rollupOptions: {
      output: {
        // React et le changelog sortent du gros paquet applicatif.
        // POURQUOI : server.cjs sert les assets en "max-age=31536000, immutable" (nom haché),
        // et il n'y a PAS de service worker (selfDestroying) — le cache HTTP du navigateur est
        // donc le seul cache. Tant que tout est dans un seul fichier, la moindre version
        // nocturne change son hash et fait re-telecharger React au complet à chaque fois.
        // Isolés, ces deux morceaux gardent leur hash entre les versions et restent en cache.
        // Ce ne sont PAS des import() paresseux : les 3 fichiers sont préchargés en parallèle
        // depuis index.html, donc aucun aller-retour réseau supplémentaire au démarrage.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react'
        }
      }
    }
  },
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
