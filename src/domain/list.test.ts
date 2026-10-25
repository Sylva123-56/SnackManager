import { describe, expect, it } from 'vitest'
import {
  FILTER_LABELS,
  STATUS_LABELS,
  filterEntries,
  selectEntries,
  sortEntries,
  statusBucketsByCount,
} from './list'
import type { Entry } from './types'

const TODAY = '2026-10-25'
const WARN = 7

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
    unitPrice: null,
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

describe('filterEntries 状态筛选', () => {
  const entries = [
    makeEntry({ id: 'expired', remaining: 2, expiryDate: '2026-10-01' }),
    makeEntry({ id: 'expiring', remaining: 1, expiryDate: '2026-10-28' }),
    makeEntry({ id: 'ok', remaining: 3, expiryDate: '2027-06-01' }),
    makeEntry({ id: 'finished', remaining: 0, expiryDate: '2026-10-01' }),
  ]

  it('all 返回全部', () => {
    expect(filterEntries(entries, 'all', TODAY, WARN)).toHaveLength(4)
  })

  it('instock 只按剩余件数判断，含过期品', () => {
    const ids = filterEntries(entries, 'instock', TODAY, WARN).map((e) => e.id)
    expect(ids).toEqual(['expired', 'expiring', 'ok'])
  })

  it('expiring 只有临期', () => {
    expect(filterEntries(entries, 'expiring', TODAY, WARN).map((e) => e.id)).toEqual(['expiring'])
  })

  it('expired 只有过期', () => {
    expect(filterEntries(entries, 'expired', TODAY, WARN).map((e) => e.id)).toEqual(['expired'])
  })

  it('finished 只有吃完的', () => {
    expect(filterEntries(entries, 'finished', TODAY, WARN).map((e) => e.id)).toEqual(['finished'])
  })

  it('阈值变化会改变归类', () => {
    // warnDays=0 时 2026-10-28 不再算临期
    expect(filterEntries(entries, 'expiring', TODAY, 0)).toHaveLength(0)
  })
})

describe('filterEntries 搜索', () => {
  const entries = [
    makeEntry({ id: 'a', name: '乐事薯片', brand: '乐事' }),
    makeEntry({ id: 'b', name: '奥利奥', brand: '亿滋', note: '夹心饼干' }),
    makeEntry({ id: 'c', name: '可乐', barcode: '6901234567890' }),
  ]

  it('匹配名称', () => {
    expect(filterEntries(entries, 'all', TODAY, WARN, '薯片').map((e) => e.id)).toEqual(['a'])
  })

  it('匹配品牌', () => {
    expect(filterEntries(entries, 'all', TODAY, WARN, '亿滋').map((e) => e.id)).toEqual(['b'])
  })

  it('匹配备注', () => {
    expect(filterEntries(entries, 'all', TODAY, WARN, '夹心').map((e) => e.id)).toEqual(['b'])
  })

  it('匹配条码', () => {
    expect(filterEntries(entries, 'all', TODAY, WARN, '6901234').map((e) => e.id)).toEqual(['c'])
  })

  it('大小写不敏感，空查询不过滤', () => {
    expect(filterEntries(entries, 'all', TODAY, WARN, '   ')).toHaveLength(3)
  })

  it('无匹配返回空数组', () => {
    expect(filterEntries(entries, 'all', TODAY, WARN, '不存在的东西')).toEqual([])
  })
})

describe('sortEntries', () => {
  const entries = [
    makeEntry({ id: 'ok', name: 'C', expiryDate: '2027-06-01' }),
    makeEntry({ id: 'finished', name: 'D', remaining: 0, expiryDate: '2026-01-01' }),
    makeEntry({ id: 'expired', name: 'A', expiryDate: '2026-09-01' }),
    makeEntry({ id: 'expiring', name: 'B', expiryDate: '2026-10-28' }),
  ]

  it('按到期日：紧急的在前，吃完的沉底', () => {
    const ids = sortEntries(entries, 'expiry', TODAY).map((e) => e.id)
    expect(ids).toEqual(['expired', 'expiring', 'ok', 'finished'])
  })

  it('按购买日：最近的在前', () => {
    const list = [
      makeEntry({ id: 'old', purchasedAt: '2026-01-01' }),
      makeEntry({ id: 'new', purchasedAt: '2026-10-20' }),
      makeEntry({ id: 'mid', purchasedAt: '2026-06-01' }),
    ]
    expect(sortEntries(list, 'purchasedAt', TODAY).map((e) => e.id)).toEqual([
      'new',
      'mid',
      'old',
    ])
  })

  it('按名称', () => {
    const list = [makeEntry({ id: 'x', name: '雪饼' }), makeEntry({ id: 'y', name: '饼干' })]
    const sorted = sortEntries(list, 'name', TODAY)
    // 中文按拼音：bing < xue
    expect(sorted.map((e) => e.id)).toEqual(['y', 'x'])
  })

  it('不修改原数组', () => {
    const list = [makeEntry({ id: 'b', expiryDate: '2027-01-01' }), makeEntry({ id: 'a', expiryDate: '2026-11-01' })]
    const before = list.map((e) => e.id)
    sortEntries(list, 'expiry', TODAY)
    expect(list.map((e) => e.id)).toEqual(before)
  })
})

describe('selectEntries', () => {
  it('筛选与排序组合', () => {
    const entries = [
      makeEntry({ id: 'a', remaining: 2, expiryDate: '2026-10-28' }),
      makeEntry({ id: 'b', remaining: 2, expiryDate: '2026-10-26' }),
      makeEntry({ id: 'c', remaining: 0, expiryDate: '2026-10-01' }),
    ]
    const result = selectEntries(entries, { filter: 'instock', sort: 'expiry', today: TODAY, warnDays: WARN })
    expect(result.map((e) => e.id)).toEqual(['b', 'a'])
  })
})

describe('statusBucketsByCount', () => {
  it('未吃完按件数计，吃完的按条数计', () => {
    const entries = [
      makeEntry({ id: 'a', remaining: 3, expiryDate: '2027-06-01' }),
      makeEntry({ id: 'b', remaining: 2, expiryDate: '2026-10-01' }),
      makeEntry({ id: 'c', remaining: 0 }),
      makeEntry({ id: 'd', remaining: 0 }),
    ]
    const buckets = statusBucketsByCount(entries, TODAY, WARN)
    expect(buckets.ok).toBe(3)
    expect(buckets.expired).toBe(2)
    expect(buckets.finished).toBe(2)
    expect(buckets.active).toBe(5)
  })

  it('空数据全为 0', () => {
    expect(statusBucketsByCount([], TODAY, WARN)).toEqual({
      expired: 0,
      expiring: 0,
      ok: 0,
      finished: 0,
      active: 0,
    })
  })
})

describe('标签表', () => {
  it('四个筛选与四个状态都有中文标签', () => {
    expect(Object.keys(FILTER_LABELS)).toHaveLength(5)
    expect(STATUS_LABELS.finished).toBe('已吃完')
  })
})
