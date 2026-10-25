import { useEffect } from 'react'
import type { ThemeMode } from '../domain/types'

const QUERY = '(prefers-color-scheme: dark)'

/**
 * 主题：auto 时监听系统，light/dark 时固定。
 * 解析结果写到 <html data-theme>，CSS 只认这一个属性，
 * 不再重复写一套 @media (prefers-color-scheme) 的变量。
 */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement
  if (mode === 'auto') {
    const dark = window.matchMedia(QUERY).matches
    root.dataset.theme = dark ? 'dark' : 'light'
    return
  }
  root.dataset.theme = mode
}

export function useTheme(mode: ThemeMode): void {
  useEffect(() => {
    applyTheme(mode)
    if (mode !== 'auto') return
    const media = window.matchMedia(QUERY)
    const onChange = () => applyTheme('auto')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [mode])
}
