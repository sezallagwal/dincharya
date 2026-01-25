import React from 'react'
import ReactDOM from 'react-dom/client'
import './global.css'
import { PromptWindow } from './components/PromptWindow'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <PromptWindow />
  </React.StrictMode>
)
