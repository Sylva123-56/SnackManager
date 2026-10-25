import { daysUntilExpiry, statusOf } from './expiry'
import type { Entry, ExpiryStatus, ListFilter, SortKey } from './types'

/** 按状态筛选；'instock' 表示还剩货且未过期（含临期） */
export function filterEntries(
  entries: Entry[],
  filter: ListFilter,
  today: string,
  warnDays: number,
  query = '',
): Entry[] {
  const q = query.trim().toLowerCase()
  return entries.filter((entry) => {
    if (q !== '' && !matchesQuery(entry, q)) return false
    if (filter === 'all') return true
    const status = statusOf(entry, today, warnDays)
    if (filter === 'instock') return entry.remaining > 0
    if (filter === 'expiring') return status === 'expiring'
    if (filter === 'expired') return status === 'expired'
    return status === 'finished'
  })
}

function matchesQuery(entry: Entry, query: string): boolean {
  return (
    entry.name.toLowerCase().includes(query) ||
    entry.brand.toLowerCase().includes(query) ||
    entry.note.toLowerCase().includes(query) ||
    entry.barcode.includes(query)
  )
}

/**
 * 排序：
 * - expiry：越紧急越靠前（已过期最前），吃完的沉底
 * - purchasedAt：最近买的靠前
 * - name：按本地化拼音序
 */
export function sortEntries(entries: Entry[], sort: SortKey, today: string): Entry[] {
  const copy = [...entries]
  if (sort === 'expiry') {
    copy.sort((a, b) => {
      const aDone = a.remaining <= 0
      const bDone = b.remaining <= 0
      if (aDone !== bDone) return aDone ? 1 : -1
      const diff = (daysUntilExpiry(a, today) ?? 0) - (daysUntilExpiry(b, today) ?? 0)
      if (diff !== 0) return diff
      return a.name.localeCompare(b.name, 'zh-Hans-CN')
    })
    return copy
  }
  if (sort === 'purchasedAt') {
    copy.sort((a, b) => {
      const diff = b.purchasedAt.localeCompare(a.purchasedAt)
      if (diff !== 0) return diff
      return a.name.localeCompare(b.name, 'zh-Hans-CN')
    })
    return copy
  }
  copy.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  return copy
}

/** 筛选 + 排序一步到位 */
export function selectEntries(
  entries: Entry[],
  options: { filter: ListFilter; sort: SortKey; today: string; warnDays: number; query?: string },
): Entry[] {
  const filtered = filterEntries(entries, options.filter, options.today, options.warnDays, options.query)
  return sortEntries(filtered, options.sort, options.today)
}

export interface StatusBuckets {
  expired: number
  expiring: number
  ok: number
  finished: number
  /** 还需要吃掉的总件数（不含已吃完） */
  active: number
}

/** 用于顶部分布条：按剩余件数还是按记录条数，两者视角不同 */
export function statusBucketsByCount(entries: Entry[], today: string, warnDays: number): StatusBuckets {
  const buckets: StatusBuckets = { expired: 0, expiring: 0, ok: 0, finished: 0, active: 0 }
  for (const entry of entries) {
    const status = statusOf(entry, today, warnDays)
    // 已吃完的记录按「条」计 1，其余按剩余件数计，视觉上更贴近「货架上有多少东西」
    const weight = status === 'finished' ? 1 : entry.remaining
    buckets[status] += weight
    if (status !== 'finished') buckets.active += entry.remaining
  }
  return buckets
}

export const FILTER_LABELS: Record<ListFilter, string> = {
  all: '全部',
  instock: '在库',
  expiring: '临期',
  expired: '过期',
  finished: '已吃完',
}

export const SORT_LABELS: Record<SortKey, string> = {
  expiry: '按到期日',
  purchasedAt: '按购买日',
  name: '按名称',
}

export const STATUS_LABELS: Record<ExpiryStatus, string> = {
  expired: '已过期',
  expiring: '临期',
  ok: '正常',
  finished: '已吃完',
}
