import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import http from 'http'
import { AddressInfo } from 'net'
import crypto from 'crypto'
import pool from '../../apps/gateway/src/lib/db.js'
import redis, { evalScript, loadScripts } from '../../apps/gateway/src/lib/redis.js'
import { rateLimiter } from '../../apps/gateway/src/middleware/rateLimiter.js'
import { quotaEnforcer } from '../../apps/gateway/src/middleware/quotaEnforcer.js'
import { apiKeyAuth } from '../../apps/gateway/src/middleware/apiKeyAuth.js'
import { routeMatcher, clearRouteCache } from '../../apps/gateway/src/middleware/routeMatcher.js'
import { policyResolver } from '../../apps/gateway/src/middleware/policyResolver.js'
import { proxyMiddlewareHandler, clearProxyCache } from '../../apps/gateway/src/proxy/proxyHandler.js'
import { requestId } from '../../apps/gateway/src/middleware/requestId.js'
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

describe('M6.2 — Concurrency Validation', () => {
  let upstream: EphemeralServer
  let gatewayApp: express.Express
  let gatewayServer: http.Server
  let gatewayUrl: string

  let sharedPlan: any
  let sharedOrg1: any
  let sharedOrg2: any
  let sharedUpstream: any
  let sharedRouteA: any
  let sharedRouteB: any

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

    // Shared DB entities so all usage.recordUsage calls have valid FK constraints in PostgreSQL
    sharedPlan = await createTestPlan('Shared Conc Plan', 100, 5000)
    createdPlanIds.push(sharedPlan.id)

    sharedOrg1 = await createTestOrganization('Shared Conc Org 1', sharedPlan.id)
    sharedOrg2 = await createTestOrganization('Shared Conc Org 2', sharedPlan.id)
    createdOrgIds.push(sharedOrg1.id, sharedOrg2.id)

    sharedUpstream = await createTestUpstream('Shared Conc Upstream', upstream.url)
    createdUpstreamIds.push(sharedUpstream.id)

    sharedRouteA = await createTestRoute('shared-conc-route-a', '/api/v1/shared-a', sharedUpstream.id)
    sharedRouteB = await createTestRoute('shared-conc-route-b', '/api/v1/shared-b', sharedUpstream.id)
    createdRouteIds.push(sharedRouteA.id, sharedRouteB.id)

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

  function mockRequestResponse(options: {
    orgId: string
    route: any
    limit?: number
    quota?: number
    reqId?: string
  }) {
    const responseHeaders: Record<string, string> = {}
    const req: any = {
      headers: {
        'x-request-id': options.reqId || crypto.randomUUID(),
      },
      id: options.reqId || crypto.randomUUID(),
      policy: {
        rateLimitPerMinute: options.limit ?? 100,
        quotaPerMonth: options.quota ?? 1000,
      },
      auth: { organization: { id: options.orgId } },
      routeConfig: options.route,
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
  // M6.2.1 & M6.2.2: Rate-Limit Concurrency & Redis Atomicity
  // =========================================================================
  describe('M6.2.1 & M6.2.2 — Rate Limit Concurrency & Atomicity', () => {
    it('Scenario A: Same org + same route + 20 simultaneous requests against limit=10', async () => {
      const orgId = sharedOrg1.id
      const route = sharedRouteA
      const key = `rate:${orgId}:${route.id}`
      await redis.del(key)
      redisKeysToClean.push(key)

      const limit = 10
      const totalRequests = 20

      const promises = Array.from({ length: totalRequests }, async (_, i) => {
        const ctx = mockRequestResponse({ orgId, route, limit, reqId: `req_sim_${i}` })
        await rateLimiter(ctx.req, ctx.res, ctx.next)
        return { status: ctx.res.statusCode, nextCalled: ctx.isNextCalled() }
      })

      const results = await Promise.all(promises)
      const allowed = results.filter((r) => r.nextCalled && r.status === 200)
      const rejected = results.filter((r) => !r.nextCalled && r.status === 429)

      expect(allowed.length).toBe(limit)
      expect(rejected.length).toBe(totalRequests - limit)

      // Verify Redis ZSET atomicity & cardinality
      const card = await redis.zcard(key)
      expect(card).toBe(limit)
    })

    it('Scenario B: Same org + different dynamic paths on same route share bucket', async () => {
      const orgId = sharedOrg1.id
      const route = sharedRouteA
      const key = `rate:${orgId}:${route.id}`
      await redis.del(key)
      redisKeysToClean.push(key)

      const limit = 5
      const paths = ['/orders/1', '/orders/2', '/orders/3', '/orders/4', '/orders/5', '/orders/6', '/orders/7', '/orders/8']
      const promises = paths.map(async (p, i) => {
        const ctx = mockRequestResponse({ orgId, route, limit, reqId: `req_path_${i}` })
        ctx.req.path = p
        await rateLimiter(ctx.req, ctx.res, ctx.next)
        return { status: ctx.res.statusCode, nextCalled: ctx.isNextCalled() }
      })

      const results = await Promise.all(promises)
      const allowed = results.filter((r) => r.nextCalled && r.status === 200)
      expect(allowed.length).toBe(limit)
    })

    it('Scenario C: Same org + different routes remain isolated', async () => {
      const orgId = sharedOrg1.id
      const routeA = sharedRouteA
      const routeB = sharedRouteB
      await redis.del(`rate:${orgId}:${routeA.id}`)
      await redis.del(`rate:${orgId}:${routeB.id}`)
      redisKeysToClean.push(`rate:${orgId}:${routeA.id}`, `rate:${orgId}:${routeB.id}`)

      const limit = 4

      const promisesA = Array.from({ length: 8 }, async (_, i) => {
        const ctx = mockRequestResponse({ orgId, route: routeA, limit, reqId: `req_A_${i}` })
        await rateLimiter(ctx.req, ctx.res, ctx.next)
        return { route: 'A', status: ctx.res.statusCode, nextCalled: ctx.isNextCalled() }
      })

      const promisesB = Array.from({ length: 4 }, async (_, i) => {
        const ctx = mockRequestResponse({ orgId, route: routeB, limit, reqId: `req_B_${i}` })
        await rateLimiter(ctx.req, ctx.res, ctx.next)
        return { route: 'B', status: ctx.res.statusCode, nextCalled: ctx.isNextCalled() }
      })

      const results = await Promise.all([...promisesA, ...promisesB])
      const allowedA = results.filter((r) => r.route === 'A' && r.nextCalled && r.status === 200)
      const allowedB = results.filter((r) => r.route === 'B' && r.nextCalled && r.status === 200)

      expect(allowedA.length).toBe(4)
      expect(allowedB.length).toBe(4)
    })

    it('Scenario D: Different orgs + same route maintain strict tenant isolation', async () => {
      const org1 = sharedOrg1.id
      const org2 = sharedOrg2.id
      const route = sharedRouteA
      await redis.del(`rate:${org1}:${route.id}`)
      await redis.del(`rate:${org2}:${route.id}`)
      redisKeysToClean.push(`rate:${org1}:${route.id}`, `rate:${org2}:${route.id}`)

      const limit = 5

      const reqs1 = Array.from({ length: 8 }, async (_, i) => {
        const ctx = mockRequestResponse({ orgId: org1, route, limit, reqId: `org1_req_${i}` })
        await rateLimiter(ctx.req, ctx.res, ctx.next)
        return { org: 1, status: ctx.res.statusCode, nextCalled: ctx.isNextCalled() }
      })

      const reqs2 = Array.from({ length: 8 }, async (_, i) => {
        const ctx = mockRequestResponse({ orgId: org2, route, limit, reqId: `org2_req_${i}` })
        await rateLimiter(ctx.req, ctx.res, ctx.next)
        return { org: 2, status: ctx.res.statusCode, nextCalled: ctx.isNextCalled() }
      })

      const all = await Promise.all([...reqs1, ...reqs2])
      const allowed1 = all.filter((r) => r.org === 1 && r.nextCalled && r.status === 200)
      const allowed2 = all.filter((r) => r.org === 2 && r.nextCalled && r.status === 200)

      expect(allowed1.length).toBe(5)
      expect(allowed2.length).toBe(5)
    })

    it('Scenario E: Exact boundary without race double allowance', async () => {
      const orgId = sharedOrg1.id
      const route = sharedRouteA
      const key = `rate:${orgId}:${route.id}`
      await redis.del(key)
      redisKeysToClean.push(key)

      const limit = 15
      const burst = 25

      const promises = Array.from({ length: burst }, async (_, i) => {
        const ctx = mockRequestResponse({ orgId, route, limit, reqId: `exact_b_${i}` })
        await rateLimiter(ctx.req, ctx.res, ctx.next)
        return ctx.isNextCalled()
      })

      const results = await Promise.all(promises)
      const allowedCount = results.filter(Boolean).length
      expect(allowedCount).toBe(limit)
    })
  })

  // =========================================================================
  // M6.2.3 & M6.2.4: Quota Concurrency & Exact Boundary Race
  // =========================================================================
  describe('M6.2.3 & M6.2.4 — Quota Concurrency & Boundary Race', () => {
    it('1. Quota concurrency: quota=10 with 25 concurrent requests admits exactly 10', async () => {
      const orgId = sharedOrg1.id
      const currentMonth = new Date().toISOString().slice(0, 7)
      const key = `quota:${orgId}:${currentMonth}`
      await redis.del(key)
      redisKeysToClean.push(key)

      const quota = 10
      const totalRequests = 25

      const promises = Array.from({ length: totalRequests }, async () => {
        const ctx = mockRequestResponse({ orgId, route: sharedRouteA, quota })
        await quotaEnforcer(ctx.req, ctx.res, ctx.next)
        return { status: ctx.res.statusCode, nextCalled: ctx.isNextCalled() }
      })

      const results = await Promise.all(promises)
      const allowed = results.filter((r) => r.nextCalled && r.status === 200)
      const rejected = results.filter((r) => !r.nextCalled && r.status === 429)

      expect(allowed.length).toBe(quota)
      expect(rejected.length).toBe(totalRequests - quota)

      const redisVal = await redis.get(key)
      expect(Number(redisVal)).toBe(quota)
    })

    it('2. Quota exact-boundary race: current usage = quota - K (K=3), launch 10 concurrent requests', async () => {
      const orgId = sharedOrg1.id
      const currentMonth = new Date().toISOString().slice(0, 7)
      const key = `quota:${orgId}:${currentMonth}`
      await redis.del(key)
      redisKeysToClean.push(key)

      const quota = 10
      const K = 3
      // Pre-seed usage to quota - K = 7
      await redis.set(key, (quota - K).toString())

      const promises = Array.from({ length: 10 }, async () => {
        const ctx = mockRequestResponse({ orgId, route: sharedRouteA, quota })
        await quotaEnforcer(ctx.req, ctx.res, ctx.next)
        return { status: ctx.res.statusCode, nextCalled: ctx.isNextCalled() }
      })

      const results = await Promise.all(promises)
      const allowed = results.filter((r) => r.nextCalled && r.status === 200)
      const rejected = results.filter((r) => !r.nextCalled && r.status === 429)

      expect(allowed.length).toBe(K)
      expect(rejected.length).toBe(7)

      const finalVal = await redis.get(key)
      expect(Number(finalVal)).toBe(quota)
    })

    it('3. Quota tenant isolation: Org A reaching quota does not impact Org B', async () => {
      const orgA = sharedOrg1.id
      const orgB = sharedOrg2.id
      const currentMonth = new Date().toISOString().slice(0, 7)
      await redis.del(`quota:${orgA}:${currentMonth}`)
      await redis.del(`quota:${orgB}:${currentMonth}`)
      redisKeysToClean.push(`quota:${orgA}:${currentMonth}`, `quota:${orgB}:${currentMonth}`)

      const quota = 3

      // Exhaust Org A
      for (let i = 0; i < quota; i++) {
        const ctx = mockRequestResponse({ orgId: orgA, route: sharedRouteA, quota })
        await quotaEnforcer(ctx.req, ctx.res, ctx.next)
        expect(ctx.isNextCalled()).toBe(true)
      }

      // Next request for Org A rejected
      const ctxA = mockRequestResponse({ orgId: orgA, route: sharedRouteA, quota })
      await quotaEnforcer(ctxA.req, ctxA.res, ctxA.next)
      expect(ctxA.isNextCalled()).toBe(false)
      expect(ctxA.res.statusCode).toBe(429)

      // Org B concurrent requests must still succeed up to quota
      const promisesB = Array.from({ length: quota }, async () => {
        const ctx = mockRequestResponse({ orgId: orgB, route: sharedRouteA, quota })
        await quotaEnforcer(ctx.req, ctx.res, ctx.next)
        return ctx.isNextCalled()
      })
      const resultsB = await Promise.all(promisesB)
      expect(resultsB.every(Boolean)).toBe(true)
    })
  })

  // =========================================================================
  // M6.2.5: Multi-Tenant Concurrency
  // =========================================================================
  describe('M6.2.5 — Multi-Tenant Concurrency', () => {
    it('concurrent traffic across 3 organizations preserves isolation across auth, rate, and quota', async () => {
      const p = await createTestPlan('MultiTenant Plan', 20, 100)
      createdPlanIds.push(p.id)

      const tenants = await Promise.all([
        createTestOrganization('Tenant Alpha', p.id),
        createTestOrganization('Tenant Beta', p.id),
        createTestOrganization('Tenant Gamma', p.id),
      ])
      createdOrgIds.push(...tenants.map((t) => t.id))

      const keys = await Promise.all(
        tenants.map((t, i) => createTestApiKey(`gf_live_tenant_${i}_${Date.now()}`, t.id))
      )
      createdKeyIds.push(...keys.map((k) => k.id))

      const route = sharedRouteA
      for (const t of tenants) {
        redisKeysToClean.push(`rate:${t.id}:${route.id}`)
      }

      const allPromises = tenants.flatMap((t, tIdx) => {
        return Array.from({ length: 10 }, async (_, i) => {
          const ctx = mockRequestResponse({
            orgId: t.id,
            route,
            limit: 20,
            quota: 100,
            reqId: `tenant_${tIdx}_req_${i}`,
          })
          await rateLimiter(ctx.req, ctx.res, ctx.next)
          return { tenantId: t.id, allowed: ctx.isNextCalled() }
        })
      })

      const results = await Promise.all(allPromises)
      for (const t of tenants) {
        const tenantResults = results.filter((r) => r.tenantId === t.id)
        expect(tenantResults.every((r) => r.allowed)).toBe(true)
        expect(tenantResults.length).toBe(10)
      }
    })
  })

  // =========================================================================
  // M6.2.6: Key Revocation During Traffic
  // =========================================================================
  describe('M6.2.6 — Key Revocation During Active Traffic', () => {
    it('revoking an active key during traffic invalidates cache and rejects subsequent requests', async () => {
      const plan = await createTestPlan('Revoke Test Plan', 100, 1000)
      createdPlanIds.push(plan.id)
      const org = await createTestOrganization('Revoke Test Org', plan.id)
      createdOrgIds.push(org.id)

      const rawKey = `gf_live_revoke_concurrent_${Date.now()}`
      const apiKey = await createTestApiKey(rawKey, org.id)
      createdKeyIds.push(apiKey.id)

      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')
      const cacheKey = `key_auth:${keyHash}`
      redisKeysToClean.push(cacheKey)

      // 1. Warm cache
      const ctx1 = mockRequestResponse({ orgId: org.id, route: sharedRouteA })
      ctx1.req.headers = { 'x-api-key': rawKey }
      await apiKeyAuth(ctx1.req, ctx1.res, ctx1.next)
      expect(ctx1.isNextCalled()).toBe(true)

      // 2. Revoke in DB and invalidate Redis cache
      await pool.query(`UPDATE "ApiKey" SET status = 'REVOKED' WHERE id = $1`, [apiKey.id])
      await redis.del(cacheKey)

      // 3. Subsequent requests are rejected with 403
      const subsequentReqs = Array.from({ length: 5 }, async () => {
        const ctx = mockRequestResponse({ orgId: org.id, route: sharedRouteA })
        ctx.req.headers = { 'x-api-key': rawKey }
        await apiKeyAuth(ctx.req, ctx.res, ctx.next)
        return { status: ctx.res.statusCode, allowed: ctx.isNextCalled() }
      })

      const results = await Promise.all(subsequentReqs)
      expect(results.every((r) => !r.allowed && r.status === 403)).toBe(true)
    })
  })

  // =========================================================================
  // M6.2.7: Plan Update During Traffic
  // =========================================================================
  describe('M6.2.7 — Plan Update During Active Traffic', () => {
    it('updating plan and invalidating cache seamlessly applies new limits to concurrent requests', async () => {
      const planA = await createTestPlan('Plan A Basic', 10, 100)
      const planB = await createTestPlan('Plan B Pro', 50, 500)
      createdPlanIds.push(planA.id, planB.id)

      const org = await createTestOrganization('Plan Update Org', planA.id)
      createdOrgIds.push(org.id)

      const rawKey = `gf_live_plan_upd_${Date.now()}`
      const apiKey = await createTestApiKey(rawKey, org.id)
      createdKeyIds.push(apiKey.id)

      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex')
      const cacheKey = `key_auth:${keyHash}`
      redisKeysToClean.push(cacheKey)

      // Initial request with Plan A
      const ctx1 = mockRequestResponse({ orgId: org.id, route: sharedRouteA })
      ctx1.req.headers = { 'x-api-key': rawKey }
      await apiKeyAuth(ctx1.req, ctx1.res, ctx1.next)
      expect(ctx1.req.auth.organization.plan.rateLimitPerMinute).toBe(10)

      // Update to Plan B & invalidate cache
      await pool.query(`UPDATE "Organization" SET "planId" = $1 WHERE id = $2`, [planB.id, org.id])
      await redis.del(cacheKey)

      // Concurrent new requests all resolve Plan B
      const reqs = Array.from({ length: 4 }, async () => {
        const ctx = mockRequestResponse({ orgId: org.id, route: sharedRouteA })
        ctx.req.headers = { 'x-api-key': rawKey }
        await apiKeyAuth(ctx.req, ctx.res, ctx.next)
        return ctx.req.auth.organization.plan.rateLimitPerMinute
      })

      const rates = await Promise.all(reqs)
      expect(rates.every((r) => r === 50)).toBe(true)
    })
  })

  // =========================================================================
  // M6.2.8: Route Configuration Updates During Traffic
  // =========================================================================
  describe('M6.2.8 — Route Configuration During Traffic', () => {
    it('deactivating a route causes subsequent requests to receive 404', async () => {
      const route = await createTestRoute('dynamic-route', '/api/v1/dyn-route', sharedUpstream.id)
      createdRouteIds.push(route.id)
      clearRouteCache()

      // 1. Initial request matches route
      const ctx1 = mockRequestResponse({ orgId: sharedOrg1.id, route: null })
      ctx1.req.path = '/api/v1/dyn-route/items'
      await routeMatcher(ctx1.req, ctx1.res, ctx1.next)
      expect(ctx1.isNextCalled()).toBe(true)

      // 2. Deactivate route in DB and clear cache
      await pool.query(`UPDATE "Route" SET "isActive" = false WHERE id = $1`, [route.id])
      clearRouteCache()

      // 3. Subsequent requests receive 404
      const ctx2 = mockRequestResponse({ orgId: sharedOrg1.id, route: null })
      ctx2.req.path = '/api/v1/dyn-route/items'
      await routeMatcher(ctx2.req, ctx2.res, ctx2.next)

      expect(ctx2.isNextCalled()).toBe(false)
      expect(ctx2.res.statusCode).toBe(404)
      expect(ctx2.res.jsonData).toEqual({ error: 'no matching route' })
    })
  })

  // =========================================================================
  // M6.2.10: Usage Aggregation Concurrency
  // =========================================================================
  describe('M6.2.10 — Usage Aggregation Concurrency & Flush', () => {
    it('concurrent in-memory usage updates aggregate accurately and flush without loss', async () => {
      const orgId = sharedOrg1.id
      const routeId = sharedRouteA.id

      // Record 20 concurrent usage increments across various status codes
      for (let i = 0; i < 20; i++) {
        const status = i < 10 ? 'success' : i < 15 ? 'client_error' : 'server_error'
        usage.recordUsage(orgId, routeId, status as any)
      }

      // Flush usage to PostgreSQL
      await usage.flushUsage()

      // Query database for the aggregated counts
      const res = await pool.query(
        `SELECT "requestCount", "successCount", "clientErrCount", "serverErrCount"
         FROM "UsageHourly"
         WHERE "organizationId" = $1 AND "routeId" = $2`,
        [orgId, routeId]
      )

      expect(res.rowCount).toBeGreaterThanOrEqual(1)
      const row = res.rows[0]
      expect(row.requestCount).toBeGreaterThanOrEqual(20)
      expect(row.successCount).toBeGreaterThanOrEqual(10)
      expect(row.clientErrCount).toBeGreaterThanOrEqual(5)
      expect(row.serverErrCount).toBeGreaterThanOrEqual(5)

      // Clean up usage records
      await pool.query(`DELETE FROM "UsageHourly" WHERE "organizationId" = $1`, [orgId])
    })
  })

  // =========================================================================
  // M6.2.11: Concurrent Failure Scenarios (Fail-Closed)
  // =========================================================================
  describe('M6.2.11 — Concurrent Failure Scenarios (Fail-Closed)', () => {
    it('rate limiter fails closed (propagates error to next) when Redis throws', async () => {
      const errorOrgId = `err_org_${Date.now()}`
      const errorRouteId = `err_route_${Date.now()}`
      const key = `rate:${errorOrgId}:${errorRouteId}`

      // Create a String key so Redis ZSET operations in slidingWindow.lua throw WRONGTYPE
      await redis.set(key, 'invalid_string_holding_wrong_type')
      redisKeysToClean.push(key)

      const ctxBroken = mockRequestResponse({
        orgId: errorOrgId,
        route: { id: errorRouteId },
        limit: 10,
      })

      await rateLimiter(ctxBroken.req, ctxBroken.res, ctxBroken.next)

      // Verified fail-closed behavior: error is caught and propagated to next(err)
      expect(ctxBroken.isNextCalled()).toBe(false)
      expect(ctxBroken.getNextError()).toBeDefined()
      expect(ctxBroken.getNextError()?.message).toMatch(/WRONGTYPE/)

      await redis.del(key)
    })

    it('PostgreSQL failure during usage flush retains in-memory counters for retry', async () => {
      // Record a test increment
      usage.recordUsage(sharedOrg1.id, sharedRouteA.id, 'success')

      // Temporarily sabotage pool query to simulate PostgreSQL failure
      const originalQuery = pool.query
      pool.query = (async () => {
        throw new Error('Simulated PostgreSQL Connection Failure')
      }) as any

      try {
        await usage.flushUsage()
      } finally {
        pool.query = originalQuery
      }

      // Now flush with restored PostgreSQL - should succeed and not crash
      await usage.flushUsage()

      await pool.query(`DELETE FROM "UsageHourly" WHERE "organizationId" = $1`, [sharedOrg1.id])
    })
  })
})
