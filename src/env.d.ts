/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
<<<<<<< HEAD
  readonly VITE_OCR_API_URL?: string
=======
>>>>>>> 0ddfe5350d317c1145c9dc6928afddcd722cf6d9
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<{}, {}, any>
  export default component
}
