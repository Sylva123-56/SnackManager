import { useEffect, useState } from 'react'
import type { Entry } from '../domain/types'
import { IconCamera } from './icons'
import { BarcodeScanner } from './scan/BarcodeScanner'

interface Props {
  value: string
  entries: Entry[]
  onChange: (value: string) => void
  /** 条码匹配到历史记录时，用户点一下就回填 */
  onMatch: (entry: Entry) => void
}

/**
 * 条码：输入为主，扫码为可选增强。
 *
 * 扫码按钮只在运行环境真的支持 BarcodeDetector 时才出现——
 * WebView2 在 Windows 上目前没有实现它，所以按钮会自然消失，
 * 而不是给用户一个点了没反应的按钮。
 */
export function BarcodeField({ value, entries, onChange, onMatch }: Props) {
  const [scanning, setScanning] = useState(false)
  const [canScan, setCanScan] = useState(false)

  useEffect(() => {
    setCanScan(typeof window !== 'undefined' && 'BarcodeDetector' in window)
  }, [])

  const match = findMatch(entries, value)

  return (
    <div className="field" data-field="barcode">
      <label className="field__label" htmlFor="entry-barcode">
        条码
        <span className="field__hint">扫不了就手打</span>
      </label>

      <div className="barcode-row">
        <input
          id="entry-barcode"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="tnum"
          placeholder="可不填"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/[^0-9A-Za-z-]/g, ''))}
        />
        {canScan && (
          <button
            type="button"
            className="icon-btn"
            title="用摄像头扫码"
            aria-label="用摄像头扫码"
            onClick={() => setScanning(true)}
          >
            <IconCamera size={15} />
          </button>
        )}
      </div>

      {match && (
        <button type="button" className="barcode-match" onClick={() => onMatch(match)}>
          上次买过「{match.name}」，点这里沿用它的信息
        </button>
      )}

      {scanning && (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onResult={(code) => {
            onChange(code)
            setScanning(false)
          }}
        />
      )}
    </div>
  )
}

function findMatch(entries: Entry[], code: string): Entry | null {
  const trimmed = code.trim()
  if (trimmed.length < 6) return null
  let best: Entry | null = null
  for (const entry of entries) {
    if (entry.barcode !== trimmed) continue
    if (!best || entry.updatedAt > best.updatedAt) best = entry
  }
  return best
}
