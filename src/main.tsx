import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import { App } from './App'
import { StoreProvider } from './state/store'
import { applyCachedFontSize } from './state/fontSize'

// 首帧前先按上次的字号排，否则会先按 14px 画一遍再跳一下
applyCachedFontSize()

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 挂载点')

createRoot(container).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
)
