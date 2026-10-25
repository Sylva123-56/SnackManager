import { beforeEach, describe, expect, it } from 'vitest'
import { clearDraft, loadDraft, saveDraft } from './draftCache'
import { emptyDraft } from './draft'

/** 用内存 Map 顶替 localStorage，Node 环境里也能跑 */
function stubStorage() {
  const map = new Map<string, string>()
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  }
  ;(globalThis as { window?: unknown }).window = { localStorage: storage }
  return map
}

describe('草稿暂存', () => {
  let map: Map<string, string>

  beforeEach(() => {
    map = stubStorage()
  })

  it('没存过时读到 null', () => {
    expect(loadDraft('pack')).toBeNull()
  })

  it('存了能读回来，字段完整', () => {
    const draft = { ...emptyDraft('2026-10-25'), name: '薯片', quantity: '3' }
    saveDraft('pack', draft)
    const back = loadDraft('pack')
    expect(back?.name).toBe('薯片')
    expect(back?.quantity).toBe('3')
    expect(back?.isBox).toBe(false)
  })

  it('散包与整箱的草稿各存各的，不串', () => {
    saveDraft('pack', { ...emptyDraft('2026-10-25'), name: '散包那份', isBox: false })
    saveDraft('box', { ...emptyDraft('2026-10-25', true), name: '整箱那份', quantity: '12' })
    expect(loadDraft('pack')?.name).toBe('散包那份')
    expect(loadDraft('box')?.name).toBe('整箱那份')
    expect(loadDraft('box')?.quantity).toBe('12')
  })

  it('清掉一个槽不影响另一个', () => {
    saveDraft('pack', { ...emptyDraft('2026-10-25'), name: '甲' })
    saveDraft('box', { ...emptyDraft('2026-10-25', true), name: '乙' })
    clearDraft('pack')
    expect(loadDraft('pack')).toBeNull()
    expect(loadDraft('box')?.name).toBe('乙')
  })

  it('两个槽都清掉后，存储里不留垃圾键', () => {
    saveDraft('pack', emptyDraft('2026-10-25'))
    saveDraft('box', emptyDraft('2026-10-25', true))
    clearDraft('pack')
    clearDraft('box')
    expect(map.size).toBe(0)
  })

  it('存的内容坏了当作没有，不炸', () => {
    map.set('snack-manager:draft', '{ 这不是 JSON')
    expect(loadDraft('pack')).toBeNull()
  })

  it('存的形状不对也当没有', () => {
    map.set('snack-manager:draft', JSON.stringify({ pack: { name: '缺字段' } }))
    expect(loadDraft('pack')).toBeNull()
  })
})
