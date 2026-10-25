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

/**
 * 一箱里的一批。大包装里的小包通常同一生产日期，但偶尔混了几包不同日期的，
 * 于是「一条记录」= 一箱，箱内可以有多批。
 *
 * 保质期由整条记录共用，所以这里只存生产日期与到期日；
 * 每批的剩余量不单独存：因为「先吃最早到期的」是固定规则，
 * 由总剩余量倒推即可（见 batches.ts 的 batchStocks）。
 */
export interface Batch {
  id: string
  /** 这一批的生产日期 YYYY-MM-DD，未知时为 null */
  productionDate: string | null
  /** 这一批的到期日 YYYY-MM-DD，由生产日期 + 共用保质期算出 */
  expiryDate: string
  /** 这一批装了几包，>= 1 */
  quantity: number
}

/** 一条记录 = 一次购买（一箱） */
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
  /**
   * 箱内的批次。至少一批，各批 quantity 之和等于下面的 quantity。
   * 只有一批时它就是「整箱同一生产日期」的普通情况。
   */
  batches: Batch[]
  /** 本次购买总包数，>= 1（由 batches 汇总而来，见 syncEntry） */
  quantity: number
  /** 剩余包数，0 <= remaining <= quantity */
  remaining: number
  /** 单价（元/包），未知时为 null */
  unitPrice: number | null
  /** 购买日期 YYYY-MM-DD */
  purchasedAt: string
  /**
   * 最早那批的生产日期（缓存值，真值在 batches 里）。
   * 保留这两个字段是为了让统计、排序、旧数据与测试都还能按单值读。
   */
  productionDate: string | null
  shelfLifeValue: number | null
  shelfLifeUnit: ShelfLifeUnit
  /** 最早那批的到期日（缓存值，真值在 batches 里）。整箱按最早到期的那批算状态 */
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
