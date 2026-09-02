const CONTROL_API_BASE = process.env.NEXT_PUBLIC_CONTROL_API || 'http://localhost:4001/control'
const GATEWAY_BASE = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:4000'
const CONTROL_TOKEN = process.env.NEXT_PUBLIC_CONTROL_TOKEN || ''

function getHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'x-actor': 'dashboard_operator',
    ...extra,
  }
  if (CONTROL_TOKEN) {
    headers['Authorization'] = `Bearer ${CONTROL_TOKEN}`
  }
  return headers
}

export interface Organization {
  id: string
  name: string
  slug: string
  planId: string
  planName?: string
  rateLimitPerMinute?: number
  quotaPerMonth?: number
  createdAt: string
  updatedAt: string
}

export interface Plan {
  id: string
  name: string
  rateLimitPerMinute: number
  quotaPerMonth: number
  createdAt: string
  updatedAt: string
}

export interface ApiKey {
  id: string
  keyPrefix: string
  keyHash: string
  organizationId: string
  organizationName?: string
  organizationSlug?: string
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED'
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  rawKey?: string
}

export interface Upstream {
  id: string
  name: string
  baseUrl: string
  timeoutMs: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface RouteItem {
  id: string
  slug: string
  pathPrefix: string
  upstreamId: string
  upstreamName?: string
  upstreamBaseUrl?: string
  timeoutMs: number
  planOverrideId: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface AuditEvent {
  id: string
  organizationId: string | null
  organizationName?: string
  actor: string
  action: string
  targetType: string
  targetId: string
  metadata: Record<string, any> | null
  createdAt: string
}

export interface HealthStatus {
  gateway: 'online' | 'offline' | 'checking'
  controlApi: 'online' | 'offline' | 'checking'
  redis: string | null
  orders: 'online' | 'offline' | 'checking'
  payments: 'online' | 'offline' | 'checking'
}

// ---------------------------------------------------------------------------
// Control API Client Functions
// ---------------------------------------------------------------------------

export async function fetchHealth(): Promise<HealthStatus> {
  const status: HealthStatus = {
    gateway: 'offline',
    controlApi: 'offline',
    redis: null,
    orders: 'offline',
    payments: 'offline',
  }

  try {
    const r = await fetch(`${GATEWAY_BASE}/health`, { cache: 'no-store' })
    if (r.ok) {
      const data = await r.json()
      status.gateway = 'online'
      status.redis = data.redis || 'PONG'
    }
  } catch (e) {}

  try {
    const r = await fetch(`${CONTROL_API_BASE}/organizations`, { cache: 'no-store' })
    if (r.ok) status.controlApi = 'online'
  } catch (e) {}

  try {
    const r = await fetch(`http://localhost:5001/health`, { cache: 'no-store' })
    if (r.ok) status.orders = 'online'
  } catch (e) {}

  try {
    const r = await fetch(`http://localhost:5002/health`, { cache: 'no-store' })
    if (r.ok) status.payments = 'online'
  } catch (e) {}

  return status
}

export async function fetchOrganizations(): Promise<Organization[]> {
  const r = await fetch(`${CONTROL_API_BASE}/organizations`, { headers: getHeaders(), cache: 'no-store' })
  if (!r.ok) throw new Error('Failed to fetch organizations')
  return r.json()
}

export async function createOrganization(data: { name: string; slug: string; planId: string }): Promise<Organization> {
  const r = await fetch(`${CONTROL_API_BASE}/organizations`, {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create organization')
  }
  return r.json()
}

export async function fetchPlans(): Promise<Plan[]> {
  const r = await fetch(`${CONTROL_API_BASE}/plans`, { headers: getHeaders(), cache: 'no-store' })
  if (!r.ok) throw new Error('Failed to fetch plans')
  return r.json()
}

export async function createPlan(data: { name: string; rateLimitPerMinute: number; quotaPerMonth: number }): Promise<Plan> {
  const r = await fetch(`${CONTROL_API_BASE}/plans`, {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create plan')
  }
  return r.json()
}

export async function fetchApiKeys(): Promise<ApiKey[]> {
  const r = await fetch(`${CONTROL_API_BASE}/api-keys`, { headers: getHeaders(), cache: 'no-store' })
  if (!r.ok) throw new Error('Failed to fetch API keys')
  return r.json()
}

export async function createApiKey(organizationId: string, expiresAt?: string | null): Promise<ApiKey> {
  const r = await fetch(`${CONTROL_API_BASE}/api-keys`, {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ organizationId, expiresAt }),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create API key')
  }
  return r.json()
}

export async function revokeApiKey(identifier: string): Promise<ApiKey> {
  const r = await fetch(`${CONTROL_API_BASE}/api-keys/${identifier}/revoke`, {
    method: 'POST',
    headers: getHeaders(),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to revoke API key')
  }
  return r.json()
}

export async function fetchUpstreams(): Promise<Upstream[]> {
  const r = await fetch(`${CONTROL_API_BASE}/upstreams`, { headers: getHeaders(), cache: 'no-store' })
  if (!r.ok) throw new Error('Failed to fetch upstreams')
  return r.json()
}

export async function createUpstream(data: { name: string; baseUrl: string; timeoutMs?: number }): Promise<Upstream> {
  const r = await fetch(`${CONTROL_API_BASE}/upstreams`, {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create upstream')
  }
  return r.json()
}

export async function fetchRoutes(): Promise<RouteItem[]> {
  const r = await fetch(`${CONTROL_API_BASE}/routes`, { headers: getHeaders(), cache: 'no-store' })
  if (!r.ok) throw new Error('Failed to fetch routes')
  return r.json()
}

export async function createRoute(data: {
  slug: string
  pathPrefix: string
  upstreamId: string
  timeoutMs?: number
  planOverrideId?: string | null
}): Promise<RouteItem> {
  const r = await fetch(`${CONTROL_API_BASE}/routes`, {
    method: 'POST',
    headers: getHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create route')
  }
  return r.json()
}

export async function fetchAuditEvents(): Promise<AuditEvent[]> {
  const r = await fetch(`${CONTROL_API_BASE}/audit-events`, { headers: getHeaders(), cache: 'no-store' })
  if (!r.ok) throw new Error('Failed to fetch audit events')
  return r.json()
}
