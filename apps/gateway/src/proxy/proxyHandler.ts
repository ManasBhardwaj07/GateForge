import { createProxyMiddleware } from 'http-proxy-middleware'
import type { RequestHandler, Request, Response, NextFunction } from 'express'
import http from 'http'
import https from 'https'
import { validateTargetUrl, safeLookup } from '../lib/ssrf.js'
import usage from '../lib/usage.js'

const customHttpAgent = new http.Agent({ lookup: safeLookup as any, autoSelectFamily: false })
const customHttpsAgent = new https.Agent({ lookup: safeLookup as any, autoSelectFamily: false })

const proxyCache = new Map<string, RequestHandler>()
const MAX_PROXY_ENTRIES = 100

export function getOrCreateProxy(target: string, timeout = 30000): RequestHandler {
  const cacheKey = `${target}::${timeout}`
  let proxy = proxyCache.get(cacheKey)
  if (!proxy) {
    if (proxyCache.size >= MAX_PROXY_ENTRIES) {
      const oldestKey = proxyCache.keys().next().value
      if (oldestKey) proxyCache.delete(oldestKey)
    }
    proxy = createProxyMiddleware({
      target,
      changeOrigin: true,
      agent: target.startsWith('https') ? customHttpsAgent : customHttpAgent,
      pathRewrite: (path: string) => {
        try {
          const apiBase = process.env.API_BASE || '/api/v1'
          if (apiBase && path.startsWith(apiBase)) return path.slice(apiBase.length) || '/'
        } catch (e) {}
        return path
      },
      proxyTimeout: timeout,
      selfHandleResponse: false,
      on: {
        proxyReq: (proxyReq: any) => {
          try {
            if (proxyReq.removeHeader) proxyReq.removeHeader('x-internal')
            if (proxyReq.setHeader) proxyReq.setHeader('x-forwarded-by', 'gateforge')
          } catch (e) {}
        },
        proxyRes: (proxyRes: any, req: any) => {
          try {
            const org = (req as any)?.auth?.organization?.id
            const routeId = (req as any)?.routeConfig?.id
            if (org && routeId && proxyRes) {
              const status =
                proxyRes.statusCode >= 500 ? 'server_error' : proxyRes.statusCode >= 400 ? 'client_error' : 'success'
              usage.recordUsage(org, routeId, status)
            }
          } catch (e) {}
        },
        error: (err: any, req: any, resErr: any) => {
          try {
            const org = (req as any)?.auth?.organization?.id
            const routeId = (req as any)?.routeConfig?.id
            if (org && routeId) usage.recordUsage(org, routeId, 'server_error')
          } catch (e) {}

          if (resErr && !resErr.headersSent) {
            if (typeof resErr.status === 'function') {
              resErr.status(504).json({ error: 'gateway timeout' })
            } else if (typeof resErr.writeHead === 'function') {
              resErr.writeHead(504, { 'Content-Type': 'application/json' })
              resErr.end(JSON.stringify({ error: 'gateway timeout' }))
            }
          }
        },
      },
    } as any)
    proxyCache.set(cacheKey, proxy)
  }
  return proxy
}

const validatedTargets = new Set<string>()

export function clearProxyCache() {
  proxyCache.clear()
  validatedTargets.clear()
}

export function proxyMiddlewareHandler(req: Request, res: Response, next: NextFunction) {
  const target = (req as any).routeConfig?.upstream
  if (!target) return res.status(500).json({ error: 'No upstream target configured for route' })

  const timeout = (req as any).routeConfig?.timeoutMs || 30000

  if (validatedTargets.has(target)) {
    const proxy = getOrCreateProxy(target, timeout)
    return proxy(req, res, next)
  }

  validateTargetUrl(target)
    .then(() => {
      validatedTargets.add(target)
      const proxy = getOrCreateProxy(target, timeout)
      proxy(req, res, next)
    })
    .catch(() => {
      res.status(400).json({ error: 'invalid upstream target' })
    })
}

export default { getOrCreateProxy, clearProxyCache, proxyMiddlewareHandler }
