import type { Request, Response, NextFunction } from 'express'
import redis, { getScriptSha } from '../lib/redis.js'
import { format } from 'date-fns'

export async function quotaEnforcer(req: Request, res: Response, next: NextFunction) {
  const policy = (req as any).policy
  const auth = (req as any).auth
  if (!policy || !auth) return res.status(500).json({ error: 'missing policy or auth' })

  const quota = policy.quotaPerMonth
  const bucket = format(new Date(), 'yyyy-MM')
  const key = `quota:${auth.organization.id}:${bucket}`

  try {
    const sha = getScriptSha('atomicQuota.lua')
    const resArr = await redis.evalsha(sha, 1, key, '1', quota.toString())
    const allowed = resArr[0]
    const value = resArr[1]
    res.setHeader('X-Quota-Limit', quota.toString())
    res.setHeader('X-Quota-Used', value.toString())
    if (allowed == 1) return next()
    return res.status(429).json({ error: 'quota exceeded' })
  } catch (err) {
    next(err)
  }
}
