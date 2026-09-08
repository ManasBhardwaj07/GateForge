import { Client } from 'pg'
import { randomUUID, createHash } from 'crypto'

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gateforge_dev'

async function main() {
  const client = new Client({ connectionString: dbUrl })
  await client.connect()

  const now = new Date()

  // Plans
  const plans = [
    { id: randomUUID(), name: 'Free', rateLimitPerMinute: 10, quotaPerMonth: 1000 },
    { id: randomUUID(), name: 'Pro', rateLimitPerMinute: 100, quotaPerMonth: 50000 },
    { id: randomUUID(), name: 'Enterprise', rateLimitPerMinute: 1000, quotaPerMonth: -1 },
  ]
  const planMap = new Map<string, string>()
  for (const p of plans) {
    const r = await client.query(`SELECT id FROM "Plan" WHERE name=$1`, [p.name])
    if (r.rowCount === 0) {
      await client.query(
        `INSERT INTO "Plan" (id, name, "rateLimitPerMinute", "quotaPerMonth", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6)`,
        [p.id, p.name, p.rateLimitPerMinute, p.quotaPerMonth, now, now]
      )
      planMap.set(p.name, p.id)
    } else {
      planMap.set(p.name, r.rows[0].id)
    }
  }

  // Organizations
  const proId = planMap.get('Pro')!
  const enterpriseId = planMap.get('Enterprise')!
  const freeId = planMap.get('Free')!

  const orgsToSeed = [
    { name: 'Acme Corp', slug: 'acme', planId: proId },
    { name: 'Stripey Financial', slug: 'stripey', planId: enterpriseId },
    { name: 'CloudScale Labs', slug: 'cloudscale', planId: freeId },
  ]

  const orgMap = new Map<string, string>()
  for (const o of orgsToSeed) {
    const orgCheck = await client.query(`SELECT id FROM "Organization" WHERE slug=$1`, [o.slug])
    if (orgCheck.rowCount === 0) {
      const id = randomUUID()
      await client.query(
        `INSERT INTO "Organization" (id, name, slug, "planId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, o.name, o.slug, o.planId, now, now]
      )
      orgMap.set(o.slug, id)
    } else {
      orgMap.set(o.slug, orgCheck.rows[0].id)
    }
  }

  const acmeId = orgMap.get('acme')!
  const stripeyId = orgMap.get('stripey')!
  const cloudScaleId = orgMap.get('cloudscale')!

  // Upstreams (Orders & Payments)
  const upstreamsToSeed = [
    { name: 'mock-orders', url: 'http://mock-orders:5001' },
    { name: 'mock-payments', url: 'http://mock-payments:5002' },
  ]
  const upstreamMap = new Map<string, string>()

  for (const u of upstreamsToSeed) {
    const upCheck = await client.query(`SELECT id FROM "Upstream" WHERE name=$1`, [u.name])
    if (upCheck.rowCount === 0) {
      const id = randomUUID()
      await client.query(
        `INSERT INTO "Upstream" (id, name, "baseUrl", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5)`,
        [id, u.name, u.url, now, now]
      )
      upstreamMap.set(u.name, id)
    } else {
      upstreamMap.set(u.name, upCheck.rows[0].id)
    }
  }

  // Routes
  const routesToSeed = [
    { slug: 'orders', prefix: '/api/v1/orders', upstream: 'mock-orders' },
    { slug: 'payments', prefix: '/api/v1/payments', upstream: 'mock-payments' },
  ]

  for (const r of routesToSeed) {
    const routeCheck = await client.query(`SELECT id FROM "Route" WHERE slug=$1`, [r.slug])
    if (routeCheck.rowCount === 0) {
      const id = randomUUID()
      const upId = upstreamMap.get(r.upstream)!
      await client.query(
        `INSERT INTO "Route" (id, slug, "pathPrefix", "upstreamId", "timeoutMs", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, r.slug, r.prefix, upId, 2000, now, now]
      )
    }
  }

  // API Keys
  const keysToSeed = [
    { raw: 'gf_test_123', orgId: acmeId, status: 'ACTIVE' },
    { raw: 'gf_live_stripey_prod_key', orgId: stripeyId, status: 'ACTIVE' },
    { raw: 'gf_live_cloudscale_dev_key', orgId: cloudScaleId, status: 'ACTIVE' },
    { raw: 'gf_revoked_acme_key', orgId: acmeId, status: 'REVOKED' },
  ]

  for (const k of keysToSeed) {
    const keyHash = createHash('sha256').update(k.raw).digest('hex')
    const keyPrefix = k.raw.slice(0, 8)
    const keyCheck = await client.query(`SELECT id FROM "ApiKey" WHERE "keyHash"=$1`, [keyHash])
    if (keyCheck.rowCount === 0) {
      const apiKeyId = randomUUID()
      await client.query(
        `INSERT INTO "ApiKey" (id, "keyHash", "keyPrefix", "organizationId", status, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [apiKeyId, keyHash, keyPrefix, k.orgId, k.status, now, now]
      )
    }
  }

  // Audit Events
  const sampleAudits = [
    { action: 'api_key.create', targetType: 'ApiKey', actor: 'system-bootstrap', orgId: acmeId, metadata: { keyPrefix: 'gf_live_s', scope: 'production' } },
    { action: 'route.create', targetType: 'Route', actor: 'admin@gateforge.io', orgId: null, metadata: { path: '/api/v1/orders', upstream: 'mock-orders' } },
    { action: 'organization.create', targetType: 'Organization', actor: 'system-bootstrap', orgId: stripeyId, metadata: { tier: 'Enterprise', slug: 'stripey' } },
    { action: 'api_key.revoke', targetType: 'ApiKey', actor: 'security-operator', orgId: acmeId, metadata: { keyPrefix: 'gf_revok', reason: 'Key rotated by security operator' } },
    { action: 'plan.assign', targetType: 'Plan', actor: 'billing-service', orgId: cloudScaleId, metadata: { plan: 'Free', tier: 'Starter', quota: 1000 } },
  ]

  // Clean up any legacy placeholder metadata
  await client.query(`DELETE FROM "AuditEvent" WHERE metadata::text LIKE '%"seeded":true%'`)

  for (const a of sampleAudits) {
    const auditId = randomUUID()
    await client.query(
      `INSERT INTO "AuditEvent" (id, "organizationId", actor, action, "targetType", "targetId", metadata, "createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [auditId, a.orgId, a.actor, a.action, a.targetType, auditId, JSON.stringify(a.metadata), now]
    )
  }

  console.log('seed completed — seeded plans, 3 orgs, 2 upstreams, 2 routes, 4 keys, and audit records.')
  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
