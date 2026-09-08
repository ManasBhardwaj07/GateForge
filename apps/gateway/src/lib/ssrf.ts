import dns from 'dns'
import ipaddr from 'ipaddr.js'

function isCloudMetadata(addr: string): boolean {
  try {
    const clean = addr.replace(/^\[|\]$/g, '')
    let ip = ipaddr.parse(clean)
    if (ip.kind() === 'ipv6' && (ip as ipaddr.IPv6).isIPv4MappedAddress()) {
      ip = (ip as ipaddr.IPv6).toIPv4Address()
    }
    const normalized = ip.toString()
    return normalized === '169.254.169.254' || normalized === 'fd00:ec2::254'
  } catch {
    const clean = addr.replace(/^\[|\]$/g, '')
    return clean === '169.254.169.254' || clean === 'fd00:ec2::254'
  }
}

function isPrivateOrMetadata(addr: string): boolean {
  try {
    const clean = addr.replace(/^\[|\]$/g, '')
    if (isCloudMetadata(clean)) return true

    let ip = ipaddr.parse(clean)
    if (ip.kind() === 'ipv6' && (ip as ipaddr.IPv6).isIPv4MappedAddress()) {
      ip = (ip as ipaddr.IPv6).toIPv4Address()
    }

    if (ip.kind() === 'ipv4') {
      const range = ip.range()
      if (
        range === 'private' ||
        range === 'loopback' ||
        range === 'linkLocal' ||
        range === 'reserved'
      ) {
        return true
      }
    } else if (ip.kind() === 'ipv6') {
      const range = ip.range()
      if (range === 'loopback' || range === 'linkLocal' || range === 'uniqueLocal') {
        return true
      }
    }
    return false
  } catch (e) {
    return false
  }
}

export async function validateTargetUrl(target: string): Promise<boolean> {
  try {
    const u = new URL(target)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error('disallowed URL protocol; only http: and https: are allowed')
    }

    const rawHostname = u.hostname
    if (!rawHostname) throw new Error('invalid host')

    // Strip square brackets if hostname is IPv6 literal (e.g. [::1] -> ::1)
    const hostname = rawHostname.replace(/^\[|\]$/g, '')

    // Cloud metadata endpoints are NEVER permitted under any circumstance
    if (isCloudMetadata(hostname)) throw new Error('cloud metadata address disallowed')

    const litIp = ipaddr.isValid(hostname)
    const isProd = process.env.NODE_ENV === 'production'
    // Dev override is strictly forbidden in production
    const allowPrivate = !isProd && process.env.ALLOW_PRIVATE_UPSTREAMS === '1'

    if (litIp) {
      if (isPrivateOrMetadata(hostname) && !allowPrivate) {
        throw new Error('disallowed private IP address')
      }
      return true
    }

    if (!allowPrivate && (hostname === 'localhost' || hostname.endsWith('.local'))) {
      throw new Error('disallowed hostname')
    }

    // Resolve DNS and verify all returned addresses
    const addrs = await dns.promises.lookup(hostname, { all: true })
    for (const a of addrs) {
      const cleanAddr = a.address.replace(/^\[|\]$/g, '')
      if (isCloudMetadata(cleanAddr)) throw new Error('cloud metadata address disallowed')
      if (!allowPrivate && isPrivateOrMetadata(cleanAddr)) {
        throw new Error('disallowed resolved private address')
      }
    }

    return true
  } catch (err) {
    throw err
  }
}

export function safeLookup(
  hostname: string,
  options: any,
  callback?: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void
) {
  let cb = callback
  let opts = options
  if (typeof options === 'function') {
    cb = options
    opts = {}
  }

  // Strip square brackets if hostname is IPv6 literal
  const cleanHostname = hostname.replace(/^\[|\]$/g, '')

  dns.lookup(cleanHostname, opts, (err, address, family) => {
    if (err) return cb?.(err, address as any, family)

    try {
      if (typeof address === 'string') {
        const clean = address.replace(/^\[|\]$/g, '')
        if (isCloudMetadata(clean)) throw new Error('cloud metadata address disallowed')

        const isProd = process.env.NODE_ENV === 'production'
        const allowPrivate = !isProd && process.env.ALLOW_PRIVATE_UPSTREAMS === '1'

        if (!allowPrivate && isPrivateOrMetadata(clean)) {
          throw new Error('disallowed private IP address')
        }
      } else if (Array.isArray(address)) {
        for (const a of (address as any[])) {
          const addrStr = (typeof a === 'string' ? a : a.address).replace(/^\[|\]$/g, '')
          if (isCloudMetadata(addrStr)) throw new Error('cloud metadata address disallowed')

          const isProd = process.env.NODE_ENV === 'production'
          const allowPrivate = !isProd && process.env.ALLOW_PRIVATE_UPSTREAMS === '1'

          if (!allowPrivate && isPrivateOrMetadata(addrStr)) {
            throw new Error('disallowed private IP address')
          }
        }
      }
      cb?.(null, address, family)
    } catch (e: any) {
      const error = new Error(`SSRF Validation Failed: ${e.message}`) as NodeJS.ErrnoException
      error.code = 'ENOTFOUND'
      cb?.(error, '' as any, 0)
    }
  })
}

export { isPrivateOrMetadata, isCloudMetadata }
