import { NextRequest, NextResponse } from 'next/server'

const CONTROL_API_BASE =
  process.env.INTERNAL_CONTROL_API_URL || process.env.CONTROL_API_URL || 'http://localhost:4001/control'
const CONTROL_TOKEN = process.env.CONTROL_TOKEN

async function handle(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path ? params.path.join('/') : ''
  const search = req.nextUrl.search || ''
  const targetUrl = `${CONTROL_API_BASE}/${path}${search}`

  const headers: Record<string, string> = {
    'Content-Type': req.headers.get('content-type') || 'application/json',
    'x-actor': 'dashboard_operator',
  }
  if (CONTROL_TOKEN) {
    headers['Authorization'] = `Bearer ${CONTROL_TOKEN}`
  }

  const method = req.method
  const body = method !== 'GET' && method !== 'HEAD' ? await req.text() : undefined

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
