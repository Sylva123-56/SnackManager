import type { Draft } from './draft'

/**
 * 没填完的草稿暂存。
 *
 * 场景：正在填「记录零食」，手一滑点了窗口外面的暗色区域，窗口关了。
 * 这时内容不该丢——下次打开同一类表单，接着填。
 * 点「取消」或真的记进去了，才清掉。
 *
 * 存在 WebView 的 localStorage 里：万一顺手把应用关了，下次启动还在。
 */
const KEY = 'snack-manager:draft'

export type DraftSlot = 'pack' | 'box'

type Stash = Partial<Record<DraftSlot, Draft>>

function read(): Stash {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const out: Stash = {}
    for (const slot of ['pack', 'box'] as DraftSlot[]) {
      const value = (parsed as Record<string, unknown>)[slot]
      if (isDraftShaped(value)) out[slot] = value
    }
    return out
  } catch {
    return {}
  }
}

function write(stash: Stash): void {
  try {
    if (Object.keys(stash).length === 0) window.localStorage.removeItem(KEY)
    else window.localStorage.setItem(KEY, JSON.stringify(stash))
  } catch {
    /* 存不下就算了，不影响记录 */
  }
}

export function loadDraft(slot: DraftSlot): Draft | null {
  return read()[slot] ?? null
}

export function saveDraft(slot: DraftSlot, draft: Draft): void {
  write({ ...read(), [slot]: draft })
}

export function clearDraft(slot: DraftSlot): void {
  const stash = read()
  if (!(slot in stash)) return
  delete stash[slot]
  write(stash)
}

/** 只要看起来像草稿就收下；字段缺了由表单自己兜底 */
function isDraftShaped(value: unknown): value is Draft {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return typeof obj.name === 'string' && typeof obj.quantity === 'string' && Array.isArray(obj.extraBatches)
}
