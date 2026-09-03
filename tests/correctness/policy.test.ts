import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { policyResolver } from '../../apps/gateway/src/middleware/policyResolver.js'
import { apiKeyAuth } from '../../apps/gateway/src/middleware/apiKeyAuth.js'
import pool from '../../apps/gateway/src/lib/db.js'
import redis from '../../apps/gateway/src/lib/redis.js'
import {
  createTestPlan,
  createTestOrganization,
  createTestApiKey,
  cleanupTestData,
} from '../helpers/testDb.js'

describe('M6.1 — Policy Resolution & Invalidation Correctness', () => {
  let defaultPlanId: string
  let overridePlanId: string
  let orgId: string
  let testKeyId: string
  const rawKey = 'gf_live_policy_test_key_xyz'

  beforeAll(async () => {
    const p1 = await createTestPlan('Default Org Plan', 50, 2000)
    defaultPlanId = p1.id
    const p2 = await createTestPlan('Route Override Plan', 200, 10000)
    overridePlanId = p2.id

    const org = await createTestOrganization('Policy Test Org', defaultPlanId)
    orgId = org.id

    const key = await createTestApiKey(rawKey, orgId)
    testKeyId = key.id
  })

  afterAll(async () => {
    await cleanupTestData({
      keyIds: [testKeyId],
      orgIds: [orgId],
      planIds: [defaultPlanId, overridePlanId],
    })
  })

  function mockRequestResponse(reqOverrides: any = {}) {
    const req: any = { ...reqOverrides }
    const res: any = {
      statusCode: 200,
      jsonData: null,
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
      next: next as any,
      isNextCalled: () => nextCalled && !nextError,
      getNextError: () => nextError,
    }
  }

  it('1. organization plan is used by default when no route override exists', () => {
    const ctx = mockRequestResponse({
      routeConfig: {
        id: 'route-1',
        slug: 'orders',
        pathPrefix: '/orders',
        planOverride: null,
      },
      auth: {
        organization: {
          id: orgId,
          plan: {
            id: defaultPlanId,
            rateLimitPerMinute: 50,
            quotaPerMonth: 2000,
          },
        },
      },
    })

    policyResolver(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(true)
    expect(ctx.req.policy).toEqual({
      rateLimitPerMinute: 50,
      quotaPerMonth: 2000,
    })
  })

  it('2. route plan override takes precedence over organization plan', () => {
    const ctx = mockRequestResponse({
      routeConfig: {
        id: 'route-2',
        slug: 'high-throughput-orders',
        pathPrefix: '/orders/bulk',
        planOverride: {
          id: overridePlanId,
          rateLimitPerMinute: 200,
          quotaPerMonth: 10000,
        },
      },
      auth: {
        organization: {
          id: orgId,
          plan: {
            id: defaultPlanId,
            rateLimitPerMinute: 50,
            quotaPerMonth: 2000,
          },
        },
      },
    })

    policyResolver(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(true)
    expect(ctx.req.policy).toEqual({
      rateLimitPerMinute: 200,
      quotaPerMonth: 10000,
    })
  })

  it('3. removing route override restores organization plan limits', () => {
    // Route config without planOverride
    const ctx = mockRequestResponse({
      routeConfig: {
        id: 'route-2',
        slug: 'orders',
        pathPrefix: '/orders',
        planOverride: undefined,
      },
      auth: {
        organization: {
          id: orgId,
          plan: {
            id: defaultPlanId,
            rateLimitPerMinute: 50,
            quotaPerMonth: 2000,
          },
        },
      },
    })

    policyResolver(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(true)
    expect(ctx.req.policy.rateLimitPerMinute).toBe(50)
    expect(ctx.req.policy.quotaPerMonth).toBe(2000)
  })

  it('4. updated plan values propagate after cache invalidation', async () => {
    const hash = (await import('crypto')).createHash('sha256').update(rawKey).digest('hex')
    await redis.del(`key_auth:${hash}`)

    // 1. Authenticate to load initial plan into cache
    const ctx1 = mockRequestResponse({ headers: { 'x-api-key': rawKey } })
    await apiKeyAuth(ctx1.req, ctx1.res, ctx1.next)
    expect(ctx1.isNextCalled()).toBe(true)
    expect(ctx1.req.auth.organization.plan.rateLimitPerMinute).toBe(50)

    // 2. Update the organization to point to overridePlanId
    await pool.query(`UPDATE "Organization" SET "planId" = $1 WHERE id = $2`, [overridePlanId, orgId])

    // 3. Before invalidation: still cached
    const ctx2 = mockRequestResponse({ headers: { 'x-api-key': rawKey } })
    await apiKeyAuth(ctx2.req, ctx2.res, ctx2.next)
    expect(ctx2.req.auth.organization.plan.rateLimitPerMinute).toBe(50)

    // 4. Invalidate cache
    await redis.del(`key_auth:${hash}`)

    // 5. After invalidation: reloads fresh plan from database
    const ctx3 = mockRequestResponse({ headers: { 'x-api-key': rawKey } })
    await apiKeyAuth(ctx3.req, ctx3.res, ctx3.next)
    expect(ctx3.isNextCalled()).toBe(true)
    expect(ctx3.req.auth.organization.plan.id).toBe(overridePlanId)
    expect(ctx3.req.auth.organization.plan.rateLimitPerMinute).toBe(200)

    // Revert org plan back to default
    await pool.query(`UPDATE "Organization" SET "planId" = $1 WHERE id = $2`, [defaultPlanId, orgId])
    await redis.del(`key_auth:${hash}`)
  })

  it('5. returns 500 if route or organization context is missing', () => {
    const ctx = mockRequestResponse({ routeConfig: null, auth: null })
    policyResolver(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(false)
    expect(ctx.res.statusCode).toBe(500)
    expect(ctx.res.jsonData).toEqual({ error: 'missing route or org' })
  })
})
