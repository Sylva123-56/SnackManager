import { describe, expect, it } from 'vitest'
import { formatMoney, inRange, rangeStart, rangeStats, roundMoney, spendByCategory } from './stats'
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
    isBox: false,
    batches: [{ id: 'b1', productionDate: '2026-09-01', expiryDate: '2027-03-01', quantity: 2 }],
    quantity: 2,
    remaining: 2,
    unitPrice: 8.5,
    purchasedAt: TODAY,
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

describe('rangeStart', () => {
  it('近 7 天包含今天在内的 7 个日历日', () => {
    expect(rangeStart('7d', TODAY)).toBe('2026-10-19')
  })

  it('近 30 天包含今天在内的 30 个日历日', () => {
    expect(rangeStart('30d', TODAY)).toBe('2026-09-26')
  })

  it('本月从 1 号开始', () => {
    expect(rangeStart('month', TODAY)).toBe('2026-10-01')
  })

  it('全部返回 null', () => {
    expect(rangeStart('all', TODAY)).toBeNull()
  })

  it('跨月回溯不跳日', () => {
    expect(rangeStart('7d', '2026-03-03')).toBe('2026-02-25')
    expect(rangeStart('30d', '2026-01-10')).toBe('2025-12-12')
    expect(rangeStart('30d', '2024-03-10')).toBe('2024-02-10')
  })
})

describe('inRange', () => {
  it('区间为闭区间 [start, today]', () => {
    expect(inRange(makeEntry({ purchasedAt: '2026-10-19' }), '7d', TODAY)).toBe(true)
    expect(inRange(makeEntry({ purchasedAt: '2026-10-18' }), '7d', TODAY)).toBe(false)
    expect(inRange(makeEntry({ purchasedAt: TODAY }), '7d', TODAY)).toBe(true)
  })

  it('未来日期不计入区间', () => {
    expect(inRange(makeEntry({ purchasedAt: '2026-10-26' }), '7d', TODAY)).toBe(false)
  })

  it('全部范围总是命中', () => {
    expect(inRange(makeEntry({ purchasedAt: '2020-01-01' }), 'all', TODAY)).toBe(true)
  })
})

describe('rangeStats', () => {
  const entries = [
    makeEntry({ id: 'a', quantity: 2, unitPrice: 8.5, purchasedAt: '2026-10-20' }),
    makeEntry({ id: 'b', quantity: 3, unitPrice: null, purchasedAt: '2026-10-21' }),
    makeEntry({ id: 'c', quantity: 1, unitPrice: 100, purchasedAt: '2026-08-01' }),
  ]

  it('累计购买包数、花费与记录数', () => {
    const stats = rangeStats(entries, '30d', TODAY)
    expect(stats.packages).toBe(5)
    expect(stats.records).toBe(2)
    expect(stats.spend).toBe(17)
    expect(stats.pricedRecords).toBe(1)
  })

  it('无单价的记录不计入花费，但计入包数与记录数', () => {
    const stats = rangeStats(entries, 'all', TODAY)
    expect(stats.packages).toBe(6)
    expect(stats.records).toBe(3)
    expect(stats.spend).toBe(117)
    expect(stats.pricedRecords).toBe(2)
  })

  it('空数据返回零值', () => {
    expect(rangeStats([], '30d', TODAY)).toEqual({ packages: 0, spend: 0, records: 0, pricedRecords: 0 })
  })

  it('浮点价格不产生尾差', () => {
    const floaty = [
      makeEntry({ id: 'x', quantity: 3, unitPrice: 0.1 }),
      makeEntry({ id: 'y', quantity: 3, unitPrice: 0.2 }),
    ]
    expect(rangeStats(floaty, 'all', TODAY).spend).toBe(0.9)
  })
})

describe('spendByCategory', () => {
  it('按分类汇总并降序排列', () => {
    const entries = [
      makeEntry({ id: 'a', category: 'chips', quantity: 2, unitPrice: 5 }),
      makeEntry({ id: 'b', category: 'chips', quantity: 1, unitPrice: 5 }),
      makeEntry({ id: 'c', category: 'drink', quantity: 4, unitPrice: 3 }),
      makeEntry({ id: 'd', category: 'candy', quantity: 1, unitPrice: null }),
    ]
    const result = spendByCategory(entries, 'all', TODAY)
    expect(result.map((r) => r.category)).toEqual(['chips', 'drink', 'candy'])
    expect(result[0]).toEqual({ category: 'chips', spend: 15, packages: 3 })
    expect(result[1]).toEqual({ category: 'drink', spend: 12, packages: 4 })
    expect(result[2]).toEqual({ category: 'candy', spend: 0, packages: 1 })
  })

  it('区间外的记录被排除', () => {
    const entries = [makeEntry({ category: 'chips', purchasedAt: '2026-01-01' })]
    expect(spendByCategory(entries, '30d', TODAY)).toEqual([])
  })
})

describe('金额格式化', () => {
  it('roundMoney 保留两位', () => {
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
  })

  it('formatMoney 去掉整数价的 .00', () => {
    expect(formatMoney(17)).toBe('17')
    expect(formatMoney(17.5)).toBe('17.50')
    expect(formatMoney(0.9)).toBe('0.90')
  })
})
