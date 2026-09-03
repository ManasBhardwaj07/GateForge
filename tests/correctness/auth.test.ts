import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { apiKeyAuth } from '../../apps/gateway/src/middleware/apiKeyAuth.js'
import redis from '../../apps/gateway/src/lib/redis.js'
import {
  createTestPlan,
  createTestOrganization,
  createTestApiKey,
  cleanupTestData,
} from '../helpers/testDb.js'

describe('M6.1 — Authentication Correctness', () => {
  let planId: string
  let orgId: string
  const createdKeys: string[] = []

  beforeAll(async () => {
    const plan = await createTestPlan('Auth Test Plan', 100, 5000)
    planId = plan.id
    const org = await createTestOrganization('Auth Test Org', planId)
    orgId = org.id
  })

  afterAll(async () => {
    await cleanupTestData({
      keyIds: createdKeys,
      orgIds: [orgId],
      planIds: [planId],
    })
  })

  function mockRequestResponse(headers: Record<string, string> = {}) {
    const req: any = { headers }
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

  it('1. valid active key succeeds and attaches auth context', async () => {
    const rawKey = 'gf_live_valid_active_test_key_123'
    const key = await createTestApiKey(rawKey, orgId, { status: 'ACTIVE' })
    createdKeys.push(key.id)

    const ctx = mockRequestResponse({ 'x-api-key': rawKey })
    await apiKeyAuth(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(true)
    expect(ctx.res.statusCode).toBe(200)
    expect(ctx.req.auth).toBeDefined()
    expect(ctx.req.auth.organization.id).toBe(orgId)
  })

  it('2. missing API key returns 401', async () => {
    const ctx = mockRequestResponse({})
    await apiKeyAuth(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(false)
    expect(ctx.res.statusCode).toBe(401)
    expect(ctx.res.jsonData).toEqual({ error: 'Missing API key' })
  })

  it('3. invalid API key returns 401', async () => {
    const ctx = mockRequestResponse({ 'x-api-key': 'gf_invalid_key_nonexistent' })
    await apiKeyAuth(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(false)
    expect(ctx.res.statusCode).toBe(401)
    expect(ctx.res.jsonData).toEqual({ error: 'Invalid API key' })
  })

  it('4. malformed authorization header with empty key returns 401', async () => {
    const ctx = mockRequestResponse({ authorization: 'Bearer   ' })
    await apiKeyAuth(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(false)
    expect(ctx.res.statusCode).toBe(401)
    expect(ctx.res.jsonData).toEqual({ error: 'Missing API key' })
  })

  it('5. revoked key returns 403', async () => {
    const rawKey = 'gf_live_revoked_test_key_456'
    const key = await createTestApiKey(rawKey, orgId, { status: 'REVOKED' })
    createdKeys.push(key.id)

    const ctx = mockRequestResponse({ 'x-api-key': rawKey })
    await apiKeyAuth(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(false)
    expect(ctx.res.statusCode).toBe(403)
    expect(ctx.res.jsonData.error).toMatch(/revoked|inactive/)
  })

  it('6. expired status key returns 403', async () => {
    const rawKey = 'gf_live_expired_status_test_key_789'
    const key = await createTestApiKey(rawKey, orgId, { status: 'EXPIRED' })
    createdKeys.push(key.id)

    const ctx = mockRequestResponse({ 'x-api-key': rawKey })
    await apiKeyAuth(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(false)
    expect(ctx.res.statusCode).toBe(403)
    expect(ctx.res.jsonData.error).toMatch(/revoked|inactive/)
  })

  it('7. ACTIVE key with past expiresAt returns 403', async () => {
    const rawKey = 'gf_live_past_expires_test_key_321'
    const pastDate = new Date(Date.now() - 1000 * 60 * 60) // 1 hour ago
    const key = await createTestApiKey(rawKey, orgId, { status: 'ACTIVE', expiresAt: pastDate })
    createdKeys.push(key.id)

    const ctx = mockRequestResponse({ 'x-api-key': rawKey })
    await apiKeyAuth(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(false)
    expect(ctx.res.statusCode).toBe(403)
    expect(ctx.res.jsonData).toEqual({ error: 'API key expired' })
  })

  it('8. cached key that has expired is rejected from cache with 403', async () => {
    const rawKey = 'gf_live_cached_expired_test_key_654'
    const hash = (await import('crypto')).createHash('sha256').update(rawKey).digest('hex')
    const cacheKey = `key_auth:${hash}`

    // Populate Redis with an expired entry
    const expiredAuth = {
      apiKeyHash: hash,
      expiresAt: new Date(Date.now() - 5000).toISOString(),
      organization: { id: orgId, slug: 'test-slug', plan: { id: planId } },
    }
    await redis.set(cacheKey, JSON.stringify(expiredAuth), 'EX', 60)

    const ctx = mockRequestResponse({ 'x-api-key': rawKey })
    await apiKeyAuth(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(false)
    expect(ctx.res.statusCode).toBe(403)
    expect(ctx.res.jsonData).toEqual({ error: 'API key expired' })

    await redis.del(cacheKey)
  })

  it('9. key with future expiration date succeeds', async () => {
    const rawKey = 'gf_live_future_expires_test_key_987'
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24) // 24 hours in future
    const key = await createTestApiKey(rawKey, orgId, { status: 'ACTIVE', expiresAt: futureDate })
    createdKeys.push(key.id)

    const ctx = mockRequestResponse({ 'x-api-key': rawKey })
    await apiKeyAuth(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(true)
    expect(ctx.res.statusCode).toBe(200)
    expect(ctx.req.auth.expiresAt).toBeDefined()
  })

  it('10. key belongs to correct organization in auth context', async () => {
    const rawKey = 'gf_live_org_check_test_key_111'
    const key = await createTestApiKey(rawKey, orgId, { status: 'ACTIVE' })
    createdKeys.push(key.id)

    const ctx = mockRequestResponse({ 'x-api-key': rawKey })
    await apiKeyAuth(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(true)
    expect(ctx.req.auth.organization.id).toBe(orgId)
    expect(ctx.req.auth.organization.plan.id).toBe(planId)
  })
})
