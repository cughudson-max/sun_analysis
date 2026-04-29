import React from 'react'
import ReactDOM from 'react-dom/client'
import { FluentProvider, webLightTheme } from '@fluentui/react-components'
import App from './App.tsx'
import './index.css'
import { Analytics } from '@vercel/analytics/react';


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FluentProvider theme={webLightTheme}>
      <App />
      <Analytics />
    </FluentProvider>
  </React.StrictMode>,
)
