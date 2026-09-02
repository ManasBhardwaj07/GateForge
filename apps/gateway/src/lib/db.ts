import { Pool } from 'pg'

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gateforge_dev'

export const pool = new Pool({
  connectionString: dbUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

export default pool
