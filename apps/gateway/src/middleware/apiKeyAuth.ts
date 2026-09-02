import type { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import Redis from '../lib/redis.js'
import pool from '../lib/db.js'

function isExpired(expiresAt: string | Date | null | undefined): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() <= Date.now()
}

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const keyHeader = (req.headers['x-api-key'] || req.headers['authorization'] || '') as string
  const raw = keyHeader.replace(/^Bearer\s+/i, '').trim()
  if (!raw) return res.status(401).json({ error: 'Missing API key' })

  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const rreq = req as any
  rreq.auth = { apiKeyHash: hash }

  try {
    const cacheKey = `key_auth:${hash}`
    const cached = await Redis.get(cacheKey)
    if (cached) {
      const parsed = JSON.parse(cached)
      if (isExpired(parsed.expiresAt)) {
        return res.status(403).json({ error: 'API key expired' })
      }
      rreq.auth = { ...rreq.auth, ...parsed }
      return next()
    }

    const q = `
      SELECT a."keyHash", a."status", a."expiresAt",
             o.id as org_id, o.slug as org_slug,
             p.id as plan_id, p."rateLimitPerMinute", p."quotaPerMonth"
      FROM "ApiKey" a
      JOIN "Organization" o ON a."organizationId" = o.id
      JOIN "Plan" p ON o."planId" = p.id
      WHERE a."keyHash" = $1
    `
    const r = await pool.query(q, [hash])
    if (r.rowCount === 0) return res.status(401).json({ error: 'Invalid API key' })

    const row = r.rows[0]
    if (row.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'API key revoked or inactive' })
    }

    if (isExpired(row.expiresAt)) {
      return res.status(403).json({ error: 'API key expired' })
    }

    const auth = {
      apiKeyHash: row.keyhash || row.keyHash || hash,
      expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
      organization: {
        id: row.org_id,
        slug: row.org_slug,
        plan: {
          id: row.plan_id,
          rateLimitPerMinute: row.rateLimitPerMinute,
          quotaPerMonth: row.quotaPerMonth,
        },
      },
    }

    await Redis.set(cacheKey, JSON.stringify(auth), 'EX', 60)
    rreq.auth = auth
    next()
  } catch (err) {
    next(err)
  }
}
