import { batchStocks } from '../domain/batches'
import { categoryLabel } from '../domain/catalog'
import { formatCN } from '../domain/date'
import { expiryHint, statusOf } from '../domain/expiry'
import type { Entry, ExpiryStatus } from '../domain/types'
import { formatPrice } from '../format'
import { IconEdit, IconMinus, IconPlus, IconTrash } from './icons'

interface Props {
  entry: Entry
  today: string
  warnDays: number
  imageUrl: string | null
  onEdit: (entry: Entry) => void
  onConsume: (entry: Entry, amount: number) => void
  /** 撤销一包：把刚刚吃掉的那包加回来，不改变批次 */
  onUndoEat: (entry: Entry) => void
  /** 再进一包：真的多买一包，算进最晚到期的那批 */
  onAddPack: (entry: Entry) => void
  onDelete: (entry: Entry) => void
}

const STATUS_TEXT: Record<ExpiryStatus, string> = {
  expired: '已过期',
  expiring: '临期',
  ok: '正常',
  finished: '已吃完',
}

export function EntryRow({ entry, today, warnDays, imageUrl, onEdit, onConsume, onUndoEat, onAddPack, onDelete }: Props) {
  const status = statusOf(entry, today, warnDays)
  const remaining = entry.remaining
  const finished = remaining <= 0
  const progress = entry.quantity > 0 ? remaining / entry.quantity : 0
  // 吃了一些但没吃完 → 加号是撤销一包；满箱或已吃完 → 加号是再进一包
  const addingPacks = finished || remaining >= entry.quantity
  const plusLabel = addingPacks ? '再进一包' : '加回一包'
  const onPlus = () => (addingPacks ? onAddPack(entry) : onUndoEat(entry))
  const stocks = batchStocks(entry)

  return (
    <li className={`row row--${status}`}>
      <div className="row__thumb" aria-hidden="true">
        {imageUrl ? (
          <img src={imageUrl} alt="" loading="lazy" />
        ) : (
          <span className="row__emoji">{entry.emoji}</span>
        )}
      </div>

      <div className="row__main">
        <div className="row__title">
          <button type="button" className="row__name" onClick={() => onEdit(entry)}>
            {entry.name}
          </button>
          <span className={`chip chip--${chipTone(status)}`}>{STATUS_TEXT[status]}</span>
        </div>

        <div className="row__meta">
          <span>{categoryLabel(entry.category)}</span>
          {entry.brand && <span className="row__brand">{entry.brand}</span>}
          {entry.unitPrice !== null && <span className="tnum">{formatPrice(entry.unitPrice)}/包</span>}
          <span className="tnum">买于 {formatCN(entry.purchasedAt, today)}</span>
        </div>

        <div className="row__expiry">
          <span className="tnum">到期 {formatCN(entry.expiryDate, today)}</span>
          <span className={`row__hint row__hint--${chipTone(status)}`}>{expiryHint(entry, today)}</span>
          {entry.note && <span className="row__note" title={entry.note}>{entry.note}</span>}
        </div>

        {/* 一箱里日期不一样的几包：逐批写清楚，谁快到期一眼看见 */}
        {stocks.length > 1 && (
          <ul className="row__batches" aria-label="各批到期日">
            {stocks.map((stock, index) => (
              <li
                key={stock.batch.id}
                className={`batch-tag${stock.stock > 0 ? '' : ' batch-tag--empty'}${
                  stock.isEarliest && stock.stock > 0 ? ' batch-tag--urgent' : ''
                }`}
              >
                <span className="batch-tag__date tnum">{formatCN(stock.batch.expiryDate, today)}</span>
                <span className="batch-tag__stock tnum">
                  {stock.stock}/{stock.quantity}
                </span>
                {index === 0 && <span className="batch-tag__flag">先吃</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="row__stock">
        <div className="stock">
          <button
            type="button"
            className="icon-btn stock__btn"
            onClick={() => onConsume(entry, 1)}
            disabled={finished}
            title="吃掉一包"
            aria-label={`${entry.name} 吃掉一包`}
          >
            <IconMinus size={14} />
          </button>
          <span className="stock__count tnum" aria-live="polite">
            {remaining}
            <span className="stock__total">/{entry.quantity}</span>
          </span>
          <button
            type="button"
            className="icon-btn stock__btn"
            onClick={onPlus}
            title={plusLabel}
            aria-label={`${entry.name} ${plusLabel}`}
          >
            <IconPlus size={14} />
          </button>
        </div>
        <div className="stock__bar" aria-hidden="true">
          <span
            className={`stock__fill stock__fill--${chipTone(status)}`}
            style={{ width: `${Math.max(finished ? 0 : 4, progress * 100)}%` }}
          />
        </div>
      </div>

      <div className="row__actions">
        <button type="button" className="icon-btn" onClick={() => onEdit(entry)} title="编辑" aria-label={`编辑 ${entry.name}`}>
          <IconEdit size={14} />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--danger"
          onClick={() => onDelete(entry)}
          title="删除"
          aria-label={`删除 ${entry.name}`}
        >
          <IconTrash size={14} />
        </button>
      </div>
    </li>
  )
}

function chipTone(status: ExpiryStatus): 'ok' | 'soon' | 'danger' | 'done' {
  if (status === 'expired') return 'danger'
  if (status === 'expiring') return 'soon'
  if (status === 'finished') return 'done'
  return 'ok'
}

export { STATUS_TEXT, chipTone }
