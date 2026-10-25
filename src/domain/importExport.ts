import { formatISODate, isValidDateParts, parseISODate } from './date'
import { isCategoryKey, isShelfLifeUnit } from './catalog'
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from './types'
import type { AppData, CategoryKey, Entry, ExpirySource, Settings, ShelfLifeUnit } from './types'

/**
 * 数据规范化与导入/导出。
 *
 * 原则：宁可丢弃一条坏记录，也不要让整个文件读不出来；
 * 但**结构性**错误（不是对象、没有 entries 数组）必须抛错，交给上层决定是否走备份。
 */

export class DataFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DataFormatError'
  }
}

const MAX_QUANTITY = 9999
const MAX_STRING = 200

function asString(value: unknown, maxLength = MAX_STRING): string {
  if (typeof value !== 'string') return ''
  // 去掉控制字符，避免把奇怪不可见字符写进界面
  return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength)
}

function pickIsoDate(value: unknown): string | null {
  const raw = asString(value, 10)
  return parseISODate(raw) ? raw : null
}

function toInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return Math.trunc(n)
  }
  return null
}

/** 保留小数的数值解析，用于金额 */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function pickCategory(value: unknown): CategoryKey {
  return isCategoryKey(value) ? value : 'other'
}

function pickUnit(value: unknown): ShelfLifeUnit {
  return isShelfLifeUnit(value) ? value : 'month'
}

function pickSource(value: unknown): ExpirySource {
  return value === 'manual' ? 'manual' : 'shelfLife'
}

/**
 * 把任意一条记录规范化为合法 Entry；无法修复的关键字段（id/名称/到期日）
 * 导致返回 null，由调用方丢弃该条。
 */
export function normalizeEntry(raw: unknown, index: number): Entry | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>

  const expiryDate = pickIsoDate(obj.expiryDate)
  if (!expiryDate) return null

  const id = asString(obj.id, 64) || `imp-${index}-${expiryDate}`
  const name = asString(obj.name, 80).trim()

  const quantityRaw = toInt(obj.quantity)
  const quantity = clampInt(quantityRaw === null ? 1 : quantityRaw, 1, MAX_QUANTITY)
  const remainingRaw = toInt(obj.remaining)
  const remaining = clampInt(remainingRaw === null ? quantity : remainingRaw, 0, quantity)

  const unitPriceRaw = obj.unitPrice
  const unitPriceNum = unitPriceRaw === null || unitPriceRaw === '' ? null : toNumber(unitPriceRaw)
  const unitPrice =
    unitPriceNum === null || unitPriceNum < 0
      ? null
      : Math.min(1_000_000, Math.round(unitPriceNum * 100) / 100)

  const purchasedAt = pickIsoDate(obj.purchasedAt) ?? expiryDate
  const createdAt = asString(obj.createdAt, 40) || new Date().toISOString()
  const updatedAt = asString(obj.updatedAt, 40) || createdAt

  return {
    id,
    name: name || '未命名零食',
    brand: asString(obj.brand, 60).trim(),
    category: pickCategory(obj.category),
    emoji: asString(obj.emoji, 8) || '🍿',
    imageFile: normalizeImageFile(obj.imageFile),
    barcode: asString(obj.barcode, 64).replace(/[^0-9A-Za-z-]/g, ''),
    quantity,
    remaining,
    unitPrice,
    purchasedAt,
    productionDate: pickIsoDate(obj.productionDate),
    shelfLifeValue: normalizeShelfLifeValue(obj.shelfLifeValue),
    shelfLifeUnit: pickUnit(obj.shelfLifeUnit),
    expiryDate,
    expirySource: pickSource(obj.expirySource),
    note: asString(obj.note, 500),
    createdAt,
    updatedAt,
  }
}

function normalizeShelfLifeValue(value: unknown): number | null {
  const n = toInt(value)
  if (n === null || n < 0) return null
  return Math.min(100_000, n)
}

/** 只接受纯文件名，禁止路径穿越 */
export function normalizeImageFile(value: unknown): string | null {
  const name = asString(value, 128)
  if (!name) return null
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return null
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null
  return name
}

export function normalizeSettings(raw: unknown): Settings {
  const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const warnDaysRaw = toInt(obj.warnDays)
  // 负数视为损坏（回落到默认），超大值夹取到一年；0 是合法设置
  const warnDays =
    warnDaysRaw === null || warnDaysRaw < 0
      ? DEFAULT_SETTINGS.warnDays
      : Math.min(365, warnDaysRaw)
  const theme = obj.theme === 'light' || obj.theme === 'dark' || obj.theme === 'auto' ? obj.theme : 'auto'
  const sort =
    obj.sort === 'expiry' || obj.sort === 'purchasedAt' || obj.sort === 'name' ? obj.sort : 'expiry'
  const statsRange =
    obj.statsRange === '7d' || obj.statsRange === '30d' || obj.statsRange === 'month' || obj.statsRange === 'all'
      ? obj.statsRange
      : '30d'
  const filter =
    obj.filter === 'all' ||
    obj.filter === 'instock' ||
    obj.filter === 'expiring' ||
    obj.filter === 'expired' ||
    obj.filter === 'finished'
      ? obj.filter
      : 'all'
  return { warnDays, theme, sort, statsRange, filter }
}

/**
 * 解析磁盘上的 JSON 文本。结构性错误抛 DataFormatError，
 * 单条记录损坏则跳过并计入 dropped。
 */
export function parseAppData(text: string): { data: AppData; dropped: number } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new DataFormatError('文件内容不是合法的 JSON')
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new DataFormatError('文件根节点不是对象')
  }
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.entries)) {
    throw new DataFormatError('缺少 entries 数组')
  }

  const seen = new Set<string>()
  const entries: Entry[] = []
  let dropped = 0
  obj.entries.forEach((item, index) => {
    const entry = normalizeEntry(item, index)
    if (!entry) {
      dropped += 1
      return
    }
    // id 冲突时重新分配，避免 React key 与更新逻辑错乱
    let id = entry.id
    let n = 1
    while (seen.has(id)) {
      id = `${entry.id}-${n++}`
    }
    seen.add(id)
    entries.push({ ...entry, id })
  })

  return {
    data: {
      schemaVersion: SCHEMA_VERSION,
      entries,
      settings: normalizeSettings(obj.settings),
    },
    dropped,
  }
}

/** 序列化为磁盘格式：带缩进便于手工查看与 diff */
export function serializeAppData(data: AppData): string {
  return `${JSON.stringify(
    {
      schemaVersion: SCHEMA_VERSION,
      entries: data.entries,
      settings: data.settings,
    },
    null,
    2,
  )}\n`
}

export interface BackupFile {
  kind: 'snack-manager-backup'
  schemaVersion: number
  exportedAt: string
  entries: Entry[]
  settings: Settings
}

/** 导出备份（比磁盘格式多一层元信息，便于识别文件来源） */
export function buildBackup(data: AppData, now: Date = new Date()): BackupFile {
  return {
    kind: 'snack-manager-backup',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    entries: data.entries,
    settings: data.settings,
  }
}

export function serializeBackup(backup: BackupFile): string {
  return `${JSON.stringify(backup, null, 2)}\n`
}

/** 解析用户选择的备份文件；兼容裸的磁盘格式 */
export function parseBackup(text: string): { data: AppData; dropped: number } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new DataFormatError('文件内容不是合法的 JSON')
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new DataFormatError('不是本软件导出的备份文件')
  }
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.entries)) {
    throw new DataFormatError('备份文件缺少 entries 数组')
  }
  const version = toInt(obj.schemaVersion)
  if (version !== null && version > SCHEMA_VERSION) {
    throw new DataFormatError(`备份来自更新的版本（v${version}），当前版本无法读取`)
  }
  return parseAppData(JSON.stringify({ entries: obj.entries, settings: obj.settings }))
}

export interface MergeResult {
  data: AppData
  added: number
  updated: number
  kept: number
}

/** 合并：id 相同者保留 updatedAt 较新的一条 */
export function mergeData(current: AppData, incoming: AppData): MergeResult {
  const byId = new Map(current.entries.map((e) => [e.id, e]))
  let added = 0
  let updated = 0
  let kept = 0
  for (const entry of incoming.entries) {
    const existing = byId.get(entry.id)
    if (!existing) {
      byId.set(entry.id, entry)
      added += 1
      continue
    }
    if (entry.updatedAt > existing.updatedAt) {
      byId.set(entry.id, entry)
      updated += 1
    } else {
      kept += 1
    }
  }
  return {
    data: { ...current, entries: [...byId.values()] },
    added,
    updated,
    kept,
  }
}

/** 备份文件名：snacks-backup-20261025-1436.json */
export function backupFileName(now: Date = new Date()): string {
  const date = formatISODate({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() })
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  return `snacks-backup-${date.replace(/-/g, '')}-${time}.json`
}

/** 仅用于测试与导入预览的合法性自检 */
export function isValidISODateString(value: string): boolean {
  const p = parseISODate(value)
  return p !== null && isValidDateParts(p.y, p.m, p.d)
}
