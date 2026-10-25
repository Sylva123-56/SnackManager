/**
 * 批次功能的界面验证：填一条「一箱里有两批不同生产日期」的记录，
 * 检查总包数、主批包数、到期日、列表上的批次标签、以及扣减顺序。
 *
 * 用法：先 `npx vite --port 1420`，然后
 *   node scripts/check-batches.mjs
 */
const URL = process.argv[2] ?? 'http://127.0.0.1:1420'
const PORT = 9339

const { spawn } = await import('node:child_process')
const { setTimeout: sleep } = await import('node:timers/promises')

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const child = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=900,620',
    '--user-data-dir=' + process.env.TEMP + '\\snack-check-' + Date.now(),
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let ws
for (let i = 0; i < 60; i += 1) {
  await sleep(250)
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
    const pages = await res.json()
    const page = pages.find((p) => p.type === 'page')
    if (page) {
      ws = new WebSocket(page.webSocketDebuggerUrl)
      await new Promise((resolve, reject) => {
        ws.onopen = resolve
        ws.onerror = reject
      })
      break
    }
  } catch {
    /* 还没起来 */
  }
}
if (!ws) {
  child.kill()
  throw new Error('连不上 Chrome 调试端口')
}

let nextId = 1
const pending = new Map()
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(JSON.stringify(msg.error)))
    else resolve(msg.result)
  }
}

function send(method, params = {}) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  })
  if (result.exceptionDetails) {
    const det = result.exceptionDetails
    throw new Error(det.exception?.description ?? det.text)
  }
  return result.result?.value
}

// ---------- 断言 ----------
const failures = []
function check(name, ok, detail) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`)
  if (!ok) failures.push(name)
}

/** React 受控输入必须走原生 setter，否则 onChange 不触发 */
const SET_INPUT = `
function setInput(root, selector, value) {
  const el = root.querySelector(selector)
  if (!el) return false
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}
`

await send('Page.enable')
await send('Runtime.enable')
await send('Page.navigate', { url: URL })
await sleep(1200)

// 清掉上次的浏览器本地数据，从空白库开始
await evaluate(`localStorage.removeItem('snack-manager:data')`)
await send('Page.navigate', { url: URL })
await sleep(1200)

console.log('\n== 1. 打开表单，填一条两批的记录 ==')
await evaluate(`document.querySelector('.list-panel__tools .btn--primary').click()`)
await sleep(400)

const filled = await evaluate(`(() => {
  ${SET_INPUT}
  const form = document.querySelector('.entry-form')
  if (!form) return { error: 'no form' }
          // 占位，真正的字段用 data-field 找
  const nameInput = form.querySelector('.form-row--name input')
  setInput(form, '.form-row--name input', '混合装蛋黄酥')
  setInput(form, '[data-field="quantity"] input', '5')
  setInput(form, '[data-field="remaining"] input', '5')
  setInput(form, '[data-field="productionDate"] input', '2026-09-25')
  setInput(form, '[data-field="shelfLifeValue"] input', '1')
  return {
    name: nameInput ? nameInput.value : null,
    qty: form.querySelector('[data-field="quantity"] input')?.value,
    prod: form.querySelector('[data-field="productionDate"] input')?.value,
    shelf: form.querySelector('[data-field="shelfLifeValue"] input')?.value,
  }
})()`)
console.log('  填写结果', filled)
check('名称已填', filled?.name === '混合装蛋黄酥', filled?.name)
check('总包数已填', filled?.qty === '5', filled?.qty)

const preview1 = await evaluate(`(() => {
  const el = document.querySelector('.field--preview')
  return el ? el.textContent.trim() : null
})()`)
console.log('  单批时的状态预览:', preview1)

console.log('\n== 2. 加一批日期不同的 ==')
await evaluate(`document.querySelector('.batch-add').click()`)
await sleep(300)

const extraFilled = await evaluate(`(() => {
  ${SET_INPUT}
  const rows = [...document.querySelectorAll('.batch-row')].filter((r) => !r.classList.contains('batch-row--main'))
  const row = rows[rows.length - 1]
  if (!row) return { error: 'no batch row' }
  setInput(row, '.batch-row__date', '2026-10-02')
  setInput(row, '.batch-row__qty', '2')
  return {
    rows: rows.length,
    date: row.querySelector('.batch-row__date').value,
    qty: row.querySelector('.batch-row__qty').value,
    mainSummary: document.querySelector('.batch-row--main')?.textContent.trim(),
    expiryReadonly: document.querySelector('[data-field="expiryDate"] input')?.value,
    expiryReadOnly: document.querySelector('[data-field="expiryDate"] input')?.readOnly,
    preview: document.querySelector('.field--preview')?.textContent.trim(),
  }
})()`)
console.log('  批次填写后', extraFilled)
check('多出 1 行批次', extraFilled?.rows === 1, extraFilled?.rows)
check('主批剩 3 包', extraFilled?.mainSummary?.includes('3'), extraFilled?.mainSummary)
// 保质期单位默认「个月」：9/25 + 1 月 = 10/25，10/02 + 1 月 = 11/02
check('到期日按最早那批算（10月25日）', extraFilled?.expiryReadonly === '2026-10-25', extraFilled?.expiryReadonly)
check('到期日只读', extraFilled?.expiryReadOnly === true, extraFilled?.expiryReadOnly)

console.log('\n== 3. 提交并检查列表 ==')
await evaluate(`(() => {
  const btn = [...document.querySelectorAll('.entry-form__footer button')].find((b) => b.textContent.includes('加入库存'))
  btn.click()
  return true
})()`)
await sleep(600)

const row = await evaluate(`(() => {
  const li = document.querySelector('.row')
  if (!li) return { error: 'no row' }
  const tags = [...li.querySelectorAll('.batch-tag')].map((t) => ({
    text: t.textContent.trim(),
    urgent: t.classList.contains('batch-tag--urgent'),
  }))
  return {
    name: li.querySelector('.row__name')?.textContent.trim(),
    stock: li.querySelector('.stock__count')?.textContent.trim(),
    expiry: li.querySelector('.row__expiry')?.textContent.trim(),
    tags,
    dialogsOpen: document.querySelectorAll('.modal').length,
  }
})()`)
console.log('  列表行', JSON.stringify(row, null, 2))
check('表单已关闭', row?.dialogsOpen === 0, row?.dialogsOpen)
check('列表出现记录', row?.name === '混合装蛋黄酥', row?.name)
check('显示 5/5', row?.stock?.startsWith('5'), row?.stock)
check('两个批次标签', row?.tags?.length === 2, row?.tags?.length)
check('先吃的那批有 urgent 标记', row?.tags?.[0]?.urgent === true, row?.tags?.[0])
check('标签写明各批剩余', row?.tags?.[0]?.text?.includes('3/3') && row?.tags?.[1]?.text?.includes('2/2'), row?.tags)

console.log('\n== 4. 吃掉 3 包后，早批吃光、整箱转为按晚批算 ==')
for (let i = 0; i < 3; i += 1) {
  await evaluate(`(() => {
    const btn = document.querySelector('.row .stock__btn')
    btn.click()
    return true
  })()`)
  await sleep(160)
}

const afterEat = await evaluate(`(() => {
  const li = document.querySelector('.row')
  const tags = [...li.querySelectorAll('.batch-tag')].map((t) => t.textContent.trim())
  return {
    stock: li.querySelector('.stock__count')?.textContent.trim(),
    expiry: li.querySelector('.row__expiry')?.textContent.trim(),
    tags,
    status: li.className,
  }
})()`)
console.log('  吃掉 3 包后', afterEat)
check('剩余 2/5', afterEat?.stock?.startsWith('2'), afterEat?.stock)
check('早批显示 0/3', afterEat?.tags?.[0]?.includes('0/3'), afterEat?.tags?.[0])
check('晚批仍有 2/2', afterEat?.tags?.[1]?.includes('2/2'), afterEat?.tags?.[1])
check('整箱到期日挪到晚批（11月2日）', afterEat?.expiry?.includes('11月2日'), afterEat?.expiry)

console.log('\n== 5. 落盘数据里的批次结构 ==')
// 写盘是 200ms 防抖，等它落稳再读
await sleep(500)
const stored = await evaluate(`(() => {
  const raw = localStorage.getItem('snack-manager:data')
  if (!raw) return null
  const data = JSON.parse(raw)
  const entry = data.entries[0]
  return { batches: entry?.batches, quantity: entry?.quantity, remaining: entry?.remaining, expiryDate: entry?.expiryDate }
})()`)
console.log('  落盘', JSON.stringify(stored))
check('落盘有 2 个批次', stored?.batches?.length === 2, stored?.batches?.length)
check('总包数为 5', stored?.quantity === 5, stored?.quantity)
check('剩余 2 包已落盘', stored?.remaining === 2, stored?.remaining)

ws.close()
child.kill()

console.log('')
if (failures.length > 0) {
  console.log(`失败 ${failures.length} 项：${failures.join('、')}`)
  process.exitCode = 1
} else {
  console.log('全部通过')
}
