import { useEffect, useRef, useState } from 'react'
import { isDesktop, loadImage, saveImage } from '../state/backend'
import { invoke } from '@tauri-apps/api/core'
import { IconClose, IconImage } from './icons'

interface Props {
  imageFile: string | null
  fallbackEmoji: string
  onChange: (fileName: string | null) => void
}

const ACCEPT = ['png', 'jpg', 'jpeg', 'webp', 'gif']
const MAX_BYTES = 10 * 1024 * 1024

/**
 * 图片选取。
 * 桌面端走系统文件对话框 + Rust 拷贝（避免把大图塞进 JSON）；
 * 浏览器预览模式退化为 <input type=file> + localStorage。
 * 失败一律降级为「不设图片」，不吃掉已填的表单内容。
 */
export function ImagePick({ imageFile, fallbackEmoji, onChange }: Props) {
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    if (!imageFile) {
      setPreview(null)
      return
    }
    void (async () => {
      try {
        const url = await loadImage(imageFile)
        if (!cancelled) setPreview(url)
      } catch {
        if (!cancelled) setPreview(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [imageFile])

  async function pickDesktop() {
    setError(null)
    setBusy(true)
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const picked = await open({
        multiple: false,
        directory: false,
        title: '选择零食图片',
        filters: [{ name: '图片', extensions: ACCEPT }],
      })
      if (typeof picked !== 'string') return
      const ext = (picked.split('.').pop() ?? 'png').toLowerCase()
      if (!ACCEPT.includes(ext)) {
        setError('只支持 PNG / JPG / WebP / GIF')
        return
      }
      const fileName = `${newId()}.${ext === 'jpeg' ? 'jpg' : ext}`
      try {
        const saved = await invoke<string>('copy_image', { source: picked, fileName })
        onChange(saved)
      } catch (err) {
        setError(errorText(err))
      }
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function pickBrowser(file: File) {
    setError(null)
    if (file.size > MAX_BYTES) {
      setError('图片不要超过 10MB')
      return
    }
    setBusy(true)
    try {
      const ext = (file.name.split('.').pop() ?? 'png').toLowerCase()
      if (!ACCEPT.includes(ext)) {
        setError('只支持 PNG / JPG / WebP / GIF')
        return
      }
      const bytes = new Uint8Array(await file.arrayBuffer())
      const fileName = `${newId()}.${ext === 'jpeg' ? 'jpg' : ext}`
      const saved = await saveImage(fileName, bytes)
      onChange(saved)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="image-pick">
      <button
        type="button"
        className="image-pick__frame"
        onClick={() => (isDesktop ? void pickDesktop() : inputRef.current?.click())}
        aria-label={imageFile ? '更换图片' : '添加图片'}
        disabled={busy}
      >
        {preview ? (
          <img className="image-pick__img" src={preview} alt="" />
        ) : (
          <span className="image-pick__placeholder" aria-hidden="true">
            {fallbackEmoji}
          </span>
        )}
        <span className="image-pick__badge" aria-hidden="true">
          <IconImage size={12} />
        </span>
      </button>

      {imageFile && (
        <button
          type="button"
          className="icon-btn"
          onClick={() => onChange(null)}
          title="移除图片"
          aria-label="移除图片"
        >
          <IconClose size={13} />
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.currentTarget.value = ''
          if (file) void pickBrowser(file)
        }}
      />

      {error && <span className="field__error">{error}</span>}
    </div>
  )
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return '图片处理失败'
}
