'use client'

import React, { useState, useEffect } from 'react'
import { fetchApiKeys, fetchRoutes, ApiKey, RouteItem } from '../../lib/api'
import { DecisionInspector, CapturedRequest } from '../../components/DecisionInspector'
import { 
  Zap, 
  Play, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ShieldAlert, 
  Layers, 
  Activity,
  Sliders,
  Sparkles,
  ChevronRight
} from 'lucide-react'

export default function PlaygroundPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [routes, setRoutes] = useState<RouteItem[]>([])
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('GET')
  const [selectedKey, setSelectedKey] = useState('gf_test_123')
  const [selectedRoute, setSelectedRoute] = useState('/api/v1/orders')
  const [customBody, setCustomBody] = useState('{\n  "item": "golf ball",\n  "quantity": 2\n}')
  const [burstCount, setBurstCount] = useState(10)
  const [concurrency, setConcurrency] = useState(5)
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<CapturedRequest[]>([])
  const [activeRequest, setActiveRequest] = useState<CapturedRequest | null>(null)

  useEffect(() => {
    async function load() {
      const [k, r] = await Promise.all([
        fetchApiKeys().catch(() => []),
        fetchRoutes().catch(() => []),
      ])
      setKeys(k)
      setRoutes(r)
    }
    load()
  }, [])

  const runBurst = async () => {
    setIsRunning(true)
    setResults([])
    const captured: CapturedRequest[] = []

    // Concurrency worker queue
    let nextIndex = 1
    const workers = Array.from({ length: Math.min(concurrency, burstCount) }, async () => {
      while (nextIndex <= burstCount) {
        const id = nextIndex++
        const startTime = performance.now()
        try {
          const fetchOptions: RequestInit = {
            method,
            headers: {
              ...(selectedKey ? { 'X-API-Key': selectedKey } : {}),
              ...(method === 'POST' || method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(method === 'POST' || method === 'PUT' ? { body: customBody } : {}),
          }

          const res = await fetch(`http://localhost:4000${selectedRoute}`, fetchOptions)
          const duration = Math.round(performance.now() - startTime)
          const body = await res.json().catch(() => ({}))
          
          const headerMap: Record<string, string> = {}
          res.headers.forEach((v, k) => { headerMap[k.toLowerCase()] = v })

          const item: CapturedRequest = {
            id,
            requestId: headerMap['x-request-id'] || `req_${Math.random().toString(36).slice(2, 10)}`,
            method,
            url: selectedRoute,
            statusCode: res.status,
            durationMs: duration,
            apiKey: selectedKey,
            headers: headerMap,
            payload: body,
            timestamp: new Date().toISOString(),
          }
          captured.push(item)
          setResults([...captured].sort((a, b) => a.id - b.id))
        } catch (err: any) {
          const item: CapturedRequest = {
            id,
            requestId: `req_err_${id}`,
            method,
            url: selectedRoute,
            statusCode: 0,
            durationMs: Math.round(performance.now() - startTime),
            apiKey: selectedKey,
            headers: {},
            payload: { error: 'Connection Failed to Gateway :4000' },
            timestamp: new Date().toISOString(),
          }
          captured.push(item)
          setResults([...captured].sort((a, b) => a.id - b.id))
        }
      }
    })

    await Promise.all(workers)
    setIsRunning(false)
  }

  const successCount = results.filter((r) => r.statusCode >= 200 && r.statusCode < 300).length
  const throttledCount = results.filter((r) => r.statusCode === 429).length
  const errorCount = results.filter((r) => r.statusCode >= 400 && r.statusCode !== 429).length
  const avgLatency = results.length > 0 ? Math.round(results.reduce((acc, r) => acc + r.durationMs, 0) / results.length) : 0
  const p99Latency = results.length > 0 ? [...results].sort((a, b) => a.durationMs - b.durationMs)[Math.floor(results.length * 0.95)]?.durationMs || 0 : 0

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-3">
            <Zap className="w-6 h-6 text-amber-400" />
            <span>Traffic Playground & Decision Inspector</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Simulate live concurrent HTTP traffic, stress-test rate limiters, and inspect atomic pipeline decisions.
          </p>
        </div>
      </div>

      {/* Control Panel Grid */}
      <div className="glass-panel p-6 rounded-2xl space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Method & Route */}
          <div className="md:col-span-2">
            <label className="block text-xs font-mono uppercase text-slate-400 mb-1.5">HTTP Method & Target Route</label>
            <div className="flex items-center space-x-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as any)}
                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs font-mono font-bold text-indigo-400 focus:outline-none focus:border-amber-500"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>

              <select
                value={selectedRoute}
                onChange={(e) => setSelectedRoute(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
              >
                <option value="/api/v1/orders">/api/v1/orders (Mock Orders Service)</option>
                <option value="/api/v1/orders/1">/api/v1/orders/1 (Single Order Entity)</option>
                <option value="/api/v1/orders/slow">/api/v1/orders/slow (504 Timeout Simulation)</option>
                <option value="/api/v1/orders/error">/api/v1/orders/error (500 Upstream Error)</option>
                <option value="/api/v1/unknown">/api/v1/unknown (404 Unmatched Route)</option>
              </select>
            </div>
          </div>

          {/* API Key Header */}
          <div>
            <label className="block text-xs font-mono uppercase text-slate-400 mb-1.5">API Key (X-API-Key)</label>
            <input
              type="text"
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              placeholder="gf_test_123 or gf_live_..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 font-mono text-xs text-emerald-400 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Concurrency Slider */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-mono uppercase text-slate-400">Concurrency Workers</label>
              <span className="text-xs font-mono text-amber-400 font-bold">{concurrency} Parallel</span>
            </div>
            <input
              type="range"
              min="1"
              max="20"
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>
        </div>

        {/* POST/PUT Body (if applicable) */}
        {(method === 'POST' || method === 'PUT') && (
          <div>
            <label className="block text-xs font-mono uppercase text-slate-400 mb-1.5">JSON Payload Body</label>
            <textarea
              rows={3}
              value={customBody}
              onChange={(e) => setCustomBody(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-300 focus:border-amber-500 focus:outline-none"
            />
          </div>
        )}

        {/* Burst Presets & Action Button */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2 border-t border-slate-800/80">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono uppercase text-slate-500 mr-1">Presets:</span>
            {[
              { count: 10, label: '10 Reqs (Standard)' },
              { count: 50, label: '50 Reqs (High Load)' },
              { count: 105, label: '105 Reqs (Throttle 429 Test)' },
            ].map((p) => (
              <button
                key={p.count}
                type="button"
                onClick={() => setBurstCount(p.count)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                  burstCount === p.count
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-glow-amber'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={runBurst}
            disabled={isRunning}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white font-semibold text-sm shadow-glow-amber flex items-center justify-center space-x-2 transition-all active:scale-95 disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Simulating {results.length}/{burstCount}...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Launch Burst ({burstCount} Requests)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Telemetry Summary Metrics */}
      {results.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 animate-in fade-in duration-300">
          <div className="glass-card p-4 rounded-xl border border-slate-800">
            <div className="text-[11px] font-mono text-slate-400">TOTAL DISPATCHED</div>
            <div className="text-2xl font-bold font-mono text-white mt-1">{results.length}</div>
          </div>

          <div className="glass-card p-4 rounded-xl border border-emerald-500/30">
            <div className="text-[11px] font-mono text-emerald-400">2xx PASSED</div>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{successCount}</div>
          </div>

          <div className="glass-card p-4 rounded-xl border border-amber-500/30">
            <div className="text-[11px] font-mono text-amber-400">429 THROTTLED</div>
            <div className="text-2xl font-bold font-mono text-amber-400 mt-1">{throttledCount}</div>
          </div>

          <div className="glass-card p-4 rounded-xl border border-rose-500/30">
            <div className="text-[11px] font-mono text-rose-400">ERRORS (4xx/5xx)</div>
            <div className="text-2xl font-bold font-mono text-rose-400 mt-1">{errorCount}</div>
          </div>

          <div className="glass-card p-4 rounded-xl border border-indigo-500/30">
            <div className="text-[11px] font-mono text-indigo-400">AVG / P99 LATENCY</div>
            <div className="text-xl font-bold font-mono text-white mt-1">{avgLatency}ms / {p99Latency}ms</div>
          </div>
        </div>
      )}

      {/* Live Captured Decision Stream */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center space-x-2">
            <Activity className="w-4 h-4 text-amber-400" />
            <span>Captured Pipeline Decisions & Telemetry Stream</span>
          </h2>
          <span className="text-xs font-mono text-slate-500">
            {results.length === 0 ? 'Awaiting burst' : `Captured ${results.length} requests • Click row to inspect decision`}
          </span>
        </div>

        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-xs font-mono uppercase text-slate-400">
              <tr>
                <th className="py-3 pl-3">Req #</th>
                <th className="py-3">Status</th>
                <th className="py-3">Method & Path</th>
                <th className="py-3">Latency</th>
                <th className="py-3">Rate Limit Remaining</th>
                <th className="py-3">Decision</th>
                <th className="py-3 text-right pr-3">Inspector</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {results.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 font-mono text-xs">
                    No requests dispatched yet. Configure burst above and click "Launch Burst".
                  </td>
                </tr>
              ) : (
                results.map((res) => (
                  <tr 
                    key={res.id} 
                    onClick={() => setActiveRequest(res)}
                    className="hover:bg-slate-800/40 cursor-pointer font-mono text-xs transition-colors group"
                  >
                    <td className="py-3.5 pl-3 text-slate-500">#{res.id}</td>
                    <td className="py-3.5">
                      <span className={`px-2.5 py-1 rounded-md font-bold text-[11px] ${
                        res.statusCode === 200
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : res.statusCode === 429
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}>
                        {res.statusCode || 'ERR'}
                      </span>
                    </td>
                    <td className="py-3.5 text-slate-300 font-medium">
                      <span className="text-indigo-400">{res.method}</span> {res.url}
                    </td>
                    <td className="py-3.5 text-slate-400">{res.durationMs}ms</td>
                    <td className="py-3.5 text-slate-300">
                      {res.headers['x-ratelimit-remaining'] !== undefined ? (
                        <span className="text-emerald-400 font-bold">{res.headers['x-ratelimit-remaining']}</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        res.statusCode === 200
                          ? 'text-emerald-400 bg-emerald-500/10'
                          : res.statusCode === 429
                          ? 'text-amber-400 bg-amber-500/10'
                          : 'text-rose-400 bg-rose-500/10'
                      }`}>
                        {res.statusCode === 200 ? 'PROXIED' : res.statusCode === 429 ? 'RATE_LIMITED' : 'ERROR'}
                      </span>
                    </td>
                    <td className="py-3.5 text-right pr-3">
                      <button className="inline-flex items-center space-x-1 text-indigo-400 hover:text-indigo-300 group-hover:translate-x-0.5 transition-transform">
                        <span>Inspect</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Decision Inspector Drawer Modal */}
      <DecisionInspector
        request={activeRequest}
        onClose={() => setActiveRequest(null)}
      />
    </div>
  )
}
