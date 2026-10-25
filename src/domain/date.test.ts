import { describe, expect, it } from 'vitest'
import {
  addDaysISO,
  addMonthsClamped,
  addYearsClamped,
  daysBetweenISO,
  daysInMonth,
  formatCN,
  formatISODate,
  isLeapYear,
  monthStartISO,
  parseISODate,
  todayISO,
} from './date'

describe('parseISODate', () => {
  it('接受合法日期', () => {
    expect(parseISODate('2026-10-25')).toEqual({ y: 2026, m: 10, d: 25 })
  })

  it('拒绝非法月份与日期', () => {
    expect(parseISODate('2026-13-01')).toBeNull()
    expect(parseISODate('2026-00-10')).toBeNull()
    expect(parseISODate('2026-02-30')).toBeNull()
    expect(parseISODate('2026-04-31')).toBeNull()
  })

  it('闰年 2 月 29 日仅在闰年合法', () => {
    expect(parseISODate('2024-02-29')).toEqual({ y: 2024, m: 2, d: 29 })
    expect(parseISODate('2025-02-29')).toBeNull()
    expect(parseISODate('2000-02-29')).not.toBeNull()
    expect(parseISODate('1900-02-29')).toBeNull()
  })

  it('拒绝格式不正确的输入', () => {
    expect(parseISODate('2026-1-5')).toBeNull()
    expect(parseISODate('2026/10/25')).toBeNull()
    expect(parseISODate('')).toBeNull()
    expect(parseISODate(null)).toBeNull()
    expect(parseISODate(undefined)).toBeNull()
  })
})

describe('isLeapYear / daysInMonth', () => {
  it('闰年判定遵循 4/100/400 规则', () => {
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2025)).toBe(false)
    expect(isLeapYear(1900)).toBe(false)
    expect(isLeapYear(2000)).toBe(true)
  })

  it('各月天数正确', () => {
    expect(daysInMonth(2026, 1)).toBe(31)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(daysInMonth(2026, 12)).toBe(31)
  })
})

describe('addDaysISO', () => {
  it('跨月与跨年', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysISO('2024-03-01', -1)).toBe('2024-02-29')
  })

  it('跨夏令时边界不加不减一天（纯日历运算）', () => {
    expect(addDaysISO('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDaysISO('2026-11-01', -1)).toBe('2026-10-31')
  })

  it('非法输入返回 null', () => {
    expect(addDaysISO('2026-02-30', 1)).toBeNull()
  })
})

describe('addMonthsClamped', () => {
  it('月末夹取', () => {
    expect(formatISODate(addMonthsClamped({ y: 2026, m: 1, d: 31 }, 1))).toBe('2026-02-28')
    expect(formatISODate(addMonthsClamped({ y: 2024, m: 1, d: 31 }, 1))).toBe('2024-02-29')
    expect(formatISODate(addMonthsClamped({ y: 2026, m: 3, d: 31 }, 1))).toBe('2026-04-30')
  })

  it('跨年进位', () => {
    expect(formatISODate(addMonthsClamped({ y: 2026, m: 11, d: 15 }, 3))).toBe('2027-02-15')
    expect(formatISODate(addMonthsClamped({ y: 2026, m: 1, d: 15 }, -1))).toBe('2025-12-15')
    expect(formatISODate(addMonthsClamped({ y: 2026, m: 1, d: 15 }, -13))).toBe('2024-12-15')
  })

  it('12 个月等于下一年同一日期', () => {
    expect(formatISODate(addMonthsClamped({ y: 2026, m: 6, d: 10 }, 12))).toBe('2027-06-10')
  })
})

describe('addYearsClamped', () => {
  it('2/29 夹取到 2/28', () => {
    expect(formatISODate(addYearsClamped({ y: 2024, m: 2, d: 29 }, 1))).toBe('2025-02-28')
    expect(formatISODate(addYearsClamped({ y: 2024, m: 2, d: 29 }, 4))).toBe('2028-02-29')
  })
})

describe('daysBetweenISO', () => {
  it('同一天为 0', () => {
    expect(daysBetweenISO('2026-10-25', '2026-10-25')).toBe(0)
  })

  it('正负方向正确', () => {
    expect(daysBetweenISO('2026-10-25', '2026-10-28')).toBe(3)
    expect(daysBetweenISO('2026-10-28', '2026-10-25')).toBe(-3)
  })

  it('跨年与闰年', () => {
    expect(daysBetweenISO('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetweenISO('2024-02-28', '2024-03-01')).toBe(2)
    expect(daysBetweenISO('2025-02-28', '2025-03-01')).toBe(1)
  })

  it('非法输入返回 null', () => {
    expect(daysBetweenISO('2026-02-30', '2026-03-01')).toBeNull()
  })
})

describe('todayISO', () => {
  it('取本机日历日而非 UTC', () => {
    // 本地时间 2026-01-01 00:30 在 UTC 可能还是 2025-12-31
    expect(todayISO(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01')
    expect(todayISO(new Date(2026, 0, 1, 23, 30))).toBe('2026-01-01')
  })
})

describe('monthStartISO', () => {
  it('返回当月 1 号', () => {
    expect(monthStartISO('2026-10-25')).toBe('2026-10-01')
    expect(monthStartISO('2026-01-31')).toBe('2026-01-01')
  })
})

describe('formatCN', () => {
  it('同年省略年份', () => {
    expect(formatCN('2026-10-28', '2026-10-25')).toBe('10月28日')
  })

  it('跨年带年份', () => {
    expect(formatCN('2027-01-05', '2026-10-25')).toBe('2027年1月5日')
  })

  it('无参考日期时省略年份', () => {
    expect(formatCN('2026-10-28')).toBe('10月28日')
  })
})
