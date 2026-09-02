import pool from './db.js'

type BucketKey = string // orgId::routeId::yyyy-MM-ddTHH:00:00.000Z

interface BucketMetrics {
  requestCount: number
  successCount: number
  clientErrCount: number
  serverErrCount: number
  rateLimitedCount: number
  quotaHitCount: number
}

const counters: Map<BucketKey, BucketMetrics> = new Map()

function getHourBucket(): string {
  return new Date().toISOString().slice(0, 13) + ':00:00.000Z'
}

function makeKey(orgId: string, routeId: string, hour: string): BucketKey {
  return `${orgId}::${routeId}::${hour}`
}

export function recordUsage(
  orgId: string,
  routeId: string,
  status: 'success' | 'client_error' | 'server_error' | 'rate_limit' | 'quota_hit'
) {
  const hour = getHourBucket()
  const key = makeKey(orgId, routeId, hour)
  const current = counters.get(key) || {
    requestCount: 0,
    successCount: 0,
    clientErrCount: 0,
    serverErrCount: 0,
    rateLimitedCount: 0,
    quotaHitCount: 0,
  }

  current.requestCount += 1
  if (status === 'success') current.successCount += 1
  else if (status === 'client_error') current.clientErrCount += 1
  else if (status === 'server_error') current.serverErrCount += 1
  else if (status === 'rate_limit') current.rateLimitedCount += 1
  else if (status === 'quota_hit') current.quotaHitCount += 1

  counters.set(key, current)
}

export async function flushUsage() {
  if (counters.size === 0) return
  const entries = Array.from(counters.entries())
  counters.clear()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const [key, m] of entries) {
      const [orgId, routeId, hour] = key.split('::')
      const q = `
        INSERT INTO "UsageHourly" (
          id, "organizationId", "routeId", "hourBucket",
          "requestCount", "successCount", "clientErrCount", "serverErrCount", "rateLimitedCount", "quotaHitCount"
        )
        VALUES (
          gen_random_uuid()::text, $1, $2, $3::timestamp, $4, $5, $6, $7, $8, $9
        )
        ON CONFLICT ("organizationId", "routeId", "hourBucket")
        DO UPDATE SET
          "requestCount" = "UsageHourly"."requestCount" + EXCLUDED."requestCount",
          "successCount" = "UsageHourly"."successCount" + EXCLUDED."successCount",
          "clientErrCount" = "UsageHourly"."clientErrCount" + EXCLUDED."clientErrCount",
          "serverErrCount" = "UsageHourly"."serverErrCount" + EXCLUDED."serverErrCount",
          "rateLimitedCount" = "UsageHourly"."rateLimitedCount" + EXCLUDED."rateLimitedCount",
          "quotaHitCount" = "UsageHourly"."quotaHitCount" + EXCLUDED."quotaHitCount"
      `
      await client.query(q, [
        orgId,
        routeId,
        hour,
        m.requestCount,
        m.successCount,
        m.clientErrCount,
        m.serverErrCount,
        m.rateLimitedCount,
        m.quotaHitCount,
      ])
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    // restore metrics to in-memory map
    for (const [k, m] of entries) {
      const prev = counters.get(k)
      if (prev) {
        prev.requestCount += m.requestCount
        prev.successCount += m.successCount
        prev.clientErrCount += m.clientErrCount
        prev.serverErrCount += m.serverErrCount
        prev.rateLimitedCount += m.rateLimitedCount
        prev.quotaHitCount += m.quotaHitCount
      } else {
        counters.set(k, m)
      }
    }
    console.error('Usage flush failed:', err)
  } finally {
    client.release()
  }
}

let timer: NodeJS.Timeout | null = null

export function startUsageFlush(intervalMs = 5 * 60 * 1000) {
  if (timer) return
  timer = setInterval(() => {
    flushUsage().catch((e) => console.error('Periodic usage flush error:', e))
  }, intervalMs)
}

export async function stopUsageFlush() {
  if (timer) clearInterval(timer)
  await flushUsage()
}

export default { recordUsage, flushUsage, startUsageFlush, stopUsageFlush }
