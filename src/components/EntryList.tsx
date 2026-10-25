import { useEffect, useMemo, useRef, useState } from 'react'
import { FILTER_LABELS, SORT_LABELS } from '../domain/list'
import { selectEntries } from '../domain/list'
import { countByStatus } from '../domain/expiry'
import type { Entry, ListFilter, SortKey } from '../domain/types'
import { loadImage } from '../state/backend'
import { EntryRow } from './EntryRow'
import { IconArchive, IconPlus, IconSearch } from './icons'

interface Props {
  entries: Entry[]
  today: string
  warnDays: number
  filter: ListFilter
  sort: SortKey
  onFilter: (filter: ListFilter) => void
  onSort: (sort: SortKey) => void
  onAdd: () => void
  /** 一整箱：箱里可能有生产日期不同的几层 */
  onAddBox: () => void
  onEdit: (entry: Entry) => void
  onConsume: (entry: Entry, amount: number) => void
  onUndoEat: (entry: Entry) => void
  onAddPack: (entry: Entry) => void
  onDelete: (entry: Entry) => void
}

const FILTERS: ListFilter[] = ['all', 'instock', 'expiring', 'expired', 'finished']
const SORTS: SortKey[] = ['expiry', 'purchasedAt', 'name']

export function EntryList({
  entries,
  today,
  warnDays,
  filter,
  sort,
  onFilter,
  onSort,
  onAdd,
  onAddBox,
  onEdit,
  onConsume,
  onUndoEat,
  onAddPack,
  onDelete,
}: Props) {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const counts = useMemo(() => countByStatus(entries, today, warnDays), [entries, today, warnDays])
  const visible = useMemo(
    () => selectEntries(entries, { filter, sort, today, warnDays, query }),
    [entries, filter, sort, today, warnDays, query],
  )

  // 图片地址缓存：同一条记录只读一次磁盘
  const [images, setImages] = useState<Record<string, string>>({})
  useEffect(() => {
    let cancelled = false
    const missing = entries.filter((e) => e.imageFile && !(e.imageFile in images))
    if (missing.length === 0) return
    void (async () => {
      const next: Record<string, string> = {}
      for (const entry of missing) {
        if (!entry.imageFile) continue
        try {
          const url = await loadImage(entry.imageFile)
          if (url) next[entry.imageFile] = url
        } catch {
          /* 图片丢了不影响列表 */
        }
      }
      if (!cancelled && Object.keys(next).length > 0) {
        setImages((prev) => ({ ...prev, ...next }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [entries, images])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const countOf = (key: ListFilter): number => {
    if (key === 'all') return counts.expired + counts.expiring + counts.ok + counts.finished
    if (key === 'instock') return counts.expired + counts.expiring + counts.ok
    if (key === 'expiring') return counts.expiring
    if (key === 'expired') return counts.expired
    return counts.finished
  }

  return (
    <section className="list-panel" aria-label="零食列表">
      <div className="list-panel__toolbar">
        <div className="tabs" role="tablist" aria-label="筛选">
          {FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={`tabs__item${filter === key ? ' is-active' : ''}${
                key === 'expired' && counts.expired > 0 ? ' tabs__item--alert' : ''
              }`}
              onClick={() => onFilter(key)}
            >
              {FILTER_LABELS[key]}
              <span className="tabs__count tnum">{countOf(key)}</span>
            </button>
          ))}
        </div>

        <div className="list-panel__tools">
          <div className="search">
            <IconSearch size={14} />
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="搜索名称、品牌、备注"
              aria-label="搜索零食"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setQuery('')
                  event.currentTarget.blur()
                }
              }}
            />
          </div>

          <label className="sort-select">
            <span className="sr-only">排序方式</span>
            <select value={sort} onChange={(event) => onSort(event.target.value as SortKey)}>
              {SORTS.map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="btn btn--primary btn--sm" onClick={onAdd}>
            <IconPlus size={14} />
            记录零食
            <kbd>Ctrl N</kbd>
          </button>

          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={onAddBox}
            title="一整箱，箱里的包生产日期可能不一样"
          >
            <IconArchive size={14} />
            记录整箱
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          hasAny={entries.length > 0}
          filter={filter}
          query={query}
          onAdd={onAdd}
          onClear={() => {
            setQuery('')
            onFilter('all')
          }}
        />
      ) : (
        <ul className="rows">
          {visible.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              today={today}
              warnDays={warnDays}
              imageUrl={entry.imageFile ? images[entry.imageFile] ?? null : null}
              onEdit={onEdit}
              onConsume={onConsume}
              onUndoEat={onUndoEat}
              onAddPack={onAddPack}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function EmptyState({
  hasAny,
  filter,
  query,
  onAdd,
  onClear,
}: {
  hasAny: boolean
  filter: ListFilter
  query: string
  onAdd: () => void
  onClear: () => void
}) {
  if (!hasAny) {
    return (
      <div className="empty">
        <span className="empty__art" aria-hidden="true">
          🍪
        </span>
        <h3 className="empty__title">零食柜还是空的</h3>
        <p className="empty__text">
          记下第一包零食，之后它会自己提醒你什么时候该吃、什么时候过期。
        </p>
        <button type="button" className="btn btn--primary" onClick={onAdd}>
          <IconPlus size={15} />
          记录第一包零食
        </button>
      </div>
    )
  }

  if (query.trim() !== '') {
    return (
      <div className="empty empty--compact">
        <h3 className="empty__title">没有匹配「{query.trim()}」的零食</h3>
        <button type="button" className="btn btn--outline btn--sm" onClick={onClear}>
          清空搜索
        </button>
      </div>
    )
  }

  return (
    <div className="empty empty--compact">
      <h3 className="empty__title">这里暂时没有东西</h3>
      <p className="empty__text">
        {filter === 'expired'
          ? '没有过期的零食，保持住。'
          : filter === 'expiring'
            ? '近期没有要到期的零食。'
            : filter === 'finished'
              ? '还没有吃完的零食。'
              : '换个筛选看看。'}
      </p>
      <button type="button" className="btn btn--outline btn--sm" onClick={onClear}>
        看全部
      </button>
    </div>
  )
}
