import { createProxyMiddleware } from 'http-proxy-middleware'
import type { RequestHandler, Request, Response, NextFunction } from 'express'
import { validateTargetUrl } from '../lib/ssrf.js'
import usage from '../lib/usage.js'

const proxyCache = new Map<string, RequestHandler>()
const MAX_PROXY_ENTRIES = 100

export function getOrCreateProxy(target: string, timeout = 30000): RequestHandler {
  const cacheKey = `${target}::${timeout}`
  let proxy = proxyCache.get(cacheKey)
  if (proxy) {
    // Refresh LRU order: delete and re-insert at end of Map
    proxyCache.delete(cacheKey)
    proxyCache.set(cacheKey, proxy)
    return proxy
  }

  if (proxyCache.size >= MAX_PROXY_ENTRIES) {
    const oldestKey = proxyCache.keys().next().value
    if (oldestKey) proxyCache.delete(oldestKey)
  }

  proxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    followRedirects: false, // Prevent SSRF redirect bypasses
    pathRewrite: (path: string) => {
      try {
        const apiBase = process.env.API_BASE || '/api/v1'
        if (apiBase && path.startsWith(apiBase)) return path.slice(apiBase.length) || '/'
      } catch (e) {
        console.warn('[Proxy] Path rewrite error:', e)
      }
      return path
    },
    timeout,
    proxyTimeout: timeout,
    selfHandleResponse: false,
    on: {
      proxyReq: (proxyReq: any) => {
        try {
          if (proxyReq.removeHeader) proxyReq.removeHeader('x-internal')
          if (proxyReq.setHeader) proxyReq.setHeader('x-forwarded-by', 'gateforge')
        } catch (e) {
          console.warn('[Proxy] Failed to mutate outbound proxy request headers:', e)
        }
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
        } catch (e) {
          console.warn('[Proxy] Failed to record usage from proxy response:', e)
        }
      },
      error: (err: any, req: any, resErr: any) => {
        try {
          const org = (req as any)?.auth?.organization?.id
          const routeId = (req as any)?.routeConfig?.id
          if (org && routeId) usage.recordUsage(org, routeId, 'server_error')
        } catch (e) {
          console.warn('[Proxy] Failed to record error usage:', e)
        }

        if (resErr && !resErr.headersSent) {
          if (typeof resErr.status === 'function') {
            resErr.status(504).json({ error: 'gateway timeout or upstream unavailable' })
          } else if (typeof resErr.writeHead === 'function') {
            resErr.writeHead(504, { 'Content-Type': 'application/json' })
            resErr.end(JSON.stringify({ error: 'gateway timeout or upstream unavailable' }))
          }
        }
      },
    },
  } as any)

  proxyCache.set(cacheKey, proxy)
  return proxy
}

export function clearProxyCache() {
  proxyCache.clear()
}

export function proxyMiddlewareHandler(req: Request, res: Response, next: NextFunction) {
  const target = (req as any).routeConfig?.upstream
  if (!target) return res.status(500).json({ error: 'No upstream target configured for route' })

  validateTargetUrl(target)
    .then(() => {
      const timeout = (req as any).routeConfig?.timeoutMs || 30000
      const proxy = getOrCreateProxy(target, timeout)
      proxy(req, res, next)
    })
    .catch((err) => {
      console.warn('[Proxy] Target URL validation rejected:', err.message)
      res.status(400).json({ error: 'invalid upstream target' })
    })
}

export default { getOrCreateProxy, clearProxyCache, proxyMiddlewareHandler }
