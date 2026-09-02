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
  for (const p of plans) {
    const r = await client.query(`SELECT id FROM "Plan" WHERE name=$1`, [p.name])
    if (r.rowCount === 0) {
      await client.query(
        `INSERT INTO "Plan" (id, name, "rateLimitPerMinute", "quotaPerMonth", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6)`,
        [p.id, p.name, p.rateLimitPerMinute, p.quotaPerMonth, now, now]
      )
    }
  }

  // Organization (Acme)
  const pro = plans.find((x) => x.name === 'Pro')!
  let orgId = ''
  const orgCheck = await client.query(`SELECT id FROM "Organization" WHERE slug=$1`, ['acme'])
  if (orgCheck.rowCount === 0) {
    orgId = randomUUID()
    await client.query(
      `INSERT INTO "Organization" (id, name, slug, "planId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6)`,
      [orgId, 'Acme Corp', 'acme', pro.id, now, now]
    )
  } else {
    orgId = orgCheck.rows[0].id
  }

  // Upstream
  let upstreamId = randomUUID()
  const upCheck = await client.query(`SELECT id FROM "Upstream" WHERE name=$1`, ['mock-orders'])
  if (upCheck.rowCount === 0) {
    await client.query(
      `INSERT INTO "Upstream" (id, name, "baseUrl", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5)`,
      [upstreamId, 'mock-orders', 'http://mock-orders:5001', now, now]
    )
  } else {
    // use existing upstream id
    upstreamId = upCheck.rows[0].id
  }

  // Route
  const routeId = randomUUID()
  const routeCheck = await client.query(`SELECT id FROM "Route" WHERE slug=$1`, ['orders'])
  if (routeCheck.rowCount === 0) {
    await client.query(
      `INSERT INTO "Route" (id, slug, "pathPrefix", "upstreamId", "timeoutMs", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [routeId, 'orders', '/api/v1/orders', upstreamId, 2000, now, now]
    )
  }

  // API Key (raw)
  const rawKey = process.env.GF_TEST_KEY || 'gf_test_123'
  const keyHash = createHash('sha256').update(rawKey).digest('hex')
  const keyPrefix = rawKey.slice(0, 8)
  const apiKeyId = randomUUID()
  const keyCheck = await client.query(`SELECT id FROM "ApiKey" WHERE "keyHash"=$1`, [keyHash])
  if (keyCheck.rowCount === 0) {
    await client.query(
      `INSERT INTO "ApiKey" (id, "keyHash", "keyPrefix", "organizationId", status, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [apiKeyId, keyHash, keyPrefix, orgId, 'ACTIVE', now, now]
    )
  }

  console.log('seed completed — raw key:', rawKey, 'keyPrefix:', keyPrefix)
  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
