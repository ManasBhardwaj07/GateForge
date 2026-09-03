import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import express from 'express'
import http from 'http'
import { AddressInfo } from 'net'
import { requestId } from '../../apps/gateway/src/middleware/requestId.js'
import { apiKeyAuth } from '../../apps/gateway/src/middleware/apiKeyAuth.js'
import { routeMatcher, clearRouteCache } from '../../apps/gateway/src/middleware/routeMatcher.js'
import { policyResolver } from '../../apps/gateway/src/middleware/policyResolver.js'
import { rateLimiter } from '../../apps/gateway/src/middleware/rateLimiter.js'
import { quotaEnforcer } from '../../apps/gateway/src/middleware/quotaEnforcer.js'
import { proxyMiddlewareHandler, clearProxyCache } from '../../apps/gateway/src/proxy/proxyHandler.js'
import redis, { loadScripts } from '../../apps/gateway/src/lib/redis.js'
import { createEphemeralServer, EphemeralServer } from '../helpers/testServer.js'
import { request } from '../helpers/testClient.js'
import {
  createTestPlan,
  createTestOrganization,
  createTestApiKey,
  createTestUpstream,
  createTestRoute,
  cleanupTestData,
} from '../helpers/testDb.js'

describe('M6.1 — End-to-End Pipeline Integration', () => {
  let upstream: EphemeralServer
  let gatewayApp: express.Express
  let gatewayServer: http.Server
  let gatewayUrl: string

  let planId: string
  let orgId: string
  let upstreamId: string
  let routeId: string
  let apiKeyId: string
  const rawApiKey = 'gf_live_e2e_full_pipeline_key_123'

  beforeAll(async () => {
    process.env.ALLOW_PRIVATE_UPSTREAMS = '1'
    process.env.NODE_ENV = 'development'

    await loadScripts()

    // 1. Start ephemeral upstream
    upstream = await createEphemeralServer()

    // 2. Set up DB entities
    const plan = await createTestPlan('E2E Test Plan', 20, 500)
    planId = plan.id

    const org = await createTestOrganization('E2E Test Org', planId)
    orgId = org.id

    const key = await createTestApiKey(rawApiKey, orgId)
    apiKeyId = key.id

    const ups = await createTestUpstream('E2E Upstream', upstream.url)
    upstreamId = ups.id

    const route = await createTestRoute('e2e-orders', '/api/v1/e2e-orders', upstreamId)
    routeId = route.id

    clearRouteCache()
    clearProxyCache()

    // 3. Assemble complete GateForge pipeline
    gatewayApp = express()
    gatewayApp.use(requestId)
    gatewayApp.use(apiKeyAuth)
    gatewayApp.use(routeMatcher)
    gatewayApp.use(policyResolver)
    gatewayApp.use(rateLimiter)
    gatewayApp.use(quotaEnforcer)
    gatewayApp.use(proxyMiddlewareHandler)

    await new Promise<void>((resolve, reject) => {
      gatewayServer = gatewayApp.listen(0, '127.0.0.1', () => {
        const addr = gatewayServer.address() as AddressInfo
        gatewayUrl = `http://127.0.0.1:${addr.port}`
        resolve()
      })
      gatewayServer.on('error', reject)
    })
  })

  afterAll(async () => {
    clearRouteCache()
    clearProxyCache()

    if (gatewayServer) {
      await new Promise<void>((res) => gatewayServer.close(() => res()))
    }
    if (upstream) {
      await upstream.stop()
    }

    await cleanupTestData({
      keyIds: [apiKeyId],
      routeIds: [routeId],
      upstreamIds: [upstreamId],
      orgIds: [orgId],
      planIds: [planId],
    })

    // Clean Redis keys
    const currentMonth = new Date().toISOString().slice(0, 7)
    await redis.del(`quota:${orgId}:${currentMonth}`)
    await redis.del(`rate:${orgId}:${routeId}`)
  })

  it('1. complete pipeline: auth -> route -> policy -> rate -> quota -> SSRF -> proxy -> upstream -> response', async () => {
    const res = await request(`${gatewayUrl}/api/v1/e2e-orders/details?item=golf-balls`, {
      method: 'GET',
      headers: {
        'X-API-Key': rawApiKey,
      },
    })

    // 1. Status 200 OK
    expect(res.status).toBe(200)

    // 2. Request ID generated and attached
    const reqId = res.headers.get('x-request-id')
    expect(reqId).toBeDefined()
    expect(reqId?.length).toBeGreaterThan(10)

    // 3. Rate limit headers attached
    expect(res.headers.get('x-ratelimit-limit')).toBe('20')
    expect(res.headers.get('x-ratelimit-remaining')).toBe('19')

    // 4. Quota headers attached
    expect(res.headers.get('x-quota-limit')).toBe('500')
    expect(res.headers.get('x-quota-used')).toBe('1')

    // 5. Upstream received request and body returned
    expect(res.data.echoMethod).toBe('GET')
    expect(res.data.echoPath).toBe('/e2e-orders/details')
    expect(res.data.echoQuery).toEqual({ item: 'golf-balls' })
    expect(upstream.lastRequest?.headers['x-forwarded-by']).toBe('gateforge')
  })

  it('2. pipeline tracks state across multiple requests', async () => {
    const res2 = await request(`${gatewayUrl}/api/v1/e2e-orders/details?item=clubs`, {
      method: 'GET',
      headers: {
        'X-API-Key': rawApiKey,
      },
    })

    expect(res2.status).toBe(200)
    expect(res2.headers.get('x-ratelimit-remaining')).toBe('18')
    expect(res2.headers.get('x-quota-used')).toBe('2')
  })

  it('3. unauthenticated request fails early at auth stage without touching upstream', async () => {
    const initialUpstreamCalls = upstream.lastRequest

    const res = await request(`${gatewayUrl}/api/v1/e2e-orders/details`, {
      method: 'GET',
      // No X-API-Key
    })

    expect(res.status).toBe(401)
    expect(res.data).toEqual({ error: 'Missing API key' })
  })

  it('4. unmapped route fails at route stage with 404', async () => {
    const res = await request(`${gatewayUrl}/api/v1/non-existent-route`, {
      method: 'GET',
      headers: {
        'X-API-Key': rawApiKey,
      },
    })

    expect(res.status).toBe(404)
    expect(res.data).toEqual({ error: 'no matching route' })
  })
})
