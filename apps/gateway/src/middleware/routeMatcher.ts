import type { Request, Response, NextFunction } from 'express'
import pool from '../lib/db.js'

export interface CachedRoute {
  id: string
  slug: string
  pathPrefix: string
  upstreamId: string
  timeoutMs: number
  upstream: string
}

let routesCache: CachedRoute[] = []
let lastLoad = 0

export function matchesRoutePrefix(reqPath: string, routePrefix: string): boolean {
  if (!routePrefix) return false
  if (routePrefix === '/') return true

  // Normalize by stripping trailing slashes for clean boundary matching
  const p = reqPath.endsWith('/') && reqPath.length > 1 ? reqPath.slice(0, -1) : reqPath
  const prefix = routePrefix.endsWith('/') && routePrefix.length > 1 ? routePrefix.slice(0, -1) : routePrefix

  // Exact match or sub-path with boundary delimiter ('/')
  return p === prefix || p.startsWith(prefix + '/')
}

export async function loadRoutes() {
  const q = `
    SELECT r.id, r.slug, r."pathPrefix", r."upstreamId", r."timeoutMs",
           u."baseUrl" as "upstreamBaseUrl", u."timeoutMs" as "upstreamTimeoutMs",
           p.id as "planId", p."rateLimitPerMinute", p."quotaPerMonth"
    FROM "Route" r
    JOIN "Upstream" u ON r."upstreamId" = u.id
    LEFT JOIN "Plan" p ON r."planOverrideId" = p.id
    WHERE r."isActive" = true AND u."isActive" = true
    ORDER BY r."createdAt" DESC
  `
  const res = await pool.query(q)
  routesCache = res.rows.map((r) => {
    let base = r.upstreamBaseUrl || r.upstreambaseurl || ''
    if (process.env.USE_LOCAL_UPSTREAM === '1') {
      base = base.replace('//mock-orders', '//localhost').replace('//mock-payments', '//localhost')
    }
    const route: CachedRoute = {
      id: r.id,
      slug: r.slug,
      pathPrefix: r.pathPrefix,
      upstreamId: r.upstreamId || r.upstreamid,
      timeoutMs: r.timeoutMs || r.upstreamTimeoutMs || 30000,
      upstream: base,
    }
    const planId = r.planId || r.planid
    if (planId) {
      const rateLimitPerMinute = r.rateLimitPerMinute ?? r.ratelimitperminute
      const quotaPerMonth = r.quotaPerMonth ?? r.quotapermonth
      ;(route as any).planOverride = { id: planId, rateLimitPerMinute, quotaPerMonth }
    }
    return route
  })
  lastLoad = Date.now()
}

export function clearRouteCache() {
  routesCache = []
  lastLoad = 0
}

export async function routeMatcher(req: Request, res: Response, next: NextFunction) {
  try {
    if (Date.now() - lastLoad > 5000 || routesCache.length === 0) {
      await loadRoutes()
    }

    const path = req.path
    let best: CachedRoute | null = null
    for (const r of routesCache) {
      if (matchesRoutePrefix(path, r.pathPrefix)) {
        if (!best || r.pathPrefix.length > best.pathPrefix.length) {
          best = r
        }
      }
    }

    if (!best) {
      return res.status(404).json({ error: 'no matching route' })
    }

    ;(req as any).routeConfig = best
    next()
  } catch (err) {
    next(err)
  }
}
