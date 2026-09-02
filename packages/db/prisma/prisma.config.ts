// Minimal Prisma v7 configuration: reads DATABASE_URL from env for CLI operations
export default {
  datasource: {
    provider: 'postgresql',
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gateforge_dev',
  },
}
