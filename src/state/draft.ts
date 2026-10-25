import { CATEGORIES, categoryMeta, normalizeName } from '../domain/catalog'
import { batchesOf, newBatchId } from '../domain/batches'
import { parseISODate } from '../domain/date'
import { computeExpiry } from '../domain/expiry'
import type { Batch, CategoryKey, Entry, ShelfLifeUnit } from '../domain/types'

/**
 * 表单草稿。
 *
 * 关于批次：一整箱通常只有一个生产日期，所以主字段就是「总包数 + 生产日期」。
 * 少数几包日期不同时，用 extraBatches 记「额外的、日期不同那几包」，
 * 主批包的包数 = 总包数 − 额外包数之和（见 mainQuantity）。
 * 这样常见情况（不拆分）没有任何多余输入。
 */
export interface DraftExtra {
  id: string
  /** 这几包的生产日期 */
  productionDate: string
  /** 这几包有几包 */
  quantity: string
}

export interface Draft {
  name: string
  brand: string
  category: CategoryKey
  emoji: string
  imageFile: string | null
  barcode: string
  /** 这条记录按「一整箱」记（箱里可能拆批次）；散包记录为 false */
  isBox: boolean
  /** 整箱总包数 */
  quantity: string
  remaining: string
  unitPrice: string
  purchasedAt: string
  /** 主批包的生产日期 */
  productionDate: string
  shelfLifeValue: string
  shelfLifeUnit: ShelfLifeUnit
  /** 手填到期日（整箱共用） */
  expiryDate: string
  /** 日期不同的那几包；空数组表示整箱同一生产日期 */
  extraBatches: DraftExtra[]
  note: string
}

export function emptyDraft(today: string, isBox = false): Draft {
  return {
    name: '',
    brand: '',
    category: 'other',
    emoji: '🍿',
    imageFile: null,
    barcode: '',
    isBox,
    quantity: '1',
    remaining: '1',
    unitPrice: '',
    purchasedAt: today,
    productionDate: '',
    shelfLifeValue: '',
    shelfLifeUnit: 'month',
    expiryDate: '',
    extraBatches: [],
    note: '',
  }
}

export function makeDraftExtra(productionDate = '', quantity = ''): DraftExtra {
  return { id: newBatchId(), productionDate, quantity }
}

export function draftFromEntry(entry: Entry): Draft {
  const batches = batchesOf(entry)
  // 第一批判为「主批」，其余都是日期不同的额外那几包
  const [main, ...rest] = batches
  return {
    name: entry.name,
    brand: entry.brand,
    category: entry.category,
    emoji: entry.emoji,
    imageFile: entry.imageFile,
    barcode: entry.barcode,
    isBox: entry.isBox,
    quantity: String(entry.quantity),
    remaining: String(entry.remaining),
    unitPrice: entry.unitPrice === null ? '' : String(entry.unitPrice),
    purchasedAt: entry.purchasedAt,
    productionDate: main?.productionDate ?? '',
    shelfLifeValue: entry.shelfLifeValue === null ? '' : String(entry.shelfLifeValue),
    expiryDate: entry.expiryDate,
    shelfLifeUnit: entry.shelfLifeUnit,
    extraBatches: rest.map((batch) => ({
      id: batch.id,
      productionDate: batch.productionDate ?? '',
      quantity: String(batch.quantity),
    })),
    note: entry.note,
  }
}

function parsePositiveInt(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  return Number.isSafeInteger(n) ? n : null
}

function parsePrice(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  return Number(trimmed)
}

export interface DraftErrors {
  name?: string
  quantity?: string
  remaining?: string
  unitPrice?: string
  purchasedAt?: string
  productionDate?: string
  shelfLifeValue?: string
  expiryDate?: string
  /** 额外的几包的整体错误（加起来超过总数等） */
  extra?: string
  /** 逐行错误，键是 DraftExtra.id */
  extraRows?: Record<string, string>
}

/** 额外的几包加起来是多少包 */
export function extraQuantityTotal(draft: Draft): number {
  return draft.extraBatches.reduce((sum, extra) => sum + (parsePositiveInt(extra.quantity) ?? 0), 0)
}

/** 主批包有几包 = 总包数 − 额外包数；算不出来时返回 null */
export function mainQuantity(draft: Draft): number | null {
  const total = parsePositiveInt(draft.quantity)
  if (total === null) return null
  return total - extraQuantityTotal(draft)
}

/** 是否走「生产日期 + 保质期」推算模式 */
export function hasShelfLife(draft: Draft): boolean {
  return parsePositiveInt(draft.shelfLifeValue) !== null && draft.productionDate.trim() !== ''
}

function expiryFor(productionDate: string, value: number | null, unit: ShelfLifeUnit): string | null {
  if (value === null) return null
  return computeExpiry(productionDate || null, value, unit)
}

export interface PreviewBatch {
  id: string
  /** 这一批有几包 */
  total: number
  productionDate: string
  expiryDate: string | null
}

/**
 * 展开成待写入的批次：主批在前，额外那几包按填写顺序在后。
 * 到期日：能按共用保质期推算就逐批推算；否则整箱共用那个手填的到期日。
 */
export function previewBatches(draft: Draft): PreviewBatch[] {
  const total = parsePositiveInt(draft.quantity)
  if (total === null) return []

  const value = parsePositiveInt(draft.shelfLifeValue)
  const derived = value !== null && draft.productionDate.trim() !== ''
  const manual = draft.expiryDate || null

  const rows: PreviewBatch[] = [
    {
      id: 'main',
      total: total - extraQuantityTotal(draft),
      productionDate: draft.productionDate,
      expiryDate: derived ? expiryFor(draft.productionDate, value, draft.shelfLifeUnit) : manual,
    },
  ]

  for (const extra of draft.extraBatches) {
    rows.push({
      id: extra.id,
      total: parsePositiveInt(extra.quantity) ?? 0,
      productionDate: extra.productionDate,
      expiryDate: derived ? expiryFor(extra.productionDate, value, draft.shelfLifeUnit) : manual,
    })
  }

  return rows
}

/**
 * 按「生产日期 + 保质期」推算出来的整箱到期日（最早的那一批）。
 * 没填保质期或生产日期时返回 null，此时到期日靠手填。
 */
export function shelfLifeExpiry(draft: Draft): string | null {
  const value = parsePositiveInt(draft.shelfLifeValue)
  if (value === null) return null
  if (draft.productionDate.trim() === '') return null

  let earliest: string | null = null
  for (const row of previewBatches(draft)) {
    if (row.total <= 0) continue
    const expiry = expiryFor(row.productionDate, value, draft.shelfLifeUnit)
    if (!expiry) continue
    if (!earliest || expiry < earliest) earliest = expiry
  }
  return earliest
}

/** 整箱到期日：能推算就用推算的，否则用手填的 */
export function previewExpiry(draft: Draft): string | null {
  const computed = shelfLifeExpiry(draft)
  if (computed) return computed
  return draft.expiryDate || null
}

export function validateDraft(draft: Draft): DraftErrors {
  const errors: DraftErrors = {}

  if (draft.name.trim() === '') errors.name = '给零食起个名字吧'

  const quantity = parsePositiveInt(draft.quantity)
  if (quantity === null || quantity < 1) errors.quantity = '至少 1 包'
  else if (quantity > 9999) errors.quantity = '最多 9999 包'

  const remaining = parsePositiveInt(draft.remaining)
  if (remaining === null) errors.remaining = '请填剩余包数'
  else if (quantity !== null && remaining > quantity) errors.remaining = '不能超过总包数'

  if (draft.unitPrice.trim() !== '' && parsePrice(draft.unitPrice) === null) {
    errors.unitPrice = '最多两位小数'
  }

  if (!draft.purchasedAt) errors.purchasedAt = '请选择购买日期'

  const shelfValue = parsePositiveInt(draft.shelfLifeValue)
  if (draft.shelfLifeValue.trim() !== '' && shelfValue === null) {
    errors.shelfLifeValue = '请填整数天数/月数/年数'
  }

  const derived = shelfValue !== null && draft.productionDate.trim() !== ''

  if (draft.productionDate && !parseISODate(draft.productionDate)) {
    errors.productionDate = '生产日期不合法'
  }

  // ---------- 额外那几包 ----------
  const rowErrors: Record<string, string> = {}
  for (const extra of draft.extraBatches) {
    const qty = parsePositiveInt(extra.quantity)
    if (qty === null || qty < 1) {
      rowErrors[extra.id] = '至少 1 包'
      continue
    }
    if (extra.productionDate && !parseISODate(extra.productionDate)) {
      rowErrors[extra.id] = '生产日期不合法'
      continue
    }
    // 按保质期推算时，每批都要有自己的生产日期，否则算不来到期日
    if (derived && extra.productionDate.trim() === '') {
      rowErrors[extra.id] = '填一下这几包的生产日期'
    }
  }
  if (Object.keys(rowErrors).length > 0) errors.extraRows = rowErrors

  if (draft.extraBatches.length > 0 && quantity !== null) {
    const extras = extraQuantityTotal(draft)
    if (extras >= quantity) {
      errors.extra = `额外的加起来是 ${extras} 包，要比总包数 ${quantity} 少，主批才剩得下包`
    }
  }

  // ---------- 到期日 ----------
  if (!previewExpiry(draft) && !draft.expiryDate) {
    if (!errors.shelfLifeValue && !errors.productionDate) {
      errors.expiryDate = '填写生产日期+保质期，或直接选到期日'
    }
  }

  return errors
}

export interface DraftResult {
  entry: Omit<Entry, 'id' | 'createdAt' | 'updatedAt'>
}

/** 把合法草稿转成记录（不含 id 与时间戳） */
export function draftToEntry(draft: Draft): DraftResult | null {
  const errors = validateDraft(draft)
  if (Object.keys(errors).length > 0) return null

  const quantity = parsePositiveInt(draft.quantity)!
  const remaining = parsePositiveInt(draft.remaining)!
  const shelfLifeValue = parsePositiveInt(draft.shelfLifeValue)
  const derived = shelfLifeValue !== null && draft.productionDate.trim() !== ''
  const manual = draft.expiryDate || null

  const batches: Batch[] = []
  const mainQty = quantity - extraQuantityTotal(draft)
  const mainExpiry = derived
    ? expiryFor(draft.productionDate, shelfLifeValue, draft.shelfLifeUnit)
    : manual

  if (mainQty > 0 && mainExpiry) {
    batches.push({
      id: newBatchId(),
      productionDate: draft.productionDate || null,
      expiryDate: mainExpiry,
      quantity: mainQty,
    })
  }

  for (const extra of draft.extraBatches) {
    const qty = parsePositiveInt(extra.quantity)
    if (qty === null || qty < 1) continue
    const expiry = derived ? expiryFor(extra.productionDate, shelfLifeValue, draft.shelfLifeUnit) : manual
    if (!expiry) continue
    batches.push({
      id: extra.id,
      productionDate: extra.productionDate || null,
      expiryDate: expiry,
      quantity: qty,
    })
  }

  if (batches.length === 0) return null

  const quantitySum = batches.reduce((sum, batch) => sum + batch.quantity, 0)
  const earliest = batches.reduce<Batch>(
    (best, batch) => (batch.expiryDate < best.expiryDate ? batch : best),
    batches[0]!,
  )

  return {
    entry: {
      name: draft.name.trim(),
      brand: draft.brand.trim(),
      category: draft.category,
      emoji: draft.emoji || categoryMeta(draft.category).emoji,
      imageFile: draft.imageFile,
      barcode: draft.barcode.trim(),
      isBox: draft.isBox,
      batches,
      quantity: quantitySum,
      remaining,
      unitPrice: parsePrice(draft.unitPrice),
      purchasedAt: draft.purchasedAt,
      productionDate: earliest.productionDate,
      shelfLifeValue,
      shelfLifeUnit: draft.shelfLifeUnit,
      expiryDate: earliest.expiryDate,
      expirySource: derived ? 'shelfLife' : 'manual',
      note: draft.note.trim(),
    },
  }
}

/** 名称自动补全：取同名记录里最近更新的一条 */
export interface Suggestion {
  entry: Entry
  /** 匹配到的名称（保留原始大小写） */
  displayName: string
}

export function suggestByName(entries: Entry[], query: string, limit = 6): Suggestion[] {
  const q = normalizeName(query)
  if (q === '') return []
  const best = new Map<string, Entry>()
  for (const entry of entries) {
    const key = normalizeName(entry.name)
    if (!key.includes(q)) continue
    const current = best.get(key)
    if (!current || entry.updatedAt > current.updatedAt) best.set(key, entry)
  }
  return [...best.values()]
    .sort((a, b) => {
      // 前缀命中优先，其次按更新时间
      const aPrefix = normalizeName(a.name).startsWith(q) ? 0 : 1
      const bPrefix = normalizeName(b.name).startsWith(q) ? 0 : 1
      if (aPrefix !== bPrefix) return aPrefix - bPrefix
      return b.updatedAt.localeCompare(a.updatedAt)
    })
    .slice(0, limit)
    .map((entry) => ({ entry, displayName: entry.name }))
}

/** 用历史记录预填一份草稿（保留数量与购买日期为本次输入） */
export function draftFromSuggestion(base: Draft, entry: Entry): Draft {
  return {
    ...base,
    name: entry.name,
    brand: entry.brand,
    category: entry.category,
    emoji: entry.emoji,
    imageFile: entry.imageFile,
    barcode: entry.barcode,
    unitPrice: entry.unitPrice === null ? '' : String(entry.unitPrice),
    productionDate: batchesOf(entry)[0]?.productionDate ?? entry.productionDate ?? '',
    shelfLifeValue: entry.shelfLifeValue === null ? '' : String(entry.shelfLifeValue),
    shelfLifeUnit: entry.shelfLifeUnit,
    expiryDate: '',
    // 数量与批次按本次实际购买填，不继承上次
    extraBatches: [],
    note: entry.note,
  }
}

export { CATEGORIES }
