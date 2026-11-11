import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.css'
import './index.css'
import App from './App'
import { registerSW } from 'virtual:pwa-register'

// Installed PWAs rarely re-check for a new version on their own, so check every minute and whenever the
// app comes back to the foreground. With registerType "autoUpdate" a new version then reloads the app.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateSW(true)
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => void registration.update().catch(() => undefined)
    setInterval(check, 60_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
