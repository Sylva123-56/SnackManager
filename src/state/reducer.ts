import { todayISO } from '../domain/date'
import { SCHEMA_VERSION } from '../domain/types'
import type { AppData, Entry, Settings } from '../domain/types'
import { normalizeSettings } from '../domain/importExport'
import { mergeData } from '../domain/importExport'

export type LoadPhase = 'loading' | 'ready' | 'broken'
export type SavePhase = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export interface AppState {
  data: AppData
  /** 今天的本地日期，跨零点时刷新 */
  today: string
  phase: LoadPhase
  /** 坏档原因，phase === 'broken' 时有值 */
  brokenReason: string | null
  /** 是否已用备份恢复过，提示用 */
  recoveredFromBackup: boolean
  savePhase: SavePhase
  saveError: string | null
  /** 导入过程中丢弃的坏记录数（仅一条提示） */
  lastNotice: string | null
}

export type Action =
  | { type: 'load'; data: AppData; recoveredFromBackup: boolean }
  | { type: 'loadBroken'; reason: string }
  | { type: 'add'; entry: Omit<Entry, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'update'; id: string; patch: Partial<Omit<Entry, 'id' | 'createdAt'>> }
  | { type: 'delete'; id: string }
  | { type: 'consume'; id: string; amount: number }
  | { type: 'setRemaining'; id: string; remaining: number }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'replace'; data: AppData }
  | { type: 'merge'; data: AppData }
  | { type: 'restoreBackup'; data: AppData }
  | { type: 'setToday'; today: string }
  | { type: 'saving' }
  | { type: 'saved' }
  | { type: 'saveFailed'; message: string }
  | { type: 'notice'; message: string | null }

export function initialState(): AppState {
  return {
    data: { schemaVersion: SCHEMA_VERSION, entries: [], settings: normalizeSettings(undefined) },
    today: todayISO(),
    phase: 'loading',
    brokenReason: null,
    recoveredFromBackup: false,
    savePhase: 'idle',
    saveError: null,
    lastNotice: null,
  }
}

function clampRemaining(value: number, quantity: number): number {
  return Math.min(quantity, Math.max(0, Math.trunc(value)))
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'load':
      return {
        ...state,
        data: action.data,
        phase: 'ready',
        brokenReason: null,
        recoveredFromBackup: action.recoveredFromBackup,
        savePhase: 'idle',
      }

    case 'loadBroken':
      return { ...state, phase: 'broken', brokenReason: action.reason }

    case 'add': {
      const now = new Date().toISOString()
      const entry: Entry = {
        ...action.entry,
        id: newId(),
        quantity: Math.max(1, Math.trunc(action.entry.quantity)),
        remaining: clampRemaining(action.entry.remaining, Math.max(1, action.entry.quantity)),
        createdAt: now,
        updatedAt: now,
      }
      return { ...state, data: { ...state.data, entries: [entry, ...state.data.entries] } }
    }

    case 'update': {
      const now = new Date().toISOString()
      const entries = state.data.entries.map((entry) => {
        if (entry.id !== action.id) return entry
        const merged = { ...entry, ...action.patch, updatedAt: now }
        const quantity = Math.max(1, Math.trunc(merged.quantity))
        return {
          ...merged,
          quantity,
          remaining: clampRemaining(merged.remaining, quantity),
        }
      })
      return { ...state, data: { ...state.data, entries } }
    }

    case 'delete':
      return {
        ...state,
        data: { ...state.data, entries: state.data.entries.filter((e) => e.id !== action.id) },
      }

    case 'consume': {
      const now = new Date().toISOString()
      const entries = state.data.entries.map((entry) =>
        entry.id === action.id
          ? {
              ...entry,
              remaining: clampRemaining(entry.remaining - action.amount, entry.quantity),
              updatedAt: now,
            }
          : entry,
      )
      return { ...state, data: { ...state.data, entries } }
    }

    case 'setRemaining': {
      const now = new Date().toISOString()
      const entries = state.data.entries.map((entry) =>
        entry.id === action.id
          ? { ...entry, remaining: clampRemaining(action.remaining, entry.quantity), updatedAt: now }
          : entry,
      )
      return { ...state, data: { ...state.data, entries } }
    }

    case 'settings':
      return {
        ...state,
        data: { ...state.data, settings: { ...state.data.settings, ...action.patch } },
      }

    case 'replace':
      return {
        ...state,
        data: { ...action.data, settings: { ...action.data.settings, ...state.data.settings } },
        phase: 'ready',
        savePhase: 'pending',
      }

    case 'merge': {
      const result = mergeData(state.data, action.data)
      return { ...state, data: result.data, savePhase: 'pending' }
    }

    case 'restoreBackup':
      return {
        ...state,
        data: action.data,
        phase: 'ready',
        brokenReason: null,
        recoveredFromBackup: true,
        savePhase: 'pending',
      }

    case 'setToday':
      return action.today === state.today ? state : { ...state, today: action.today }

    case 'saving':
      return { ...state, savePhase: 'saving' }

    case 'saved':
      return state.savePhase === 'saved' ? state : { ...state, savePhase: 'saved', saveError: null }

    case 'saveFailed':
      return { ...state, savePhase: 'error', saveError: action.message }

    case 'notice':
      return { ...state, lastNotice: action.message }

    default:
      return state
  }
}

/** 保存中被合并掉的连续编辑不会各写一次盘，状态里只需知道「待写」 */
export function isDirty(state: AppState): boolean {
  return state.savePhase === 'pending' || state.savePhase === 'error'
}
