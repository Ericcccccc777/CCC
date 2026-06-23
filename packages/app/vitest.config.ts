import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./__tests__/setup.ts'],
    include: ['./__tests__/**/*.test.{ts,tsx}'],
    // The heavier multi-step renderer flows (engine picker → launch several
    // sessions in one test) run long enough under contended parallel CPU to
    // brush past the 5s default. Give them headroom so the suite is stable.
    testTimeout: 15000
  },
  resolve: {
    alias: {
      '@renderer': resolve('./src/renderer/src')
    }
  }
})
