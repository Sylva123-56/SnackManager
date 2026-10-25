import { describe, expect, it } from 'vitest'
import { formatPrice, formatSpend } from './format'

describe('formatSpend', () => {
  it('去掉无意义的尾部零', () => {
    expect(formatSpend(17)).toBe('17')
    expect(formatSpend(0)).toBe('0')
    expect(formatSpend(17.5)).toBe('17.5')
    expect(formatSpend(0.9)).toBe('0.9')
  })

  it('真实两位小数保留', () => {
    expect(formatSpend(8.55)).toBe('8.55')
    expect(formatSpend(0.05)).toBe('0.05')
    expect(formatSpend(1.01)).toBe('1.01')
  })

  it('四位以上加千分位', () => {
    expect(formatSpend(1234)).toBe('1,234')
    expect(formatSpend(1234.5)).toBe('1,234.5')
    expect(formatSpend(1234567)).toBe('1,234,567')
  })

  it('非有限值兜底为 0', () => {
    expect(formatSpend(Number.NaN)).toBe('0')
    expect(formatSpend(Number.POSITIVE_INFINITY)).toBe('0')
  })

  it('四舍五入到两位', () => {
    expect(formatSpend(8.567)).toBe('8.57')
    expect(formatSpend(8.564)).toBe('8.56')
  })
})

describe('formatPrice', () => {
  it('带人民币符号', () => {
    expect(formatPrice(8.5)).toBe('¥8.5')
    expect(formatPrice(8)).toBe('¥8')
    expect(formatPrice(1234.5)).toBe('¥1,234.5')
  })
})
