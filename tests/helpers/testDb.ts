import { createHash, randomUUID } from 'crypto'
import pool from '../../apps/gateway/src/lib/db.js'
import redis from '../../apps/gateway/src/lib/redis.js'

export async function createTestPlan(name: string, rateLimitPerMinute = 60, quotaPerMonth = 1000) {
  const id = `test_plan_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  const uniqueName = `${name}_${randomUUID().slice(0, 8)}`
  const res = await pool.query(
    `INSERT INTO "Plan" (id, name, "rateLimitPerMinute", "quotaPerMonth", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, now(), now()) RETURNING *`,
    [id, uniqueName, rateLimitPerMinute, quotaPerMonth]
  )
  return res.rows[0]
}

export async function createTestOrganization(name: string, planId: string) {
  const id = `test_org_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  const slug = `slug-${id}`
  const res = await pool.query(
    `INSERT INTO "Organization" (id, name, slug, "planId", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, now(), now()) RETURNING *`,
    [id, name, slug, planId]
  )
  return res.rows[0]
}

export async function createTestApiKey(
  rawKey: string,
  organizationId: string,
  options: {
    status?: 'ACTIVE' | 'REVOKED' | 'EXPIRED'
    expiresAt?: Date | null
  } = {}
) {
  const id = `test_key_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  const keyHash = createHash('sha256').update(rawKey).digest('hex')
  const keyPrefix = rawKey.slice(0, 8)
  const status = options.status || 'ACTIVE'
  const expiresAt = options.expiresAt || null

  await redis.del(`key_auth:${keyHash}`)

  const res = await pool.query(
    `INSERT INTO "ApiKey" (id, "keyHash", "keyPrefix", "organizationId", status, "expiresAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, now(), now()) RETURNING *`,
    [id, keyHash, keyPrefix, organizationId, status, expiresAt]
  )
  return res.rows[0]
}

export async function createTestUpstream(name: string, baseUrl: string, timeoutMs = 30000) {
  const id = `test_ups_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  const res = await pool.query(
    `INSERT INTO "Upstream" (id, name, "baseUrl", "timeoutMs", "isActive", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, true, now(), now()) RETURNING *`,
    [id, name, baseUrl, timeoutMs]
  )
  return res.rows[0]
}

export async function createTestRoute(
  slug: string,
  pathPrefix: string,
  upstreamId: string,
  options: {
    timeoutMs?: number
    planOverrideId?: string | null
    isActive?: boolean
  } = {}
) {
  const id = `test_rte_${randomUUID().replace(/-/g, '').slice(0, 12)}`
  const timeoutMs = options.timeoutMs || 30000
  const planOverrideId = options.planOverrideId || null
  const isActive = options.isActive !== undefined ? options.isActive : true

  const res = await pool.query(
    `INSERT INTO "Route" (id, slug, "pathPrefix", "upstreamId", "timeoutMs", "planOverrideId", "isActive", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now()) RETURNING *`,
    [id, slug, pathPrefix, upstreamId, timeoutMs, planOverrideId, isActive]
  )
  return res.rows[0]
}

export async function cleanupTestData(data: {
  orgIds?: string[]
  planIds?: string[]
  upstreamIds?: string[]
  routeIds?: string[]
  keyIds?: string[]
}) {
  if (data.orgIds && data.orgIds.length > 0) {
    await pool.query(`DELETE FROM "UsageHourly" WHERE "organizationId" = ANY($1)`, [data.orgIds])
  }
  if (data.routeIds && data.routeIds.length > 0) {
    await pool.query(`DELETE FROM "UsageHourly" WHERE "routeId" = ANY($1)`, [data.routeIds])
  }
  if (data.keyIds && data.keyIds.length > 0) {
    await pool.query(`DELETE FROM "ApiKey" WHERE id = ANY($1)`, [data.keyIds])
  }
  if (data.routeIds && data.routeIds.length > 0) {
    await pool.query(`DELETE FROM "Route" WHERE id = ANY($1)`, [data.routeIds])
  }
  if (data.upstreamIds && data.upstreamIds.length > 0) {
    await pool.query(`DELETE FROM "Upstream" WHERE id = ANY($1)`, [data.upstreamIds])
  }
  if (data.orgIds && data.orgIds.length > 0) {
    await pool.query(`DELETE FROM "Organization" WHERE id = ANY($1)`, [data.orgIds])
  }
  if (data.planIds && data.planIds.length > 0) {
    await pool.query(`DELETE FROM "Plan" WHERE id = ANY($1)`, [data.planIds])
  }
}
