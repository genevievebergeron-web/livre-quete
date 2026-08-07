import React from 'react'
import ReactDOM from 'react-dom/client'
import App, { APP_VERSION } from './App.jsx'
import ErrorBoundary from './errorboundary.jsx'

// 1) On rend l'app EN PREMIER — comme ça l'app s'affiche même si l'enregistrement
//    du service worker échoue (ex: Safari en navigation privée, where serviceWorker peut manquer).
//    v2.16.42 — enveloppée dans un ErrorBoundary : une erreur de rendu donnait jusqu'ici
//    une page blanche muette (aucun message, aucune trace). Voir errorboundary.jsx.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary appVersion={APP_VERSION}>
      <App />
    </ErrorBoundary>
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
