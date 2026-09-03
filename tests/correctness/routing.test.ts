import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  matchesRoutePrefix,
  routeMatcher,
  clearRouteCache,
} from '../../apps/gateway/src/middleware/routeMatcher.js'
import {
  createTestUpstream,
  createTestRoute,
  cleanupTestData,
} from '../helpers/testDb.js'

describe('M6.1 — Routing Correctness', () => {
  let upstreamId: string
  const createdRouteIds: string[] = []

  beforeAll(async () => {
    const ups = await createTestUpstream('Routing Upstream', 'http://localhost:5001')
    upstreamId = ups.id
  })

  afterAll(async () => {
    await cleanupTestData({
      routeIds: createdRouteIds,
      upstreamIds: [upstreamId],
    })
    clearRouteCache()
  })

  beforeEach(() => {
    clearRouteCache()
  })

  function mockRequestResponse(path: string, query: Record<string, string> = {}) {
    const req: any = {
      path,
      url: path + (Object.keys(query).length ? '?' + new URLSearchParams(query).toString() : ''),
      query,
    }
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

  it('1. matches exact route prefix /api/v1/orders', () => {
    expect(matchesRoutePrefix('/api/v1/orders', '/api/v1/orders')).toBe(true)
  })

  it('2. matches route prefix with trailing slash /api/v1/orders/', () => {
    expect(matchesRoutePrefix('/api/v1/orders/', '/api/v1/orders')).toBe(true)
    expect(matchesRoutePrefix('/api/v1/orders', '/api/v1/orders/')).toBe(true)
  })

  it('3. matches sub-path /api/v1/orders/123', () => {
    expect(matchesRoutePrefix('/api/v1/orders/123', '/api/v1/orders')).toBe(true)
  })

  it('4. matches nested sub-path /api/v1/orders/123/items', () => {
    expect(matchesRoutePrefix('/api/v1/orders/123/items', '/api/v1/orders')).toBe(true)
  })

  it('5. does not match partial word prefix /api/v1/order', () => {
    expect(matchesRoutePrefix('/api/v1/order', '/api/v1/orders')).toBe(false)
  })

  it('6. does not match prefix with suffix boundary violation /api/v1/ordersX', () => {
    expect(matchesRoutePrefix('/api/v1/ordersX', '/api/v1/orders')).toBe(false)
  })

  it('7. longest-prefix route wins when multiple routes match', async () => {
    const r1 = await createTestRoute('orders-base', '/api/v1/orders-test', upstreamId)
    const r2 = await createTestRoute('orders-items', '/api/v1/orders-test/items', upstreamId)
    createdRouteIds.push(r1.id, r2.id)

    const ctx = mockRequestResponse('/api/v1/orders-test/items/456')
    await routeMatcher(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(true)
    expect(ctx.req.routeConfig.slug).toBe('orders-items')
    expect(ctx.req.routeConfig.pathPrefix).toBe('/api/v1/orders-test/items')
  })

  it('8. inactive route does not match and returns 404', async () => {
    const inactiveRoute = await createTestRoute('inactive-route', '/api/v1/inactive-endpoint', upstreamId, {
      isActive: false,
    })
    createdRouteIds.push(inactiveRoute.id)

    const ctx = mockRequestResponse('/api/v1/inactive-endpoint')
    await routeMatcher(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(false)
    expect(ctx.res.statusCode).toBe(404)
    expect(ctx.res.jsonData).toEqual({ error: 'no matching route' })
  })

  it('9. duplicate pathPrefix resolution is deterministic (newest created route wins)', async () => {
    // Older route
    const rOlder = await createTestRoute('dup-older', '/api/v1/duplicate-path-test', upstreamId)
    // Delay slightly to guarantee different createdAt
    await new Promise((r) => setTimeout(r, 20))
    // Newer route with same pathPrefix
    const rNewer = await createTestRoute('dup-newer', '/api/v1/duplicate-path-test', upstreamId)
    createdRouteIds.push(rOlder.id, rNewer.id)

    clearRouteCache()
    const ctx = mockRequestResponse('/api/v1/duplicate-path-test/sub')
    await routeMatcher(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(true)
    expect(ctx.req.routeConfig.slug).toBe('dup-newer')
  })

  it('10. query string does not affect route matching incorrectly', async () => {
    const r = await createTestRoute('query-test-route', '/api/v1/query-test', upstreamId)
    createdRouteIds.push(r.id)

    const ctx = mockRequestResponse('/api/v1/query-test/details', { sort: 'desc', filter: 'active' })
    await routeMatcher(ctx.req, ctx.res, ctx.next)

    expect(ctx.isNextCalled()).toBe(true)
    expect(ctx.req.routeConfig.slug).toBe('query-test-route')
  })
})
