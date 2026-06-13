import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Enregistre le service worker et vérifie une nouvelle version chaque minute.
// registerType:'autoUpdate' → la nouvelle version s'active et recharge toute seule.
// C'est ce qui garantit que les appareils des enfants passent vite à la dernière version.
registerSW({
  immediate: true,
  onRegisteredSW(swUrl, r) {
    if (r) setInterval(() => { r.update().catch(() => {}); }, 60 * 1000)
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
