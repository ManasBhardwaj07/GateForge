import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const status = {
    gateway: 'offline',
    controlApi: 'offline',
    redis: null as string | null,
    orders: 'offline',
    payments: 'offline',
  }

  const gatewayUrl = process.env.INTERNAL_GATEWAY_URL || 'http://gateway:4000'
  const controlUrl = process.env.INTERNAL_CONTROL_API_URL || 'http://gateway:4001/control'
  const ordersUrl = process.env.ORDERS_API_URL || 'http://mock-orders:5001'
  const paymentsUrl = process.env.PAYMENTS_API_URL || 'http://mock-payments:5002'

  // 1. Gateway & Redis
  try {
    const r = await fetch(`${gatewayUrl}/health`, { cache: 'no-store', signal: AbortSignal.timeout(2000) })
    if (r.ok) {
      const data = await r.json().catch(() => ({}))
      status.gateway = 'online'
      status.redis = data.redis || 'PONG'
    }
  } catch {
    try {
      const r = await fetch('http://localhost:4000/health', { cache: 'no-store', signal: AbortSignal.timeout(1000) })
      if (r.ok) {
        const data = await r.json().catch(() => ({}))
        status.gateway = 'online'
        status.redis = data.redis || 'PONG'
      }
    } catch {}
  }

  // 2. Control API
  try {
    const token = process.env.CONTROL_TOKEN || 'dev_operator_secret_token_123'
    const r = await fetch(`${controlUrl}/organizations`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    })
    if (r.ok) status.controlApi = 'online'
  } catch {
    try {
      const token = process.env.CONTROL_TOKEN || 'dev_operator_secret_token_123'
      const r = await fetch('http://localhost:4001/control/organizations', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(1000),
      })
      if (r.ok) status.controlApi = 'online'
    } catch {}
  }

  // 3. Mock Orders
  try {
    const r = await fetch(`${ordersUrl}/health`, { cache: 'no-store', signal: AbortSignal.timeout(2000) })
    if (r.ok) status.orders = 'online'
  } catch {
    try {
      const r = await fetch('http://localhost:5001/health', { cache: 'no-store', signal: AbortSignal.timeout(1000) })
      if (r.ok) status.orders = 'online'
    } catch {}
  }

  // 4. Mock Payments
  try {
    const r = await fetch(`${paymentsUrl}/health`, { cache: 'no-store', signal: AbortSignal.timeout(2000) })
    if (r.ok) status.payments = 'online'
  } catch {
    try {
      const r = await fetch('http://localhost:5002/health', { cache: 'no-store', signal: AbortSignal.timeout(1000) })
      if (r.ok) status.payments = 'online'
    } catch {}
  }

  return NextResponse.json(status)
}
