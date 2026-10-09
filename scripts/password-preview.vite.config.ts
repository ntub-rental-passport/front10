import { defineConfig } from 'vite'
import base from '../vite.config'
export default defineConfig(async (env) => {
  const config = typeof base === 'function' ? await base(env) : await base
  return { ...config, server: { ...config.server, watch: { ignored: ['**/outputs/**'] } } }
})
