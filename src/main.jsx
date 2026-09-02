import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './ui/App.jsx'
import { ToastProvider } from './ui/primitives/Toast.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
)
