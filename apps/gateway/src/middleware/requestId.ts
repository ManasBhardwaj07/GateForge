import { v4 as uuidv4 } from 'uuid'
import type { Request, Response, NextFunction } from 'express'

export function requestId(req: Request, _res: Response, next: NextFunction) {
  req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4()
  next()
}
