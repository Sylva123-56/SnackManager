/**
 * 一次性迁移脚本：把样式里「跟排版走」的 px 换成 rem（基准 14px），
 * 让根字号成为唯一的缩放旋钮。字号设置就是改 html 的 font-size。
 *
 * 有意保留 px 的部分：
 * - border*：1px 的线要始终是 1 个物理像素才清晰
 * - box-shadow / outline / outline-offset：装饰性，放大后不必等比
 * - 媒体查询断点：断点描述的是窗口物理宽度，不该跟着字号动
 * - 99px 以上的哨兵值（999px 胶囊圆角）与 .sr-only 的 1px
 *
 * 用法：node scripts/px-to-rem.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'

const BASE = 14
const FILES = ['src/styles/base.css', 'src/styles/app.css', 'src/styles/tokens.css']

/** 参与换算的声明属性 */
const SCALE_PROPS = new Set([
  'font-size',
  'gap',
  'row-gap',
  'column-gap',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'height',
  'min-height',
  'max-height',
  'width',
  'min-width',
  'max-width',
  'border-radius',
  'grid-template-columns',
  'grid-template-rows',
  'flex',
  'flex-basis',
  'top',
  'right',
  'bottom',
  'left',
  'line-height',
])

/** 尺寸类自定义属性：无条件换算 */
const SCALE_VARS = new Set(['--sidebar-w', '--radius-sm', '--radius', '--radius-lg'])

function toRem(num) {
  const n = Number(num)
  if (!Number.isFinite(n) || n === 0) return '0'
  const text = (n / BASE).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  return `${text}rem`
}

function convertValue(value, force, prop) {
  return value.replace(/(?<![\w.-])(\d+(?:\.\d+)?)px/g, (whole, num) => {
    const n = Number(num)
    if (force) return toRem(num)
    // 细线与位移保持原样，放大后不会变成毛边
    if (n <= 1.5) return whole
    // 999px 这类哨兵圆角原样保留，其余一律跟着字号走
    if (prop === 'border-radius' && n >= 99) return whole
    return toRem(num)
  })
}

for (const file of FILES) {
  const css = readFileSync(file, 'utf8')
  const out = css.replace(
    /(^|\n)([ \t]*)([a-z-]+)([ \t]*:[ \t]*)([^;{}]+)(;)/g,
    (whole, lead, indent, prop, colon, value, semi) => {
      const isVar = SCALE_VARS.has(prop)
      if (!SCALE_PROPS.has(prop) && !isVar) return whole
      if (!/(?<![\w.-])\d+(?:\.\d+)?px/.test(value)) return whole
      return `${lead}${indent}${prop}${colon}${convertValue(value, isVar, prop)}${semi}`
    },
  )
  if (out === css) {
    console.log(`${file}: 无改动`)
    continue
  }
  writeFileSync(file, out, 'utf8')
  const left = (out.match(/(?<![\w.-])\d+(?:\.\d+)?px/g) ?? []).length
  console.log(`${file}: 已换算，保留 ${left} 处 px`)
}
