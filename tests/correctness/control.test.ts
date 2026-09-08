import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import express from 'express'
import http from 'http'
import { AddressInfo } from 'net'
import { request } from '../helpers/testClient.js'
import pool from '../../apps/gateway/src/lib/db.js'

describe('M6.5 — Control Plane Security & Correctness', () => {
  let app: express.Express
  let server: http.Server
  let url: string

  const token = 'test_operator_token'

  beforeAll(async () => {
    process.env.ALLOW_PRIVATE_UPSTREAMS = '1'
    process.env.CONTROL_TOKEN = token
    process.env.DASHBOARD_URL = 'https://dashboard.gateforge.internal'
    
    const { default: controlPlane } = await import('../../apps/gateway/src/controlPlane.js')

    app = express()
    app.use('/api/control', controlPlane)

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo
        url = `http://127.0.0.1:${addr.port}`
        resolve()
      })
      server.on('error', reject)
    })

    await pool.query('DELETE FROM "Route" WHERE slug IN (\'route-1\', \'route-2\', \'route-parent\', \'route-child\')')
  })

  afterAll(async () => {
    if (server) {
      await new Promise<void>((res) => server.close(() => res()))
    }
  })

  it('1. duplicate active prefix rejected with 409 Conflict', async () => {
    const upstreamRes = await request(`${url}/api/control/upstreams`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: { name: 'Test Upstream', baseUrl: 'http://127.0.0.1:3000' },
    })
    expect(upstreamRes.status).toBe(201)
    const upstreamId = upstreamRes.data.id

    const routeRes1 = await request(`${url}/api/control/routes`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: { slug: 'route-1', pathPrefix: '/api/v1/test-dup', upstreamId },
    })
    expect(routeRes1.status).toBe(201)

    const routeRes2 = await request(`${url}/api/control/routes`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: { slug: 'route-2', pathPrefix: '/api/v1/test-dup', upstreamId },
    })
    expect(routeRes2.status).toBe(409)
    expect(routeRes2.data.error).toMatch(/active route with this path prefix already exists/)
    
    await pool.query('DELETE FROM "Route" WHERE slug = $1', ['route-1'])
    await pool.query('DELETE FROM "Upstream" WHERE id = $1', [upstreamId])
  })

  it('2. nested prefixes remain valid and do not conflict', async () => {
    const upstreamRes = await request(`${url}/api/control/upstreams`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: { name: 'Test Upstream 2', baseUrl: 'http://127.0.0.1:3000' },
    })
    const upstreamId = upstreamRes.data.id

    const routeRes1 = await request(`${url}/api/control/routes`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: { slug: 'route-parent', pathPrefix: '/api/v1/parent', upstreamId },
    })
    expect(routeRes1.status).toBe(201)

    const routeRes2 = await request(`${url}/api/control/routes`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: { slug: 'route-child', pathPrefix: '/api/v1/parent/child', upstreamId },
    })
    expect(routeRes2.status).toBe(201)

    await pool.query('DELETE FROM "Route" WHERE slug IN ($1, $2)', ['route-parent', 'route-child'])
    await pool.query('DELETE FROM "Upstream" WHERE id = $1', [upstreamId])
  })

  it('3. production origin allowed and credentials behavior is correct', async () => {
    process.env.DASHBOARD_URL = 'https://dashboard.gateforge.internal'
    
    // Simulate preflight CORS request
    const res = await request(`${url}/api/control/organizations`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://dashboard.gateforge.internal',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Authorization',
      },
    })
    
    // Express cors middleware returns 204 No Content for successful preflight
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://dashboard.gateforge.internal')
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('4. Dashboard Control Proxy: anonymous GET is blocked with 401', async () => {
    process.env.INTERNAL_CONTROL_API_URL = `${url}/api/control`
    const { GET } = await import('../../apps/dashboard/app/api/control/[...path]/route.js')
    const { NextRequest } = await import('../../apps/dashboard/node_modules/next/server.js')

    const req = new NextRequest('http://localhost:3000/api/control/organizations', {
      method: 'GET',
    })
    const res = await GET(req, { params: { path: ['organizations'] } })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/Admin authentication required/)
  })

  it('5. Dashboard Control Proxy: anonymous mutation is blocked with 401', async () => {
    process.env.INTERNAL_CONTROL_API_URL = `${url}/api/control`
    const { POST } = await import('../../apps/dashboard/app/api/control/[...path]/route.js')
    const { NextRequest } = await import('../../apps/dashboard/node_modules/next/server.js')

    const req = new NextRequest('http://localhost:3000/api/control/organizations', {
      method: 'POST',
      body: JSON.stringify({ name: 'Hacked', slug: 'hacked-org', planId: 'plan-1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: { path: ['organizations'] } })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/Admin authentication required/)
  })

  it('6. Dashboard Control Proxy: unauthorized credentials blocked with 403', async () => {
    process.env.INTERNAL_CONTROL_API_URL = `${url}/api/control`
    const { GET } = await import('../../apps/dashboard/app/api/control/[...path]/route.js')
    const { NextRequest } = await import('../../apps/dashboard/node_modules/next/server.js')

    const req = new NextRequest('http://localhost:3000/api/control/organizations', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer wrong_attacker_secret_999' },
    })
    const res = await GET(req, { params: { path: ['organizations'] } })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/Invalid operator credentials/)
  })

  it('7. Dashboard Control Proxy: authorized admin succeeds and proxies request', async () => {
    process.env.INTERNAL_CONTROL_API_URL = `${url}/api/control`
    const { GET } = await import('../../apps/dashboard/app/api/control/[...path]/route.js')
    const { NextRequest } = await import('../../apps/dashboard/node_modules/next/server.js')

    const req = new NextRequest('http://localhost:3000/api/control/organizations', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    })
    const res = await GET(req, { params: { path: ['organizations'] } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('8. Dashboard Control Proxy: CONTROL_TOKEN is never returned to the client', async () => {
    process.env.INTERNAL_CONTROL_API_URL = `${url}/api/control`
    const { GET } = await import('../../apps/dashboard/app/api/control/[...path]/route.js')
    const { NextRequest } = await import('../../apps/dashboard/node_modules/next/server.js')

    const req = new NextRequest('http://localhost:3000/api/control/organizations', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    })
    const res = await GET(req, { params: { path: ['organizations'] } })
    expect(res.status).toBe(200)
    const rawText = await res.text()
    expect(rawText).not.toContain(token)
    expect(res.headers.get('authorization')).toBeNull()
  })
})

