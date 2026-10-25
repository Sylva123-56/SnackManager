import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StatusBar } from './components/StatusBar'
import { Sidebar } from './components/Sidebar'
import { EntryList } from './components/EntryList'
import { EntryForm } from './components/EntryForm'
import { Modal } from './components/Modal'
import { SettingsModal } from './components/SettingsModal'
import { ImportDialog, type PendingImport } from './components/ImportDialog'
import { countByStatus, statusOf, totalRemaining } from './domain/expiry'
import { batchesOf } from './domain/batches'
import { statusBucketsByCount } from './domain/list'
import { rangeStats, spendByCategory } from './domain/stats'
import { backupFileName, buildBackup, parseBackup, serializeBackup } from './domain/importExport'
import type { AppData, Entry, ListFilter, StatsRange } from './domain/types'
import { draftToEntry, type Draft } from './state/draft'
import { clearDraft, loadDraft, saveDraft } from './state/draftCache'
import { useStore } from './state/store'
import { isDesktop, dataDirInfo, exportText, importText, writeSideBackup } from './state/backend'
import { useTheme } from './state/theme'
import { IconAlert, IconSnack } from './components/icons'

type Dialog =
  | { kind: 'none' }
  | { kind: 'create'; mode: CreateMode }
  | { kind: 'edit'; entry: Entry }
  | { kind: 'settings' }
  | { kind: 'import'; pending: PendingImport }
  | { kind: 'confirmDelete'; entry: Entry }

/** 一包散装零食，还是一整箱（箱里可能有生产日期不同的几层/几包） */
type CreateMode = 'pack' | 'box'

export function App() {
  const {
    state,
    addEntry,
    updateEntry,
    deleteEntry,
    consumeEntry,
    restockEntry,
    setRemaining,
    patchSettings,
    replaceAll,
    mergeIn,
    clearAll,
    recoverFromBackup,
    startFresh,
    flush,
  } = useStore()
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' })
  // 「点了窗口外面」时留下来的草稿：下次打开同一类表单自动带回来。
  // 点「取消」不算留存，直接丢掉。
  // 从 localStorage 起步，顺手关了应用也还在。
  const [keptDrafts, setKeptDrafts] = useState<Partial<Record<CreateMode, Draft>>>(() => ({
    pack: loadDraft('pack') ?? undefined,
    box: loadDraft('box') ?? undefined,
  }))
  const draftRef = useRef<Draft | null>(null)
  const [dataDir, setDataDir] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const { data, today, phase, brokenReason, lastNotice, savePhase, saveError } = state
  const settings = data.settings

  useTheme(settings.theme)

  useEffect(() => {
    void dataDirInfo()
      .then(setDataDir)
      .catch(() => setDataDir(''))
  }, [])

  // 一次性提示，3.5 秒后自己消失
  useEffect(() => {
    if (lastNotice) setToast(lastNotice)
  }, [lastNotice])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const buckets = useMemo(
    () => statusBucketsByCount(data.entries, today, settings.warnDays),
    [data.entries, today, settings.warnDays],
  )
  const counts = useMemo(() => countByStatus(data.entries, today, settings.warnDays), [data.entries, today, settings.warnDays])
  const inStock = useMemo(() => totalRemaining(data.entries), [data.entries])
  const stats = useMemo(
    () => rangeStats(data.entries, settings.statsRange, today),
    [data.entries, settings.statsRange, today],
  )
  const byCategory = useMemo(
    () => spendByCategory(data.entries, settings.statsRange, today),
    [data.entries, settings.statsRange, today],
  )

  const closeDialog = useCallback(() => setDialog({ kind: 'none' }), [])

  /** 点「取消」：明确放弃，丢掉留存草稿 */
  const cancelCreate = useCallback((mode: CreateMode) => {
    draftRef.current = null
    clearDraft(mode)
    setKeptDrafts((prev) => {
      if (!(mode in prev)) return prev
      const next = { ...prev }
      delete next[mode]
      return next
    })
    setDialog({ kind: 'none' })
  }, [])

  /** 点窗口外面 / Esc / 右上角 ×：先放一边，留着已填的内容 */
  const dismissCreate = useCallback((mode: CreateMode) => {
    const draft = draftRef.current
    draftRef.current = null
    if (draft) {
      saveDraft(mode, draft)
      setKeptDrafts((prev) => ({ ...prev, [mode]: draft }))
    }
    setDialog({ kind: 'none' })
  }, [])

  const openCreate = useCallback((mode: CreateMode) => {
    draftRef.current = null
    setDialog({ kind: 'create', mode })
  }, [])

  // ---------- 快捷键 ----------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing =
        event.target instanceof HTMLElement &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        openCreate('pack')
        return
      }
      if (event.key === 'Escape' && !typing) {
        setDialog((current) => (current.kind === 'none' ? current : { kind: 'none' }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openCreate])

  // ---------- 表单提交 ----------
  function submitDraft(draft: Draft) {
    const result = draftToEntry(draft)
    if (!result) return
    if (dialog.kind === 'edit') {
      updateEntry(dialog.entry.id, result.entry)
      setToast('已保存修改')
    } else {
      addEntry(result.entry)
      setToast(`已记下「${result.entry.name}」`)
      // 真正写进去了，留存的草稿就没用了
      if (dialog.kind === 'create') {
        const done = dialog.mode
        clearDraft(done)
        setKeptDrafts((prev) => {
          if (!(done in prev)) return prev
          const next = { ...prev }
          delete next[done]
          return next
        })
      }
    }
    draftRef.current = null
    closeDialog()
  }

  // 撤销一包：把刚吃掉的那包加回来，批次不变
  function handleUndoEat(entry: Entry) {
    setRemaining(entry.id, entry.remaining + 1)
  }

  // 再进一包：真的多一包，算进最晚到期的那批。
  // 不能走 updateEntry 改 quantity —— 数量由批次派生，会被 syncEntry 改回去。
  function handleAddPack(entry: Entry) {
    restockEntry(entry.id, 1)
    setToast(`「${entry.name}」再进 1 包`)
  }

  function handleConsume(entry: Entry, amount: number) {
    consumeEntry(entry.id, amount)
    if (entry.remaining - amount <= 0) setToast(`「${entry.name}」吃完了`)
  }

  // ---------- 导出 ----------
  async function handleExport() {
    setBusy(true)
    try {
      const backup = buildBackup(data, new Date())
      const text = serializeBackup(backup)
      const suggested = backupFileName(new Date())
      if (isDesktop) {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const path = await save({
          title: '导出零食数据',
          defaultPath: suggested,
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })
        if (typeof path !== 'string') return
        await exportText(path, text)
        setToast('已导出备份')
      } else {
        await exportText(suggested, text)
        setToast('已导出备份')
      }
    } catch (error) {
      setToast(`导出失败：${errorText(error)}`)
    } finally {
      setBusy(false)
    }
  }

  // ---------- 导入 ----------
  async function handleImport() {
    setBusy(true)
    try {
      let picked: string | null | undefined
      if (isDesktop) {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const chosen = await open({
          multiple: false,
          directory: false,
          title: '选择备份文件',
          filters: [{ name: 'JSON', extensions: ['json'] }],
        })
        picked = typeof chosen === 'string' ? chosen : undefined
        if (!picked) return
      } else {
        setToast('浏览器预览模式不支持导入，请在应用里操作')
        return
      }
      const text = await importText(picked)
      const { data: incoming } = parseBackup(text)
      setDialog({
        kind: 'import',
        pending: {
          fileName: picked.split(/[\\/]/).pop() ?? 'backup.json',
          text,
          incoming,
        },
      })
    } catch (error) {
      setToast(`导入失败：${errorText(error)}`)
    } finally {
      setBusy(false)
    }
  }

  async function applyImport(mode: 'replace' | 'merge', incoming: AppData) {
    // 无论覆盖还是合并，都先给当前库留一份带时间戳的备份
    try {
      await writeSideBackup(`snacks.pre-import-${stamp()}.json`, serializeBackup(buildBackup(data, new Date())))
    } catch {
      /* 留档失败不阻断导入，但下面会提示 */
    }
    if (mode === 'replace') {
      const merged: AppData = {
        schemaVersion: incoming.schemaVersion,
        entries: incoming.entries,
        settings: data.settings,
      }
      replaceAll(merged)
      setToast(`已导入 ${incoming.entries.length} 条记录`)
    } else {
      mergeIn(incoming)
      setToast('已合并导入的数据')
    }
    closeDialog()
  }

  async function handleRevealDir() {
    try {
      if (isDesktop) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('reveal_data_dir')
        return
      }
      setToast(dataDir)
    } catch (error) {
      setToast(errorText(error))
    }
  }

  async function handleClearAll() {
    setBusy(true)
    try {
      await writeSideBackup(`snacks.before-clear-${stamp()}.json`, serializeBackup(buildBackup(data, new Date())))
      clearAll()
      setToast('已清空，原数据留了备份')
      closeDialog()
    } catch (error) {
      setToast(`清空失败：${errorText(error)}`)
    } finally {
      setBusy(false)
    }
  }

  // ---------- 坏档 / 加载中 ----------
  if (phase === 'loading') {
    return (
      <div className="boot">
        <span className="boot__mark" aria-hidden="true">
          <IconSnack size={28} />
        </span>
        <p className="boot__text">正在打开零食柜…</p>
      </div>
    )
  }

  if (phase === 'broken') {
    return (
      <div className="boot boot--broken">
        <span className="boot__mark boot__mark--danger" aria-hidden="true">
          <IconAlert size={26} />
        </span>
        <h1 className="boot__title">数据文件读不出来</h1>
        <p className="boot__text">
          {brokenReason ?? '文件内容不是有效的零食数据。'}
        </p>
        <p className="boot__text boot__text--muted">
          原来的文件没有被覆盖。你可以试试从自动备份恢复，或者留档后新建一个空库。
        </p>
        <div className="boot__actions">
          <button type="button" className="btn btn--primary" onClick={() => void recoverFromBackup()}>
            用备份恢复
          </button>
          <button type="button" className="btn btn--outline" onClick={() => void startFresh()}>
            新建空库
          </button>
        </div>
      </div>
    )
  }

  const expired = counts.expired

  return (
    <div className="app">
      <div className="app__shell">
        <StatusBar
          buckets={buckets}
          counts={counts}
          inStock={inStock}
          today={today}
          onPick={(bucket) => patchSettings({ filter: bucket === 'expired' ? 'expired' : 'expiring' })}
        />

        <div className="app__body">
          <Sidebar
            counts={counts}
            inStock={inStock}
            stats={stats}
            byCategory={byCategory}
            range={settings.statsRange}
            onRangeChange={(range: StatsRange) => patchSettings({ statsRange: range })}
            onOpenSettings={() => setDialog({ kind: 'settings' })}
            onExport={() => void handleExport()}
            onImport={() => void handleImport()}
            onRevealDir={() => void handleRevealDir()}
            busy={busy}
          />

          <main className="app__main">
            <EntryList
              entries={data.entries}
              today={today}
              warnDays={settings.warnDays}
              filter={settings.filter}
              sort={settings.sort}
              onFilter={(filter: ListFilter) => patchSettings({ filter })}
              onSort={(sort) => patchSettings({ sort })}
              onAdd={() => openCreate('pack')}
              onAddBox={() => openCreate('box')}
              onEdit={(entry) => setDialog({ kind: 'edit', entry })}
              onConsume={handleConsume}
              onUndoEat={handleUndoEat}
              onAddPack={handleAddPack}
              onDelete={(entry) => setDialog({ kind: 'confirmDelete', entry })}
            />
          </main>
        </div>

        <SaveBar savePhase={savePhase} saveError={saveError} expired={expired} onFlush={() => void flush()} />
      </div>

      {dialog.kind === 'create' && (
        <Modal
          title={dialog.mode === 'box' ? '记录一整箱' : '记录一包零食'}
          subtitle={
            dialog.mode === 'box'
              ? '一箱算一条记录，箱里的包日期不一样也没关系'
              : '带 * 的必填'
          }
          onClose={() => cancelCreate(dialog.mode)}
          onDismiss={() => dismissCreate(dialog.mode)}
          size="wide"
        >
          <EntryForm
            editing={null}
            entries={data.entries}
            today={today}
            warnDays={settings.warnDays}
            allowBatches={dialog.mode === 'box'}
            initial={keptDrafts[dialog.mode] ?? null}            onDraftChange={(next) => {
              draftRef.current = next
            }}
            onSubmit={submitDraft}
            onCancel={() => cancelCreate(dialog.mode)}
          />
        </Modal>
      )}

      {dialog.kind === 'edit' && (
        <Modal title="编辑记录" subtitle={dialog.entry.name} onClose={closeDialog} size="wide">
          <EntryForm
            editing={dialog.entry}
            entries={data.entries.filter((entry) => entry.id !== dialog.entry.id)}
            today={today}
            warnDays={settings.warnDays}
            /* 已经拆过批次的整箱记录，编辑时仍要能看见每一批 */
            allowBatches={dialog.entry.isBox || batchesOf(dialog.entry).length > 1}
            onSubmit={submitDraft}
            onCancel={closeDialog}
            onDelete={(entry) => setDialog({ kind: 'confirmDelete', entry })}
          />
        </Modal>
      )}

      {dialog.kind === 'settings' && (
        <SettingsModal
          settings={settings}
          entryCount={data.entries.length}
          dataDir={dataDir}
          onPatch={patchSettings}
          onClose={closeDialog}
          onExport={() => void handleExport()}
          onImport={() => void handleImport()}
          onRevealDir={() => void handleRevealDir()}
          onClearAll={() => void handleClearAll()}
        />
      )}

      {dialog.kind === 'import' && (
        <ImportDialog
          pending={dialog.pending}
          current={data}
          today={today}
          onClose={closeDialog}
          onReplace={(incoming) => void applyImport('replace', incoming)}
          onMerge={(incoming) => void applyImport('merge', incoming)}
        />
      )}

      {dialog.kind === 'confirmDelete' && (
        <Modal
          title="删除这条记录？"
          subtitle={dialog.entry.name}
          onClose={closeDialog}
          size="narrow"
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={closeDialog}>
                取消
              </button>
              <button
                type="button"
                className="btn btn--danger-solid"
                onClick={() => {
                  deleteEntry(dialog.entry.id)
                  setToast(`已删除「${dialog.entry.name}」`)
                  closeDialog()
                }}
              >
                删除
              </button>
            </>
          }
        >
          <p className="settings__text">
            记录会被移除。想留个底的话，可以在设置里先导出备份。
          </p>
        </Modal>
      )}

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  )
}

function SaveBar({
  savePhase,
  saveError,
  expired,
  onFlush,
}: {
  savePhase: string
  saveError: string | null
  expired: number
  onFlush: () => void
}) {
  if (savePhase === 'error') {
    return (
      <div className="savebar savebar--error" role="alert">
        <span>保存失败：{saveError ?? '未知原因'}</span>
        <button type="button" className="btn btn--outline btn--sm" onClick={onFlush}>
          重试
        </button>
      </div>
    )
  }
  if (savePhase === 'saving' || savePhase === 'pending') {
    return (
      <div className="savebar" aria-live="polite">
        <span className="savebar__dot" aria-hidden="true" />
        正在保存…
      </div>
    )
  }
  return (
    <div className="savebar savebar--idle" aria-live="polite">
      已保存到本机
      {expired > 0 && <span className="savebar__warn">· {expired} 件已过期</span>}
    </div>
  )
}

function stamp(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}${pad(now.getSeconds())}`
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return '未知错误'
}

export { statusOf }
