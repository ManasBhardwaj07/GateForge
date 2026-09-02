'use client'

import { useState, useEffect } from 'react'
import { fetchApiKeys, fetchRoutes, ApiKey, RouteItem } from '../../lib/api'
import { 
  Zap, 
  Play, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ShieldAlert, 
  Layers, 
  Activity 
} from 'lucide-react'

interface RequestResult {
  id: number
  statusCode: number
  durationMs: number
  headers: Record<string, string>
  payload: any
  timestamp: string
}

export default function PlaygroundPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [routes, setRoutes] = useState<RouteItem[]>([])
  const [selectedKey, setSelectedKey] = useState('')
  const [selectedRoute, setSelectedRoute] = useState('/api/v1/orders')
  const [burstCount, setBurstCount] = useState(10)
  const [concurrency, setConcurrency] = useState(5)
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<RequestResult[]>([])

  useEffect(() => {
    async function load() {
      const [k, r] = await Promise.all([
        fetchApiKeys().catch(() => []),
        fetchRoutes().catch(() => []),
      ])
      setKeys(k)
      setRoutes(r)
      const active = k.find((x) => x.status === 'ACTIVE')
      if (active) setSelectedKey('gf_test_123') // Default to seeded test key
    }
    load()
  }, [])

  const runBurst = async () => {
    setIsRunning(true)
    setResults([])
    const newResults: RequestResult[] = []

    for (let i = 1; i <= burstCount; i++) {
      const startTime = performance.now()
      try {
        const res = await fetch(`http://localhost:4000${selectedRoute}`, {
          headers: selectedKey ? { 'X-API-Key': selectedKey } : {},
        })
        const duration = Math.round(performance.now() - startTime)
        const body = await res.json().catch(() => ({}))
        
        const headerMap: Record<string, string> = {}
        res.headers.forEach((v, k) => { headerMap[k] = v })

        newResults.push({
          id: i,
          statusCode: res.status,
          durationMs: duration,
          headers: headerMap,
          payload: body,
          timestamp: new Date().toISOString(),
        })
      } catch (err: any) {
        newResults.push({
          id: i,
          statusCode: 0,
          durationMs: Math.round(performance.now() - startTime),
          headers: {},
          payload: { error: 'Network Connection Failed' },
          timestamp: new Date().toISOString(),
        })
      }

      setResults([...newResults])
    }

    setIsRunning(false)
  }

  const successCount = results.filter((r) => r.statusCode >= 200 && r.statusCode < 300).length
  const throttledCount = results.filter((r) => r.statusCode === 429).length
  const errorCount = results.filter((r) => r.statusCode >= 400 && r.statusCode !== 429).length

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-3">
            <Zap className="w-6 h-6 text-amber-400" />
            <span>Real-Time Traffic Burst Playground</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Generate live concurrent bursts, stress-test rate limiters, and inspect atomic gateway decisions.
          </p>
        </div>
      </div>

      {/* Control Panel */}
      <div className="glass-panel p-6 rounded-2xl grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        {/* Target Route */}
        <div>
          <label className="block text-xs font-mono uppercase text-slate-400 mb-1.5">Target Route</label>
          <select
            value={selectedRoute}
            onChange={(e) => setSelectedRoute(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
          >
            <option value="/api/v1/orders">GET /api/v1/orders (Mock Orders)</option>
            <option value="/api/v1/orders/1">GET /api/v1/orders/1 (Single Order)</option>
            <option value="/api/v1/orders/slow">GET /api/v1/orders/slow (504 Timeout Test)</option>
            <option value="/api/v1/orders/error">GET /api/v1/orders/error (500 Error Test)</option>
            <option value="/api/v1/unknown">GET /api/v1/unknown (404 Not Found Test)</option>
          </select>
        </div>

        {/* API Key */}
        <div>
          <label className="block text-xs font-mono uppercase text-slate-400 mb-1.5">API Key (Header)</label>
          <input
            type="text"
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            placeholder="gf_test_123 or gf_live_..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 font-mono text-xs text-emerald-400 focus:outline-none focus:border-amber-500"
          />
        </div>

        {/* Burst Count Preset */}
        <div>
          <label className="block text-xs font-mono uppercase text-slate-400 mb-1.5">Burst Request Count</label>
          <div className="flex items-center space-x-2">
            {[10, 50, 105].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setBurstCount(count)}
                className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
                  burstCount === count
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {count} {count === 105 ? '(Throttled)' : 'reqs'}
              </button>
            ))}
          </div>
        </div>

        {/* Action Button */}
        <div>
          <button
            onClick={runBurst}
            disabled={isRunning}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white font-semibold text-sm shadow-glow-amber flex items-center justify-center space-x-2 transition-all active:scale-95 disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Firing {results.length}/{burstCount}...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Fire Burst ({burstCount} Reqs)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Real-time Response Telemetry Bar */}
      {results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card p-4 rounded-xl border border-emerald-500/30 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">2xx Success Responses</span>
            <span className="text-2xl font-bold font-mono text-emerald-400">{successCount}</span>
          </div>

          <div className="glass-card p-4 rounded-xl border border-amber-500/30 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">429 Rate Limited (Throttled)</span>
            <span className="text-2xl font-bold font-mono text-amber-400">{throttledCount}</span>
          </div>

          <div className="glass-card p-4 rounded-xl border border-rose-500/30 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">Client / Server Errors</span>
            <span className="text-2xl font-bold font-mono text-rose-400">{errorCount}</span>
          </div>
        </div>
      )}

      {/* Live Stream Inspector */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center space-x-2">
            <Activity className="w-4 h-4 text-amber-400" />
            <span>Burst Decision Stream</span>
          </h2>
          <span className="text-xs font-mono text-slate-500">
            {results.length === 0 ? 'Idle' : `${results.length} Frames Captured`}
          </span>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-xs font-mono uppercase text-slate-400">
              <tr>
                <th className="py-2.5 pl-2">#</th>
                <th className="py-2.5">Status</th>
                <th className="py-2.5">Latency</th>
                <th className="py-2.5">Rate Limit Remaining</th>
                <th className="py-2.5">Payload Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {results.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 font-mono text-xs">
                    No requests dispatched yet. Configure target route and click "Fire Burst".
                  </td>
                </tr>
              ) : (
                results.map((res) => (
                  <tr key={res.id} className="hover:bg-slate-800/30 font-mono text-xs transition-colors">
                    <td className="py-2.5 pl-2 text-slate-500">#{res.id}</td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded font-bold ${
                        res.statusCode === 200
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : res.statusCode === 429
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}>
                        {res.statusCode}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-400">{res.durationMs}ms</td>
                    <td className="py-2.5 text-slate-300">
                      {res.headers['x-ratelimit-remaining'] !== undefined ? (
                        <span className="text-emerald-400 font-bold">{res.headers['x-ratelimit-remaining']}</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-2.5 text-slate-400 truncate max-w-xs">
                      {JSON.stringify(res.payload)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
