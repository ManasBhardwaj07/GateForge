import Redis from 'ioredis'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Prefer service hostname 'redis' in containerized environments; allow override via REDIS_URL
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:56111'
// ioredis exports a constructor compatible with runtime; cast to any to satisfy TypeScript
const client = new (Redis as any)(redisUrl)

// Load Lua scripts and store their SHA
const scripts: Record<string, string> = {}

export async function loadScripts() {
  // __dirname is not available in ESM; derive from import.meta.url
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const luaDir = path.join(__dirname, '..', 'lua')
  const files = ['slidingWindow.lua', 'atomicQuota.lua']
  for (const f of files) {
    const content = fs.readFileSync(path.join(luaDir, f), 'utf8')
    const sha = await client.script('load', content)
    scripts[f] = sha
  }
}

export function getScriptSha(name: string) {
  return scripts[name]
}

export default client
