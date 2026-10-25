import { useEffect, useRef, type ReactNode } from 'react'
import { IconClose } from './icons'

interface Props {
  title: string
  subtitle?: string
  /** 明确的取消动作（点「取消」、提交完成）——调用方可以据此丢弃临时内容 */
  onClose: () => void
  /**
   * 「先关上」的动作：点遮罩、右上角 ×、Esc。
   * 表单用它区分「取消」和「先放一边」——后者应当留下已填的内容。
   */
  onDismiss?: () => void
  children: ReactNode
  footer?: ReactNode
  /** wide 用于编辑表单，narrow 用于确认框 */
  size?: 'narrow' | 'normal' | 'wide'
}

/**
 * 模态外壳：焦点圈在框内、Esc 关闭、点遮罩关闭。
 * 用原生 <dialog> 的语义（role + aria-modal），但不依赖 <dialog> 元素，
 * 以免 WebView2 各版本在滚动锁定上的差异。
 */
export function Modal({ title, subtitle, onClose, onDismiss, children, footer, size = 'normal' }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<Element | null>(null)
  const dismiss = onDismiss ?? onClose
  // 用 ref 拿最新的关闭函数：否则每次父组件重渲染都会重建这个 effect，
  // 把焦点抢回第一个输入框（表单打字时会一直丢焦点）
  const dismissRef = useRef(dismiss)
  useEffect(() => {
    dismissRef.current = dismiss
  })

  useEffect(() => {
    restoreRef.current = document.activeElement
    const first = boxRef.current?.querySelector<HTMLElement>(
      'input:not([type=hidden]), textarea, select, button',
    )
    first?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        dismissRef.current()
      }
      if (event.key === 'Tab' && boxRef.current) {
        const focusables = [
          ...boxRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ),
        ].filter((el) => el.offsetParent !== null)
        const firstEl = focusables[0]
        const lastEl = focusables[focusables.length - 1]
        if (!firstEl || !lastEl) return
        if (event.shiftKey && document.activeElement === firstEl) {
          event.preventDefault()
          lastEl.focus()
        } else if (!event.shiftKey && document.activeElement === lastEl) {
          event.preventDefault()
          firstEl.focus()
        }
      }
    }

    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      const back = restoreRef.current
      if (back instanceof HTMLElement) back.focus()
    }
  }, [])

  return (
    <div className="modal" role="presentation">
      <div className="modal__scrim" onClick={dismiss} />
      <div
        ref={boxRef}
        className={`modal__box modal__box--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal__head">
          <div>
            <h2 className="modal__title">{title}</h2>
            {subtitle && <p className="modal__subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={dismiss} aria-label="关闭">
            <IconClose size={16} />
          </button>
        </header>

        <div className="modal__body">{children}</div>

        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>
  )
}
