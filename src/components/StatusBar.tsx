import { formatCN } from '../domain/date'
import type { StatusBuckets } from '../domain/list'
import type { StatusCounts } from '../domain/expiry'

interface Props {
  /** 按剩余包数统计，用于分段条，和主数字同单位 */
  buckets: StatusBuckets
  /** 按记录条数统计，用于「N 款」警示，和列表逐行对得上 */
  counts: StatusCounts
  /** 在库总件数，也是整个界面的主数字 */
  inStock: number
  today: string
  onPick: (bucket: 'expired' | 'expiring') => void
}

/**
 * 顶部横幅：全app唯一的「记忆点」。
 * 一个巨大的在库件数 + 一条按比例分段的货物条。
 * 其余区域刻意保持安静，视觉重心只落在这里。
 *
 * 单位分两种，各自标清楚，避免两处数字打架：
 * - 主数字与分段条用「件」（剩余包数）
 * - 警示胶囊用「款」（记录条数），与列表筛选页签一一对应
 */
export function StatusBar({ buckets, counts, inStock, today, onPick }: Props) {
  const total = buckets.expired + buckets.expiring + buckets.ok + buckets.finished
  const seg = (value: number) => (total > 0 ? Math.max(value > 0 ? 1.5 : 0, (value / total) * 100) : 0)

  const expired = counts.expired
  const expiring = counts.expiring
  const tone = expired > 0 ? 'danger' : expiring > 0 ? 'soon' : 'calm'

  return (
    <header className={`statusbar statusbar--${tone}`}>
      <div className="statusbar__head">
        <div className="statusbar__figure">
          <span className="statusbar__number tnum">{inStock}</span>
          <span className="statusbar__unit">件在库</span>
        </div>

        <div className="statusbar__alerts">
          {expired > 0 && (
            <button type="button" className="alert-pill alert-pill--danger" onClick={() => onPick('expired')}>
              <span className="alert-pill__dot" aria-hidden="true" />
              <span className="tnum">{expired}</span> 款已过期
            </button>
          )}
          {expiring > 0 && (
            <button type="button" className="alert-pill alert-pill--soon" onClick={() => onPick('expiring')}>
              <span className="alert-pill__dot" aria-hidden="true" />
              <span className="tnum">{expiring}</span> 款临期
            </button>
          )}
          {expired === 0 && expiring === 0 && (
            <span className="alert-pill alert-pill--calm">
              <span className="alert-pill__dot" aria-hidden="true" />
              {inStock > 0 ? '全部新鲜' : '柜子空了'}
            </span>
          )}
        </div>

        <time className="statusbar__today tnum" dateTime={today}>
          {formatCN(today)}
        </time>
      </div>

      {total > 0 && (
        <div
          className="statusbar__track"
          role="img"
          aria-label={`过期 ${buckets.expired} 件，临期 ${buckets.expiring} 件，正常 ${buckets.ok} 件，已吃完 ${buckets.finished} 条`}
        >
          {buckets.expired > 0 && (
            <span className="statusbar__seg statusbar__seg--expired" style={{ width: `${seg(buckets.expired)}%` }} />
          )}
          {buckets.expiring > 0 && (
            <span className="statusbar__seg statusbar__seg--expiring" style={{ width: `${seg(buckets.expiring)}%` }} />
          )}
          {buckets.ok > 0 && (
            <span className="statusbar__seg statusbar__seg--ok" style={{ width: `${seg(buckets.ok)}%` }} />
          )}
          {buckets.finished > 0 && (
            <span className="statusbar__seg statusbar__seg--finished" style={{ width: `${seg(buckets.finished)}%` }} />
          )}
        </div>
      )}
    </header>
  )
}
