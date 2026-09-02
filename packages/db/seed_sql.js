const { Client } = require('pg')

const { randomUUID } = require('crypto')

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/gateforge_dev',
  })
  await client.connect()

  const planId = randomUUID()
  const orgId = randomUUID()
  const now = new Date()

  await client.query(
    `INSERT INTO "Plan" (id, name, "rateLimitPerMinute", "quotaPerMonth", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (name) DO NOTHING`,
    [planId, 'Pro', 100, 50000, now, now]
  )
  await client.query(
    `INSERT INTO "Organization" (id, name, slug, "planId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (slug) DO NOTHING`,
    [orgId, 'Acme Corp', 'acme', planId, now, now]
  )

  console.log('seed_sql: inserted plan and org')
  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
