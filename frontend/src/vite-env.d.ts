/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '*.md?raw' {
  const content: string
  export default content
}

declare module '@ffmpeg/core/wasm?url' {
  const url: string
  export default url
}

declare module '@ffmpeg/ffmpeg/worker?url' {
  const url: string
  export default url
}
