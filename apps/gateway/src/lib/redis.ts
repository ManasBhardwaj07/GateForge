import Redis from 'ioredis'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Prefer service hostname 'redis' in containerized environments; allow override via REDIS_URL
const redisUrl = process.env.REDIS_URL || (process.env.DOCKER_CONTAINER ? 'redis://redis:6379' : 'redis://127.0.0.1:6379')
// ioredis exports a constructor compatible with runtime; cast to any to satisfy TypeScript
const client = new (Redis as any)(redisUrl)

// Load Lua scripts and store their SHA and contents for automatic fallback
const scripts: Record<string, string> = {}
const scriptsContent: Record<string, string> = {}

function getLuaDir(): string {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  return path.join(__dirname, '..', 'lua')
}

export async function loadScripts() {
  const luaDir = getLuaDir()
  const files = ['slidingWindow.lua', 'atomicQuota.lua']
  for (const f of files) {
    const content = fs.readFileSync(path.join(luaDir, f), 'utf8')
    scriptsContent[f] = content
    try {
      const sha = await client.script('load', content)
      scripts[f] = sha
    } catch (e) {
      console.warn(`[Redis] Script load warning for ${f}:`, e)
    }
  }
}

export function getScriptSha(name: string): string | undefined {
  return scripts[name]
}

export async function evalScript(name: string, numKeys: number, ...args: string[]): Promise<any> {
  let sha = scripts[name]
  if (sha) {
    try {
      return await client.evalsha(sha, numKeys, ...args)
    } catch (err: any) {
      if (!err.message?.includes('NOSCRIPT')) throw err
    }
  }

  // Fallback: load script content and re-eval
  let content = scriptsContent[name]
  if (!content) {
    const luaDir = getLuaDir()
    content = fs.readFileSync(path.join(luaDir, name), 'utf8')
    scriptsContent[name] = content
  }

  sha = await client.script('load', content)
  scripts[name] = sha
  return await client.evalsha(sha, numKeys, ...args)
}

export default client
