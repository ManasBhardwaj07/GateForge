import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

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

export async function GET(req: NextRequest) {
  const token = req.cookies.get('gateforge_admin_token')?.value
  const isAuthenticated = Boolean(
    token && DASHBOARD_ADMIN_KEY && safeCompare(token, DASHBOARD_ADMIN_KEY)
  )
  return NextResponse.json({ authenticated: isAuthenticated })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token } = body
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    if (!DASHBOARD_ADMIN_KEY || !safeCompare(token.trim(), DASHBOARD_ADMIN_KEY)) {
      return NextResponse.json({ error: 'Invalid operator credentials' }, { status: 403 })
    }

    const res = NextResponse.json({ success: true, authenticated: true })
    res.cookies.set('gateforge_admin_token', token.trim(), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24, // 24 hours
    })
    return res
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function DELETE() {
  const res = NextResponse.json({ success: true, authenticated: false })
  res.cookies.set('gateforge_admin_token', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
