import dns from 'dns'
import { fileURLToPath } from 'url'
import ipaddr from 'ipaddr.js'

function isPrivateOrMetadata(addr: string) {
  try {
    const ip = ipaddr.parse(addr)
    if (ip.kind() === 'ipv4') {
      if (ip.range() === 'private' || ip.range() === 'loopback' || ip.range() === 'linkLocal' || ip.range() === 'reserved') return true
    } else if (ip.kind() === 'ipv6') {
      if (ip.range() === 'loopback' || ip.range() === 'linkLocal' || ip.range() === 'uniqueLocal') return true
    }
    // block common cloud metadata address
    if (addr === '169.254.169.254') return true
    return false
  } catch (e) {
    return false
  }
}

export async function validateTargetUrl(target: string) {
  // target is expected to be a full URL
  try {
    const u = new URL(target)
    const hostname = u.hostname
    // immediate host checks
    if (!hostname) throw new Error('invalid host')
    const litIp = ipaddr.isValid(hostname)
    if (litIp && isPrivateOrMetadata(hostname)) throw new Error('disallowed IP address')
    if (hostname === 'localhost' || hostname.endsWith('.local')) throw new Error('disallowed hostname')

    // resolve DNS and ensure none of the addresses are private/metadata
    const addrs = await dns.promises.lookup(hostname, { all: true })
    const allowPrivate = process.env.ALLOW_PRIVATE_UPSTREAMS === '1'
    for (const a of addrs) {
      if (!allowPrivate && isPrivateOrMetadata(a.address)) throw new Error('disallowed resolved address')
    }

    return true
  } catch (err) {
    throw err
  }
}

export { isPrivateOrMetadata }
