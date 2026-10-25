import {
  addDaysISO,
  addMonthsClamped,
  addYearsClamped,
  daysBetweenISO,
  formatISODate,
  parseISODate,
  todayISO,
} from './date'
import type { Entry, ExpiryStatus, ShelfLifeUnit } from './types'

/**
 * 由「生产日期 + 保质期」推算到期日。
 * 天数按日历日直接相加；月/年按日历进位并在月末夹取。
 * 任一输入缺失或非法时返回 null。
 */
export function computeExpiry(
  productionDate: string | null,
  value: number | null,
  unit: ShelfLifeUnit,
): string | null {
  if (!productionDate || value === null || !Number.isInteger(value) || value < 0) return null
  if (unit === 'day') return addDaysISO(productionDate, value)
  const p = parseISODate(productionDate)
  if (!p) return null
  if (unit === 'month') return formatISODate(addMonthsClamped(p, value))
  if (unit === 'year') return formatISODate(addYearsClamped(p, value))
  return null
}

/**
 * 到期状态（纯日期比较，不用时间戳）。
 * - 剩余为 0 → finished
 * - expiry < today → expired
 * - 0 <= expiry - today <= warnDays → expiring（到期当天算临期）
 * - 其余 → ok
 *
 * 一条记录可能有多批，此时 expiryDate 是最早到期那批的日期（见 syncEntry），
 * 因此整箱状态按最急的那批算，不会把快过期的包藏起来。
 */
export function statusOf(entry: Entry, today: string, warnDays: number): ExpiryStatus {
  if (entry.remaining <= 0) return 'finished'
  const diff = daysBetweenISO(today, entry.expiryDate)
  if (diff === null) return 'ok'
  if (diff < 0) return 'expired'
  if (diff <= warnDays) return 'expiring'
  return 'ok'
}

export function isActiveStatus(status: ExpiryStatus): boolean {
  return status === 'expired' || status === 'expiring'
}

/** 距到期天数（正数为还剩，负数为已过期）；非法日期返回 null */
export function daysUntilExpiry(entry: Entry, today: string): number | null {
  return daysBetweenISO(today, entry.expiryDate)
}

/** 到期日的口语化描述 */
export function expiryHint(entry: Entry, today: string): string {
  if (entry.remaining <= 0) return `吃完于 ${entry.expiryDate} 前`
  const diff = daysBetweenISO(today, entry.expiryDate)
  if (diff === null) return entry.expiryDate
  if (diff < 0) return `已过期 ${-diff} 天`
  if (diff === 0) return '今天到期'
  if (diff === 1) return '明天到期'
  return `${diff} 天后到期`
}

export interface StatusCounts {
  expired: number
  expiring: number
  ok: number
  finished: number
}

/** 按条目计数（不是件数），finished 由 remaining=0 得出 */
export function countByStatus(entries: Entry[], today: string, warnDays: number): StatusCounts {
  const counts: StatusCounts = { expired: 0, expiring: 0, ok: 0, finished: 0 }
  for (const entry of entries) {
    counts[statusOf(entry, today, warnDays)] += 1
  }
  return counts
}

/** 顶部警示：只在剩余 > 0 时统计 */
export function alertCounts(entries: Entry[], today: string, warnDays: number): { expired: number; expiring: number } {
  let expired = 0
  let expiring = 0
  for (const entry of entries) {
    const status = statusOf(entry, today, warnDays)
    if (status === 'expired') expired += 1
    else if (status === 'expiring') expiring += 1
  }
  return { expired, expiring }
}

/** 在库总包数 */
export function totalRemaining(entries: Entry[]): number {
  return entries.reduce((sum, e) => sum + e.remaining, 0)
}

export { todayISO }
