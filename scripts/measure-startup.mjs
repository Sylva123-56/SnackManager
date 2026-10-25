// 量冷启动：从进程启动到「界面真正画出来」的时间。
// 用 CDP 轮询页面 DOM，等到左栏的库存数字出现就算首屏可用。
// 用法：node scripts/measure-startup.mjs [次数]
import { spawn } from 'node:child_process'

const RUNS = Number(process.argv[2] ?? 3)
const EXE = 'src-tauri\\target\\release\\snack-manager.exe'
const PORT = 9600 + Math.floor(Math.random() * 300)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []

for (let run = 0; run < RUNS; run += 1) {
  const started = performance.now()
  const child = spawn(EXE, [], {
    stdio: 'ignore',
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
  })

  let painted = 0
  let attached = 0

  for (let i = 0; i < 400; i += 1) {
    await sleep(25)
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const pages = await res.json()
      const page = pages.find((p) => p.type === 'page')
      if (!page) continue
      if (!attached) attached = performance.now() - started

      const ws = new WebSocket(page.webSocketDebuggerUrl)
      const opened = await new Promise((resolve) => {
        ws.onopen = () => resolve(true)
        ws.onerror = () => resolve(false)
        setTimeout(() => resolve(false), 500)
      })
      if (!opened) continue

      const value = await new Promise((resolve) => {
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data)
          if (msg.id === 1) resolve(msg.result?.result?.value)
        }
        ws.send(
          JSON.stringify({
            id: 1,
            method: 'Runtime.evaluate',
            params: {
              expression: `(() => {
                const n = document.querySelector('.statusbar__number, .metrics__value, .row__name')
                return n ? (n.textContent || '').trim() : null
              })()`,
              returnByValue: true,
            },
          }),
        )
        setTimeout(() => resolve(null), 500)
      })
      ws.close()

      if (value) {
        painted = performance.now() - started
        break
      }
    } catch {
      /* webview not up yet */
    }
  }

  child.kill()
  await sleep(700)

  results.push({ attached: Math.round(attached), painted: Math.round(painted) })
  console.log(`run ${run + 1}: attach ${Math.round(attached)} ms · 首屏 ${Math.round(painted)} ms`)
}

const paintTimes = results.map((r) => r.painted).filter((v) => v > 0)
if (paintTimes.length) {
  const sorted = [...paintTimes].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  console.log(`\n中位数：${median} ms（${paintTimes.length}/${RUNS} 次成功采样）`)
  if (paintTimes.length !== RUNS) console.log('有采样没等到界面，可能进程复用或数据未加载')
}
