// 在真实打包好的应用里检查字体到底有没有加载、有没有真的用上。
// 用法：先用 --remote-debugging-port=9455 启动 snack-manager.exe，再跑这个。
const PORT = Number(process.argv[2] ?? 9455)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = list.find((p) => p.type === 'page')
if (!page) throw new Error('no page target')

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})

let nextId = 1
const pending = new Map()
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}
const send = (method, params) =>
  new Promise((res) => {
    const id = nextId++
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })

await send('Runtime.enable')
await sleep(400)

const expression = `(async () => {
  await document.fonts.ready
  const faces = [...document.fonts].map((f) => f.family + ' / ' + f.weight + ' / ' + f.status)

  // 中文在任何中文字体里都是全角方块，宽度比不出差别；用拉丁字母和数字才看得出字体是否真的换了
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-size:100px'
  probe.textContent = 'Mango 1234'
  document.body.appendChild(probe)
  const widths = {}
  for (const family of ['Chill Round', 'Microsoft YaHei UI', 'Segoe UI']) {
    probe.style.fontFamily = "'" + family + "'"
    widths[family] = Math.round(probe.getBoundingClientRect().width * 100) / 100
  }
  probe.remove()

  // 宽度只能说明「不同」，像素比对才能说明「真的是圆体画出来的」。
  // 同样的字用两族各画一遍，逐像素求差，差异像素占比为 0 就是没生效。
  const paint = (family) => {
    const canvas = document.createElement('canvas')
    canvas.width = 420
    canvas.height = 70
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#000'
    ctx.font = '32px "' + family + '"'
    ctx.fillText('零食管家 Mango 123', 6, 46)
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data
  }
  const a = paint('Chill Round')
  const b = paint('Microsoft YaHei UI')
  let diffPx = 0
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i]) diffPx += 1
  }
  const pixelDiffPct = Math.round((diffPx / (a.length / 4)) * 10000) / 100

  const target =
    document.querySelector('.row__name') ??
    document.querySelector('.statusbar__label') ??
    document.body
  return {
    faces,
    usedFamily: getComputedStyle(target).fontFamily,
    widths,
    chillIsDistinct: Math.abs(widths['Chill Round'] - widths['Microsoft YaHei UI']) > 0.5,
    pixelDiffPct,
  }
})()`

const res = await send('Runtime.evaluate', {
  expression,
  awaitPromise: true,
  returnByValue: true,
})

console.log(JSON.stringify(res.result?.result?.value ?? res, null, 2))

const shot = await send('Page.captureScreenshot', { format: 'png' })
if (shot.result?.data) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync('.shots/packaged-app.png', Buffer.from(shot.result.data, 'base64'))
  console.log('saved .shots/packaged-app.png')
}

ws.close()
