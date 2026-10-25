import { describe, expect, it } from 'vitest'
import {
  DataFormatError,
  backupFileName,
  buildBackup,
  mergeData,
  normalizeEntry,
  normalizeImageFile,
  normalizeSettings,
  parseAppData,
  parseBackup,
  serializeAppData,
  serializeBackup,
} from './importExport'
import { DEFAULT_SETTINGS, emptyData } from './types'
import type { AppData, Entry } from './types'

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'e1',
    name: '薯片',
    brand: '',
    category: 'chips',
    emoji: '🥔',
    imageFile: null,
    barcode: '',
    batches: [{ id: 'b1', productionDate: null, expiryDate: '2027-01-01', quantity: 2 }],
    quantity: 2,
    remaining: 2,
    unitPrice: 8.5,
    purchasedAt: '2026-10-01',
    productionDate: null,
    shelfLifeValue: null,
    shelfLifeUnit: 'month',
    expiryDate: '2027-01-01',
    expirySource: 'manual',
    note: '',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('parseAppData 结构校验', () => {
  it('坏 JSON 抛 DataFormatError', () => {
    expect(() => parseAppData('{not json')).toThrow(DataFormatError)
    expect(() => parseAppData('')).toThrow(DataFormatError)
  })

  it('根节点不是对象抛错', () => {
    expect(() => parseAppData('[]')).toThrow(DataFormatError)
    expect(() => parseAppData('"hi"')).toThrow(DataFormatError)
    expect(() => parseAppData('null')).toThrow(DataFormatError)
  })

  it('缺少 entries 数组抛错', () => {
    expect(() => parseAppData('{"schemaVersion":1}')).toThrow(DataFormatError)
  })

  it('单条损坏只丢弃该条并计数', () => {
    const text = JSON.stringify({
      entries: [
        makeEntry({ id: 'good' }),
        { name: '没有到期日' },
        'not-an-object',
        makeEntry({ id: 'good2', expiryDate: 'bad' }),
      ],
    })
    const { data, dropped } = parseAppData(text)
    expect(data.entries).toHaveLength(1)
    expect(data.entries[0]!.id).toBe('good')
    expect(dropped).toBe(3)
  })

  it('空 entries 可正常解析', () => {
    const { data, dropped } = parseAppData('{"entries":[]}')
    expect(data.entries).toEqual([])
    expect(dropped).toBe(0)
    expect(data.schemaVersion).toBe(1)
  })

  it('重复 id 自动去重', () => {
    const text = JSON.stringify({
      entries: [makeEntry({ id: 'dup' }), makeEntry({ id: 'dup' }), makeEntry({ id: 'dup' })],
    })
    const ids = parseAppData(text).data.entries.map((e) => e.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids[0]).toBe('dup')
  })
})

describe('normalizeEntry 字段修复', () => {
  it('remaining 夹取到 [0, quantity]', () => {
    expect(normalizeEntry({ expiryDate: '2027-01-01', quantity: 3, remaining: 10 }, 0)!.remaining).toBe(3)
    expect(normalizeEntry({ expiryDate: '2027-01-01', quantity: 3, remaining: -5 }, 0)!.remaining).toBe(0)
    expect(normalizeEntry({ expiryDate: '2027-01-01', quantity: 3 }, 0)!.remaining).toBe(3)
  })

  it('quantity 至少为 1', () => {
    expect(normalizeEntry({ expiryDate: '2027-01-01', quantity: 0 }, 0)!.quantity).toBe(1)
    expect(normalizeEntry({ expiryDate: '2027-01-01', quantity: -3 }, 0)!.quantity).toBe(1)
  })

  it('未知分类落到 other，未知单位落到 month', () => {
    const entry = normalizeEntry({ expiryDate: '2027-01-01', category: 'space-food', shelfLifeUnit: 'week' }, 0)!
    expect(entry.category).toBe('other')
    expect(entry.shelfLifeUnit).toBe('month')
  })

  it('缺失名称给默认值', () => {
    expect(normalizeEntry({ expiryDate: '2027-01-01', name: '   ' }, 0)!.name).toBe('未命名零食')
  })

  it('缺失到期日返回 null', () => {
    expect(normalizeEntry({ name: 'x' }, 0)).toBeNull()
    expect(normalizeEntry({ name: 'x', expiryDate: '2026-02-30' }, 0)).toBeNull()
  })

  it('单价四舍五入到两位，非法值变 null', () => {
    expect(normalizeEntry({ expiryDate: '2027-01-01', unitPrice: 8.567 }, 0)!.unitPrice).toBe(8.57)
    expect(normalizeEntry({ expiryDate: '2027-01-01', unitPrice: 'abc' }, 0)!.unitPrice).toBeNull()
    expect(normalizeEntry({ expiryDate: '2027-01-01', unitPrice: null }, 0)!.unitPrice).toBeNull()
  })

  it('条码只保留字母数字与连字符', () => {
    expect(normalizeEntry({ expiryDate: '2027-01-01', barcode: '69 01<23>45' }, 0)!.barcode).toBe('69012345')
  })
})

describe('normalizeImageFile 防路径穿越', () => {
  it('接受纯文件名', () => {
    expect(normalizeImageFile('abc-123.png')).toBe('abc-123.png')
  })

  it('拒绝路径与非法字符', () => {
    expect(normalizeImageFile('../../etc/passwd')).toBeNull()
    expect(normalizeImageFile('sub/dir.png')).toBeNull()
    expect(normalizeImageFile('sub\\dir.png')).toBeNull()
    expect(normalizeImageFile('a b.png')).toBeNull()
    expect(normalizeImageFile('')).toBeNull()
    expect(normalizeImageFile(null)).toBeNull()
  })
})

describe('normalizeSettings', () => {
  it('非法值回落到默认', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(
      normalizeSettings({ warnDays: -3, theme: 'neon', sort: 'size', statsRange: '5y', filter: 'x' }),
    ).toEqual(DEFAULT_SETTINGS)
  })

  it('warnDays = 0 是合法设置（只有当天到期才算临期）', () => {
    expect(normalizeSettings({ warnDays: 0 }).warnDays).toBe(0)
  })

  it('合法值被保留，warnDays 夹取到 0-365', () => {
    const s = normalizeSettings({ warnDays: 999, theme: 'dark', sort: 'name', statsRange: 'all', filter: 'expired' })
    expect(s).toEqual({ warnDays: 365, theme: 'dark', sort: 'name', statsRange: 'all', filter: 'expired' })
  })
})

describe('serialize / parse 往返', () => {
  it('序列化后可原样解析回来', () => {
    const data: AppData = {
      schemaVersion: 1,
      entries: [makeEntry(), makeEntry({ id: 'e2', name: '巧克力' })],
      settings: { ...DEFAULT_SETTINGS, theme: 'dark', warnDays: 3 },
    }
    const round = parseAppData(serializeAppData(data)).data
    expect(round.entries).toEqual(data.entries)
    expect(round.settings).toEqual(data.settings)
  })
})

describe('批次兼容', () => {
  it('没有 batches 字段的老数据被合成一批', () => {
    const legacy = {
      id: 'old-1',
      name: '老数据薯片',
      quantity: 4,
      remaining: 1,
      productionDate: '2026-08-01',
      expiryDate: '2027-02-01',
    }
    const entry = normalizeEntry(legacy, 0)
    expect(entry).not.toBeNull()
    expect(entry!.batches).toHaveLength(1)
    expect(entry!.batches[0]).toMatchObject({
      productionDate: '2026-08-01',
      expiryDate: '2027-02-01',
      quantity: 4,
    })
    expect(entry!.quantity).toBe(4)
    expect(entry!.remaining).toBe(1)
  })

  it('多个批次被原样读入并保留各自日期', () => {
    const entry = normalizeEntry(
      {
        ...makeEntry(),
        batches: [
          { id: 'x1', productionDate: '2026-07-01', expiryDate: '2026-12-01', quantity: 3 },
          { id: 'x2', productionDate: '2026-08-01', expiryDate: '2027-01-01', quantity: 2 },
        ],
        quantity: 5,
        remaining: 5,
      },
      0,
    )
    expect(entry!.batches.map((b) => b.expiryDate)).toEqual(['2026-12-01', '2027-01-01'])
    expect(entry!.quantity).toBe(5)
    // 整箱到期日取最早那批
    expect(entry!.expiryDate).toBe('2026-12-01')
  })

  it('坏掉的批次元素被丢弃，一个不剩就退化成单批', () => {
    const entry = normalizeEntry(
      { ...makeEntry(), batches: [{ id: 'x', expiryDate: 'not-a-date', quantity: 2 }] },
      0,
    )
    expect(entry!.batches).toHaveLength(1)
    expect(entry!.batches[0]?.expiryDate).toBe('2027-01-01')
  })

  it('批次 id 重复时自动改成唯一 id', () => {
    const entry = normalizeEntry(
      {
        ...makeEntry(),
        batches: [
          { id: 'same', productionDate: null, expiryDate: '2026-12-01', quantity: 1 },
          { id: 'same', productionDate: null, expiryDate: '2027-01-01', quantity: 1 },
        ],
      },
      0,
    )
    const ids = entry!.batches.map((b) => b.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('批次包数之和决定总包数', () => {
    const entry = normalizeEntry(
      {
        ...makeEntry(),
        batches: [
          { id: 'a', productionDate: null, expiryDate: '2026-12-01', quantity: 3 },
          { id: 'b', productionDate: null, expiryDate: '2027-01-01', quantity: 4 },
        ],
        quantity: 99,
      },
      0,
    )
    expect(entry!.quantity).toBe(7)
  })
})

describe('备份格式', () => {
  it('导出再导入保持一致', () => {
    const data: AppData = { schemaVersion: 1, entries: [makeEntry()], settings: { ...DEFAULT_SETTINGS } }
    const text = serializeBackup(buildBackup(data))
    const parsed = parseBackup(text)
    expect(parsed.data.entries).toEqual(data.entries)
    expect(parsed.dropped).toBe(0)
  })

  it('兼容裸的磁盘格式', () => {
    const text = serializeAppData({ schemaVersion: 1, entries: [makeEntry()], settings: { ...DEFAULT_SETTINGS } })
    expect(parseBackup(text).data.entries).toHaveLength(1)
  })

  it('来自更新版本的文件被拒绝', () => {
    const text = JSON.stringify({ kind: 'snack-manager-backup', schemaVersion: 99, entries: [] })
    expect(() => parseBackup(text)).toThrow(/更新的版本/)
  })

  it('非 JSON 被拒绝', () => {
    expect(() => parseBackup('hello')).toThrow(DataFormatError)
    expect(() => parseBackup('[]')).toThrow(DataFormatError)
  })

  it('备份文件名带日期时间', () => {
    const name = backupFileName(new Date(2026, 9, 25, 14, 36))
    expect(name).toBe('snacks-backup-20261025-1436.json')
  })
})

describe('mergeData', () => {
  it('新记录被加入，旧记录按 updatedAt 取胜者', () => {
    const current: AppData = {
      ...emptyData(),
      entries: [
        makeEntry({ id: 'a', name: '旧', updatedAt: '2026-01-01T00:00:00.000Z' }),
        makeEntry({ id: 'b', name: '保留', updatedAt: '2026-05-01T00:00:00.000Z' }),
      ],
    }
    const incoming: AppData = {
      ...emptyData(),
      entries: [
        makeEntry({ id: 'a', name: '新', updatedAt: '2026-06-01T00:00:00.000Z' }),
        makeEntry({ id: 'b', name: '较旧', updatedAt: '2026-04-01T00:00:00.000Z' }),
        makeEntry({ id: 'c', name: '新增', updatedAt: '2026-06-01T00:00:00.000Z' }),
      ],
    }
    const result = mergeData(current, incoming)
    expect(result.added).toBe(1)
    expect(result.updated).toBe(1)
    expect(result.kept).toBe(1)
    expect(result.data.entries).toHaveLength(3)
    expect(result.data.entries.find((e) => e.id === 'a')!.name).toBe('新')
    expect(result.data.entries.find((e) => e.id === 'b')!.name).toBe('保留')
  })

  it('合并不会改变当前设置', () => {
    const current: AppData = { ...emptyData(), settings: { ...DEFAULT_SETTINGS, warnDays: 14 } }
    const incoming: AppData = { ...emptyData(), settings: { ...DEFAULT_SETTINGS, warnDays: 1 } }
    expect(mergeData(current, incoming).data.settings.warnDays).toBe(14)
  })
})
