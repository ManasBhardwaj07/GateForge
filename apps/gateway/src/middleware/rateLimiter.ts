import type { Request, Response, NextFunction } from 'express'
import redis, { getScriptSha } from '../lib/redis.js'

export async function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const policy = (req as any).policy
  const auth = (req as any).auth
  if (!policy || !auth) return res.status(500).json({ error: 'missing policy or auth' })

  const limit = policy.rateLimitPerMinute || 0
  const windowMs = 60 * 1000
  const key = `rate:${auth.apiKeyHash}:${req.path}`

  try {
    const sha = getScriptSha('slidingWindow.lua')
    const now = Date.now().toString()
    const resArr = await redis.evalsha(sha, 1, key, now, windowMs.toString(), limit.toString())
    const allowed = resArr[0]
    const remaining = resArr[1]
    res.setHeader('X-RateLimit-Limit', limit.toString())
    res.setHeader('X-RateLimit-Remaining', remaining.toString())
    if (allowed == 1) return next()
    return res.status(429).json({ error: 'rate limit exceeded' })
  } catch (err) {
    next(err)
  }
}
