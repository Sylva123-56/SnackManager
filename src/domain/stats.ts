import { addDaysISO, monthStartISO } from './date'
import type { Entry, StatsRange, CategoryKey } from './types'

/** 时间范围换算成起始日期；'all' 返回 null 表示不限 */
export function rangeStart(range: StatsRange, today: string): string | null {
  if (range === 'all') return null
  if (range === 'month') return monthStartISO(today)
  const days = range === '7d' ? 7 : 30
  // 「近 7 天」= 含今天在内的最近 7 个日历日，即 [today-6, today]
  return addDaysISO(today, -(days - 1))
}

/** 记录是否落在统计区间内（按购买日期） */
export function inRange(entry: Entry, range: StatsRange, today: string): boolean {
  const start = rangeStart(range, today)
  if (start === null) return true
  return entry.purchasedAt >= start && entry.purchasedAt <= today
}

export interface RangeStats {
  /** 购买包数 */
  packages: number
  /** 花费（元），无单价的记录不计入 */
  spend: number
  /** 记录条数 */
  records: number
  /** 有价格记录的条数，用于提示覆盖率 */
  pricedRecords: number
}

export function rangeStats(entries: Entry[], range: StatsRange, today: string): RangeStats {
  const stats: RangeStats = { packages: 0, spend: 0, records: 0, pricedRecords: 0 }
  for (const entry of entries) {
    if (!inRange(entry, range, today)) continue
    stats.records += 1
    stats.packages += entry.quantity
    if (entry.unitPrice !== null) {
      stats.pricedRecords += 1
      stats.spend += entry.quantity * entry.unitPrice
    }
  }
  stats.spend = roundMoney(stats.spend)
  return stats
}

/** 金额保留两位小数，避免浮点尾差（1.005 → 1.01，而非 1.00） */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function formatMoney(value: number): string {
  const fixed = roundMoney(value).toFixed(2)
  // 去掉整数价的 .00，紧凑一些
  return fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed
}

export interface CategorySpend {
  category: CategoryKey
  spend: number
  packages: number
}

/** 区间内分类花费，降序；无价格的分类花费为 0 但仍列出包数 */
export function spendByCategory(entries: Entry[], range: StatsRange, today: string): CategorySpend[] {
  const map = new Map<CategoryKey, CategorySpend>()
  for (const entry of entries) {
    if (!inRange(entry, range, today)) continue
    const current = map.get(entry.category) ?? { category: entry.category, spend: 0, packages: 0 }
    current.packages += entry.quantity
    if (entry.unitPrice !== null) current.spend += entry.quantity * entry.unitPrice
    map.set(entry.category, current)
  }
  const list = [...map.values()]
  for (const item of list) item.spend = roundMoney(item.spend)
  list.sort((a, b) => b.spend - a.spend || b.packages - a.packages)
  return list
}
