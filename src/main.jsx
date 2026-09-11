// TWO APPS, ONE BUNDLE.
//
// The editor is what the deployed site serves. The Rhino Companion is the same
// bundle loaded inside a WebView2 window by gh/sp_connect.py, showing one option
// and nothing else — see src/companion/CompanionApp.jsx.
//
// PRESENCE PICKS, once, here. `window.chrome.webview` exists only inside that
// window, so there is no URL parameter, no build variant and no setting to get
// wrong, and nobody browsing the site can reach the other app.
//
// ToastProvider wraps both: it is where every confirmation goes, including
// Rhino's answer to a link.

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './ui/App.jsx'
import CompanionApp from './companion/CompanionApp.jsx'
import { inRhino } from './companion/bridge.js'
import { ToastProvider } from './ui/primitives/Toast.jsx'
import './index.css'

const Root = inRhino() ? CompanionApp : App

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <Root />
    </ToastProvider>
  </React.StrictMode>,
)
