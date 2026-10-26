import { useEffect } from 'react'
import { DEFAULT_FONT_SIZE, MAX_FONT_SIZE, MIN_FONT_SIZE } from '../domain/types'

/**
 * 字号：整套样式都用 rem，把根字号设成用户选的 px，
 * 界面就等比放大——字、间距、按钮高度一起长，不会出现「字大了但行高没变」的挤。
 *
 * 真值存在数据文件的 settings.fontSize 里；这里另存一份到 localStorage 只为了
 * 首帧就能用对字号，避免启动时先按 14px 排一遍再跳一下。
 */

const KEY = 'snack-manager:font-size'

export function clampFontSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FONT_SIZE
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(value)))
}

export function applyFontSize(size: number): void {
  document.documentElement.style.fontSize = `${clampFontSize(size)}px`
}

export function readCachedFontSize(): number | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? clampFontSize(n) : null
  } catch {
    return null
  }
}

export function cacheFontSize(size: number): void {
  try {
    window.localStorage.setItem(KEY, String(clampFontSize(size)))
  } catch {
    /* 存不了就算了，只影响首帧是否跳动，不影响功能 */
  }
}

/** 首帧前调用：有缓存就先用，没有就等磁盘数据到了再说 */
export function applyCachedFontSize(): void {
  const cached = readCachedFontSize()
  if (cached !== null) applyFontSize(cached)
}

export function useFontSize(size: number): void {
  useEffect(() => {
    applyFontSize(size)
    cacheFontSize(size)
  }, [size])
}
