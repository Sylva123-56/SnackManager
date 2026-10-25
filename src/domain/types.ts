/** 保质期单位：天 / 月 / 年 */
export type ShelfLifeUnit = 'day' | 'month' | 'year'

/** 内置分类（固定集合，不做自定义分类管理） */
export type CategoryKey =
  | 'chips'
  | 'biscuit'
  | 'candy'
  | 'chocolate'
  | 'nuts'
  | 'drink'
  | 'jelly'
  | 'other'

/** 到期日来源：由「生产日期 + 保质期」推算，或用户直接指定 */
export type ExpirySource = 'shelfLife' | 'manual'

export type StatsRange = '7d' | '30d' | 'month' | 'all'

export type ListFilter = 'all' | 'instock' | 'expiring' | 'expired' | 'finished'

export type SortKey = 'expiry' | 'purchasedAt' | 'name'

export type ThemeMode = 'auto' | 'light' | 'dark'

/** 一条记录 = 一次购买批次 */
export interface Entry {
  id: string
  name: string
  brand: string
  category: CategoryKey
  /** emoji 图标，如 🍪；与 imageFile 同时存在时优先显示图片 */
  emoji: string
  /** images/ 目录下的文件名 */
  imageFile: string | null
  barcode: string
  /** 本次购买总包数，>= 1 */
  quantity: number
  /** 剩余包数，0 <= remaining <= quantity */
  remaining: number
  /** 单价（元/包），未知时为 null */
  unitPrice: number | null
  /** 购买日期 YYYY-MM-DD */
  purchasedAt: string
  /** 生产日期 YYYY-MM-DD，未知时为 null */
  productionDate: string | null
  shelfLifeValue: number | null
  shelfLifeUnit: ShelfLifeUnit
  /** 到期日 YYYY-MM-DD，始终有值 */
  expiryDate: string
  expirySource: ExpirySource
  note: string
  createdAt: string
  updatedAt: string
}

export interface Settings {
  /** 临期阈值（天），默认 7 */
  warnDays: number
  theme: ThemeMode
  sort: SortKey
  statsRange: StatsRange
  filter: ListFilter
}

export interface AppData {
  schemaVersion: number
  entries: Entry[]
  settings: Settings
}

/** 过期状态：过期 / 临期 / 正常 / 已吃完 */
export type ExpiryStatus = 'expired' | 'expiring' | 'ok' | 'finished'

export const SCHEMA_VERSION = 1

export const DEFAULT_SETTINGS: Settings = {
  warnDays: 7,
  theme: 'auto',
  sort: 'expiry',
  statsRange: '30d',
  filter: 'all',
}

export function emptyData(): AppData {
  return { schemaVersion: SCHEMA_VERSION, entries: [], settings: { ...DEFAULT_SETTINGS } }
}
