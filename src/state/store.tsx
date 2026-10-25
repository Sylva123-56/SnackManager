import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import { todayISO } from '../domain/date'
import { parseAppData, serializeAppData, DataFormatError } from '../domain/importExport'
import type { AppData, Entry, Settings } from '../domain/types'
import { isDesktop, readBackup, readData, restoreFromBackup, writeData } from './backend'
import { initialState, reducer, type Action, type AppState } from './reducer'

interface StoreValue {
  state: AppState
  dispatch: (action: Action) => void
  /** 立即落盘（关闭窗口前调用） */
  flush: () => Promise<void>
  addEntry: (entry: Omit<Entry, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateEntry: (id: string, patch: Partial<Omit<Entry, 'id' | 'createdAt'>>) => void
  deleteEntry: (id: string) => void
  consumeEntry: (id: string, amount: number) => void
  setRemaining: (id: string, remaining: number) => void
  patchSettings: (patch: Partial<Settings>) => void
  /** 导入-覆盖：仅替换记录，保留当前设置 */
  replaceAll: (incoming: AppData) => void
  /** 导入-合并：按 id 去重，updatedAt 较新者胜 */
  mergeIn: (incoming: AppData) => void
  /** 清空全部记录 */
  clearAll: () => void
  /** 坏档时用 .bak 恢复 */
  recoverFromBackup: () => Promise<void>
  /** 坏档时从空白库重新开始（会先备份原文件） */
  startFresh: () => Promise<void>
}

const StoreContext = createContext<StoreValue | null>(null)

const SAVE_DEBOUNCE_MS = 200

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const lastSavedRef = useRef<string | null>(null)
  const timerRef = useRef<number | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  /** 把当前数据写盘 */
  const persist = useCallback(async (data: AppData): Promise<void> => {
    const text = serializeAppData(data)
    if (text === lastSavedRef.current) return
    dispatch({ type: 'saving' })
    try {
      await writeData(text)
      lastSavedRef.current = text
      dispatch({ type: 'saved' })
    } catch (error) {
      dispatch({ type: 'saveFailed', message: errorText(error) })
    }
  }, [])

  const flush = useCallback(async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    await persist(stateRef.current.data)
  }, [persist])

  // ---------- 启动加载 ----------
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const primary = await readData()
        if (cancelled) return
        if (primary.status === 'missing') {
          lastSavedRef.current = null
          dispatch({
            type: 'load',
            data: { schemaVersion: 1, entries: [], settings: initialState().data.settings },
            recoveredFromBackup: false,
          })
          return
        }
        try {
          const { data, dropped } = parseAppData(primary.content)
          lastSavedRef.current = serializeAppData(data)
          dispatch({ type: 'load', data, recoveredFromBackup: false })
          if (dropped > 0) {
            dispatch({ type: 'notice', message: `已跳过 ${dropped} 条损坏的记录` })
          }
        } catch (error) {
          // 主文件坏了：尝试 .bak，且绝不覆盖原文件
          const backup = await readBackup()
          if (cancelled) return
          if (backup.status === 'found') {
            try {
              const { data } = parseAppData(backup.content)
              lastSavedRef.current = serializeAppData(data)
              dispatch({ type: 'load', data, recoveredFromBackup: true })
              dispatch({
                type: 'notice',
                message: '数据文件损坏，已自动从备份恢复。原文件保留未动。',
              })
              return
            } catch {
              /* 备份也坏，落到下面 */
            }
          }
          dispatch({
            type: 'loadBroken',
            reason: errorText(error),
          })
        }
      } catch (error) {
        if (cancelled) return
        dispatch({ type: 'loadBroken', reason: errorText(error) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ---------- 防抖落盘 ----------
  useEffect(() => {
    if (state.phase !== 'ready') return
    const text = serializeAppData(state.data)
    if (text === lastSavedRef.current) {
      // 已经落过盘：把 pending 状态收回 saved，避免状态条一直转
      if (state.savePhase === 'pending') dispatch({ type: 'saved' })
      return
    }
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      void persist(stateRef.current.data)
    }, SAVE_DEBOUNCE_MS)
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [state.data, state.phase, state.savePhase, persist])

  // ---------- 跨零点刷新「今天」 ----------
  useEffect(() => {
    const tick = () => {
      const today = todayISO()
      if (today !== stateRef.current.today) dispatch({ type: 'setToday', today })
    }
    const timer = window.setInterval(tick, 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', tick)
    }
  }, [])

  // ---------- 关闭前兜底落盘 ----------
  useEffect(() => {
    const handler = () => {
      void flush()
    }
    window.addEventListener('pagehide', handler)
    return () => window.removeEventListener('pagehide', handler)
  }, [flush])

  const recoverFromBackupAction = useCallback(async () => {
    try {
      const result = await restoreFromBackup()
      if (result.status === 'missing') {
        dispatch({ type: 'notice', message: '没有可用的备份' })
        return
      }
      const { data } = parseAppData(result.content)
      lastSavedRef.current = serializeAppData(data)
      dispatch({ type: 'restoreBackup', data })
      dispatch({ type: 'notice', message: '已从备份恢复' })
    } catch (error) {
      dispatch({ type: 'notice', message: errorText(error) })
    }
  }, [])

  const startFreshAction = useCallback(async () => {
    const current = stateRef.current
    try {
      // 先尽力把坏档留档，再写空库
      if (isDesktop) {
        const { writeSideBackup } = await import('./backend')
        const raw = await readData()
        if (raw.status === 'found' && raw.content) {
          const stamp = new Date().toISOString().replace(/[:.]/g, '-')
          await writeSideBackup(`snacks.broken-${stamp}.json`, raw.content)
        }
      }
    } catch {
      /* 留档失败不阻断新建 */
    }
    const fresh: AppData = {
      schemaVersion: 1,
      entries: [],
      settings: current.data.settings,
    }
    lastSavedRef.current = null
    dispatch({ type: 'replace', data: fresh })
    dispatch({ type: 'notice', message: '已新建空白库，原文件已留档' })
  }, [])

  const value = useMemo<StoreValue>(
    () => ({
      state,
      dispatch,
      flush,
      addEntry: (entry) => dispatch({ type: 'add', entry }),
      updateEntry: (id, patch) => dispatch({ type: 'update', id, patch }),
      deleteEntry: (id) => dispatch({ type: 'delete', id }),
      consumeEntry: (id, amount) => dispatch({ type: 'consume', id, amount }),
      setRemaining: (id, remaining) => dispatch({ type: 'setRemaining', id, remaining }),
      patchSettings: (patch) => dispatch({ type: 'settings', patch }),
      replaceAll: (incoming) => dispatch({ type: 'replace', data: incoming }),
      mergeIn: (incoming) => dispatch({ type: 'merge', data: incoming }),
      clearAll: () =>
        dispatch({
          type: 'replace',
          data: { schemaVersion: 1, entries: [], settings: stateRef.current.data.settings },
        }),
      recoverFromBackup: recoverFromBackupAction,
      startFresh: startFreshAction,
    }),
    [state, flush, recoverFromBackupAction, startFreshAction],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore 必须在 StoreProvider 内使用')
  return value
}

function errorText(error: unknown): string {
  if (error instanceof DataFormatError) return error.message
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return '未知错误'
}
