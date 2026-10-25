/**
 * 纯日历日期运算。
 *
 * 全部以 YYYY-MM-DD 字符串为边界、内部换算成「自 1970-01-01 起的天数」，
 * 借 Date.UTC 做整数换算，因此不受本地时区、夏令时影响：
 * 不出现「少一天」「多一天」的经典坑。
 */

export interface DateParts {
  y: number
  /** 1-12 */
  m: number
  /** 1-31 */
  d: number
}

const MS_PER_DAY = 86_400_000
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

export function daysInMonth(y: number, m: number): number {
  switch (m) {
    case 2:
      return isLeapYear(y) ? 29 : 28
    case 4:
    case 6:
    case 9:
    case 11:
      return 30
    default:
      return 31
  }
}

export function isValidDateParts(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false
  if (y < 1900 || y > 2999) return false
  if (m < 1 || m > 12) return false
  return d >= 1 && d <= daysInMonth(y, m)
}

/** 严格解析 YYYY-MM-DD；非法或缺省一律返回 null */
export function parseISODate(value: string | null | undefined): DateParts | null {
  if (!value) return null
  const matched = ISO_RE.exec(value)
  if (!matched) return null
  const y = Number(matched[1])
  const m = Number(matched[2])
  const d = Number(matched[3])
  if (!isValidDateParts(y, m, d)) return null
  return { y, m, d }
}

export function formatISODate(p: DateParts): string {
  return `${String(p.y).padStart(4, '0')}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

/** 自 1970-01-01 起的天数（可为负） */
export function dayNumber(p: DateParts): number {
  return Math.round(Date.UTC(p.y, p.m - 1, p.d) / MS_PER_DAY)
}

export function dateFromDayNumber(n: number): DateParts {
  const dt = new Date(n * MS_PER_DAY)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

/** 加减天数；输入非法时返回 null */
export function addDaysISO(iso: string, days: number): string | null {
  const p = parseISODate(iso)
  if (!p) return null
  return formatISODate(dateFromDayNumber(dayNumber(p) + days))
}

/** 加减月数，月末夹取（1/31 + 1 月 = 2/28 或闰年 2/29） */
export function addMonthsClamped(p: DateParts, months: number): DateParts {
  const total = p.y * 12 + (p.m - 1) + months
  const y = Math.floor(total / 12)
  const m = total - y * 12 + 1
  return { y, m, d: Math.min(p.d, daysInMonth(y, m)) }
}

/** 加减年数，2/29 夹取到 2/28 */
export function addYearsClamped(p: DateParts, years: number): DateParts {
  const y = p.y + years
  return { y, m: p.m, d: Math.min(p.d, daysInMonth(y, p.m)) }
}

/** to - from，单位天；任一非法返回 null */
export function daysBetweenISO(from: string, to: string): number | null {
  const a = parseISODate(from)
  const b = parseISODate(to)
  if (!a || !b) return null
  return dayNumber(b) - dayNumber(a)
}

/** 本地「今天」（取本机日历日，不做 UTC 换算） */
export function todayISO(now: Date = new Date()): string {
  return formatISODate({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() })
}

/** 当月 1 号 */
export function monthStartISO(today: string): string {
  const p = parseISODate(today)
  if (!p) return today
  return formatISODate({ y: p.y, m: p.m, d: 1 })
}

/** 用于展示：2026-10-28 → 10月28日；跨年时带年份 */
export function formatCN(iso: string, today?: string): string {
  const p = parseISODate(iso)
  if (!p) return iso
  const t = today ? parseISODate(today) : null
  if (t && t.y !== p.y) return `${p.y}年${p.m}月${p.d}日`
  return `${p.m}月${p.d}日`
}
