/**
 * 金额写法：最多两位小数，去掉无意义的尾部零（8.50 → 8.5，17.00 → 17）。
 * 侧栏空间紧，紧凑的数字读起来更快；千分位只在四位数以上出现。
 */
export function formatSpend(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  const fixed = safe.toFixed(2).replace(/\.?0+$/, '')
  const [intPart = '0', decimal] = fixed.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return decimal ? `${grouped}.${decimal}` : grouped
}

/** 单价写法：8.5 → ¥8.5，8 → ¥8 */
export function formatPrice(value: number): string {
  return `¥${formatSpend(value)}`
}
