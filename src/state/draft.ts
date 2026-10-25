import { computeExpiry } from '../domain/expiry'
import { CATEGORIES, categoryMeta, normalizeName } from '../domain/catalog'
import type { CategoryKey, Entry, ShelfLifeUnit } from '../domain/types'

/** 新建记录的表单草稿（全部是字符串，便于受控输入） */
export interface Draft {
  name: string
  brand: string
  category: CategoryKey
  emoji: string
  imageFile: string | null
  barcode: string
  quantity: string
  remaining: string
  unitPrice: string
  purchasedAt: string
  productionDate: string
  shelfLifeValue: string
  shelfLifeUnit: ShelfLifeUnit
  expiryDate: string
  note: string
}

export function emptyDraft(today: string): Draft {
  return {
    name: '',
    brand: '',
    category: 'other',
    emoji: '🍿',
    imageFile: null,
    barcode: '',
    quantity: '1',
    remaining: '1',
    unitPrice: '',
    purchasedAt: today,
    productionDate: '',
    shelfLifeValue: '',
    shelfLifeUnit: 'month',
    expiryDate: '',
    note: '',
  }
}

export function draftFromEntry(entry: Entry): Draft {
  return {
    name: entry.name,
    brand: entry.brand,
    category: entry.category,
    emoji: entry.emoji,
    imageFile: entry.imageFile,
    barcode: entry.barcode,
    quantity: String(entry.quantity),
    remaining: String(entry.remaining),
    unitPrice: entry.unitPrice === null ? '' : String(entry.unitPrice),
    purchasedAt: entry.purchasedAt,
    productionDate: entry.productionDate ?? '',
    shelfLifeValue: entry.shelfLifeValue === null ? '' : String(entry.shelfLifeValue),
    expiryDate: entry.expiryDate,
    shelfLifeUnit: entry.shelfLifeUnit,
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
}

/** 到期日预览：仅当「生产日期 + 保质期」都合法时给值 */
export function previewExpiry(draft: Draft): string | null {
  const value = parsePositiveInt(draft.shelfLifeValue)
  if (value === null) return null
  return computeExpiry(draft.productionDate || null, value, draft.shelfLifeUnit)
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

  if (draft.productionDate && draft.shelfLifeValue.trim() !== '') {
    if (parsePositiveInt(draft.shelfLifeValue) === null) {
      errors.shelfLifeValue = '请填整数天数/月数/年数'
    } else if (previewExpiry(draft) === null) {
      errors.productionDate = '生产日期不合法'
    }
  } else if (draft.shelfLifeValue.trim() !== '' && !draft.productionDate) {
    // 只填了保质期没填生产日期：不报错，但也不用它
  } else if (draft.productionDate && draft.shelfLifeValue.trim() === '') {
    // 只填了生产日期：同样允许，靠手填到期日
  }

  // 到期日：能自动算就用算出来的，否则必须手填
  const derived = previewExpiry(draft)
  const manual = draft.expiryDate || null
  if (!derived && !manual) {
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
  const derived = previewExpiry(draft)
  const expiryDate = derived ?? draft.expiryDate
  const shelfLifeValue = parsePositiveInt(draft.shelfLifeValue)

  return {
    entry: {
      name: draft.name.trim(),
      brand: draft.brand.trim(),
      category: draft.category,
      emoji: draft.emoji || categoryMeta(draft.category).emoji,
      imageFile: draft.imageFile,
      barcode: draft.barcode.trim(),
      quantity,
      remaining,
      unitPrice: parsePrice(draft.unitPrice),
      purchasedAt: draft.purchasedAt,
      productionDate: draft.productionDate || null,
      shelfLifeValue,
      shelfLifeUnit: draft.shelfLifeUnit,
      expiryDate,
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
    productionDate: entry.productionDate ?? '',
    shelfLifeValue: entry.shelfLifeValue === null ? '' : String(entry.shelfLifeValue),
    shelfLifeUnit: entry.shelfLifeUnit,
    expiryDate: '',
    note: entry.note,
  }
}

export { CATEGORIES }
