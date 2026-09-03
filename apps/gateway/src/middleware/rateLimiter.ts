import type { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import redis, { evalScript } from '../lib/redis.js'
import usage from '../lib/usage.js'

export async function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const policy = (req as any).policy
  const auth = (req as any).auth
  const routeConfig = (req as any).routeConfig
  if (!policy || !auth || !routeConfig) {
    return res.status(500).json({ error: 'missing policy, auth, or routeConfig' })
  }

  const limit = policy.rateLimitPerMinute || 0
  const windowMs = 60 * 1000
  // Partition rate limiting by organization + routeId
  const orgId = auth.organization?.id || auth.apiKeyHash
  const key = `rate:${orgId}:${routeConfig.id}`

  try {
    const now = Date.now().toString()
    const reqId = (req as any).id || (req.headers['x-request-id'] as string) || crypto.randomUUID()
    
    const resArr = await evalScript('slidingWindow.lua', 1, key, now, windowMs.toString(), limit.toString(), reqId)
    const allowed = resArr[0]
    const remaining = resArr[1]

    res.setHeader('X-RateLimit-Limit', limit.toString())
    res.setHeader('X-RateLimit-Remaining', remaining.toString())

    if (allowed == 1) return next()
    usage.recordUsage(auth.organization.id, routeConfig.id, 'rate_limit')
    return res.status(429).json({ error: 'rate limit exceeded' })
  } catch (err) {
    next(err)
  }
}
