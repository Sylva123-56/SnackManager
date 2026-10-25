import { useEffect, useState } from 'react'
import type { Settings, ThemeMode } from '../domain/types'
import { Modal } from './Modal'

interface Props {
  settings: Settings
  entryCount: number
  dataDir: string
  onPatch: (patch: Partial<Settings>) => void
  onClose: () => void
  onExport: () => void
  onImport: () => void
  onRevealDir: () => void
  onClearAll: () => void
}

const THEMES: { key: ThemeMode; label: string; hint: string }[] = [
  { key: 'auto', label: '跟随系统', hint: '系统换深色，这里也跟着换' },
  { key: 'light', label: '浅色', hint: '纸袋奶白' },
  { key: 'dark', label: '深色', hint: '夜里的厨房' },
]

const WARN_PRESETS = [3, 7, 14, 30]

export function SettingsModal({
  settings,
  entryCount,
  dataDir,
  onPatch,
  onClose,
  onExport,
  onImport,
  onRevealDir,
  onClearAll,
}: Props) {
  const [confirmClear, setConfirmClear] = useState(false)
  const [warnInput, setWarnInput] = useState(String(settings.warnDays))

  useEffect(() => {
    setWarnInput(String(settings.warnDays))
  }, [settings.warnDays])

  function commitWarn(raw: string) {
    const n = Number(raw)
    if (!Number.isFinite(n) || raw.trim() === '') {
      setWarnInput(String(settings.warnDays))
      return
    }
    const clamped = Math.min(365, Math.max(0, Math.trunc(n)))
    onPatch({ warnDays: clamped })
    setWarnInput(String(clamped))
  }

  return (
    <Modal title="设置" onClose={onClose} size="normal">
      <div className="settings">
        <section className="settings__section">
          <h3 className="settings__title">临期提醒</h3>
          <p className="settings__text">
            距离到期还有几天时，把它标成「临期」。设为 0 表示只在到期当天提醒。
          </p>
          <div className="settings__row">
            <div className="warn-presets" role="group" aria-label="临期天数快捷选择">
              {WARN_PRESETS.map((days) => (
                <button
                  key={days}
                  type="button"
                  className={`warn-preset${settings.warnDays === days ? ' is-active' : ''}`}
                  onClick={() => onPatch({ warnDays: days })}
                >
                  {days} 天
                </button>
              ))}
            </div>
            <div className="warn-custom">
              <input
                type="text"
                inputMode="numeric"
                className="tnum"
                aria-label="自定义临期天数"
                value={warnInput}
                onChange={(event) => setWarnInput(event.target.value.replace(/[^\d]/g, ''))}
                onBlur={(event) => commitWarn(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitWarn(event.currentTarget.value)
                  }
                }}
              />
              <span className="settings__unit">天</span>
            </div>
          </div>
        </section>

        <section className="settings__section">
          <h3 className="settings__title">外观</h3>
          <div className="theme-row" role="radiogroup" aria-label="主题">
            {THEMES.map((item) => (
              <button
                key={item.key}
                type="button"
                role="radio"
                aria-checked={settings.theme === item.key}
                className={`theme-card${settings.theme === item.key ? ' is-active' : ''}`}
                onClick={() => onPatch({ theme: item.key })}
              >
                <span className={`theme-card__swatch theme-card__swatch--${item.key}`} aria-hidden="true" />
                <span className="theme-card__label">{item.label}</span>
                <span className="theme-card__hint">{item.hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="settings__section">
          <h3 className="settings__title">数据</h3>
          <p className="settings__text">
            数据存在本机的这一个 JSON 文件里，不联网、不上传。换电脑时导出再导入即可。
          </p>
          <div className="settings__row">
            <button type="button" className="btn btn--outline btn--sm" onClick={onExport}>
              导出备份
            </button>
            <button type="button" className="btn btn--outline btn--sm" onClick={onImport}>
              导入备份
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onRevealDir}>
              打开文件夹
            </button>
          </div>
          <p className="settings__path tnum" title={dataDir}>
            {dataDir}
          </p>
        </section>

        <section className="settings__section settings__section--danger">
          <h3 className="settings__title">清空</h3>
          {confirmClear ? (
            <>
              <p className="settings__text">
                将删除全部 {entryCount} 条记录，并先自动留一份带时间戳的备份。这一步不可撤销。
              </p>
              <div className="settings__row">
                <button type="button" className="btn btn--danger btn--sm" onClick={onClearAll}>
                  确认清空
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmClear(false)}>
                  我再想想
                </button>
              </div>
            </>
          ) : (
            <div className="settings__row">
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={() => setConfirmClear(true)}
                disabled={entryCount === 0}
              >
                清空所有记录
              </button>
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}
