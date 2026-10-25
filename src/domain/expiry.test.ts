import { describe, expect, it } from 'vitest'
import {
  alertCounts,
  computeExpiry,
  countByStatus,
  daysUntilExpiry,
  expiryHint,
  isActiveStatus,
  statusOf,
  totalRemaining,
} from './expiry'
import type { Entry } from './types'

const TODAY = '2026-10-25'

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'e1',
    name: '薯片',
    brand: '',
    category: 'chips',
    emoji: '🥔',
    imageFile: null,
    barcode: '',
    batches: [{ id: 'b1', productionDate: '2026-09-01', expiryDate: '2027-03-01', quantity: 2 }],
    quantity: 2,
    remaining: 2,
    unitPrice: 8.5,
    purchasedAt: '2026-10-01',
    productionDate: '2026-09-01',
    shelfLifeValue: 6,
    shelfLifeUnit: 'month',
    expiryDate: '2027-03-01',
    expirySource: 'shelfLife',
    note: '',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('computeExpiry', () => {
  it('按天计算直接相加', () => {
    expect(computeExpiry('2026-10-01', 30, 'day')).toBe('2026-10-31')
    expect(computeExpiry('2026-10-01', 1, 'day')).toBe('2026-10-02')
  })

  it('按月计算做月末夹取', () => {
    expect(computeExpiry('2026-01-31', 1, 'month')).toBe('2026-02-28')
    expect(computeExpiry('2024-01-31', 1, 'month')).toBe('2024-02-29')
    expect(computeExpiry('2026-08-31', 1, 'month')).toBe('2026-09-30')
  })

  it('跨年按月计算', () => {
    expect(computeExpiry('2026-11-15', 3, 'month')).toBe('2027-02-15')
    expect(computeExpiry('2026-12-31', 12, 'month')).toBe('2027-12-31')
  })

  it('按年计算，2/29 夹取到 2/28', () => {
    expect(computeExpiry('2024-02-29', 1, 'year')).toBe('2025-02-28')
    expect(computeExpiry('2026-05-20', 2, 'year')).toBe('2028-05-20')
  })

  it('保质期为 0 时到期日等于生产日期', () => {
    expect(computeExpiry('2026-10-01', 0, 'day')).toBe('2026-10-01')
    expect(computeExpiry('2026-10-01', 0, 'month')).toBe('2026-10-01')
  })

  it('输入缺失或非法时返回 null', () => {
    expect(computeExpiry(null, 6, 'month')).toBeNull()
    expect(computeExpiry('2026-10-01', null, 'month')).toBeNull()
    expect(computeExpiry('2026-02-30', 1, 'month')).toBeNull()
    expect(computeExpiry('2026-10-01', -1, 'day')).toBeNull()
    expect(computeExpiry('2026-10-01', 1.5, 'day')).toBeNull()
  })
})

describe('statusOf 四态边界', () => {
  const warn = 7

  it('剩余为 0 一律算吃完，即使已经过期', () => {
    const entry = makeEntry({ remaining: 0, expiryDate: '2026-01-01' })
    expect(statusOf(entry, TODAY, warn)).toBe('finished')
  })

  it('到期日早于今天 = 过期', () => {
    expect(statusOf(makeEntry({ expiryDate: '2026-10-24' }), TODAY, warn)).toBe('expired')
    expect(statusOf(makeEntry({ expiryDate: '2025-12-31' }), TODAY, warn)).toBe('expired')
  })

  it('到期日等于今天 = 临期，不算过期', () => {
    expect(statusOf(makeEntry({ expiryDate: '2026-10-25' }), TODAY, warn)).toBe('expiring')
  })

  it('剩余天数恰好等于阈值 = 临期', () => {
    expect(statusOf(makeEntry({ expiryDate: '2026-11-01' }), TODAY, warn)).toBe('expiring')
  })

  it('剩余天数超过阈值 = 正常', () => {
    expect(statusOf(makeEntry({ expiryDate: '2026-11-02' }), TODAY, warn)).toBe('ok')
  })

  it('阈值可配置：warnDays=0 时只有到期当天算临期', () => {
    expect(statusOf(makeEntry({ expiryDate: '2026-10-25' }), TODAY, 0)).toBe('expiring')
    expect(statusOf(makeEntry({ expiryDate: '2026-10-26' }), TODAY, 0)).toBe('ok')
  })

  it('跨月跨年边界', () => {
    expect(statusOf(makeEntry({ expiryDate: '2027-01-01' }), '2026-12-30', 7)).toBe('expiring')
    expect(statusOf(makeEntry({ expiryDate: '2026-01-01' }), '2026-12-30', 7)).toBe('expired')
    expect(statusOf(makeEntry({ expiryDate: '2026-12-31' }), '2026-12-31', 7)).toBe('expiring')
    expect(statusOf(makeEntry({ expiryDate: '2027-01-05' }), '2026-12-31', 7)).toBe('expiring')
    expect(statusOf(makeEntry({ expiryDate: '2027-01-08' }), '2026-12-31', 7)).toBe('ok')
  })

  it('闰年 2 月末边界', () => {
    expect(statusOf(makeEntry({ expiryDate: '2024-02-29' }), '2024-02-22', 7)).toBe('expiring')
    expect(statusOf(makeEntry({ expiryDate: '2024-02-29' }), '2024-02-21', 7)).toBe('ok')
    expect(statusOf(makeEntry({ expiryDate: '2024-02-29' }), '2024-03-01', 7)).toBe('expired')
  })

  it('日期非法时不误判为过期', () => {
    expect(statusOf(makeEntry({ expiryDate: 'bad-date' }), TODAY, warn)).toBe('ok')
  })
})

describe('daysUntilExpiry', () => {
  it('正负与零', () => {
    expect(daysUntilExpiry(makeEntry({ expiryDate: '2026-10-28' }), TODAY)).toBe(3)
    expect(daysUntilExpiry(makeEntry({ expiryDate: '2026-10-25' }), TODAY)).toBe(0)
    expect(daysUntilExpiry(makeEntry({ expiryDate: '2026-10-20' }), TODAY)).toBe(-5)
  })
})

describe('expiryHint', () => {
  it('临期与过期的文案', () => {
    expect(expiryHint(makeEntry({ expiryDate: '2026-10-25' }), TODAY)).toBe('今天到期')
    expect(expiryHint(makeEntry({ expiryDate: '2026-10-26' }), TODAY)).toBe('明天到期')
    expect(expiryHint(makeEntry({ expiryDate: '2026-10-28' }), TODAY)).toBe('3 天后到期')
    expect(expiryHint(makeEntry({ expiryDate: '2026-10-20' }), TODAY)).toBe('已过期 5 天')
  })
})

describe('countByStatus / alertCounts / totalRemaining', () => {
  const entries = [
    makeEntry({ id: 'a', remaining: 2, expiryDate: '2026-10-20' }), // expired
    makeEntry({ id: 'b', remaining: 1, expiryDate: '2026-10-27' }), // expiring
    makeEntry({ id: 'c', remaining: 3, expiryDate: '2027-01-01' }), // ok
    makeEntry({ id: 'd', remaining: 0, expiryDate: '2026-01-01' }), // finished
  ]

  it('四态分别计数', () => {
    expect(countByStatus(entries, TODAY, 7)).toEqual({ expired: 1, expiring: 1, ok: 1, finished: 1 })
  })

  it('警示只统计还有库存的条目', () => {
    expect(alertCounts(entries, TODAY, 7)).toEqual({ expired: 1, expiring: 1 })
    const allFinished = entries.map((e) => ({ ...e, remaining: 0 }))
    expect(alertCounts(allFinished, TODAY, 7)).toEqual({ expired: 0, expiring: 0 })
  })

  it('在库件数为各条剩余之和', () => {
    expect(totalRemaining(entries)).toBe(6)
    expect(totalRemaining([])).toBe(0)
  })

  it('isActiveStatus 只认过期与临期', () => {
    expect(isActiveStatus('expired')).toBe(true)
    expect(isActiveStatus('expiring')).toBe(true)
    expect(isActiveStatus('ok')).toBe(false)
    expect(isActiveStatus('finished')).toBe(false)
  })
})
