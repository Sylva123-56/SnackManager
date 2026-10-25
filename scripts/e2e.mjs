#!/usr/bin/env node
/**
 * 端到端验证：连到**真实桌面应用**的 WebView2 调试端口（9333），模拟真人操作。
 * 用法：
 *   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9333'
 *   node scripts/e2e.mjs
 *
 * 为什么不用 playwright：项目要守体积，验证脚本不该给 devDeps 加几十兆。
 * Node 22+ 自带全局 WebSocket，跟 shot.mjs 同一套路。
 */
const PORT = Number(process.env.E2E_PORT ?? 9333)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function connect() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  const list = await res.json()
  const page = list.find((t) => t.type === 'page')
  if (!page?.webSocketDebuggerUrl) throw new Error('没有可调试的页面')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
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
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      waiting.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  return { ws, send }
}

let failures = 0
function check(name, ok, detail = '') {
  if (ok) {
    console.log(`  ok   ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const { ws, send } = await connect()

async function evaluate(expression) {
  const out = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  })
  if (out.exceptionDetails) {
    throw new Error(
      `页面异常：${out.exceptionDetails.exception?.description ?? out.exceptionDetails.text}`,
    )
  }
  return out.result?.value
}

/** 在页面里按可见文本找元素并点击 */
async function clickText(selector, text) {
  return evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((n) => n.getClientRects().length > 0 && n.textContent.trim().includes(${JSON.stringify(text)}))
    if (!el) return 'not-found'
    el.click()
    return 'clicked'
  })()`)
}

/** 给受控 input 设值，必须走原生 setter 才能让 React 收到变更 */
async function setInput(selector, value) {
  return evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return 'not-found'
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return 'ok'
  })()`)
}

async function fieldValue(selector) {
  return evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    return el ? el.value : null
  })()`)
}

console.log('\n== 1. 空白库 ==')
const emptyText = await evaluate(
  `document.querySelector('.statusbar__number')?.textContent ?? ''`,
)
check('初始在库件数为 0', emptyText === '0', `实际 ${JSON.stringify(emptyText)}`)
check(
  '显示空库引导',
  await evaluate(`!!document.querySelector('.empty')`),
)

console.log('\n== 2. 新建一条（Ctrl+N 打开表单）==')
await send('Input.dispatchKeyEvent', {
  type: 'keyDown',
  key: 'n',
  code: 'KeyN',
  windowsVirtualKeyCode: 78,
  modifiers: 2,
})
await send('Input.dispatchKeyEvent', {
  type: 'keyUp',
  key: 'n',
  code: 'KeyN',
  windowsVirtualKeyCode: 78,
  modifiers: 2,
})
await sleep(500)
check(
  '表单已打开',
  await evaluate(`!!document.querySelector('.entry-form')`),
)

await setInput('.field[data-field="name"] input', '端到端测试薯片')
await setInput('.form-row--3 input', '3') // 购买包数
await setInput('.form-row--3 > div:nth-child(2) input', '3') // 剩余包数
await setInput('.form-row--3 > div:nth-child(3) input', '12.5') // 单价
await sleep(200)

// 生产日期与保质期：找 label 文本定位
const filled = await evaluate(`(() => {
  const setVal = (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const groups = [...document.querySelectorAll('.field')]
  const byLabel = (t) => groups.find((g) => g.textContent.includes(t))
  const prod = byLabel('生产日期')?.querySelector('input')
  const days = byLabel('保质期长度')?.querySelector('input')
  if (!prod || !days) return 'missing'
  setVal(prod, '2026-09-25')
  setVal(days, '30')
  // 保质期单位默认是「月」，显式改成「天」才能验证 30 天后的到期日
  const unit = byLabel('单位')?.querySelector('select')
  if (unit) {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(unit, 'day')
    unit.dispatchEvent(new Event('change', { bubbles: true }))
  }
  return 'ok'
})()`)
check('填好生产日期与保质期', filled === 'ok', filled)
await sleep(300)

const derived = await evaluate(
  `document.querySelector('.field--preview')?.textContent?.replace('状态预览', '').trim() ?? ''`,
)
console.log(`  info 到期预演：${JSON.stringify(derived)}`)
check('到期预演有内容', derived.length > 0 && !derived.includes('填完'), derived)

console.log('\n== 3. 提交 ==')
const submitText = await evaluate(`(() => {
  const btn = [...document.querySelectorAll('.entry-form__footer button')]
    .find((b) => b.textContent.includes('加入库存'))
  if (!btn) return 'not-found'
  btn.click()
  return 'clicked'
})()`)
check('点了「加入库存」', submitText === 'clicked', submitText)
await sleep(900)

const afterCreate = await evaluate(`JSON.stringify({
  count: document.querySelectorAll('.row').length,
  name: document.querySelector('.row__name')?.textContent?.trim() ?? '',
  stock: document.querySelector('.stock')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
  head: document.querySelector('.statusbar__number')?.textContent ?? '',
  tabs: [...document.querySelectorAll('.tabs__item')].map((b) => b.textContent.replace(/\\s+/g, ' ').trim()),
})`)
const created = JSON.parse(afterCreate)
check('列表里出现 1 行', created.count === 1, afterCreate)
check('名称正确', created.name === '端到端测试薯片', created.name)
check('顶部在库件数为 3', created.head === '3', created.head)
check('行内显示 3/3', created.stock.includes('3/3'), created.stock)
console.log(`  info 页签：${JSON.stringify(created.tabs)}`)

console.log('\n== 4. 吃掉一包 ==')
// 按钮里是内联 SVG，没有可见文本，只能靠 title / aria-label 定位
const minusClick = await evaluate(`(() => {
  const btn = [...document.querySelectorAll('.stock__btn')]
    .find((b) => !b.disabled && /吃掉一包/.test(b.getAttribute('aria-label') ?? b.title))
  if (!btn) return 'not-found'
  btn.click()
  return 'clicked'
})()`)
check('点了「吃掉一包」', minusClick === 'clicked', minusClick)
await sleep(700)
const afterMinus = await evaluate(`JSON.stringify({
  stock: document.querySelector('.stock')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
  head: document.querySelector('.statusbar__number')?.textContent ?? '',
})`)
const minus = JSON.parse(afterMinus)
check('剩余变成 2/3', minus.stock.includes('2/3'), minus.stock)
check('顶部在库件数变成 2', minus.head === '2', minus.head)

console.log('\n== 5. 搜索过滤 ==')
await setInput('.search input', '端到端')
await sleep(500)
check(
  '搜到 1 行',
  (await evaluate(`document.querySelectorAll('.row').length`)) === 1,
)
await setInput('.search input', '不存在的零食名')
await sleep(500)
check(
  '搜不到时显示空态',
  (await evaluate(`!!document.querySelector('.empty')`)) === true,
)
await setInput('.search input', '')
await sleep(400)

console.log('\n== 6. 等待防抖落盘（200ms + 余量）==')
await sleep(1200)
check(
  '保存状态显示已保存',
  await evaluate(`document.querySelector('.savebar')?.textContent?.includes('已保存') ?? false`),
)


console.log('\n== 7. 设置持久化 ==')
await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='设置'); b&&b.click(); return 'ok' })()`)
await sleep(600)
check('设置面板打开', await evaluate(`!!document.querySelector('.settings__section')`))
await evaluate(`(() => { const b=[...document.querySelectorAll('.modal button')].find(x=>x.textContent.trim()==='14 天'); if(!b) return 'not-found'; b.click(); return 'clicked' })()`)
await sleep(300)
await evaluate(`(() => { const cs=[...document.querySelectorAll('.theme-card')]; if(cs.length<3) return 'not-found'; cs[2].click(); return 'clicked' })()`)
await sleep(500)
check('主题切到深色即刻生效', (await evaluate(`document.documentElement.dataset.theme`)) === 'dark')
await evaluate(`(() => { const b=document.querySelector('.modal .icon-btn'); b&&b.click(); return 'ok' })()`)
await sleep(1500)

await send('Page.enable')
await send('Page.reload', { ignoreCache: false })
await sleep(2600)
check('重载后仍是深色', (await evaluate(`document.documentElement.dataset.theme`)) === 'dark')
await evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='设置'); b&&b.click(); return 'ok' })()`)
await sleep(700)
check(
  '重载后临期天数仍是 14 天',
  (await evaluate(
    `(() => { const b=[...document.querySelectorAll('.modal button')].find((x)=>x.className.includes('is-active')); return b ? b.textContent.trim() : 'none' })()`,
  )) === '14 天',
)
await evaluate(`(() => { const b=document.querySelector('.modal .icon-btn'); b&&b.click(); return 'ok' })()`)
await sleep(400)

console.log('\n== 8. 清空全部记录 ==')
await evaluate(`(() => { const b=[...document.querySelectorAll('.row__name')][0]; if(!b) return 'no-row'; b.click(); return 'clicked' })()`)
await sleep(500)
const hasEdit = await evaluate(`!!document.querySelector('.entry-form__footer .btn--danger')`)
check('点开记录能进入编辑', hasEdit)
await evaluate(`(() => { const b=document.querySelector('.modal .icon-btn'); b&&b.click(); return 'ok' })()`)
await sleep(400)

ws.close()

console.log(`\n${failures === 0 ? '全部通过' : `${failures} 项失败`}`)
process.exit(failures === 0 ? 0 : 1)