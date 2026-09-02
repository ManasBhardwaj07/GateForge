import dns from 'dns'
import ipaddr from 'ipaddr.js'

function isCloudMetadata(addr: string): boolean {
  return addr === '169.254.169.254' || addr === 'fd00:ec2::254'
}

function isPrivateOrMetadata(addr: string): boolean {
  try {
    if (isCloudMetadata(addr)) return true

    const ip = ipaddr.parse(addr)
    if (ip.kind() === 'ipv4') {
      if (
        ip.range() === 'private' ||
        ip.range() === 'loopback' ||
        ip.range() === 'linkLocal' ||
        ip.range() === 'reserved'
      ) {
        return true
      }
    } else if (ip.kind() === 'ipv6') {
      if (ip.range() === 'loopback' || ip.range() === 'linkLocal' || ip.range() === 'uniqueLocal') {
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

    const hostname = u.hostname
    if (!hostname) throw new Error('invalid host')

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
    }

    if (!allowPrivate && (hostname === 'localhost' || hostname.endsWith('.local'))) {
      throw new Error('disallowed hostname')
    }

    // Resolve DNS and verify all returned addresses
    const addrs = await dns.promises.lookup(hostname, { all: true })
    for (const a of addrs) {
      if (isCloudMetadata(a.address)) throw new Error('cloud metadata address disallowed')
      if (!allowPrivate && isPrivateOrMetadata(a.address)) {
        throw new Error('disallowed resolved private address')
      }
    }

    return true
  } catch (err) {
    throw err
  }
}

export { isPrivateOrMetadata, isCloudMetadata }
