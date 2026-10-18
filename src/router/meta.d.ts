import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    mobileFlow?: {
      title: string
      backPath: string
    }
  }
}
