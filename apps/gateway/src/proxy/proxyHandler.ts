import { createProxyMiddleware } from 'http-proxy-middleware'
import type { RequestHandler } from 'express'
import { validateTargetUrl } from '../lib/ssrf.js'
import usage from '../lib/usage.js'

export function createUpstreamProxy(targetProvider: (req: any) => string, timeout = 2000): RequestHandler {
  return async (req: any, res: any, next: any) => {
    const target = targetProvider(req)
    // validate upstream target to prevent SSRF
    try {
      await validateTargetUrl(target)
    } catch (err) {
      return res.status(400).json({ error: 'invalid upstream target' })
    }

    const errorHandler = (err: any, _req: any, resErr: any) => {
      try {
        const org = (_req as any)?.auth?.organization?.id
        const routeId = (_req as any)?.routeConfig?.id
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
    }

    const proxyResHandler = (proxyRes: any, _req: any, _res: any) => {
      try {
        const org = (_req as any)?.auth?.organization?.id
        const routeId = (_req as any)?.routeConfig?.id
        if (org && routeId && proxyRes) {
          const status = proxyRes.statusCode >= 500 ? 'server_error' : proxyRes.statusCode >= 400 ? 'client_error' : 'success'
          usage.recordUsage(org, routeId, status)
        }
      } catch (e) {}
    }

    const proxyReqHandler = (proxyReq: any) => {
      try {
        if (proxyReq.removeHeader) proxyReq.removeHeader('x-internal')
        if (proxyReq.setHeader) proxyReq.setHeader('x-forwarded-by', 'gateforge')
      } catch (e) {}
    }

    const middleware = createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: (path: string) => {
        try {
          const apiBase = process.env.API_BASE || '/api/v1'
          if (apiBase && path.startsWith(apiBase)) return path.slice(apiBase.length) || '/'
        } catch (e) {}
        return path
      },
      timeout,
      proxyTimeout: timeout,
      selfHandleResponse: false,
      on: {
        proxyReq: proxyReqHandler,
        proxyRes: proxyResHandler,
        error: errorHandler,
      },
      onError: errorHandler,
      onProxyRes: proxyResHandler,
      onProxyReq: proxyReqHandler,
    } as any)

    return middleware(req, res, next)
  }
}
