import { describe, expect, it } from 'vitest'
import { DEFAULT_FONT_SIZE, MAX_FONT_SIZE, MIN_FONT_SIZE } from '../domain/types'
import { clampFontSize } from './fontSize'

describe('clampFontSize', () => {
  it('范围内的值原样保留', () => {
    expect(clampFontSize(14)).toBe(14)
    expect(clampFontSize(MIN_FONT_SIZE)).toBe(MIN_FONT_SIZE)
    expect(clampFontSize(MAX_FONT_SIZE)).toBe(MAX_FONT_SIZE)
  })

  it('太小太大都夹到边界', () => {
    expect(clampFontSize(1)).toBe(MIN_FONT_SIZE)
    expect(clampFontSize(200)).toBe(MAX_FONT_SIZE)
    expect(clampFontSize(-5)).toBe(MIN_FONT_SIZE)
  })

  it('小数四舍五入，非数字回落默认', () => {
    expect(clampFontSize(15.6)).toBe(16)
    expect(clampFontSize(15.4)).toBe(15)
    expect(clampFontSize(Number.NaN)).toBe(DEFAULT_FONT_SIZE)
    expect(clampFontSize(Number.POSITIVE_INFINITY)).toBe(DEFAULT_FONT_SIZE)
  })
})
