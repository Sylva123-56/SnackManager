import { describe, expect, it } from 'vitest'
import {
  draftFromEntry,
  draftFromSuggestion,
  draftToEntry,
  emptyDraft,
  previewExpiry,
  suggestByName,
  validateDraft,
} from './draft'
import type { Draft } from './draft'
import type { Entry } from '../domain/types'

const TODAY = '2026-10-25'

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'e1',
    name: '乐事薯片',
    brand: '乐事',
    category: 'chips',
    emoji: '🥔',
    imageFile: null,
    barcode: '',
    quantity: 3,
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

function validDraft(): Draft {
  return {
    ...emptyDraft(TODAY),
    name: '乐事薯片',
    quantity: '3',
    remaining: '3',
    unitPrice: '8.5',
    productionDate: '2026-09-01',
    shelfLifeValue: '6',
    shelfLifeUnit: 'month',
  }
}

describe('emptyDraft', () => {
  it('默认数量 1、购买日为今天、单位为月', () => {
    const draft = emptyDraft(TODAY)
    expect(draft.quantity).toBe('1')
    expect(draft.remaining).toBe('1')
    expect(draft.purchasedAt).toBe(TODAY)
    expect(draft.shelfLifeUnit).toBe('month')
    expect(draft.imageFile).toBeNull()
  })
})

describe('validateDraft', () => {
  it('完整草稿无错误', () => {
    expect(validateDraft(validDraft())).toEqual({})
  })

  it('名称为空报错', () => {
    const draft = { ...validDraft(), name: '   ' }
    expect(validateDraft(draft).name).toBeTruthy()
  })

  it('总数必须 >= 1 且为整数', () => {
    expect(validateDraft({ ...validDraft(), quantity: '0' }).quantity).toBeTruthy()
    expect(validateDraft({ ...validDraft(), quantity: '1.5' }).quantity).toBeTruthy()
    expect(validateDraft({ ...validDraft(), quantity: 'abc' }).quantity).toBeTruthy()
    expect(validateDraft({ ...validDraft(), quantity: '' }).quantity).toBeTruthy()
  })

  it('剩余不能超过总数', () => {
    expect(validateDraft({ ...validDraft(), quantity: '2', remaining: '3' }).remaining).toBeTruthy()
    const ok = validateDraft({ ...validDraft(), quantity: '2', remaining: '2' })
    expect(ok.remaining).toBeUndefined()
  })

  it('单价最多两位小数', () => {
    expect(validateDraft({ ...validDraft(), unitPrice: '8.555' }).unitPrice).toBeTruthy()
    expect(validateDraft({ ...validDraft(), unitPrice: '8.55' }).unitPrice).toBeUndefined()
    expect(validateDraft({ ...validDraft(), unitPrice: '' }).unitPrice).toBeUndefined()
    expect(validateDraft({ ...validDraft(), unitPrice: 'abc' }).unitPrice).toBeTruthy()
  })

  it('缺少购买日期报错', () => {
    expect(validateDraft({ ...validDraft(), purchasedAt: '' }).purchasedAt).toBeTruthy()
  })

  it('既无生产日期+保质期、又无手填到期日报错', () => {
    const draft = { ...validDraft(), productionDate: '', shelfLifeValue: '', expiryDate: '' }
    expect(validateDraft(draft).expiryDate).toBeTruthy()
  })

  it('只填保质期、不填生产日期时，若手填了到期日则通过', () => {
    const draft = { ...validDraft(), productionDate: '', expiryDate: '2027-01-01' }
    expect(validateDraft(draft)).toEqual({})
  })

  it('保质期非整数报错', () => {
    expect(validateDraft({ ...validDraft(), shelfLifeValue: '1.5' }).shelfLifeValue).toBeTruthy()
  })

  it('生产日期非法报错', () => {
    expect(validateDraft({ ...validDraft(), productionDate: '2026-02-30' }).productionDate).toBeTruthy()
  })
})

describe('previewExpiry', () => {
  it('生产日期 + 保质期可推算', () => {
    expect(previewExpiry(validDraft())).toBe('2027-03-01')
  })

  it('按天按月按年都支持', () => {
    expect(previewExpiry({ ...validDraft(), shelfLifeValue: '90', shelfLifeUnit: 'day' })).toBe('2026-11-30')
    expect(previewExpiry({ ...validDraft(), shelfLifeValue: '2', shelfLifeUnit: 'year' })).toBe('2028-09-01')
  })

  it('缺任一项返回 null', () => {
    expect(previewExpiry({ ...validDraft(), productionDate: '' })).toBeNull()
    expect(previewExpiry({ ...validDraft(), shelfLifeValue: '' })).toBeNull()
  })

  it('月末夹取', () => {
    const draft = { ...validDraft(), productionDate: '2026-01-31', shelfLifeValue: '1' }
    expect(previewExpiry(draft)).toBe('2026-02-28')
  })
})

describe('draftToEntry', () => {
  it('转换后字段齐全', () => {
    const result = draftToEntry(validDraft())
    expect(result).not.toBeNull()
    const entry = result!.entry
    expect(entry.name).toBe('乐事薯片')
    expect(entry.expiryDate).toBe('2027-03-01')
    expect(entry.expirySource).toBe('shelfLife')
    expect(entry.unitPrice).toBe(8.5)
    expect(entry.quantity).toBe(3)
    expect(entry.remaining).toBe(3)
  })

  it('手填到期日时来源标记为 manual', () => {
    const draft = { ...validDraft(), productionDate: '', shelfLifeValue: '', expiryDate: '2027-05-20' }
    const entry = draftToEntry(draft)!.entry
    expect(entry.expiryDate).toBe('2027-05-20')
    expect(entry.expirySource).toBe('manual')
    expect(entry.productionDate).toBeNull()
    expect(entry.shelfLifeValue).toBeNull()
  })

  it('自动推算优先于手填值', () => {
    const draft = { ...validDraft(), expiryDate: '2030-01-01' }
    expect(draftToEntry(draft)!.entry.expiryDate).toBe('2027-03-01')
  })

  it('非法草稿返回 null', () => {
    expect(draftToEntry({ ...validDraft(), name: '' })).toBeNull()
  })

  it('emoji 缺省时回落到分类图标', () => {
    const entry = draftToEntry({ ...validDraft(), emoji: '', category: 'drink' })!.entry
    expect(entry.emoji).toBe('🥤')
  })
})

describe('draftFromEntry 往返', () => {
  it('编辑已有记录时字段无损', () => {
    const entry = makeEntry()
    const draft = draftFromEntry(entry)
    expect(draft.name).toBe(entry.name)
    expect(draft.quantity).toBe('3')
    expect(draft.remaining).toBe('2')
    expect(draft.unitPrice).toBe('8.5')
    expect(draft.shelfLifeValue).toBe('6')
    expect(previewExpiry(draft)).toBe('2027-03-01')
    const back = draftToEntry(draft)!.entry
    expect(back.expiryDate).toBe(entry.expiryDate)
    expect(back.expirySource).toBe(entry.expirySource)
  })

  it('无单价的记录草稿为空字符串', () => {
    expect(draftFromEntry(makeEntry({ unitPrice: null })).unitPrice).toBe('')
  })
})

describe('suggestByName', () => {
  const entries = [
    makeEntry({ id: 'a', name: '乐事薯片 黄瓜味', updatedAt: '2026-09-01T00:00:00.000Z' }),
    makeEntry({ id: 'b', name: '乐事薯片 原味', updatedAt: '2026-10-01T00:00:00.000Z' }),
    makeEntry({ id: 'c', name: '乐事薯片 原味', updatedAt: '2026-08-01T00:00:00.000Z' }),
    makeEntry({ id: 'd', name: '奥利奥', updatedAt: '2026-10-02T00:00:00.000Z' }),
  ]

  it('按规范化名称去重，取最新一条', () => {
    const result = suggestByName(entries, '乐事')
    expect(result).toHaveLength(2)
    expect(result[0]!.entry.id).toBe('b')
  })

  it('前缀命中的排在前面', () => {
    const result = suggestByName(entries, '乐事薯片 原')
    expect(result[0]!.entry.id).toBe('b')
  })

  it('空查询返回空数组', () => {
    expect(suggestByName(entries, '   ')).toEqual([])
  })

  it('大小写与空格不敏感', () => {
    expect(suggestByName(entries, '  奥利  ')).toHaveLength(1)
  })

  it('限制返回条数', () => {
    const many = Array.from({ length: 20 }, (_, i) => makeEntry({ id: `x${i}`, name: `薯片${i}` }))
    expect(suggestByName(many, '薯片').length).toBe(6)
    expect(suggestByName(many, '薯片', 3).length).toBe(3)
  })
})

describe('draftFromSuggestion', () => {
  it('继承历史字段但重置到期日', () => {
    const base = { ...emptyDraft(TODAY), quantity: '5' }
    const draft = draftFromSuggestion(base, makeEntry())
    expect(draft.name).toBe('乐事薯片')
    expect(draft.quantity).toBe('5')
    expect(draft.expiryDate).toBe('')
    expect(previewExpiry(draft)).toBe('2027-03-01')
  })
})
