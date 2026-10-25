import { computeExpiry } from './expiry'
import type { Batch, Entry, ShelfLifeUnit } from './types'

/**
 * 箱内批次的推导逻辑。
 *
 * 核心约定（用户确认过的规则）：
 * - 一条记录 = 一箱，箱里可以有 1..n 批，每批只记「生产日期 + 这箱有几包」
 * - 保质期整箱共用，所以每批的到期日 = 该批生产日期 + 共用保质期
 * - 整箱状态按**最早到期的那一批**算
 * - 吃的时候**先吃最早到期的那批**，所以剩余量的分布可以从总数倒推，不必逐批存
 */

/** 老数据没有 batches 字段时，合成一批用的固定 id */
const LEGACY_BATCH_ID = 'legacy'

export function newBatchId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function makeBatch(productionDate: string | null, expiryDate: string, quantity: number): Batch {
  return {
    id: newBatchId(),
    productionDate: productionDate || null,
    expiryDate,
    quantity: Math.max(1, Math.trunc(quantity)),
  }
}

/**
 * 取一条记录的批次。没有 batches 字段的旧数据（或测试里手写的 Entry）
 * 按单批处理，用它自己的生产日期/到期日/总包数合成，调用方无需关心。
 */
export function batchesOf(entry: Pick<Entry, 'batches' | 'productionDate' | 'expiryDate' | 'quantity'>): Batch[] {
  const list = entry.batches
  if (Array.isArray(list) && list.length > 0) return list
  return [
    {
      id: LEGACY_BATCH_ID,
      productionDate: entry.productionDate,
      expiryDate: entry.expiryDate,
      quantity: Math.max(1, Math.trunc(entry.quantity)),
    },
  ]
}

/** 按到期日升序（最早到期在前）；同一天按生产日期升序，保证顺序稳定 */
export function sortBatchesByExpiry(batches: Batch[]): Batch[] {
  return [...batches].sort((a, b) => {
    if (a.expiryDate !== b.expiryDate) return a.expiryDate < b.expiryDate ? -1 : 1
    const ap = a.productionDate ?? ''
    const bp = b.productionDate ?? ''
    if (ap !== bp) return ap < bp ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/** 最早到期的那一批，用来决定整箱状态；空数组返回 null */
export function earliestBatch(batches: Batch[]): Batch | null {
  let earliest: Batch | null = null
  for (const batch of batches) {
    if (!earliest || batch.expiryDate < earliest.expiryDate) earliest = batch
  }
  return earliest
}

/** 各批包数之和，即整箱总包数 */
export function totalQuantity(batches: Batch[]): number {
  return batches.reduce((sum, batch) => sum + batch.quantity, 0)
}

export interface BatchStock {
  batch: Batch
  /** 这一批还剩几包；0 表示这批已吃完 */
  stock: number
  /** 这一批的包数（购买时） */
  quantity: number
  /** 是否最早到期的那一批 */
  isEarliest: boolean
}

/**
 * 把整箱剩余量摊回各批：**先吃最早到期的**，等价于从最晚到期的那批往回填。
 *
 * 例：18 包 9/25 到期 + 2 包 10/2 到期，整箱剩 5 包
 *   → 从最晚的（2 包）先填满 2，再填最早的那批 3 → [3, 2]
 * 这样只要还剩包，就一定是「最早到期的还没吃完」或「只剩晚的」。
 */
export function batchStocks(entry: Pick<Entry, 'batches' | 'productionDate' | 'expiryDate' | 'quantity' | 'remaining'>): BatchStock[] {
  const ordered = sortBatchesByExpiry(batchesOf(entry))
  const earliest = ordered[0] ?? null
  let left = Math.max(0, Math.min(Math.trunc(entry.remaining), totalQuantity(ordered)))
  const stocks = new Array<number>(ordered.length).fill(0)

  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const batch = ordered[i]!
    const take = Math.min(left, batch.quantity)
    stocks[i] = take
    left -= take
    if (left <= 0) break
  }

  return ordered.map((batch, index) => ({
    batch,
    stock: stocks[index] ?? 0,
    quantity: batch.quantity,
    isEarliest: batch === earliest,
  }))
}

/** 整箱是否已经全部吃完 */
export function isFinished(entry: Pick<Entry, 'remaining'>): boolean {
  return entry.remaining <= 0
}

/**
 * 用批次重算派生字段：总包数、整箱到期日、整箱生产日期。
 * 任何改动批次的操作之后都要过一遍，避免缓存字段和批次打架。
 *
 * 整箱到期日取**还有存货的批次里最早到期的那个**：先吃最早到期的，
 * 所以早批吃光后整箱就按下一批算，卡片不会一直显示「已过期」。
 * 全部吃光（remaining=0）时退回全箱最早的一批，只为让字段有意义，
 * 此时状态已经是 finished，不看日期。
 */
export function syncEntry<T extends Entry>(entry: T): T {
  const batches = batchesOf(entry)
  const quantity = Math.max(1, totalQuantity(batches))
  const remaining = Math.min(quantity, Math.max(0, Math.trunc(entry.remaining)))
  const anchor = anchorBatch({ ...entry, batches, quantity, remaining })
  return {
    ...entry,
    batches,
    quantity,
    remaining,
    // batchesOf 保证至少一批，所以 anchor 不会为 null
    expiryDate: anchor ? anchor.expiryDate : entry.expiryDate,
    productionDate: anchor ? anchor.productionDate : entry.productionDate,
  }
}

function anchorBatch(
  entry: Pick<Entry, 'batches' | 'productionDate' | 'expiryDate' | 'quantity' | 'remaining'>,
): Batch | null {
  const stocks = batchStocks(entry)
  const withStock = stocks.find((stock) => stock.stock > 0)
  if (withStock) return withStock.batch
  return stocks[0]?.batch ?? earliestBatch(batchesOf(entry))
}

/** 按「生产日期 + 共用保质期」重算某一批的到期日；算不出来时返回 null */
export function batchExpiry(
  productionDate: string | null,
  shelfLifeValue: number | null,
  shelfLifeUnit: ShelfLifeUnit,
): string | null {
  return computeExpiry(productionDate, shelfLifeValue, shelfLifeUnit)
}

/**
 * 给整箱加几包：加到最后到期的那一批上（先买的先吃，新加的算在最后）。
 * 存量记录没有批次时，先合成一批再加。
 */
export function addPacks<T extends Entry>(entry: T, amount = 1): T {
  const batches = batchesOf(entry).map((batch) => ({ ...batch }))
  const target = sortBatchesByExpiry(batches).at(-1)
  if (target) {
    const found = batches.find((batch) => batch.id === target.id)
    if (found) found.quantity += Math.max(1, Math.trunc(amount))
  }
  return syncEntry({ ...entry, batches, remaining: entry.remaining + Math.max(1, Math.trunc(amount)) })
}
