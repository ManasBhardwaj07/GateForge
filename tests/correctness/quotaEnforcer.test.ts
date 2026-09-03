import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { quotaEnforcer } from '../../apps/gateway/src/middleware/quotaEnforcer.js'
import redis, { evalScript } from '../../apps/gateway/src/lib/redis.js'

describe('M6.1 — Monthly Quota Enforcer Correctness', () => {
  const orgId = 'org_quota_test_456'
  const routeId = 'route_quota_1'
  const currentMonth = new Date().toISOString().slice(0, 7)
  const quotaKey = `quota:${orgId}:${currentMonth}`

  beforeEach(async () => {
    await redis.del(quotaKey)
  })

  afterEach(async () => {
    await redis.del(quotaKey)
  })

  function mockRequestResponse(quota: number) {
    const responseHeaders: Record<string, string> = {}
    const req: any = {
      policy: { quotaPerMonth: quota },
      auth: { organization: { id: orgId } },
      routeConfig: { id: routeId },
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

  it('1. requests up to quota are allowed and increment usage', async () => {
    const quota = 3
    for (let i = 1; i <= quota; i++) {
      const ctx = mockRequestResponse(quota)
      await quotaEnforcer(ctx.req, ctx.res, ctx.next)

      expect(ctx.isNextCalled()).toBe(true)
      expect(ctx.res.statusCode).toBe(200)
      expect(ctx.responseHeaders['X-Quota-Limit']).toBe('3')
      expect(ctx.responseHeaders['X-Quota-Used']).toBe(i.toString())
    }
  })

  it('2. quota + 1 is rejected with 429 and error message', async () => {
    const quota = 2

    // Req 1 & 2 pass
    const ctx1 = mockRequestResponse(quota)
    await quotaEnforcer(ctx1.req, ctx1.res, ctx1.next)
    expect(ctx1.isNextCalled()).toBe(true)

    const ctx2 = mockRequestResponse(quota)
    await quotaEnforcer(ctx2.req, ctx2.res, ctx2.next)
    expect(ctx2.isNextCalled()).toBe(true)

    // Req 3 fails
    const ctx3 = mockRequestResponse(quota)
    await quotaEnforcer(ctx3.req, ctx3.res, ctx3.next)

    expect(ctx3.isNextCalled()).toBe(false)
    expect(ctx3.res.statusCode).toBe(429)
    expect(ctx3.res.jsonData).toEqual({ error: 'quota exceeded' })
    expect(ctx3.responseHeaders['X-Quota-Used']).toBe('2')
  })

  it('3. verifies correct quota key format and UTC month calculation', async () => {
    const quota = 5
    const ctx = mockRequestResponse(quota)
    await quotaEnforcer(ctx.req, ctx.res, ctx.next)

    const exists = await redis.exists(quotaKey)
    expect(exists).toBe(1)

    const val = await redis.get(quotaKey)
    expect(val).toBe('1')

    // Verify key format structure: quota:<orgId>:<YYYY-MM>
    const parts = quotaKey.split(':')
    expect(parts[0]).toBe('quota')
    expect(parts[1]).toBe(orgId)
    expect(parts[2]).toMatch(/^\d{4}-\d{2}$/)
  })

  it('4. small controlled concurrent boundary enforces exact quota limit', async () => {
    const quota = 4
    const burstSize = 8

    const promises = Array.from({ length: burstSize }, async () => {
      const ctx = mockRequestResponse(quota)
      await quotaEnforcer(ctx.req, ctx.res, ctx.next)
      return { status: ctx.res.statusCode, nextCalled: ctx.isNextCalled() }
    })

    const results = await Promise.all(promises)
    const passed = results.filter((r) => r.nextCalled && r.status === 200)
    const rejected = results.filter((r) => !r.nextCalled && r.status === 429)

    expect(passed.length).toBe(quota)
    expect(rejected.length).toBe(burstSize - quota)

    const finalVal = await redis.get(quotaKey)
    expect(Number(finalVal)).toBe(quota)
  })

  it('5. unlimited quota (-1) is allowed and returns -1 usage', async () => {
    const unlimitedQuota = -1
    const res = await evalScript('atomicQuota.lua', 1, `quota:${orgId}:unlimited_test`, '1', unlimitedQuota.toString())

    expect(res[0]).toBe(1) // allowed
    expect(res[1]).toBe(-1) // usage is -1 (untracked)

    await redis.del(`quota:${orgId}:unlimited_test`)
  })

  it('6. missing policy or auth fails closed with 500', async () => {
    const ctx = mockRequestResponse(10)
    ctx.req.policy = null
    await quotaEnforcer(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(false)
    expect(ctx.res.statusCode).toBe(500)
    expect(ctx.res.jsonData).toEqual({ error: 'missing policy or auth' })
  })
})
