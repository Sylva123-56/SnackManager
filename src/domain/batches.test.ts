import { describe, expect, it } from 'vitest'
import {
  addPacks,
  batchStocks,
  batchesOf,
  earliestBatch,
  makeBatch,
  sortBatchesByExpiry,
  syncEntry,
  totalQuantity,
} from './batches'
import { statusOf } from './expiry'
import type { Batch, Entry } from './types'

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'e1',
    name: '混合装薯片',
    brand: '',
    category: 'chips',
    emoji: '🥔',
    imageFile: null,
    barcode: '',
    isBox: false,
    batches: [
      { id: 'b-early', productionDate: '2026-07-01', expiryDate: '2026-10-20', quantity: 3 },
      { id: 'b-late', productionDate: '2026-09-01', expiryDate: '2026-12-01', quantity: 2 },
    ],
    quantity: 5,
    remaining: 5,
    unitPrice: 5,
    purchasedAt: '2026-10-01',
    productionDate: '2026-07-01',
    shelfLifeValue: 3,
    shelfLifeUnit: 'month',
    expiryDate: '2026-10-20',
    expirySource: 'shelfLife',
    note: '',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('batchesOf', () => {
  it('有批次时原样返回', () => {
    const entry = makeEntry()
    expect(batchesOf(entry)).toHaveLength(2)
  })

  it('没有批次的老数据按单批合成', () => {
    const legacy = { ...makeEntry(), batches: undefined } as unknown as Entry
    const batches = batchesOf(legacy)
    expect(batches).toHaveLength(1)
    expect(batches[0]?.quantity).toBe(5)
    expect(batches[0]?.expiryDate).toBe('2026-10-20')
  })
})

describe('sortBatchesByExpiry / earliestBatch', () => {
  it('按到期日升序', () => {
    const sorted = sortBatchesByExpiry(makeEntry().batches)
    expect(sorted.map((b) => b.id)).toEqual(['b-early', 'b-late'])
  })

  it('同一天到期时顺序稳定（按生产日期再按 id）', () => {
    const same: Batch[] = [
      { id: 'z', productionDate: '2026-09-01', expiryDate: '2026-12-01', quantity: 1 },
      { id: 'a', productionDate: '2026-07-01', expiryDate: '2026-12-01', quantity: 1 },
    ]
    expect(sortBatchesByExpiry(same).map((b) => b.id)).toEqual(['a', 'z'])
    expect(sortBatchesByExpiry(same).map((b) => b.id)).toEqual(['a', 'z'])
  })

  it('找出最早到期的一批', () => {
    expect(earliestBatch(makeEntry().batches)?.id).toBe('b-early')
  })

  it('空数组返回 null', () => {
    expect(earliestBatch([])).toBeNull()
  })
})

describe('totalQuantity', () => {
  it('各批包数之和', () => {
    expect(totalQuantity(makeEntry().batches)).toBe(5)
  })
})

describe('batchStocks —— 先吃最早到期的', () => {
  it('一包没吃时各批都是满的，最早那批被标记', () => {
    const stocks = batchStocks(makeEntry({ remaining: 5 }))
    expect(stocks.map((s) => s.stock)).toEqual([3, 2])
    expect(stocks[0]?.isEarliest).toBe(true)
    expect(stocks[1]?.isEarliest).toBe(false)
  })

  it('吃掉 2 包时，从最早到期那批里扣', () => {
    const stocks = batchStocks(makeEntry({ remaining: 3 }))
    expect(stocks.map((s) => s.stock)).toEqual([1, 2])
  })

  it('早批吃完后才开始吃晚批', () => {
    const stocks = batchStocks(makeEntry({ remaining: 2 }))
    expect(stocks.map((s) => s.stock)).toEqual([0, 2])
  })

  it('只剩 1 包时来自最晚到期那批', () => {
    const stocks = batchStocks(makeEntry({ remaining: 1 }))
    expect(stocks.map((s) => s.stock)).toEqual([0, 1])
  })

  it('全部吃完时都是 0', () => {
    const stocks = batchStocks(makeEntry({ remaining: 0 }))
    expect(stocks.map((s) => s.stock)).toEqual([0, 0])
  })

  it('剩余量超过总包数时按总包数封顶', () => {
    const stocks = batchStocks(makeEntry({ remaining: 99 }))
    expect(stocks.map((s) => s.stock)).toEqual([3, 2])
  })

  it('返回顺序按到期日升序，与输入顺序无关', () => {
    const reversed = [...makeEntry().batches].reverse()
    const stocks = batchStocks(makeEntry({ batches: reversed, remaining: 3 }))
    expect(stocks.map((s) => s.batch.id)).toEqual(['b-early', 'b-late'])
    expect(stocks.map((s) => s.stock)).toEqual([1, 2])
  })
})

describe('syncEntry', () => {
  it('用批次回填总包数与整箱到期日（取最早）', () => {
    const entry = syncEntry(
      makeEntry({
        batches: [
          { id: 'a', productionDate: '2026-09-01', expiryDate: '2026-12-01', quantity: 4 },
          { id: 'b', productionDate: '2026-07-01', expiryDate: '2026-10-20', quantity: 6 },
        ],
        quantity: 1,
        expiryDate: '2026-12-01',
      }),
    )
    expect(entry.quantity).toBe(10)
    expect(entry.expiryDate).toBe('2026-10-20')
    expect(entry.productionDate).toBe('2026-07-01')
  })

  it('剩余包数不会超过总包数', () => {
    const entry = syncEntry(makeEntry({ remaining: 99 }))
    expect(entry.remaining).toBe(5)
  })

  it('剩余包数不会为负', () => {
    const entry = syncEntry(makeEntry({ remaining: -3 }))
    expect(entry.remaining).toBe(0)
  })
})

describe('addPacks', () => {
  it('加包数时加到最晚到期那批', () => {
    const entry = addPacks(makeEntry({ remaining: 1 }), 2)
    const late = entry.batches.find((b) => b.id === 'b-late')
    const early = entry.batches.find((b) => b.id === 'b-early')
    expect(late?.quantity).toBe(4)
    expect(early?.quantity).toBe(3)
    expect(entry.quantity).toBe(7)
    expect(entry.remaining).toBe(3)
  })

  it('默认加 1 包', () => {
    const entry = addPacks(makeEntry())
    expect(entry.remaining).toBe(6)
    expect(entry.quantity).toBe(6)
  })

  it('不改动原对象', () => {
    const original = makeEntry()
    addPacks(original, 1)
    expect(original.quantity).toBe(5)
  })
})

describe('整箱状态按最早到期批算', () => {
  it('最早那批过期，整箱就是过期（即便晚批还新鲜）', () => {
    const entry = makeEntry({ remaining: 5 })
    expect(statusOf(entry, '2026-10-25', 7)).toBe('expired')
  })

  it('最早那批只有 3 包，吃掉后整箱按晚批算', () => {
    // 净剩 2 包 → 全来自 2026-12-01 那批；syncEntry 负责把整箱到期日挪到晚批
    const entry = syncEntry(makeEntry({ remaining: 2 }))
    expect(entry.expiryDate).toBe('2026-12-01')
    expect(statusOf(entry, '2026-10-25', 7)).toBe('ok')
  })

  it('早批还有货时，整箱到期日锁定早批（不会被晚批盖住）', () => {
    const entry = syncEntry(makeEntry({ remaining: 4 }))
    expect(entry.expiryDate).toBe('2026-10-20')
    expect(statusOf(entry, '2026-10-25', 7)).toBe('expired')
  })

  it('全部吃完后整箱到期日退回最早一批（此时状态是 finished，不看日期）', () => {
    const entry = syncEntry(makeEntry({ remaining: 0 }))
    expect(entry.expiryDate).toBe('2026-10-20')
    expect(statusOf(entry, '2026-10-30', 7)).toBe('finished')
  })

  it('吃光后是吃完状态', () => {
    expect(statusOf(makeEntry({ remaining: 0 }), '2026-10-30', 7)).toBe('finished')
  })
})

describe('makeBatch', () => {
  it('生产日期可以留空', () => {
    const batch = makeBatch(null, '2026-12-01', 2)
    expect(batch.productionDate).toBeNull()
    expect(batch.quantity).toBe(2)
  })

  it('包数至少 1 且取整', () => {
    expect(makeBatch(null, '2026-12-01', 0).quantity).toBe(1)
    expect(makeBatch(null, '2026-12-01', 2.7).quantity).toBe(2)
  })
})
