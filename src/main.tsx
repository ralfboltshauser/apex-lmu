import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import { I18nProvider } from './i18n'

const overlayMode = new URLSearchParams(window.location.search).get('overlay') === '1'
const root = ReactDOM.createRoot(document.getElementById('root')!)

if (overlayMode) {
  await import('./overlay.css')
  const { OverlayApp } = await import('./overlay-main')
  root.render(<OverlayApp />)
} else {
  await import('./styles.css')
  const { default: App } = await import('./App')
  await import('./styles/readable-surfaces.css')
  await import('./styles/garage.css')
  await import('./styles/strategy-live.css')
  await import('./styles/live-layout.css')
  root.render(<React.StrictMode><I18nProvider><App /></I18nProvider></React.StrictMode>)
}
