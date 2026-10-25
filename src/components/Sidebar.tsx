import { categoryLabel } from '../domain/catalog'
import type { StatusCounts } from '../domain/expiry'
import { formatSpend } from '../format'
import type { StatsRange } from '../domain/types'
import type { CategorySpend, RangeStats } from '../domain/stats'
import { IconDownload, IconFolder, IconSettings, IconUpload } from './icons'

interface Props {
  /** 按记录条数（款）统计，与列表页签逐行对得上 */
  counts: StatusCounts
  inStock: number
  stats: RangeStats
  byCategory: CategorySpend[]
  range: StatsRange
  onRangeChange: (range: StatsRange) => void
  onOpenSettings: () => void
  onExport: () => void
  onImport: () => void
  onRevealDir: () => void
  busy: boolean
}

const RANGES: { key: StatsRange; label: string }[] = [
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' },
]

/**
 * 左栏：统计 + 范围切换 + 操作入口。
 * 数字用等宽字体，标签用弱色，避免和右栏列表争夺注意力。
 */
export function Sidebar({
  counts,
  inStock,
  stats,
  byCategory,
  range,
  onRangeChange,
  onOpenSettings,
  onExport,
  onImport,
  onRevealDir,
  busy,
}: Props) {
  const maxSpend = byCategory.reduce((max, item) => Math.max(max, item.spend), 0)
  const priced = stats.records > 0 ? Math.round((stats.pricedRecords / stats.records) * 100) : 100

  return (
    <aside className="sidebar">
      <div className="sidebar__scroll">
        <section className="panel">
          <h2 className="panel__title">库存概况</h2>
          <ul className="inventory">
            <li className="inventory__row">
              <span className="inventory__dot inventory__dot--ok" aria-hidden="true" />
              <span className="inventory__label">正常</span>
              <span className="inventory__value tnum">{counts.ok}</span>
            </li>
            <li className="inventory__row">
              <span className="inventory__dot inventory__dot--soon" aria-hidden="true" />
              <span className="inventory__label">临期</span>
              <span className="inventory__value tnum">{counts.expiring}</span>
            </li>
            <li className="inventory__row">
              <span className="inventory__dot inventory__dot--danger" aria-hidden="true" />
              <span className="inventory__label">已过期</span>
              <span className="inventory__value tnum">{counts.expired}</span>
            </li>
            <li className="inventory__row inventory__row--muted">
              <span className="inventory__dot inventory__dot--done" aria-hidden="true" />
              <span className="inventory__label">已吃完</span>
              <span className="inventory__value tnum">{counts.finished}</span>
            </li>
          </ul>
          <p className="panel__footnote">共 {inStock} 件等待吃掉 · 以上按款计</p>
        </section>

        <section className="panel">
          <div className="panel__header">
            <h2 className="panel__title">购买统计</h2>
          </div>

          <div className="segmented" role="tablist" aria-label="统计时间范围">
            {RANGES.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={range === item.key}
                className={`segmented__item${range === item.key ? ' is-active' : ''}`}
                onClick={() => onRangeChange(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <dl className="metrics">
            <div className="metrics__item">
              <dt>购买件数</dt>
              <dd className="tnum">{stats.packages}</dd>
            </div>
            <div className="metrics__item">
              <dt>花费</dt>
              <dd className="tnum">
                <span className="metrics__currency">¥</span>
                {formatSpend(stats.spend)}
              </dd>
            </div>
            <div className="metrics__item">
              <dt>记录条数</dt>
              <dd className="tnum">{stats.records}</dd>
            </div>
          </dl>

          {byCategory.length > 0 ? (
            <ul className="bars" aria-label="分类花费">
              {byCategory.slice(0, 5).map((item) => (
                <li key={item.category} className="bars__row">
                  <span className="bars__label">{categoryLabel(item.category)}</span>
                  <span className="bars__track">
                    <span
                      className="bars__fill"
                      style={{ width: maxSpend > 0 ? `${Math.max(3, (item.spend / maxSpend) * 100)}%` : '3px' }}
                    />
                  </span>
                  <span className="bars__value tnum">{item.spend > 0 ? `¥${formatSpend(item.spend)}` : '—'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel__footnote">这段时间还没有购买记录</p>
          )}

          {priced < 100 && stats.records > 0 && (
            <p className="panel__footnote panel__footnote--warn">
              有 {stats.records - stats.pricedRecords} 条没填单价，花费只统计了填了价格的
            </p>
          )}
        </section>
      </div>

      <footer className="sidebar__footer">
        <button type="button" className="btn btn--ghost btn--block btn--sm" onClick={onOpenSettings}>
          <IconSettings size={14} />
          设置
        </button>
        <div className="sidebar__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onExport} disabled={busy}>
            <IconDownload size={14} />
            导出
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onImport} disabled={busy}>
            <IconUpload size={14} />
            导入
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onRevealDir}
            title="打开数据文件夹"
            aria-label="打开数据文件夹"
          >
            <IconFolder size={15} />
          </button>
        </div>
      </footer>
    </aside>
  )
}
