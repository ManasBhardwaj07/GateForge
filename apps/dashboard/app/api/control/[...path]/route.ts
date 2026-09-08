import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const CONTROL_API_BASE =
  process.env.INTERNAL_CONTROL_API_URL || process.env.CONTROL_API_URL || 'http://localhost:4001/control'
const CONTROL_TOKEN = process.env.CONTROL_TOKEN
const DASHBOARD_ADMIN_KEY = process.env.DASHBOARD_ADMIN_KEY || CONTROL_TOKEN

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

function extractClientToken(req: NextRequest): { token: string | null; fromCookie: boolean } {
  const authHeader = req.headers.get('authorization')
  if (authHeader) {
    const m = authHeader.match(/^Bearer\s+(.+)$/i)
    if (m && m[1]) return { token: m[1].trim(), fromCookie: false }
  }

  const customHeader = req.headers.get('x-admin-token') || req.headers.get('x-operator-token')
  if (customHeader) {
    return { token: customHeader.trim(), fromCookie: false }
  }

  const cookie = req.cookies.get('gateforge_admin_token')?.value
  if (cookie) {
    return { token: cookie.trim(), fromCookie: true }
  }

  return { token: null, fromCookie: false }
}

async function handle(req: NextRequest, { params }: { params: { path: string[] } }) {
  if (!CONTROL_TOKEN) {
    return NextResponse.json(
      { error: 'Server misconfiguration: CONTROL_TOKEN is required' },
      { status: 500 }
    )
  }

  const { token: clientToken, fromCookie } = extractClientToken(req)

  // 1. Anonymous requests must be blocked with 401
  if (!clientToken) {
    return NextResponse.json(
      { error: 'Unauthorized: Admin authentication required' },
      { status: 401 }
    )
  }

  // 2. Unauthorized credentials must be blocked with 403
  const isAuthorized = safeCompare(clientToken, DASHBOARD_ADMIN_KEY || CONTROL_TOKEN)
  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Forbidden: Invalid operator credentials' },
      { status: 403 }
    )
  }

  // 3. CSRF protection for cookie-based authentication on mutating methods
  const method = req.method.toUpperCase()
  const isMutation = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS'
  if (fromCookie && isMutation) {
    const origin = req.headers.get('origin')
    const customHeader = req.headers.get('x-requested-with') || req.headers.get('x-csrf-token')
    const isValidOrigin = origin && req.nextUrl && origin === req.nextUrl.origin
    if (!customHeader && !isValidOrigin) {
      return NextResponse.json(
        { error: 'Forbidden: CSRF protection check failed' },
        { status: 403 }
      )
    }
  }

  const path = params.path ? params.path.join('/') : ''
  const search = req.nextUrl.search || ''
  const targetUrl = `${CONTROL_API_BASE}/${path}${search}`

  const headers: Record<string, string> = {
    'Content-Type': req.headers.get('content-type') || 'application/json',
    'x-actor': req.headers.get('x-actor') || 'dashboard_operator',
    'Authorization': `Bearer ${CONTROL_TOKEN}`,
  }

  const body = isMutation ? await req.text() : undefined

  try {
    const res = await fetch(targetUrl, {
      method,
      headers,
      body,
      cache: 'no-store',
    })

    const data = await res.text()
    return new NextResponse(data, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/json',
      },
    })
  } catch (err: any) {
    console.error('[Dashboard Server Route] Proxy to Control API failed:', err)
    return NextResponse.json({ error: 'Control API unreachable', details: err.message }, { status: 502 })
  }
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const DELETE = handle
