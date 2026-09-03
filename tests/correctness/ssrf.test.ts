import { describe, it, expect } from 'vitest'
import http from 'http'
import {
  validateTargetUrl,
  safeLookup,
  isPrivateOrMetadata,
  isCloudMetadata,
} from '../../apps/gateway/src/lib/ssrf.js'

describe('M6.1 — SSRF Protection Correctness', () => {
  const originalEnv = { ...process.env }

  function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>) {
    return async () => {
      Object.assign(process.env, env)
      try {
        await fn()
      } finally {
        process.env = { ...originalEnv }
      }
    }
  }

  it('1. blocks loopback 127.0.0.1 in production / private mode', withEnv({ ALLOW_PRIVATE_UPSTREAMS: '0', NODE_ENV: 'production' }, async () => {
    await expect(validateTargetUrl('http://127.0.0.1:8080')).rejects.toThrow(/disallowed private IP address/)
  }))

  it('2. blocks localhost hostname in production / private mode', withEnv({ ALLOW_PRIVATE_UPSTREAMS: '0', NODE_ENV: 'production' }, async () => {
    await expect(validateTargetUrl('http://localhost:8080')).rejects.toThrow(/disallowed hostname|private/)
  }))

  it('3. blocks IPv6 loopback ::1 in production / private mode', withEnv({ ALLOW_PRIVATE_UPSTREAMS: '0', NODE_ENV: 'production' }, async () => {
    await expect(validateTargetUrl('http://[::1]:8080')).rejects.toThrow(/disallowed (private IP address|resolved private address)/)
  }))

  it('4. blocks RFC1918 private IPv4 ranges (10.x, 172.16.x, 192.168.x)', withEnv({ ALLOW_PRIVATE_UPSTREAMS: '0', NODE_ENV: 'production' }, async () => {
    await expect(validateTargetUrl('http://10.0.0.1:80')).rejects.toThrow(/disallowed private IP address/)
    await expect(validateTargetUrl('http://172.16.0.1:80')).rejects.toThrow(/disallowed private IP address/)
    await expect(validateTargetUrl('http://192.168.1.1:80')).rejects.toThrow(/disallowed private IP address/)
  }))

  it('5. blocks link-local addresses (169.254.x.x)', withEnv({ ALLOW_PRIVATE_UPSTREAMS: '0', NODE_ENV: 'production' }, async () => {
    await expect(validateTargetUrl('http://169.254.1.1:80')).rejects.toThrow(/disallowed private IP address/)
  }))

  it('6. unconditionally blocks AWS/GCP cloud metadata IP 169.254.169.254 even when private upstreams are enabled', withEnv({ ALLOW_PRIVATE_UPSTREAMS: '1', NODE_ENV: 'development' }, async () => {
    await expect(validateTargetUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/cloud metadata address disallowed/)
  }))

  it('7. unconditionally blocks IPv6 cloud metadata endpoint fd00:ec2::254', withEnv({ ALLOW_PRIVATE_UPSTREAMS: '1', NODE_ENV: 'development' }, async () => {
    await expect(validateTargetUrl('http://[fd00:ec2::254]/latest/meta-data')).rejects.toThrow(/cloud metadata address disallowed/)
  }))

  it('8. allows valid public hostname in production', withEnv({ ALLOW_PRIVATE_UPSTREAMS: '0', NODE_ENV: 'production' }, async () => {
    const valid = await validateTargetUrl('https://example.com')
    expect(valid).toBe(true)
  }))

  it('9. allows internal Docker service names when ALLOW_PRIVATE_UPSTREAMS=1 in dev', withEnv({ ALLOW_PRIVATE_UPSTREAMS: '1', NODE_ENV: 'development' }, async () => {
    expect(isPrivateOrMetadata('127.0.0.1')).toBe(true)
    // 127.0.0.1 literal is permitted under ALLOW_PRIVATE_UPSTREAMS=1
    const allowed = await validateTargetUrl('http://127.0.0.1:5001')
    expect(allowed).toBe(true)
  }))

  it('10. disallows non-HTTP/HTTPS protocols', async () => {
    await expect(validateTargetUrl('ftp://example.com')).rejects.toThrow(/disallowed URL protocol/)
    await expect(validateTargetUrl('file:///etc/passwd')).rejects.toThrow(/disallowed URL protocol/)
    await expect(validateTargetUrl('gopher://example.com')).rejects.toThrow(/disallowed URL protocol/)
  })

  it('11. safeLookup aborts outbound socket connection when resolving to private IP in production', withEnv({ ALLOW_PRIVATE_UPSTREAMS: '0', NODE_ENV: 'production' }, async () => {
    const agent = new http.Agent({ lookup: safeLookup as any })

    const connectionPromise = new Promise<{ status: number | null; error: Error | null }>((resolve) => {
      const req = http.request('http://localhost:80', { agent, timeout: 2000 }, (res) => {
        resolve({ status: res.statusCode || null, error: null })
      })

      req.on('error', (err) => {
        resolve({ status: null, error: err })
      })

      req.end()
    })

    const result = await connectionPromise
    expect(result.error).toBeDefined()
    expect(result.status).toBeNull()
  }))

  it('12. helper functions isCloudMetadata and isPrivateOrMetadata behave accurately', () => {
    expect(isCloudMetadata('169.254.169.254')).toBe(true)
    expect(isCloudMetadata('fd00:ec2::254')).toBe(true)
    expect(isCloudMetadata('8.8.8.8')).toBe(false)

    expect(isPrivateOrMetadata('127.0.0.1')).toBe(true)
    expect(isPrivateOrMetadata('10.0.0.5')).toBe(true)
    expect(isPrivateOrMetadata('172.20.0.1')).toBe(true)
    expect(isPrivateOrMetadata('192.168.0.100')).toBe(true)
    expect(isPrivateOrMetadata('8.8.8.8')).toBe(false)
    expect(isPrivateOrMetadata('1.1.1.1')).toBe(false)
  })
})
