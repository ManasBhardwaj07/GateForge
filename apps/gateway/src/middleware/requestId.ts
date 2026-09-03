import { v4 as uuidv4 } from 'uuid'
import type { Request, Response, NextFunction } from 'express'

export function requestId(req: Request, res: Response, next: NextFunction) {
  // Always generate a fresh UUID to prevent client spoofing/rate-limit bypass
  const id = uuidv4()
  req.headers['x-request-id'] = id
  ;(req as any).id = id
  res.setHeader('X-Request-Id', id)
  next()
}
