import { useEffect, useRef, useState } from 'react'
import { IconClose } from '../icons'

interface Props {
  onResult: (code: string) => void
  onClose: () => void
}

/**
 * 摄像头扫码：只用浏览器原生 BarcodeDetector。
 *
 * 为什么不再打包一份 zxing 兜底：WebView2 在 Windows 上根本没有实现
 * BarcodeDetector，而 zxing 未压缩体积是 11.5MB —— 为一个在这台机器上
 * 永远不会进入的分支背上十几兆，和「小巧、启动快」直接冲突。
 * 所以入口本身在 BarcodeField 里按能力检测隐藏，没能力的地方不出现按钮，
 * 由手动输入条码兜底。
 */
export function BarcodeScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState('把条码对准摄像头')
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        const Detector = (window as unknown as {
          BarcodeDetector: new (options?: { formats?: string[] }) => {
            detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
          }
        }).BarcodeDetector

        const detector = new Detector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'],
        })

        let raf = 0
        let done = false

        const tick = async () => {
          if (done || cancelled) return
          const el = videoRef.current
          if (el && el.readyState === el.HAVE_ENOUGH_DATA) {
            try {
              const codes = await detector.detect(el)
              const first = codes[0]?.rawValue
              if (first) {
                done = true
                stream.getTracks().forEach((track) => track.stop())
                onResult(first)
                return
              }
            } catch {
              /* 单帧识别失败很正常，继续下一帧 */
            }
          }
          raf = window.setTimeout(tick, 180) as unknown as number
        }
        void tick()

        stopRef.current = () => {
          done = true
          window.clearTimeout(raf)
          stream.getTracks().forEach((track) => track.stop())
        }

        window.setTimeout(() => {
          if (!cancelled && !done) setHint('还没识别到，试着让条码更清楚、更平整')
        }, 6000)
      } catch (err) {
        if (!cancelled) setError(cameraErrorText(err))
      }
    })()

    return () => {
      cancelled = true
      stopRef.current?.()
      stopRef.current = null
    }
  }, [onResult])

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label="扫码">
      <div className="scanner__frame">
        <video ref={videoRef} className="scanner__video" playsInline muted />
        <div className="scanner__reticle" aria-hidden="true" />
        <button type="button" className="scanner__close" onClick={onClose} aria-label="关闭扫码">
          <IconClose size={16} />
        </button>
      </div>
      <p className="scanner__hint">
        {error ? <span className="field__error">{error}</span> : hint}
      </p>
    </div>
  )
}

function cameraErrorText(error: unknown): string {
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return '摄像头权限被拒绝了，改用键盘输入条码吧'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '没找到可用的摄像头'
  if (name === 'NotReadableError') return '摄像头被其他程序占用了'
  return '摄像头打不开，改用键盘输入条码吧'
}
