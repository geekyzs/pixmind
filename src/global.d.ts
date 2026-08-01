import type { PixMindApi } from '../electron/preload'

declare global {
  interface Window {
    api: PixMindApi
  }
}

export {}
