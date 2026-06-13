import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// 1) On rend l'app EN PREMIER — comme ça l'app s'affiche même si l'enregistrement
//    du service worker échoue (ex: Safari en navigation privée, where serviceWorker peut manquer).
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// 2) Service worker (PWA) — totalement optionnel, dans un try/catch pour ne jamais bloquer Safari.
//    registerType:'autoUpdate' → la nouvelle version s'active et recharge toute seule.
try {
  if ('serviceWorker' in navigator) {
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        const update = registerSW({
          immediate: true,
          onRegisteredSW(swUrl, r) {
            if (r) setInterval(() => { r.update().catch(() => {}) }, 60 * 1000)
          },
        })
        return update
      })
      .catch(() => {})
  }
} catch (e) { /* SW indisponible — l'app fonctionne quand même */ }
