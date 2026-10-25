#!/usr/bin/env node
/**
 * 无依赖的 CDP 截图工具。
 * 用法：node scripts/shot.mjs <url> <out.png> [width] [height] [--seed=<file>] [--theme=dark] [--click=<css>] [--delay=ms]
 *
 * 为什么手写而不用 playwright：项目要守体积，验证脚本不该给 devDeps 加几十兆。
 * Node 22+ 自带全局 WebSocket，够用。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const positional = args.filter((a) => !a.startsWith('--'))
const flags = new Map(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...rest] = a.slice(2).split('=')
      return [k, rest.join('=') || 'true']
    }),
)

const [url, outPath] = positional
const width = Number(positional[2] ?? 900)
const height = Number(positional[3] ?? 620)
const delay = Number(flags.get('delay') ?? 900)
const port = 9333 + Math.floor(Math.random() * 400)

if (!url || !outPath) {
  console.error('usage: node scripts/shot.mjs <url> <out.png> [w] [h]')
  process.exit(2)
}

const chromeCandidates = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
]
const chrome = chromeCandidates.find((p) => {
  try {
    return readFileSync(p) && true
  } catch {
    return false
  }
})
if (!chrome) {
  console.error('找不到 Chrome/Edge')
  process.exit(2)
}

const profile = mkdtempSync(join(tmpdir(), 'shot-'))
const child = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function targets() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page
    } catch {
      /* 还没起来 */
    }
    await sleep(120)
  }
  throw new Error('CDP 连接超时')
}

const page = await targets()
const ws = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const waiting = new Map()
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && waiting.has(msg.id)) {
    const { resolve, reject } = waiting.get(msg.id)
    waiting.delete(msg.id)
    if (msg.error) reject(new Error(msg.error.message))
    else resolve(msg.result)
  }
})

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq
    waiting.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: false,
})

// 先到目标 origin，才能往它的 localStorage 里塞种子数据
const origin = new URL(url).origin
await send('Page.navigate', { url: origin })
await sleep(500)

if (flags.has('theme')) {
  const theme = flags.get('theme')
  await send('Runtime.evaluate', {
    expression: `localStorage.setItem('snack-manager:pref-theme', ${JSON.stringify(theme)})`,
  })
}

const seedFile = flags.get('seed')
if (seedFile) {
  const raw = readFileSync(seedFile, 'utf8')
  await send('Runtime.evaluate', {
    expression: `localStorage.setItem('snack-manager:data', ${JSON.stringify(raw)})`,
  })
}

await send('Page.navigate', { url })
await sleep(delay)

const click = flags.get('click')
if (click) {
  await send('Runtime.evaluate', {
    expression: `(() => {
      const target = [...document.querySelectorAll(${JSON.stringify(click)})]
        .find((el) => el.offsetParent !== null || el.getClientRects().length > 0)
      if (!target) return 'not-found'
      target.click()
      return 'clicked'
    })()`,
    returnByValue: true,
  })
  await sleep(Number(flags.get('after') ?? 600))
}

const extra = flags.get('eval')
if (extra) {
  const result = await send('Runtime.evaluate', { expression: extra, returnByValue: true, awaitPromise: true })
  console.log('eval:', JSON.stringify(result.result?.value ?? null))
}

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
writeFileSync(outPath, Buffer.from(shot.data, 'base64'))
console.log(`saved ${outPath} (${width}x${height})`)

ws.close()
child.kill()
process.exit(0)
