import { serve } from '@hono/node-server'
import { env } from './config/env.js'
import { createApp } from './app.js'
import { startCleanup } from './services/cleanup.js'

const app = createApp()
startCleanup()

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`[backend-api] listening on http://localhost:${info.port}`)
})
