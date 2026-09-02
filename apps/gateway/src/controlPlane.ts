import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import pool from './lib/db.js'
import redis from './lib/redis.js'
import { recordAudit } from './lib/audit.js'
import { validateTargetUrl } from './lib/ssrf.js'
import { clearRouteCache } from './middleware/routeMatcher.js'
import { clearProxyCache } from './proxy/proxyHandler.js'

const router = express.Router()

// CORS configuration allowing Next.js Dashboard
router.use(
  cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-actor', 'X-Actor'],
  })
)

router.use(express.json())

// Control Plane Rate Limiting: 120 reqs / min per IP
router.use(async (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1'
  const key = `rate:control:${ip}`
  try {
    const current = await redis.incr(key)
    if (current === 1) {
      await redis.expire(key, 60)
    }
    if (current > 120) {
      return res.status(429).json({ error: 'Control plane rate limit exceeded' })
    }
  } catch (e) {
    // Fail open if Redis is temporarily unreachable
  }
  next()
})

// Operator Auth Guard (if CONTROL_TOKEN is set in environment)
router.use((req, res, next) => {
  const token = process.env.CONTROL_TOKEN
  if (token) {
    const authHeader = (req.headers['authorization'] || '') as string
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!bearer || bearer !== token) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing operator token' })
    }
  }
  next()
})

function getActor(req: express.Request): string {
  return (req.headers['x-actor'] as string) || (req.headers['X-Actor'] as string) || 'admin_operator'
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------
router.get('/organizations', async (_req, res) => {
  try {
    const q = `
      SELECT o.id, o.name, o.slug, o."planId", o."createdAt", o."updatedAt",
             p.name as "planName", p."rateLimitPerMinute", p."quotaPerMonth"
      FROM "Organization" o
      JOIN "Plan" p ON o."planId" = p.id
      ORDER BY o."createdAt" DESC
    `
    const r = await pool.query(q)
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to list organizations' })
  }
})

router.post('/organizations', async (req, res) => {
  const { name, slug, planId } = req.body
  if (!name || !slug || !planId) {
    return res.status(400).json({ error: 'name, slug, and planId are required' })
  }

  try {
    const planCheck = await pool.query('SELECT id FROM "Plan" WHERE id=$1', [planId])
    if (planCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Plan not found' })
    }

    const q = `
      INSERT INTO "Organization" (id, name, slug, "planId", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, $1, $2, $3, now(), now())
      RETURNING *
    `
    const r = await pool.query(q, [name, slug, planId])
    const org = r.rows[0]

    await recordAudit({
      actor: getActor(req),
      organizationId: org.id,
      action: 'organization.create',
      targetType: 'Organization',
      targetId: org.id,
      metadata: { name: org.name, slug: org.slug, planId: org.planId },
    })

    res.status(201).json(org)
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Organization slug already exists' })
    }
    res.status(500).json({ error: 'Failed to create organization' })
  }
})

async function invalidateOrgCache(orgId: string) {
  try {
    const keys = await pool.query('SELECT "keyHash" FROM "ApiKey" WHERE "organizationId"=$1', [orgId])
    for (const row of keys.rows) {
      if (row.keyHash) {
        await redis.del(`key_auth:${row.keyHash}`)
      }
    }
  } catch (e) {
    console.error('Failed to flush org key cache:', e)
  }
}

router.put('/organizations/:id', async (req, res) => {
  const { id } = req.params
  const { name, planId } = req.body
  try {
    const q = `
      UPDATE "Organization"
      SET name = COALESCE($1, name), "planId" = COALESCE($2, "planId"), "updatedAt" = now()
      WHERE id = $3
      RETURNING *
    `
    const r = await pool.query(q, [name || null, planId || null, id])
    if (r.rowCount === 0) return res.status(404).json({ error: 'Organization not found' })

    await invalidateOrgCache(id)

    await recordAudit({
      actor: getActor(req),
      organizationId: id,
      action: 'organization.update',
      targetType: 'Organization',
      targetId: id,
      metadata: { planId },
    })

    res.json(r.rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Failed to update organization' })
  }
})

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
router.get('/plans', async (_req, res) => {
  try {
    const r = await pool.query('SELECT id, name, "rateLimitPerMinute", "quotaPerMonth", "createdAt", "updatedAt" FROM "Plan" ORDER BY "createdAt" ASC')
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to list plans' })
  }
})

router.post('/plans', async (req, res) => {
  const { name, rateLimitPerMinute, quotaPerMonth } = req.body
  if (!name || rateLimitPerMinute === undefined || quotaPerMonth === undefined) {
    return res.status(400).json({ error: 'name, rateLimitPerMinute, and quotaPerMonth are required' })
  }

  try {
    const q = `
      INSERT INTO "Plan" (id, name, "rateLimitPerMinute", "quotaPerMonth", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, $1, $2, $3, now(), now())
      RETURNING *
    `
    const r = await pool.query(q, [name, Number(rateLimitPerMinute), Number(quotaPerMonth)])
    const plan = r.rows[0]

    await recordAudit({
      actor: getActor(req),
      action: 'plan.create',
      targetType: 'Plan',
      targetId: plan.id,
      metadata: { name: plan.name, rateLimitPerMinute: plan.rateLimitPerMinute, quotaPerMonth: plan.quotaPerMonth },
    })

    res.status(201).json(plan)
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Plan name already exists' })
    }
    res.status(500).json({ error: 'Failed to create plan' })
  }
})

// ---------------------------------------------------------------------------
// Upstreams (with Save-Time SSRF Validation)
// ---------------------------------------------------------------------------
router.get('/upstreams', async (_req, res) => {
  try {
    const r = await pool.query('SELECT id, name, "baseUrl", "timeoutMs", "isActive", "createdAt", "updatedAt" FROM "Upstream" ORDER BY "createdAt" DESC')
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to list upstreams' })
  }
})

router.post('/upstreams', async (req, res) => {
  const { name, baseUrl, timeoutMs } = req.body
  if (!name || !baseUrl) {
    return res.status(400).json({ error: 'name and baseUrl are required' })
  }

  // Save-time SSRF validation
  try {
    await validateTargetUrl(baseUrl)
  } catch (err: any) {
    return res.status(400).json({ error: `SSRF Validation Failed: ${err.message || 'Invalid or disallowed upstream URL'}` })
  }

  try {
    const q = `
      INSERT INTO "Upstream" (id, name, "baseUrl", "timeoutMs", "isActive", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, $1, $2, $3, true, now(), now())
      RETURNING *
    `
    const r = await pool.query(q, [name, baseUrl, Number(timeoutMs) || 30000])
    const upstream = r.rows[0]

    await recordAudit({
      actor: getActor(req),
      action: 'upstream.create',
      targetType: 'Upstream',
      targetId: upstream.id,
      metadata: { name: upstream.name, baseUrl: upstream.baseUrl, timeoutMs: upstream.timeoutMs },
    })

    clearRouteCache()
    clearProxyCache()

    res.status(201).json(upstream)
  } catch (err) {
    res.status(500).json({ error: 'Failed to create upstream' })
  }
})

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
router.get('/routes', async (_req, res) => {
  try {
    const q = `
      SELECT r.id, r.slug, r."pathPrefix", r."upstreamId", r."timeoutMs", r."planOverrideId", r."isActive", r."createdAt", r."updatedAt",
             u.name as "upstreamName", u."baseUrl" as "upstreamBaseUrl"
      FROM "Route" r
      JOIN "Upstream" u ON r."upstreamId" = u.id
      ORDER BY r."createdAt" DESC
    `
    const r = await pool.query(q)
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to list routes' })
  }
})

router.post('/routes', async (req, res) => {
  const { slug, pathPrefix, upstreamId, timeoutMs, planOverrideId } = req.body
  if (!slug || !pathPrefix || !upstreamId) {
    return res.status(400).json({ error: 'slug, pathPrefix, and upstreamId are required' })
  }

  try {
    const upstreamCheck = await pool.query('SELECT id FROM "Upstream" WHERE id=$1', [upstreamId])
    if (upstreamCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Upstream not found' })
    }

    const q = `
      INSERT INTO "Route" (id, slug, "pathPrefix", "upstreamId", "timeoutMs", "planOverrideId", "isActive", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, true, now(), now())
      RETURNING *
    `
    const r = await pool.query(q, [
      slug,
      pathPrefix,
      upstreamId,
      Number(timeoutMs) || 30000,
      planOverrideId || null,
    ])
    const route = r.rows[0]

    await recordAudit({
      actor: getActor(req),
      action: 'route.create',
      targetType: 'Route',
      targetId: route.id,
      metadata: { slug: route.slug, pathPrefix: route.pathPrefix, upstreamId: route.upstreamId },
    })

    clearRouteCache()

    res.status(201).json(route)
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Route slug already exists' })
    }
    res.status(500).json({ error: 'Failed to create route' })
  }
})

// ---------------------------------------------------------------------------
// API Keys (Single-view Secret Key Generation & Instant Revocation)
// ---------------------------------------------------------------------------
router.get('/api-keys', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  try {
    const q = `
      SELECT k.id, k."keyPrefix", k."keyHash", k.status, k."organizationId", k."lastUsedAt", k."expiresAt", k."createdAt", k."updatedAt",
             o.name as "organizationName", o.slug as "organizationSlug"
      FROM "ApiKey" k
      JOIN "Organization" o ON k."organizationId" = o.id
      ORDER BY k."createdAt" DESC
      LIMIT $1 OFFSET $2
    `
    const r = await pool.query(q, [limit, offset])
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to list API keys' })
  }
})

router.post('/api-keys', async (req, res) => {
  const { organizationId, expiresAt } = req.body
  if (!organizationId) {
    return res.status(400).json({ error: 'organizationId is required' })
  }

  try {
    const orgCheck = await pool.query('SELECT id, name FROM "Organization" WHERE id=$1', [organizationId])
    if (orgCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Organization not found' })
    }

    // Generate secure raw key (e.g. gf_live_9f8a1234...)
    const rawSecret = `gf_live_${crypto.randomBytes(16).toString('hex')}`
    const keyHash = crypto.createHash('sha256').update(rawSecret).digest('hex')
    const keyPrefix = rawSecret.slice(0, 10)

    const q = `
      INSERT INTO "ApiKey" (id, "keyHash", "keyPrefix", "organizationId", status, "expiresAt", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, $1, $2, $3, 'ACTIVE', $4, now(), now())
      RETURNING id, "keyHash", "keyPrefix", "organizationId", status, "expiresAt", "createdAt", "updatedAt"
    `
    const r = await pool.query(q, [keyHash, keyPrefix, organizationId, expiresAt || null])
    const keyRecord = r.rows[0]

    await recordAudit({
      actor: getActor(req),
      organizationId,
      action: 'key.created',
      targetType: 'ApiKey',
      targetId: keyRecord.id,
      metadata: { keyPrefix, organizationId },
    })

    // Return the secret key ONCE for the user to copy
    res.status(201).json({
      ...keyRecord,
      rawKey: rawSecret,
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate API key' })
  }
})

// Instant key revocation by keyHash or ID
router.post('/api-keys/:identifier/revoke', async (req, res) => {
  const { identifier } = req.params

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const q = `
      UPDATE "ApiKey"
      SET status = 'REVOKED', "updatedAt" = now()
      WHERE "keyHash" = $1 OR id = $1
      RETURNING *
    `
    const r = await client.query(q, [identifier])
    if (r.rowCount === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'API Key not found' })
    }

    const revokedKey = r.rows[0]

    // Atomically delete from Redis cache so the gateway blocks subsequent requests with 403 immediately
    try {
      await redis.del(`key_auth:${revokedKey.keyHash}`)
    } catch (e) {
      console.error('Redis cache invalidation warning:', e)
    }

    await recordAudit({
      actor: getActor(req),
      organizationId: revokedKey.organizationId,
      action: 'key.revoked',
      targetType: 'ApiKey',
      targetId: revokedKey.id,
      metadata: { keyPrefix: revokedKey.keyPrefix, keyHash: revokedKey.keyHash },
    })

    await client.query('COMMIT')
    res.json(revokedKey)
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: 'Failed to revoke API key' })
  } finally {
    client.release()
  }
})

// ---------------------------------------------------------------------------
// Audit Events
// ---------------------------------------------------------------------------
router.get('/audit-events', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  try {
    const q = `
      SELECT a.id, a."organizationId", a.actor, a.action, a."targetType", a."targetId", a.metadata, a."createdAt",
             o.name as "organizationName"
      FROM "AuditEvent" a
      LEFT JOIN "Organization" o ON a."organizationId" = o.id
      ORDER BY a."createdAt" DESC
      LIMIT $1 OFFSET $2
    `
    const r = await pool.query(q, [limit, offset])
    res.json(r.rows)
  } catch (err) {
    res.status(500).json({ error: 'Failed to list audit events' })
  }
})

export default router
