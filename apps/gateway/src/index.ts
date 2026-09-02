import express from 'express'
import { requestId } from './middleware/requestId.js'
import { apiKeyAuth } from './middleware/apiKeyAuth.js'
import { routeMatcher } from './middleware/routeMatcher.js'
import { policyResolver } from './middleware/policyResolver.js'
import { rateLimiter } from './middleware/rateLimiter.js'
import { quotaEnforcer } from './middleware/quotaEnforcer.js'
import { createUpstreamProxy } from './proxy/proxyHandler.js'
import redis, { loadScripts } from './lib/redis.js'
import usage from './lib/usage.js'
import control from './controlPlane.js'

const app = express()
const PORT = process.env.PORT || 4000

app.use(requestId)
app.use(express.json())

// health
app.get('/health', async (_req, res) => {
  const ping = await redis.ping()
  res.json({ status: 'ok', redis: ping })
})

// load Lua scripts
loadScripts().catch((e) => console.error('lua load failed', e))

// start background usage flush
usage.startUsageFlush()

// start control plane on separate port for admin operations
const controlApp = express()
controlApp.use('/control', control)
const CONTROL_PORT = process.env.CONTROL_PORT || 4001
controlApp.listen(CONTROL_PORT, () => console.log(`control plane listening on ${CONTROL_PORT}`))

// pipeline
app.use(apiKeyAuth)
app.use(routeMatcher)
app.use(policyResolver)
app.use(rateLimiter)
app.use(quotaEnforcer)

// dynamic proxy to upstream determined by routeMatcher
app.use((req, res, next) => {
  const provider = (r: any) => (r as any).routeConfig.upstream
  return createUpstreamProxy(provider, (req as any).routeConfig?.timeoutMs || 2000)(req, res, next)
})

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('unhandled', err)
  res.status(500).json({ error: 'internal' })
})

app.listen(PORT, () => console.log(`gateway listening on ${PORT}`))

// graceful shutdown
const shutdown = async () => {
  console.log('shutting down gateway')
  try { await usage.stopUsageFlush() } catch (e) {}
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
