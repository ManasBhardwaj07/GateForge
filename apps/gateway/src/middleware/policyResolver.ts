import type { Request, Response, NextFunction } from 'express'

export function policyResolver(req: Request, res: Response, next: NextFunction) {
  const route = (req as any).routeConfig
  const org = (req as any).auth?.organization

  if (!route || !org) return res.status(500).json({ error: 'missing route or org' })

  const effectivePolicy = route.planOverride ?? org.plan
  ;(req as any).policy = {
    rateLimitPerMinute: effectivePolicy.rateLimitPerMinute,
    quotaPerMonth: effectivePolicy.quotaPerMonth,
  }

  next()
}
