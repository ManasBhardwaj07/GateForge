import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import express from 'express'
import http from 'http'
import { AddressInfo } from 'net'
import { proxyMiddlewareHandler, clearProxyCache } from '../../apps/gateway/src/proxy/proxyHandler.js'
import { createEphemeralServer, EphemeralServer } from '../helpers/testServer.js'
import { request } from '../helpers/testClient.js'

describe('M6.1 — Dynamic Proxy Correctness', () => {
  let upstream: EphemeralServer
  let gatewayApp: express.Express
  let gatewayServer: http.Server
  let gatewayUrl: string

  beforeAll(async () => {
    process.env.ALLOW_PRIVATE_UPSTREAMS = '1'
    process.env.NODE_ENV = 'development'

    upstream = await createEphemeralServer()

    gatewayApp = express()
    // Middleware to set routeConfig dynamically based on query/header
    gatewayApp.use((req, res, next) => {
      const target = req.headers['x-test-target'] as string || upstream.url
      const timeoutMs = parseInt(req.headers['x-test-timeout'] as string || '30000', 10)

      ;(req as any).auth = { organization: { id: 'test_org' } }
      ;(req as any).routeConfig = {
        id: 'test_route_id',
        slug: 'test-route',
        pathPrefix: '/api/v1/test',
        upstream: target,
        timeoutMs,
      }
      next()
    })

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
    clearProxyCache()
    if (gatewayServer) {
      await new Promise<void>((res) => gatewayServer.close(() => res()))
    }
    if (upstream) {
      await upstream.stop()
    }
  })

  it('1. GET request forwarded correctly with headers and query parameters', async () => {
    const res = await request(`${gatewayUrl}/api/v1/orders?sort=desc&page=2`, {
      method: 'GET',
    })

    expect(res.status).toBe(200)
    expect(res.data.echoMethod).toBe('GET')
    expect(res.data.echoPath).toBe('/orders')
    expect(res.data.echoQuery).toEqual({ sort: 'desc', page: '2' })
    expect(upstream.lastRequest?.headers['x-forwarded-by']).toBe('gateforge')
  })

  it('2. POST request forwards JSON body intact with correct Content-Type', async () => {
    const payload = { item: 'Golf Bag', price: 149.99, inStock: true }
    const res = await request(`${gatewayUrl}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    })

    expect(res.status).toBe(200)
    expect(res.data.echoMethod).toBe('POST')
    expect(res.data.echoBody).toEqual(payload)
    expect(upstream.lastRequest?.body).toEqual(payload)
  })

  it('3. PUT request forwards body and updates properly', async () => {
    const payload = { status: 'SHIPPED', trackingNumber: 'TRK998811' }
    const res = await request(`${gatewayUrl}/api/v1/orders/123`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    })

    expect(res.status).toBe(200)
    expect(res.data.echoMethod).toBe('PUT')
    expect(res.data.echoPath).toBe('/orders/123')
    expect(res.data.echoBody).toEqual(payload)
  })

  it('4. PATCH request forwards partial updates', async () => {
    const payload = { isUrgent: true }
    const res = await request(`${gatewayUrl}/api/v1/orders/123`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    })

    expect(res.status).toBe(200)
    expect(res.data.echoMethod).toBe('PATCH')
    expect(res.data.echoBody).toEqual(payload)
  })

  it('5. DELETE request is dispatched to upstream', async () => {
    const res = await request(`${gatewayUrl}/api/v1/orders/456`, {
      method: 'DELETE',
    })

    expect(res.status).toBe(200)
    expect(res.data.echoMethod).toBe('DELETE')
    expect(res.data.echoPath).toBe('/orders/456')
  })

  it('6. upstream 500 error is passed through to client with upstream payload', async () => {
    const res = await request(`${gatewayUrl}/api/v1/error?status=500`, {
      method: 'GET',
    })

    expect(res.status).toBe(500)
    expect(res.data.echoQuery).toEqual({ status: '500' })
  })

  it('7. upstream timeout triggers 504 gateway timeout', async () => {
    // Timeout configured to 150ms, upstream will delay for 600ms
    const res = await request(`${gatewayUrl}/api/v1/slow?delay=600`, {
      method: 'GET',
      headers: {
        'x-test-timeout': '150',
      },
    })

    expect(res.status).toBe(504)
    expect(res.data).toEqual({ error: 'gateway timeout' })
  })

  it('8. unavailable upstream returns 504 gateway timeout', async () => {
    // Target points to an unused dead port on localhost
    const deadTarget = 'http://127.0.0.1:49150'
    const res = await request(`${gatewayUrl}/api/v1/dead`, {
      method: 'GET',
      headers: {
        'x-test-target': deadTarget,
        'x-test-timeout': '1000',
      },
    })

    expect(res.status).toBe(504)
    expect(res.data).toEqual({ error: 'gateway timeout' })
  })
})
