import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CATEGORIES, SHELF_LIFE_UNITS, categoryMeta } from '../domain/catalog'
import { daysBetweenISO } from '../domain/date'
import type { Entry, ShelfLifeUnit } from '../domain/types'
import {
  draftFromEntry,
  draftFromSuggestion,
  emptyDraft,
  mainQuantity,
  makeDraftExtra,
  previewExpiry,
  shelfLifeExpiry,
  suggestByName,
  validateDraft,
  type Draft,
} from '../state/draft'
import { ImagePick } from './ImagePick'
import { BarcodeField } from './BarcodeField'
import { IconCheck } from './icons'

interface Props {
  /** 传入则处于编辑模式 */
  editing: Entry | null
  entries: Entry[]
  today: string
  warnDays: number
  onSubmit: (draft: Draft) => void
  onCancel: () => void
  onDelete?: (entry: Entry) => void
}

const EMOJI_CHOICES = ['🍿', '🥔', '🍪', '🍬', '🍫', '🥜', '🥤', '🍮', '🍭', '🧁', '🍩', '🍇', '🥨', '🍡']

export function EntryForm({ editing, entries, today, warnDays, onSubmit, onCancel, onDelete }: Props) {
  const [draft, setDraft] = useState<Draft>(() => (editing ? draftFromEntry(editing) : emptyDraft(today)))
  const [touched, setTouched] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestionIndex, setSuggestionIndex] = useState(-1)
  const nameRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const uid = useId()

  useEffect(() => {
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  // ---------- 批次：一整箱里生产日期不一样的那几包 ----------
  function addExtra() {
    setDraft((prev) => ({
      ...prev,
      extraBatches: [...prev.extraBatches, makeDraftExtra(prev.productionDate, '')],
    }))
  }

  function removeExtra(id: string) {
    setDraft((prev) => ({ ...prev, extraBatches: prev.extraBatches.filter((extra) => extra.id !== id) }))
  }

  function setExtra(id: string, key: 'productionDate' | 'quantity', value: string) {
    setDraft((prev) => ({
      ...prev,
      extraBatches: prev.extraBatches.map((extra) => (extra.id === id ? { ...extra, [key]: value } : extra)),
    }))
  }

  const errors = useMemo(() => validateDraft(draft), [draft])
  // 推算出来的到期日（只读展示）；手填时为空
  const derived = shelfLifeExpiry(draft)
  const effectiveExpiry = previewExpiry(draft)
  const suggestions = useMemo(
    () => (showSuggestions && !editing ? suggestByName(entries, draft.name) : []),
    [showSuggestions, editing, entries, draft.name],
  )

  const errorCount = Object.keys(errors).length
  type MessageKey =
  | 'name'
  | 'quantity'
  | 'remaining'
  | 'unitPrice'
  | 'purchasedAt'
  | 'productionDate'
  | 'shelfLifeValue'
  | 'expiryDate'
  | 'extra'

const showError = (key: MessageKey): string | undefined => (touched ? errors[key] : undefined)

  function submit() {
    setTouched(true)
    const errs = validateDraft(draft)
    if (Object.keys(errs).length > 0) {
      const firstKey = Object.keys(errs)[0]
      const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${firstKey}"]`)
      el?.focus()
      return
    }
    onSubmit(draft)
  }

  function applySuggestion(entry: Entry) {
    setDraft((prev) => draftFromSuggestion(prev, entry))
    setShowSuggestions(false)
    setSuggestionIndex(-1)
  }

  function onNameKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSuggestionIndex((i) => (i + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSuggestionIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (event.key === 'Enter' && suggestionIndex >= 0) {
      const target = suggestions[suggestionIndex]
      if (target) {
        event.preventDefault()
        applySuggestion(target.entry)
      }
    } else if (event.key === 'Escape') {
      setShowSuggestions(false)
      setSuggestionIndex(-1)
    }
  }

  const category = categoryMeta(draft.category)

  return (
    <form
      ref={formRef}
      className="entry-form"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          submit()
        }
      }}
      noValidate
    >
      <div className="entry-form__body">
        {/* ---------- 名称 + 品牌 ---------- */}
        <div className="form-row form-row--name">
          <div className="field" data-field="name" style={{ position: 'relative' }}>
            <label className="field__label" htmlFor={`${uid}-name`}>
              零食名称
              <span className="req">必填</span>
            </label>
            <input
              ref={nameRef}
              id={`${uid}-name`}
              type="text"
              value={draft.name}
              autoComplete="off"
              placeholder="例如：乐事薯片 黄瓜味"
              aria-invalid={showError('name') ? 'true' : undefined}
              onChange={(event) => {
                set('name', event.target.value)
                setShowSuggestions(true)
                setSuggestionIndex(-1)
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
              onKeyDown={onNameKeyDown}
            />
            {showError('name') && <span className="field__error">{showError('name')}</span>}
            {suggestions.length > 0 && (
              <ul className="suggest" role="listbox" aria-label="历史记录">
                {suggestions.map((item, index) => (
                  <li key={item.entry.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === suggestionIndex}
                      className={`suggest__item${index === suggestionIndex ? ' is-active' : ''}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applySuggestion(item.entry)}
                    >
                      <span className="suggest__emoji">{item.entry.emoji}</span>
                      <span className="suggest__name">{item.displayName}</span>
                      {item.entry.brand && <span className="suggest__meta">{item.entry.brand}</span>}
                      <span className="suggest__meta tnum">
                        {item.entry.shelfLifeValue ? `保质 ${item.entry.shelfLifeValue}${unitShort(item.entry.shelfLifeUnit)}` : '—'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="field">
            <label className="field__label" htmlFor={`${uid}-brand`}>
              品牌
            </label>
            <input
              id={`${uid}-brand`}
              type="text"
              value={draft.brand}
              autoComplete="off"
              placeholder="可不填"
              onChange={(event) => set('brand', event.target.value)}
            />
          </div>
        </div>

        {/* ---------- 外观 ---------- */}
        <div className="form-row">
          <div className="field">
            <span className="field__label">外观</span>
            <div className="appearance">
              <ImagePick
                imageFile={draft.imageFile}
                fallbackEmoji={draft.emoji || category.emoji}
                onChange={(file) => set('imageFile', file)}
              />
              <div className="emoji-row" role="group" aria-label="选择图标">
                {EMOJI_CHOICES.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={`emoji-btn${draft.emoji === emoji && !draft.imageFile ? ' is-active' : ''}`}
                    aria-pressed={draft.emoji === emoji && !draft.imageFile}
                    onClick={() => {
                      set('emoji', emoji)
                      set('imageFile', null)
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ---------- 分类 ---------- */}
        <div className="field">
          <span className="field__label">分类</span>
          <div className="cat-row" role="radiogroup" aria-label="分类">
            {CATEGORIES.map((item) => (
              <button
                key={item.key}
                type="button"
                role="radio"
                aria-checked={draft.category === item.key}
                className={`cat-btn${draft.category === item.key ? ' is-active' : ''}`}
                onClick={() => {
                  set('category', item.key)
                  // 换分类时，如果图标还是上一个分类的默认值，跟着换
                  const prevDefault = categoryMeta(draft.category).emoji
                  if (draft.emoji === prevDefault || draft.emoji === '') set('emoji', item.emoji)
                }}
              >
                <span aria-hidden="true">{item.emoji}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* ---------- 数量 / 单价 / 购买日 ---------- */}
        <div className="form-row form-row--3">
          <div className="field" data-field="quantity">
            <label className="field__label" htmlFor={`${uid}-qty`}>
              购买包数
            </label>
            <input
              id={`${uid}-qty`}
              type="text"
              inputMode="numeric"
              className="tnum"
              value={draft.quantity}
              aria-invalid={showError('quantity') ? 'true' : undefined}
              onChange={(event) => {
                const next = event.target.value.replace(/[^\d]/g, '')
                setDraft((prev) => ({
                  ...prev,
                  quantity: next,
                  // 新填总包数时，剩余包数跟随（除非用户已单独改过）
                  remaining: prev.remaining === prev.quantity ? next : prev.remaining,
                }))
              }}
            />
            {showError('quantity') && <span className="field__error">{showError('quantity')}</span>}
          </div>

          <div className="field" data-field="remaining">
            <label className="field__label" htmlFor={`${uid}-remain`}>
              剩余包数
            </label>
            <input
              id={`${uid}-remain`}
              type="text"
              inputMode="numeric"
              className="tnum"
              value={draft.remaining}
              aria-invalid={showError('remaining') ? 'true' : undefined}
              onChange={(event) => set('remaining', event.target.value.replace(/[^\d]/g, ''))}
            />
            {showError('remaining') && <span className="field__error">{showError('remaining')}</span>}
          </div>

          <div className="field" data-field="unitPrice">
            <label className="field__label" htmlFor={`${uid}-price`}>
              单价（元/包）
            </label>
            <input
              id={`${uid}-price`}
              type="text"
              inputMode="decimal"
              className="tnum"
              placeholder="可不填"
              value={draft.unitPrice}
              aria-invalid={showError('unitPrice') ? 'true' : undefined}
              onChange={(event) => set('unitPrice', event.target.value.replace(/[^\d.]/g, ''))}
            />
            {showError('unitPrice') && <span className="field__error">{showError('unitPrice')}</span>}
          </div>
        </div>

        <div className="form-row">
          <div className="field" data-field="purchasedAt">
            <label className="field__label" htmlFor={`${uid}-bought`}>
              购买日期
            </label>
            <input
              id={`${uid}-bought`}
              type="date"
              value={draft.purchasedAt}
              max={today}
              aria-invalid={showError('purchasedAt') ? 'true' : undefined}
              onChange={(event) => set('purchasedAt', event.target.value)}
            />
            {showError('purchasedAt') && <span className="field__error">{showError('purchasedAt')}</span>}
          </div>

          <div className="field">
            <BarcodeField
              value={draft.barcode}
              entries={entries}
              onChange={(value) => set('barcode', value)}
              onMatch={(entry) => applySuggestion(entry)}
            />
          </div>
        </div>

        {/* ---------- 保质期 ---------- */}
        <fieldset className="expiry-group">
          <legend className="expiry-group__legend">保质期</legend>

          <div className="form-row form-row--3">
            <div className="field" data-field="productionDate">
              <label className="field__label" htmlFor={`${uid}-prod`}>
                生产日期
              </label>
              <input
                id={`${uid}-prod`}
                type="date"
                value={draft.productionDate}
                max={today}
                aria-invalid={showError('productionDate') ? 'true' : undefined}
                onChange={(event) => set('productionDate', event.target.value)}
              />
              {showError('productionDate') && <span className="field__error">{showError('productionDate')}</span>}
            </div>

            <div className="field" data-field="shelfLifeValue">
              <label className="field__label" htmlFor={`${uid}-shelf`}>
                保质期长度
              </label>
              <input
                id={`${uid}-shelf`}
                type="text"
                inputMode="numeric"
                className="tnum"
                placeholder="例如 12"
                value={draft.shelfLifeValue}
                aria-invalid={showError('shelfLifeValue') ? 'true' : undefined}
                onChange={(event) => set('shelfLifeValue', event.target.value.replace(/[^\d]/g, ''))}
              />
              {showError('shelfLifeValue') && <span className="field__error">{showError('shelfLifeValue')}</span>}
            </div>

            <div className="field">
              <label className="field__label" htmlFor={`${uid}-unit`}>
                单位
              </label>
              <select
                id={`${uid}-unit`}
                value={draft.shelfLifeUnit}
                onChange={(event) => set('shelfLifeUnit', event.target.value as ShelfLifeUnit)}
              >
                {SHELF_LIFE_UNITS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ---------- 日期不同的那几包 ---------- */}
          {draft.extraBatches.length > 0 && (
            <div className="batch-list">
              <div className="batch-row batch-row--main">
                <span className="batch-row__tag">主批</span>
                <span className="batch-row__summary">
                  其余 {mainQuantity(draft) ?? '?'} 包 · 生产日期用上面这个
                </span>
              </div>
              {draft.extraBatches.map((extra, index) => {
                const rowError = touched ? errors.extraRows?.[extra.id] : undefined
                return (
                  <div className="batch-row" key={extra.id}>
                    <span className="batch-row__tag">另 {index + 1}</span>
                    <input
                      type="date"
                      className="batch-row__date tnum"
                      max={today}
                      value={extra.productionDate}
                      aria-label={`第 ${index + 1} 批生产日期`}
                      aria-invalid={rowError ? 'true' : undefined}
                      onChange={(event) => setExtra(extra.id, 'productionDate', event.target.value)}
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      className="batch-row__qty tnum"
                      placeholder="0"
                      value={extra.quantity}
                      aria-label={`第 ${index + 1} 批包数`}
                      aria-invalid={rowError ? 'true' : undefined}
                      onChange={(event) => setExtra(extra.id, 'quantity', event.target.value.replace(/[^\d]/g, ''))}
                    />
                    <span className="batch-row__unit">包</span>
                    <button
                      type="button"
                      className="icon-btn batch-row__remove"
                      onClick={() => removeExtra(extra.id)}
                      title="删掉这一批"
                      aria-label={`删掉第 ${index + 1} 批`}
                    >
                      ×
                    </button>
                    {rowError && <span className="field__error batch-row__error">{rowError}</span>}
                  </div>
                )
              })}
              {showError('extra') && <span className="field__error">{showError('extra')}</span>}
            </div>
          )}

          <button type="button" className="batch-add" onClick={addExtra}>
            <span className="batch-add__mark" aria-hidden="true">
              +
            </span>
            {draft.extraBatches.length === 0 ? '有些包生产日期不一样' : '再加一批日期不同的'}
          </button>

          <div className="form-row">
            <div className="field" data-field="expiryDate">
              <label className="field__label" htmlFor={`${uid}-exp`}>
                到期日
                {derived && (
                  <span className="field__hint">
                    {draft.extraBatches.length > 0 ? '（按最早到期的那批算）' : '（由生产日期+保质期自动算出）'}
                  </span>
                )}
              </label>
              <input
                id={`${uid}-exp`}
                type="date"
                value={derived ?? draft.expiryDate}
                readOnly={Boolean(derived)}
                aria-readonly={derived ? 'true' : undefined}
                className={derived ? 'is-derived tnum' : 'tnum'}
                aria-invalid={showError('expiryDate') ? 'true' : undefined}
                onChange={(event) => set('expiryDate', event.target.value)}
              />
              {showError('expiryDate') && <span className="field__error">{showError('expiryDate')}</span>}
            </div>

            <div className="field field--preview">
              <span className="field__label">状态预览</span>
              <ExpiryPreview iso={effectiveExpiry} today={today} warnDays={warnDays} />
            </div>
          </div>
        </fieldset>

        {/* ---------- 备注 ---------- */}
        <div className="field">
          <label className="field__label" htmlFor={`${uid}-note`}>
            备注
          </label>
          <textarea
            id={`${uid}-note`}
            value={draft.note}
            placeholder="存放位置、口味、想什么时候吃…（可不填）"
            onChange={(event) => set('note', event.target.value)}
          />
        </div>
      </div>

      <footer className="entry-form__footer">
        {editing && onDelete && (
          <button type="button" className="btn btn--danger btn--sm" onClick={() => onDelete(editing)}>
            删除这条记录
          </button>
        )}
        <div className="entry-form__foot-right">
          {touched && errorCount > 0 && (
            <span className="field__error">还有 {errorCount} 处没填对</span>
          )}
          <button type="button" className="btn btn--outline" onClick={onCancel}>
            取消
          </button>
          <button type="submit" className="btn btn--primary">
            <IconCheck size={15} />
            {editing ? '保存修改' : '加入库存'}
          </button>
        </div>
      </footer>
    </form>
  )
}

function unitShort(unit: ShelfLifeUnit): string {
  if (unit === 'day') return '天'
  if (unit === 'year') return '年'
  return '个月'
}

/**
 * 状态预览：只认到期日，与列表里的判定同一套口径，
 * 免得表单说「还新鲜」、列表说「已过期」。
 */
function ExpiryPreview({ iso, today, warnDays }: { iso: string | null; today: string; warnDays: number }) {
  if (!iso) return <span className="preview-hint__muted">填完上面就知道了</span>
  const diff = daysBetweenISO(today, iso)
  if (diff === null) return <span className="preview-hint__muted">日期不合法</span>
  if (diff < 0) {
    return (
      <span className="chip chip--danger">
        已过期 {Math.abs(diff)} 天
      </span>
    )
  }
  if (diff === 0) return <span className="chip chip--soon">今天到期</span>
  if (diff <= warnDays) {
    return (
      <span className="chip chip--soon">
        还剩 {diff} 天
      </span>
    )
  }
  return <span className="chip chip--ok">还剩 {diff} 天</span>
}

export { EMOJI_CHOICES }
