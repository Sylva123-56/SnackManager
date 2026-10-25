#!/usr/bin/env node
/**
 * 生成用于截图/手测的种子数据（浏览器 localStorage 版）。
 * 日期全部相对「今天」推算，这样任何时候跑截图都是合理的状态分布。
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const today = new Date()
const iso = (d) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const shift = (days) => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  d.setDate(d.getDate() + days)
  return iso(d)
}
const monthsAgo = (m) => {
  const d = new Date(today.getFullYear(), today.getMonth() - m, today.getDate())
  return iso(d)
}

let n = 0
const stamp = () => new Date(today.getTime() - ++n * 60000).toISOString()

/** 用生产日期 + 保质期反推一个合理的到期日，再回写 expiryDate */
function make(partial) {
  return {
    id: partial.id ?? `seed-${n + 1}`,
    name: partial.name,
    brand: partial.brand ?? '',
    category: partial.category,
    emoji: partial.emoji,
    imageFile: null,
    barcode: partial.barcode ?? '',
    quantity: partial.quantity,
    remaining: partial.remaining,
    unitPrice: partial.unitPrice ?? null,
    purchasedAt: partial.purchasedAt,
    productionDate: partial.productionDate,
    shelfLifeValue: partial.shelfLifeValue,
    shelfLifeUnit: partial.shelfLifeUnit,
    expiryDate: partial.expiryDate,
    expirySource: 'manual',
    note: partial.note ?? '',
    createdAt: stamp(),
    updatedAt: stamp(),
  }
}

const entries = [
  make({
    name: '乐事原味薯片',
    brand: '乐事',
    category: 'chips',
    emoji: '🥔',
    barcode: '6924743915848',
    quantity: 3,
    remaining: 1,
    unitPrice: 6.5,
    purchasedAt: shift(-2),
    productionDate: monthsAgo(9),
    shelfLifeValue: 9,
    shelfLifeUnit: 'month',
    expiryDate: shift(-9),
    note: '已经软了，凑合吃',
  }),
  make({
    name: '奥利奥夹心饼干',
    brand: '亿滋',
    category: 'biscuit',
    emoji: '🍪',
    quantity: 2,
    remaining: 2,
    unitPrice: 9.9,
    purchasedAt: shift(-1),
    productionDate: monthsAgo(5),
    shelfLifeValue: 12,
    shelfLifeUnit: 'month',
    expiryDate: shift(3),
  }),
  make({
    name: '德芙丝滑牛奶巧克力',
    brand: '德芙',
    category: 'chocolate',
    emoji: '🍫',
    quantity: 4,
    remaining: 3,
    unitPrice: 12.8,
    purchasedAt: shift(-6),
    productionDate: monthsAgo(7),
    shelfLifeValue: 12,
    shelfLifeUnit: 'month',
    expiryDate: shift(21),
  }),
  make({
    name: '三只松鼠每日坚果',
    brand: '三只松鼠',
    category: 'nuts',
    emoji: '🥜',
    quantity: 7,
    remaining: 5,
    unitPrice: 4.2,
    purchasedAt: shift(-9),
    productionDate: monthsAgo(2),
    shelfLifeValue: 6,
    shelfLifeUnit: 'month',
    expiryDate: shift(74),
    note: '一天一包',
  }),
  make({
    name: '旺仔牛奶',
    brand: '旺旺',
    category: 'drink',
    emoji: '🥤',
    quantity: 12,
    remaining: 8,
    unitPrice: 3.5,
    purchasedAt: shift(-4),
    productionDate: monthsAgo(3),
    shelfLifeValue: 9,
    shelfLifeUnit: 'month',
    expiryDate: shift(120),
  }),
  make({
    name: '喜之郎果冻爽',
    brand: '喜之郎',
    category: 'jelly',
    emoji: '🍮',
    quantity: 6,
    remaining: 0,
    unitPrice: 2.8,
    purchasedAt: shift(-16),
    productionDate: monthsAgo(10),
    shelfLifeValue: 12,
    shelfLifeUnit: 'month',
    expiryDate: shift(38),
  }),
  make({
    name: '阿尔卑斯棒棒糖',
    brand: '阿尔卑斯',
    category: 'candy',
    emoji: '🍬',
    quantity: 10,
    remaining: 7,
    unitPrice: 1.2,
    purchasedAt: shift(-12),
    productionDate: monthsAgo(4),
    shelfLifeValue: 18,
    shelfLifeUnit: 'month',
    expiryDate: shift(300),
  }),
  make({
    name: '好丽友派',
    brand: '好丽友',
    category: 'biscuit',
    emoji: '🍪',
    quantity: 2,
    remaining: 1,
    unitPrice: 13.5,
    purchasedAt: shift(-3),
    productionDate: monthsAgo(4),
    shelfLifeValue: 6,
    shelfLifeUnit: 'month',
    expiryDate: shift(6),
  }),
  make({
    name: '卫龙大面筋',
    brand: '卫龙',
    category: 'other',
    emoji: '🍿',
    quantity: 5,
    remaining: 4,
    unitPrice: 2.5,
    purchasedAt: shift(-1),
    productionDate: monthsAgo(1),
    shelfLifeValue: 6,
    shelfLifeUnit: 'month',
    expiryDate: shift(150),
    note: '别放太久，油会渗',
  }),
  make({
    name: '瑞士莲软心巧克力',
    brand: 'Lindt',
    category: 'chocolate',
    emoji: '🍫',
    quantity: 1,
    remaining: 1,
    unitPrice: 39,
    purchasedAt: shift(-20),
    productionDate: monthsAgo(1),
    shelfLifeValue: 1,
    shelfLifeUnit: 'year',
    expiryDate: shift(340),
  }),
]

// 一条已过期且没吃完的（保证顶部飘红）
entries.push(
  make({
    name: '康师傅蛋酥卷',
    brand: '康师傅',
    category: 'biscuit',
    emoji: '🍪',
    quantity: 3,
    remaining: 2,
    unitPrice: 7.5,
    purchasedAt: shift(-40),
    productionDate: monthsAgo(11),
    shelfLifeValue: 9,
    shelfLifeUnit: 'month',
    expiryDate: shift(-62),
  }),
)

const data = {
  schemaVersion: 1,
  entries,
  settings: {
    warnDays: 7,
    theme: 'auto',
    sort: 'expiry',
    statsRange: '30d',
    filter: 'all',
  },
}

const out = join(process.cwd(), 'scripts', 'seed.json')
writeFileSync(out, JSON.stringify(data, null, 2) + '\n')
console.log(`wrote ${out} (${entries.length} entries, today=${iso(today)})`)
