import { v4 as uuidv4 } from 'uuid'
import type { Request, Response, NextFunction } from 'express'

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = (req.headers['x-request-id'] as string) || uuidv4()
  req.headers['x-request-id'] = id
  res.setHeader('X-Request-Id', id)
  next()
}
