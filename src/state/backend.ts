import { invoke } from '@tauri-apps/api/core'

/** 后端返回的读取结果 */
export interface LoadResult {
  status: 'found' | 'missing'
  content: string
}

/**
 * 存储适配层。
 *
 * 优先走 Tauri（真实文件、原子写、.bak）；在纯浏览器里 `pnpm dev` 时
 * 退化为 localStorage，这样界面可以脱离打包直接调试。
 */

const TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const isDesktop = TAURI

const LS_DATA = 'snack-manager:data'
const LS_IMG_PREFIX = 'snack-manager:img:'
const LS_BACKUP = 'snack-manager:backup'

function lsGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function lsSet(key: string, value: string): void {
  window.localStorage.setItem(key, value)
}

export async function readData(): Promise<LoadResult> {
  if (TAURI) return invoke<LoadResult>('read_data')
  const content = lsGet(LS_DATA)
  return content === null ? { status: 'missing', content: '' } : { status: 'found', content }
}

export async function readBackup(): Promise<LoadResult> {
  if (TAURI) return invoke<LoadResult>('read_backup')
  const content = lsGet(LS_BACKUP)
  return content === null ? { status: 'missing', content: '' } : { status: 'found', content }
}

export async function writeData(content: string): Promise<void> {
  if (TAURI) {
    await invoke('write_data', { content })
    return
  }
  const previous = lsGet(LS_DATA)
  if (previous !== null) lsSet(LS_BACKUP, previous)
  lsSet(LS_DATA, content)
}

export async function restoreFromBackup(): Promise<LoadResult> {
  if (TAURI) return invoke<LoadResult>('restore_from_backup')
  const content = lsGet(LS_BACKUP)
  if (content === null) return { status: 'missing', content: '' }
  lsSet(LS_DATA, content)
  return { status: 'found', content }
}

export async function writeSideBackup(name: string, content: string): Promise<string> {
  if (TAURI) return invoke<string>('write_side_backup', { name, content })
  lsSet(`snack-manager:pre-import:${name}`, content)
  return name
}

/** 把本地图片存进应用数据目录，返回保存后的文件名 */
export async function saveImage(fileName: string, bytes: Uint8Array): Promise<string> {
  if (TAURI) return invoke<string>('write_image_bytes', { fileName, bytes: Array.from(bytes) })
  lsSet(LS_IMG_PREFIX + fileName, toBase64(bytes))
  return fileName
}

export async function deleteImage(fileName: string): Promise<void> {
  if (TAURI) {
    await invoke('remove_image', { fileName })
    return
  }
  try {
    window.localStorage.removeItem(LS_IMG_PREFIX + fileName)
  } catch {
    /* 忽略 */
  }
}

/** 读取图片为 data URL；文件不存在返回 null */
export async function loadImage(fileName: string): Promise<string | null> {
  if (TAURI) {
    const base64 = await invoke<string | null>('read_image_base64', { fileName })
    if (!base64) return null
    return `data:${mimeOf(fileName)};base64,${base64}`
  }
  const base64 = lsGet(LS_IMG_PREFIX + fileName)
  if (!base64) return null
  return `data:${mimeOf(fileName)};base64,${base64}`
}

export async function exportText(path: string, content: string): Promise<void> {
  if (TAURI) {
    await invoke('export_text', { path, content })
    return
  }
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = path.split(/[\\/]/).pop() ?? 'snacks.json'
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function importText(path: string): Promise<string> {
  if (TAURI) return invoke<string>('import_text', { path })
  return ''
}

export async function dataDirInfo(): Promise<string> {
  if (TAURI) return invoke<string>('reveal_data_dir')
  return '浏览器预览模式：数据存在 localStorage'
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return window.btoa(binary)
}

export function mimeOf(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}
