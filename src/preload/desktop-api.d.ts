import type { DesktopApi } from '../shared/contracts.js'

declare global {
  interface Window {
    readonly deepseekDesktop: DesktopApi
  }
}

export {}
