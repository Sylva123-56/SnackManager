import { useMemo, useState } from 'react'
import type { AppData } from '../domain/types'
import { mergeData, parseBackup } from '../domain/importExport'
import { rangeStats } from '../domain/stats'
import { Modal } from './Modal'

export interface PendingImport {
  fileName: string
  text: string
  incoming: AppData
}

interface Props {
  pending: PendingImport
  current: AppData
  today: string
  onClose: () => void
  /** 覆盖：先用旧数据留档，再整体换成导入的 */
  onReplace: (incoming: AppData, text: string) => void
  /** 合并：按 id 去重，updatedAt 新的赢 */
  onMerge: (incoming: AppData, text: string) => void
}

/**
 * 导入前的确认页。
 * 不做「悄悄覆盖」：先让人看清导进来的是什么，再决定覆盖还是合并。
 */
export function ImportDialog({ pending, current, today, onClose, onReplace, onMerge }: Props) {
  const [tab, setTab] = useState<'summary' | 'preview'>('summary')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const incomingStats = useMemo(() => rangeStats(pending.incoming.entries, 'all', today), [pending, today])
  const mergedPreview = useMemo(() => mergeData(current, pending.incoming), [current, pending])

  const incomingNames = useMemo(
    () => pending.incoming.entries.slice(0, 6).map((entry) => entry.name),
    [pending],
  )

  const idOverlap = useMemo(() => {
    const ids = new Set(current.entries.map((entry) => entry.id))
    return pending.incoming.entries.filter((entry) => ids.has(entry.id)).length
  }, [current, pending])

  function runReplace() {
    setBusy(true)
    setError(null)
    try {
      onReplace(pending.incoming, pending.text)
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败')
      setBusy(false)
    }
  }

  function runMerge() {
    setBusy(true)
    setError(null)
    try {
      onMerge(pending.incoming, pending.text)
    } catch (err) {
      setError(err instanceof Error ? err.message : '导入失败')
      setBusy(false)
    }
  }

  return (
    <Modal
      title="导入备份"
      subtitle={pending.fileName}
      onClose={onClose}
      size="normal"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            取消
          </button>
          <div className="import-foot">
            <button type="button" className="btn btn--outline" onClick={runMerge} disabled={busy}>
              合并进来
            </button>
            <button type="button" className="btn btn--primary" onClick={runReplace} disabled={busy}>
              全部替换
            </button>
          </div>
        </>
      }
    >
      <div className="tabs tabs--inline" role="tablist" aria-label="导入信息">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'summary'}
          className={`tabs__item${tab === 'summary' ? ' is-active' : ''}`}
          onClick={() => setTab('summary')}
        >
          概览
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'preview'}
          className={`tabs__item${tab === 'preview' ? ' is-active' : ''}`}
          onClick={() => setTab('preview')}
        >
          内容预览
        </button>
      </div>

      {tab === 'summary' ? (
        <div className="import-summary">
          <p className="settings__text">
            这个备份里有 <strong className="tnum">{pending.incoming.entries.length}</strong> 条记录、
            <strong className="tnum">{incomingStats.packages}</strong> 包零食，
            而你现在库里有 <strong className="tnum">{current.entries.length}</strong> 条。
          </p>

          {incomingNames.length > 0 && (
            <p className="import-names">
              比如：{incomingNames.join('、')}
              {pending.incoming.entries.length > incomingNames.length ? '……' : ''}
            </p>
          )}

          <dl className="import-compare">
            <div>
              <dt>全部替换</dt>
              <dd>
                现在的 {current.entries.length} 条会被换掉
                <span className="import-compare__note">（替换前会自动留一份带时间戳的备份）</span>
              </dd>
            </div>
            <div>
              <dt>合并进来</dt>
              <dd>
                新增 {mergedPreview.added} 条、更新 {mergedPreview.updated} 条、保留 {mergedPreview.kept} 条
                {idOverlap > 0 && (
                  <span className="import-compare__note">（{idOverlap} 条同 id，取修改时间较新的）</span>
                )}
              </dd>
            </div>
          </dl>

          <p className="settings__text settings__text--muted">
            你的设置（临期天数、主题、排序）不会被导入数据覆盖。
          </p>
        </div>
      ) : (
        <ul className="import-list">
          {pending.incoming.entries.slice(0, 40).map((entry) => (
            <li key={entry.id} className="import-list__row">
              <span aria-hidden="true">{entry.emoji}</span>
              <span className="import-list__name">{entry.name}</span>
              <span className="tnum import-list__meta">
                {entry.remaining}/{entry.quantity} 包
              </span>
              <span className="tnum import-list__meta">{entry.expiryDate}</span>
            </li>
          ))}
          {pending.incoming.entries.length > 40 && (
            <li className="import-list__more">还有 {pending.incoming.entries.length - 40} 条没列出</li>
          )}
        </ul>
      )}

      {error && <p className="field__error">{error}</p>}
    </Modal>
  )
}

/** 读取并解析导入文件，抛错则在调用处提示 */
export function readImportFile(text: string): AppData {
  const { data } = parseBackup(text)
  return data
}
