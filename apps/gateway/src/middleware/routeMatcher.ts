import type { Request, Response, NextFunction } from 'express'
import pool from '../lib/db.js'

// naive in-memory cache refreshed on first call
let routesCache: Array<{ id: string; pathPrefix: string; upstreamId: string; timeoutMs: number; slug: string }> = []
let lastLoad = 0

async function loadRoutes() {
  const res = await pool.query('SELECT id, "pathPrefix", "upstreamId", "timeoutMs", slug FROM "Route" WHERE "isActive" = true')
  routesCache = res.rows.map((r) => ({
    id: r.id,
    pathPrefix: r.pathPrefix,
    upstreamId: r.upstreamId || r.upstreamid,
    timeoutMs: r.timeoutMs || r.timeoutms,
    slug: r.slug,
  }))
  lastLoad = Date.now()
}

export async function routeMatcher(req: Request, res: Response, next: NextFunction) {
  try {
    if (Date.now() - lastLoad > 5000 || routesCache.length === 0) {
      await loadRoutes()
    }

    const path = req.path
    // find longest prefix match
    let best = null
    for (const r of routesCache) {
      if (path.startsWith(r.pathPrefix)) {
        if (!best || r.pathPrefix.length > best.pathPrefix.length) best = r
      }
    }

    if (!best) return res.status(404).json({ error: 'no matching route' })

    ;(req as any).routeConfig = best
    // fetch upstream baseUrl
    const up = await pool.query('SELECT "baseUrl" FROM "Upstream" WHERE id=$1', [best.upstreamId])
    if (up.rowCount === 0) return res.status(500).json({ error: 'upstream not found' })
    // when running the gateway locally (not in Docker), replace docker service hostnames with localhost for testing
    let base = up.rows[0]?.baseUrl || up.rows[0]?.baseurl
    try {
      if (process.env.USE_LOCAL_UPSTREAM === '1') {
        base = base.replace('mock-orders', 'localhost').replace('mock-payments', 'localhost')
      }
    } catch (e) {}
    ;(req as any).routeConfig.upstream = base

    next()
  } catch (err) {
    next(err)
  }
}
