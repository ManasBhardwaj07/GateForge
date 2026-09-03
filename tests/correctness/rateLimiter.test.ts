import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rateLimiter } from '../../apps/gateway/src/middleware/rateLimiter.js'
import redis, { evalScript } from '../../apps/gateway/src/lib/redis.js'
import crypto from 'crypto'

describe('M6.1 — Rate Limiter Correctness', () => {
  const orgId = 'org_rate_test_123'
  const routeA = { id: 'route_rate_A', slug: 'route-a' }
  const routeB = { id: 'route_rate_B', slug: 'route-b' }

  beforeEach(async () => {
    await redis.del(`rate:${orgId}:${routeA.id}`)
    await redis.del(`rate:${orgId}:${routeB.id}`)
  })

  afterEach(async () => {
    await redis.del(`rate:${orgId}:${routeA.id}`)
    await redis.del(`rate:${orgId}:${routeB.id}`)
  })

  function mockRequestResponse(route: any, limit: number, reqId?: string) {
    const headers: Record<string, string> = {
      'x-request-id': reqId || crypto.randomUUID(),
    }
    const responseHeaders: Record<string, string> = {}
    const req: any = {
      headers,
      id: headers['x-request-id'],
      policy: { rateLimitPerMinute: limit },
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

  it('1. requests up to configured limit are allowed', async () => {
    const limit = 3
    for (let i = 1; i <= limit; i++) {
      const ctx = mockRequestResponse(routeA, limit)
      await rateLimiter(ctx.req, ctx.res, ctx.next)

      expect(ctx.isNextCalled()).toBe(true)
      expect(ctx.res.statusCode).toBe(200)
      expect(ctx.responseHeaders['X-RateLimit-Limit']).toBe('3')
      expect(ctx.responseHeaders['X-RateLimit-Remaining']).toBe((limit - i).toString())
    }
  })

  it('2. limit + 1 is rejected with 429 and rate limit exceeded message', async () => {
    const limit = 2
    // Req 1
    const ctx1 = mockRequestResponse(routeA, limit)
    await rateLimiter(ctx1.req, ctx1.res, ctx1.next)
    expect(ctx1.isNextCalled()).toBe(true)

    // Req 2
    const ctx2 = mockRequestResponse(routeA, limit)
    await rateLimiter(ctx2.req, ctx2.res, ctx2.next)
    expect(ctx2.isNextCalled()).toBe(true)

    // Req 3 (Limit + 1)
    const ctx3 = mockRequestResponse(routeA, limit)
    await rateLimiter(ctx3.req, ctx3.res, ctx3.next)

    expect(ctx3.isNextCalled()).toBe(false)
    expect(ctx3.res.statusCode).toBe(429)
    expect(ctx3.res.jsonData).toEqual({ error: 'rate limit exceeded' })
    expect(ctx3.responseHeaders['X-RateLimit-Remaining']).toBe('0')
  })

  it('3. dynamic paths sharing the same route share the rate limit bucket', async () => {
    const limit = 2
    // Path /orders/1
    const ctx1 = mockRequestResponse(routeA, limit)
    await rateLimiter(ctx1.req, ctx1.res, ctx1.next)
    expect(ctx1.isNextCalled()).toBe(true)

    // Path /orders/2
    const ctx2 = mockRequestResponse(routeA, limit)
    await rateLimiter(ctx2.req, ctx2.res, ctx2.next)
    expect(ctx2.isNextCalled()).toBe(true)

    // Path /orders/3 exceeds shared bucket
    const ctx3 = mockRequestResponse(routeA, limit)
    await rateLimiter(ctx3.req, ctx3.res, ctx3.next)
    expect(ctx3.isNextCalled()).toBe(false)
    expect(ctx3.res.statusCode).toBe(429)
  })

  it('4. different routes do not share bucket and are fully isolated', async () => {
    const limit = 1
    // Exhaust route A
    const ctxA1 = mockRequestResponse(routeA, limit)
    await rateLimiter(ctxA1.req, ctxA1.res, ctxA1.next)
    expect(ctxA1.isNextCalled()).toBe(true)

    const ctxA2 = mockRequestResponse(routeA, limit)
    await rateLimiter(ctxA2.req, ctxA2.res, ctxA2.next)
    expect(ctxA2.res.statusCode).toBe(429)

    // Route B must still be permitted
    const ctxB1 = mockRequestResponse(routeB, limit)
    await rateLimiter(ctxB1.req, ctxB1.res, ctxB1.next)
    expect(ctxB1.isNextCalled()).toBe(true)
    expect(ctxB1.res.statusCode).toBe(200)
  })

  it('5. same-millisecond requests maintain unique members in Redis ZSET', async () => {
    const key = `rate:${orgId}:ms_test`
    await redis.del(key)

    const fixedTimestamp = '1700000000000'
    const windowMs = '60000'
    const limit = '10'

    // Dispatch two requests with identical ms timestamps but unique request IDs
    const res1 = await evalScript('slidingWindow.lua', 1, key, fixedTimestamp, windowMs, limit, 'uuid-aaa')
    const res2 = await evalScript('slidingWindow.lua', 1, key, fixedTimestamp, windowMs, limit, 'uuid-bbb')

    expect(res1[0]).toBe(1) // allowed
    expect(res1[1]).toBe(9) // remaining: 10 - 0 - 1 = 9

    expect(res2[0]).toBe(1) // allowed
    expect(res2[1]).toBe(8) // remaining: 10 - 1 - 1 = 8

    const card = await redis.zcard(key)
    expect(card).toBe(2)

    await redis.del(key)
  })

  it('6. small controlled concurrent burst strictly enforces limit', async () => {
    const limit = 4
    const burstSize = 8

    const promises = Array.from({ length: burstSize }, async (_, i) => {
      const ctx = mockRequestResponse(routeA, limit, `concurrent_req_${i}`)
      await rateLimiter(ctx.req, ctx.res, ctx.next)
      return { status: ctx.res.statusCode, nextCalled: ctx.isNextCalled() }
    })

    const results = await Promise.all(promises)
    const passed = results.filter((r) => r.nextCalled && r.status === 200)
    const rejected = results.filter((r) => !r.nextCalled && r.status === 429)

    expect(passed.length).toBe(limit)
    expect(rejected.length).toBe(burstSize - limit)
  })

  it('7. boundary reset allows new requests once previous window expires', async () => {
    const key = `rate:${orgId}:reset_test`
    await redis.del(key)

    const windowMs = '1000'
    const limit = '1'

    // t = 1000: request 1 allowed
    const r1 = await evalScript('slidingWindow.lua', 1, key, '1000', windowMs, limit, 'req-1')
    expect(r1[0]).toBe(1)

    // t = 1500: request 2 rejected (inside window)
    const r2 = await evalScript('slidingWindow.lua', 1, key, '1500', windowMs, limit, 'req-2')
    expect(r2[0]).toBe(0)

    // t = 2001: request 3 allowed (previous entry pruned by ZREMRANGEBYSCORE)
    const r3 = await evalScript('slidingWindow.lua', 1, key, '2001', windowMs, limit, 'req-3')
    expect(r3[0]).toBe(1)

    await redis.del(key)
  })

  it('8. missing policy/auth context fails closed with 500', async () => {
    const ctx = mockRequestResponse(routeA, 10)
    ctx.req.policy = null
    await rateLimiter(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(false)
    expect(ctx.res.statusCode).toBe(500)
    expect(ctx.res.jsonData).toEqual({ error: 'missing policy, auth, or routeConfig' })
  })
})
