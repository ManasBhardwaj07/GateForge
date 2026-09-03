import express, { Request, Response } from 'express'
import http from 'http'
import { AddressInfo } from 'net'

export interface EphemeralServer {
  app: express.Express
  server: http.Server
  url: string
  port: number
  lastRequest: {
    method: string
    url: string
    path: string
    query: any
    headers: http.IncomingHttpHeaders
    body: any
  } | null
  stop: () => Promise<void>
}

export function createEphemeralServer(): Promise<EphemeralServer> {
  return new Promise((resolve, reject) => {
    const app = express()
    app.use(express.json())
    app.use(express.text({ type: '*/*' }))

    let lastRequest: EphemeralServer['lastRequest'] = null

    app.use(async (req: Request, res: Response) => {
      let parsedBody = req.body
      if (typeof req.body === 'string') {
        try {
          parsedBody = JSON.parse(req.body)
        } catch {}
      }

      lastRequest = {
        method: req.method,
        url: req.url,
        path: req.path,
        query: req.query,
        headers: req.headers,
        body: parsedBody,
      }

      const statusParam = req.query.status as string
      const delayParam = req.query.delay as string

      if (delayParam) {
        const ms = parseInt(delayParam, 10)
        if (!isNaN(ms)) {
          await new Promise((r) => setTimeout(r, ms))
        }
      }

      const statusCode = statusParam ? parseInt(statusParam, 10) : 200

      res.status(statusCode).json({
        echoMethod: req.method,
        echoPath: req.path,
        echoQuery: req.query,
        echoHeaders: req.headers,
        echoBody: parsedBody,
      })
    })

    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo
      const port = address.port
      const url = `http://127.0.0.1:${port}`

      resolve({
        app,
        server,
        url,
        port,
        get lastRequest() {
          return lastRequest
        },
        stop: () =>
          new Promise((resStop) => {
            server.close(() => resStop())
          }),
      })
    })

    server.on('error', reject)
  })
}
