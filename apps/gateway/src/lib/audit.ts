import pool from './db.js'

export interface AuditPayload {
  organizationId?: string | null
  actor?: string
  action: string
  targetType: string
  targetId: string
  metadata?: Record<string, any>
}

export async function recordAudit(payload: AuditPayload) {
  const client = await pool.connect()
  try {
    const q = `
      INSERT INTO "AuditEvent" (
        id, "organizationId", actor, action, "targetType", "targetId", metadata, "createdAt"
      )
      VALUES (
        gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, now()
      )
    `
    await client.query(q, [
      payload.organizationId || null,
      payload.actor || 'system_admin',
      payload.action,
      payload.targetType,
      payload.targetId,
      payload.metadata ? JSON.stringify(payload.metadata) : null,
    ])
  } catch (e) {
    console.error('Audit record failed:', e)
  } finally {
    client.release()
  }
}

export default { recordAudit }
