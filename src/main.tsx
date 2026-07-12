import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'

const overlayMode = new URLSearchParams(window.location.search).get('overlay') === '1'
const root = ReactDOM.createRoot(document.getElementById('root')!)

if (overlayMode) {
  await import('./overlay.css')
  const { OverlayApp } = await import('./overlay-main')
  root.render(<OverlayApp />)
} else {
  await import('./styles.css')
  const { default: App } = await import('./App')
  root.render(<React.StrictMode><App /></React.StrictMode>)
}
