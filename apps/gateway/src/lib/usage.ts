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

  // Snapshot current counters without clearing to guarantee zero data loss on crash
  const snapshot = new Map<BucketKey, BucketMetrics>()
  for (const [k, v] of counters.entries()) {
    if (v.requestCount > 0) {
      snapshot.set(k, { ...v })
    }
  }

  if (snapshot.size === 0) return

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const [key, m] of snapshot.entries()) {
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

    // Only deduct committed snapshot amounts from live counters
    for (const [key, flushed] of snapshot.entries()) {
      const current = counters.get(key)
      if (current) {
        current.requestCount -= flushed.requestCount
        current.successCount -= flushed.successCount
        current.clientErrCount -= flushed.clientErrCount
        current.serverErrCount -= flushed.serverErrCount
        current.rateLimitedCount -= flushed.rateLimitedCount
        current.quotaHitCount -= flushed.quotaHitCount
        if (current.requestCount <= 0) {
          counters.delete(key)
        }
      }
    }
  } catch (err) {
    await client.query('ROLLBACK')
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
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  await flushUsage()
}

export default { recordUsage, flushUsage, startUsageFlush, stopUsageFlush }
