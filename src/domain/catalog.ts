import type { CategoryKey, ShelfLifeUnit } from './types'

export interface CategoryMeta {
  key: CategoryKey
  label: string
  emoji: string
}

/** 内置分类，顺序即界面展示顺序 */
export const CATEGORIES: CategoryMeta[] = [
  { key: 'chips', label: '薯片', emoji: '🥔' },
  { key: 'biscuit', label: '饼干', emoji: '🍪' },
  { key: 'candy', label: '糖果', emoji: '🍬' },
  { key: 'chocolate', label: '巧克力', emoji: '🍫' },
  { key: 'nuts', label: '坚果', emoji: '🥜' },
  { key: 'drink', label: '饮料', emoji: '🥤' },
  { key: 'jelly', label: '果冻', emoji: '🍮' },
  { key: 'other', label: '其他', emoji: '🍿' },
]

const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]))

export function isCategoryKey(value: unknown): value is CategoryKey {
  return typeof value === 'string' && CATEGORY_BY_KEY.has(value as CategoryKey)
}

export function categoryMeta(key: CategoryKey): CategoryMeta {
  return CATEGORY_BY_KEY.get(key) ?? CATEGORY_BY_KEY.get('other')!
}

export function categoryLabel(key: CategoryKey): string {
  return categoryMeta(key).label
}

export const SHELF_LIFE_UNITS: { key: ShelfLifeUnit; label: string; short: string }[] = [
  { key: 'day', label: '天', short: '天' },
  { key: 'month', label: '个月', short: '月' },
  { key: 'year', label: '年', short: '年' },
]

export function isShelfLifeUnit(value: unknown): value is ShelfLifeUnit {
  return value === 'day' || value === 'month' || value === 'year'
}

/** 保质期的人类可读形式：12 个月 */
export function formatShelfLife(value: number | null, unit: ShelfLifeUnit): string {
  if (value === null || !Number.isFinite(value)) return '未记录'
  const label = SHELF_LIFE_UNITS.find((u) => u.key === unit)?.label ?? '天'
  return `${value} ${label}`
}

/** 名称归一化：用于「记住上次」的模糊匹配与去重 */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}
