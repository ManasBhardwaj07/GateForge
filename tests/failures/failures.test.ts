import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import http from 'http'
import { AddressInfo } from 'net'
import crypto from 'crypto'
import pool from '../../apps/gateway/src/lib/db.js'
import redis, { loadScripts, evalScript } from '../../apps/gateway/src/lib/redis.js'
import { rateLimiter } from '../../apps/gateway/src/middleware/rateLimiter.js'
import { quotaEnforcer } from '../../apps/gateway/src/middleware/quotaEnforcer.js'
import { apiKeyAuth } from '../../apps/gateway/src/middleware/apiKeyAuth.js'
import { routeMatcher, clearRouteCache } from '../../apps/gateway/src/middleware/routeMatcher.js'
import { policyResolver } from '../../apps/gateway/src/middleware/policyResolver.js'
import { proxyMiddlewareHandler, clearProxyCache } from '../../apps/gateway/src/proxy/proxyHandler.js'
import { requestId } from '../../apps/gateway/src/middleware/requestId.js'
import { validateTargetUrl } from '../../apps/gateway/src/lib/ssrf.js'
import usage from '../../apps/gateway/src/lib/usage.js'
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

describe('M6.3 — Failure & Resilience Validation', () => {
  let upstream: EphemeralServer
  let gatewayApp: express.Express
  let gatewayServer: http.Server
  let gatewayUrl: string

  let planId: string
  let orgId: string
  let upstreamId: string
  let routeId: string
  let apiKeyId: string
  const rawKey = `gf_live_failure_test_key_${Date.now()}`

  const createdOrgIds: string[] = []
  const createdPlanIds: string[] = []
  const createdRouteIds: string[] = []
  const createdUpstreamIds: string[] = []
  const createdKeyIds: string[] = []
  const redisKeysToClean: string[] = []

  beforeAll(async () => {
    process.env.ALLOW_PRIVATE_UPSTREAMS = '1'
    process.env.NODE_ENV = 'development'

    await loadScripts()
    upstream = await createEphemeralServer()

    const plan = await createTestPlan('Failure Test Plan', 50, 1000)
    planId = plan.id
    createdPlanIds.push(planId)

    const org = await createTestOrganization('Failure Test Org', planId)
    orgId = org.id
    createdOrgIds.push(orgId)

    const key = await createTestApiKey(rawKey, orgId)
    apiKeyId = key.id
    createdKeyIds.push(apiKeyId)

    const ups = await createTestUpstream('Failure Upstream', upstream.url)
    upstreamId = ups.id
    createdUpstreamIds.push(upstreamId)

    const route = await createTestRoute('failure-route', '/api/v1/fail-test', upstreamId)
    routeId = route.id
    createdRouteIds.push(routeId)

    const deadUps = await createTestUpstream('Dead Upstream', 'http://127.0.0.1:49151')
    createdUpstreamIds.push(deadUps.id)
    const deadRoute = await createTestRoute('dead-route', '/api/v1/dead-upstream', deadUps.id)
    createdRouteIds.push(deadRoute.id)

    const slowRoute = await createTestRoute('slow-route', '/api/v1/slow-upstream', upstreamId, { timeoutMs: 150 })
    createdRouteIds.push(slowRoute.id)

    clearRouteCache()
    clearProxyCache()

    gatewayApp = express()
    gatewayApp.use(requestId)
    gatewayApp.use(apiKeyAuth)
    gatewayApp.use(routeMatcher)
    gatewayApp.use(policyResolver)
    gatewayApp.use(rateLimiter)
    gatewayApp.use(quotaEnforcer)
    gatewayApp.use(proxyMiddlewareHandler)

    // Standard Express error handling matching production gateway
    gatewayApp.use((err: any, _req: any, res: any, _next: any) => {
      res.status(500).json({ error: 'internal' })
    })

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
      keyIds: createdKeyIds,
      routeIds: createdRouteIds,
      upstreamIds: createdUpstreamIds,
      orgIds: createdOrgIds,
      planIds: createdPlanIds,
    })

    for (const k of redisKeysToClean) {
      await redis.del(k)
    }
  })

  function mockRequestResponse(route: any, limit = 50, quota = 1000) {
    const responseHeaders: Record<string, string> = {}
    const req: any = {
      headers: { 'x-request-id': crypto.randomUUID() },
      id: crypto.randomUUID(),
      policy: { rateLimitPerMinute: limit, quotaPerMonth: quota },
      auth: { organization: { id: orgId } },
      routeConfig: route,
    }
    const res: any = {
      statusCode: 200,
      jsonData: null,
      setHeader(name: string, val: string) {
        responseHeaders[name] = val
      },
      status(code: number) {
        this.statusCode = code
        return this
      },
      json(data: any) {
        this.jsonData = data
        return this
      },
    }
    let nextCalled = false
    let nextError: any = null
    const next = (err?: any) => {
      nextCalled = true
      nextError = err
    }
    return {
      req,
      res,
      responseHeaders,
      next: next as any,
      isNextCalled: () => nextCalled && !nextError,
      getNextError: () => nextError,
    }
  }

  // =========================================================================
  // M6.3.1 — REDIS FAILURE
  // =========================================================================
  describe('M6.3.1 — Redis Failure & Recovery', () => {
    it('1. rate limiter fails closed with 500 when Redis throws', async () => {
      const brokenKey = `rate:${orgId}:broken_zset`
      await redis.set(brokenKey, 'not_a_zset')
      redisKeysToClean.push(brokenKey)

      const ctx = mockRequestResponse({ id: 'broken_zset' }, 10)
      await rateLimiter(ctx.req, ctx.res, ctx.next)

      expect(ctx.isNextCalled()).toBe(false)
      expect(ctx.getNextError()).toBeDefined()
      expect(ctx.getNextError()?.message).toMatch(/WRONGTYPE/)
    })

    it('2. quota enforcer fails closed with 500 when Redis throws', async () => {
      const month = new Date().toISOString().slice(0, 7)
      const brokenKey = `quota:${orgId}:${month}`
      // Corrupt key to hash so INCRBY fails with WRONGTYPE
      await redis.del(brokenKey)
      await redis.hset(brokenKey, 'f1', 'v1')
      redisKeysToClean.push(brokenKey)

      const ctx = mockRequestResponse({ id: 'r1' }, 50, 100)
      await quotaEnforcer(ctx.req, ctx.res, ctx.next)

      expect(ctx.isNextCalled()).toBe(false)
      expect(ctx.getNextError()).toBeDefined()
      expect(ctx.getNextError()?.message).toMatch(/WRONGTYPE/)

      await redis.del(brokenKey)
    })

    it('3. recovery: after Redis state is restored, rate limiter immediately resumes normal operation', async () => {
      const key = `rate:${orgId}:recovered_route`
      await redis.del(key)
      redisKeysToClean.push(key)

      const ctx = mockRequestResponse({ id: 'recovered_route' }, 10)
      await rateLimiter(ctx.req, ctx.res, ctx.next)

      expect(ctx.isNextCalled()).toBe(true)
      expect(ctx.res.statusCode).toBe(200)
      expect(ctx.responseHeaders['X-RateLimit-Remaining']).toBe('9')
    })
  })

  // =========================================================================
  // M6.3.2 — POSTGRESQL FAILURE
  // =========================================================================
  describe('M6.3.2 — PostgreSQL Failure & Recovery', () => {
    it('1. route matcher remains operational using in-memory cache when DB is temporarily unreachable', async () => {
      // Warm route cache
      clearRouteCache()
      const ctxWarm = mockRequestResponse(null)
      ctxWarm.req.path = '/api/v1/fail-test/items'
      await routeMatcher(ctxWarm.req, ctxWarm.res, ctxWarm.next)
      expect(ctxWarm.isNextCalled()).toBe(true)

      // Temporarily sabotage pool.query to simulate PostgreSQL connection loss
      const originalQuery = pool.query
      pool.query = (async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:5433')
      }) as any

      try {
        // Subsequent requests within cache window (5000ms) continue to match routes successfully
        const ctxCached = mockRequestResponse(null)
        ctxCached.req.path = '/api/v1/fail-test/items'
        await routeMatcher(ctxCached.req, ctxCached.res, ctxCached.next)

        expect(ctxCached.isNextCalled()).toBe(true)
        expect(ctxCached.req.routeConfig.slug).toBe('failure-route')
      } finally {
        pool.query = originalQuery
      }
    })

    it('2. usage flush failure retains counters and successfully recovers on subsequent flush', async () => {
      usage.recordUsage(orgId, routeId, 'success')
      usage.recordUsage(orgId, routeId, 'client_error')

      const originalQuery = pool.query
      pool.query = (async () => {
        throw new Error('Simulated PostgreSQL Downtime')
      }) as any

      try {
        await usage.flushUsage()
      } finally {
        pool.query = originalQuery
      }

      // Restored PostgreSQL: flush succeeds without losing the recorded increments
      await usage.flushUsage()

      const res = await pool.query(
        `SELECT "requestCount", "successCount", "clientErrCount"
         FROM "UsageHourly"
         WHERE "organizationId" = $1 AND "routeId" = $2`,
        [orgId, routeId]
      )

      expect(res.rowCount).toBe(1)
      expect(res.rows[0].requestCount).toBeGreaterThanOrEqual(2)

      await pool.query(`DELETE FROM "UsageHourly" WHERE "organizationId" = $1`, [orgId])
    })
  })

  // =========================================================================
  // M6.3.3 — UPSTREAM FAILURE
  // =========================================================================
  describe('M6.3.3 — Upstream Failure & Passthrough', () => {
    it('1. upstream connection refused (dead port) returns 504 gateway timeout', async () => {
      const res = await request(`${gatewayUrl}/api/v1/dead-upstream`, {
        method: 'GET',
        headers: {
          'X-API-Key': rawKey,
        },
      })

      expect(res.status).toBe(504)
      expect(res.data).toEqual({ error: 'gateway timeout' })
    })

    it('2. upstream 500 error passes through with exact status and body', async () => {
      const res = await request(`${gatewayUrl}/api/v1/fail-test?status=500`, {
        method: 'GET',
        headers: { 'X-API-Key': rawKey },
      })

      expect(res.status).toBe(500)
      expect(res.data.echoQuery).toEqual({ status: '500' })
    })

    it('3. upstream 503 Service Unavailable passes through with 503 status', async () => {
      const res = await request(`${gatewayUrl}/api/v1/fail-test?status=503`, {
        method: 'GET',
        headers: { 'X-API-Key': rawKey },
      })

      expect(res.status).toBe(503)
      expect(res.data.echoQuery).toEqual({ status: '503' })
    })

    it('4. upstream timeout triggers 504 gateway timeout and preserves gateway health', async () => {
      // Upstream delays 400ms, route timeout configured in DB to 150ms
      const resTimeout = await request(`${gatewayUrl}/api/v1/slow-upstream?delay=400`, {
        method: 'GET',
        headers: {
          'X-API-Key': rawKey,
        },
      })

      expect(resTimeout.status).toBe(504)
      expect(resTimeout.data).toEqual({ error: 'gateway timeout' })

      // Subsequent normal request succeeds immediately
      const resOk = await request(`${gatewayUrl}/api/v1/fail-test`, {
        method: 'GET',
        headers: { 'X-API-Key': rawKey },
      })
      expect(resOk.status).toBe(200)
    })
  })

  // =========================================================================
  // M6.3.5 & M6.3.6 — DNS & SSRF FAILURE PATHS
  // =========================================================================
  describe('M6.3.5 & M6.3.6 — DNS & SSRF Failure Paths', () => {
    it('1. nonexistent target domain fails with 400 invalid upstream target', async () => {
      await expect(
        validateTargetUrl('http://nonexistent-gateforge-domain-xyz-987.invalid')
      ).rejects.toThrow()
    })

    it('2. resolution failure never allows SSRF bypass', async () => {
      await expect(
        validateTargetUrl('http://256.256.256.256')
      ).rejects.toThrow()

      await expect(
        validateTargetUrl('http://not-an-ip-or-domain')
      ).rejects.toThrow()
    })

    it('3. invalid protocol fails immediately', async () => {
      await expect(validateTargetUrl('gopher://127.0.0.1:70')).rejects.toThrow(/disallowed URL protocol/)
      await expect(validateTargetUrl('file:///etc/hosts')).rejects.toThrow(/disallowed URL protocol/)
    })

    it('4. AWS metadata endpoint is blocked unconditionally', async () => {
      await expect(validateTargetUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/cloud metadata/)
    })
  })

  // =========================================================================
  // M6.3.4 — CLIENT DISCONNECT / ABORT
  // =========================================================================
  describe('M6.3.4 — Client Disconnect / Abort', () => {
    it('client abort during request does not crash gateway process or leak unhandled rejection', async () => {
      const controller = new AbortController()

      // Fire request with 800ms delay and abort after 50ms
      let wasAborted = false
      const reqPromise = fetch(`${gatewayUrl}/api/v1/fail-test?delay=800`, {
        method: 'GET',
        headers: { 'X-API-Key': rawKey },
        signal: controller.signal,
      }).catch(() => {
        wasAborted = true
      })

      setTimeout(() => controller.abort(), 50)
      await reqPromise
      expect(wasAborted).toBe(true)

      // Gateway must remain fully functional
      const resFollowup = await request(`${gatewayUrl}/api/v1/fail-test`, {
        method: 'GET',
        headers: { 'X-API-Key': rawKey },
      })
      expect(resFollowup.status).toBe(200)
    })
  })

  // =========================================================================
  // M6.3.8 — GRACEFUL SHUTDOWN
  // =========================================================================
  describe('M6.3.8 — Graceful Shutdown', () => {
    it('stopUsageFlush clears timer and completes active flush cleanly', async () => {
      usage.startUsageFlush()
      usage.recordUsage(orgId, routeId, 'success')

      // Stop flush awaits active flush and clears interval timer
      await expect(usage.stopUsageFlush()).resolves.toBeUndefined()
    })
  })

  // =========================================================================
  // M6.3.10 — ERROR RESPONSE SANITIZATION
  // =========================================================================
  describe('M6.3.10 — Error Response Quality & Sanitization', () => {
    it('1. 401 response contains no internal leaks or stack traces', async () => {
      const res = await request(`${gatewayUrl}/api/v1/fail-test`)
      expect(res.status).toBe(401)
      expect(res.data).toEqual({ error: 'Missing API key' })
      expect(res.rawText).not.toMatch(/node_modules|stack|at |processTicksAndRejections/)
    })

    it('2. 404 response contains no internal leaks', async () => {
      const res = await request(`${gatewayUrl}/api/v1/non-existent-route-xyz`, {
        headers: { 'X-API-Key': rawKey },
      })
      expect(res.status).toBe(404)
      expect(res.data).toEqual({ error: 'no matching route' })
      expect(res.rawText).not.toMatch(/node_modules|stack|at |SELECT/)
    })

    it('3. 504 timeout response contains no internal leaks', async () => {
      const res = await request(`${gatewayUrl}/api/v1/slow-upstream?delay=400`, {
        headers: { 'X-API-Key': rawKey },
      })
      expect(res.status).toBe(504)
      expect(res.data).toEqual({ error: 'gateway timeout' })
      expect(res.rawText).not.toMatch(/node_modules|stack|at |ECONNRESET/)
    })
  })
})
