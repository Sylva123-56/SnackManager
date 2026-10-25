import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Tauri 在开发时通过固定端口加载前端，端口被占用时应直接失败而不是静默换端口。
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    watch: {
      // src-tauri 由 cargo 自己监听，避免 vite 重复触发
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    // Windows WebView2 是 Chromium 内核，现代语法可放心使用
    target: 'chrome110',
    sourcemap: false,
    chunkSizeWarningLimit: 400,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
