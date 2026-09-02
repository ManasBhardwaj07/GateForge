'use client'

import React from 'react'
import { 
  X, 
  ShieldCheck, 
  ShieldAlert, 
  Zap, 
  Clock, 
  Network, 
  Server, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check,
  Activity,
  Code
} from 'lucide-react'

export interface CapturedRequest {
  id: number
  requestId: string
  method: string
  url: string
  statusCode: number
  durationMs: number
  apiKey: string
  headers: Record<string, string>
  payload: any
  timestamp: string
}

interface DecisionInspectorProps {
  request: CapturedRequest | null
  onClose: () => void
}

export function DecisionInspector({ request, onClose }: DecisionInspectorProps) {
  const [copied, setCopied] = React.useState(false)

  if (!request) return null

  const isSuccess = request.statusCode >= 200 && request.statusCode < 300
  const isAuthError = request.statusCode === 401 || request.statusCode === 403
  const isRouteNotFound = request.statusCode === 404
  const isThrottled = request.statusCode === 429
  const isTimeout = request.statusCode === 504
  const isServerErr = request.statusCode >= 500 && !isTimeout

  // Dynamic Phase 1 (Auth)
  const phase1Badge = request.statusCode === 401
    ? { label: '401 UNAUTHORIZED', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' }
    : request.statusCode === 403
    ? { label: '403 REVOKED / EXPIRED', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' }
    : { label: 'KEY VERIFIED', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }

  // Dynamic Phase 2 (Routing)
  const phase2Badge = isRouteNotFound
    ? { label: '404 NO ROUTE MATCH', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' }
    : isAuthError
    ? { label: 'BYPASSED', color: 'bg-slate-800/80 text-slate-500 border-slate-700' }
    : { label: 'ROUTE MATCHED', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' }

  // Dynamic Phase 3 (Rate Limiting)
  const phase3Badge = isThrottled
    ? { label: '429 THROTTLED', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' }
    : isAuthError || isRouteNotFound
    ? { label: 'BYPASSED', color: 'bg-slate-800/80 text-slate-500 border-slate-700' }
    : { label: 'PASSED (OK)', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }

  // Dynamic Phase 4 (SSRF & Upstream Proxy)
  const phase4Badge = isTimeout
    ? { label: '504 TIMEOUT', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' }
    : isServerErr
    ? { label: '500 UPSTREAM ERR', color: 'bg-rose-500/15 text-rose-400 border-rose-500/30' }
    : isAuthError || isRouteNotFound || isThrottled
    ? { label: 'NOT DISPATCHED', color: 'bg-slate-800/80 text-slate-500 border-slate-700' }
    : { label: 'PROXIED (200)', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }

  const rateLimitLimit = request.headers['x-ratelimit-limit'] || '100'
  const rateLimitRemaining = request.headers['x-ratelimit-remaining'] !== undefined ? request.headers['x-ratelimit-remaining'] : (isAuthError ? '—' : '99')
  const quotaLimit = request.headers['x-quota-limit'] || '50000'
  const quotaUsed = request.headers['x-quota-used'] || (isAuthError ? '—' : '1')

  const copyPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(request.payload, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-[#0B101B] border-l border-slate-800 h-full overflow-y-auto flex flex-col shadow-2xl p-6 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className={`w-3.5 h-3.5 rounded-full ${
              isSuccess ? 'bg-emerald-400 shadow-glow-emerald' : isThrottled ? 'bg-amber-400 shadow-glow-amber' : 'bg-rose-400 shadow-glow-rose'
            }`} />
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono font-bold text-base text-white">
                  {request.method} {request.url}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full font-mono text-xs font-bold ${
                  isSuccess ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
                  isThrottled ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' :
                  'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                }`}>
                  HTTP {request.statusCode}
                </span>
              </div>
              <div className="text-xs font-mono text-slate-400 mt-0.5">
                Latency: <span className="text-slate-200 font-bold">{request.durationMs}ms</span> • Trace ID: <span className="text-indigo-400">{request.requestId || 'req_live' }</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 5-Phase Pipeline Decision Breakdown */}
        <div className="space-y-4">
          <h3 className="text-xs font-mono uppercase tracking-widest text-slate-400 font-bold flex items-center space-x-2">
            <Activity className="w-4 h-4 text-indigo-400" />
            <span>GateForge Pipeline Decision Breakdown</span>
          </h3>

          {/* Phase 1: Authentication & Identification */}
          <div className="glass-card p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono font-bold text-slate-300 flex items-center space-x-2">
                <ShieldCheck className={`w-4 h-4 ${isAuthError ? 'text-rose-400' : 'text-indigo-400'}`} />
                <span>Phase 1: Multi-Tenant Key Identification</span>
              </span>
              <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border ${phase1Badge.color}`}>
                {phase1Badge.label}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-400 pt-1">
              <div>
                <span className="text-slate-500">API Key Prefix: </span>
                <span className="text-slate-200">{request.apiKey ? `${request.apiKey.slice(0, 10)}...` : 'None'}</span>
              </div>
              <div>
                <span className="text-slate-500">Hash Algorithm: </span>
                <span className="text-slate-200">SHA-256 (64-byte Hex)</span>
              </div>
              <div>
                <span className="text-slate-500">Tenant Resolved: </span>
                <span className="text-indigo-300">{isAuthError ? 'Unresolved' : 'Acme Corp (Pro Plan)'}</span>
              </div>
              <div>
                <span className="text-slate-500">Key Status: </span>
                <span className={request.statusCode === 403 ? 'text-rose-400' : request.statusCode === 401 ? 'text-amber-400' : 'text-emerald-400'}>
                  {request.statusCode === 403 ? 'REVOKED' : request.statusCode === 401 ? 'INVALID' : 'ACTIVE'}
                </span>
              </div>
            </div>
          </div>

          {/* Phase 2: Route Matching */}
          <div className="glass-card p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono font-bold text-slate-300 flex items-center space-x-2">
                <Network className={`w-4 h-4 ${isRouteNotFound ? 'text-rose-400' : 'text-cyan-400'}`} />
                <span>Phase 2: Longest-Prefix Route Resolution</span>
              </span>
              <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border ${phase2Badge.color}`}>
                {phase2Badge.label}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-400 pt-1">
              <div>
                <span className="text-slate-500">Matched Prefix: </span>
                <span className="text-cyan-300">{isRouteNotFound ? 'None' : `${request.url}/*`}</span>
              </div>
              <div>
                <span className="text-slate-500">Target Upstream: </span>
                <span className="text-slate-200">{isRouteNotFound ? 'None' : 'http://mock-orders:5001'}</span>
              </div>
              <div>
                <span className="text-slate-500">Timeout Policy: </span>
                <span className="text-slate-200">30,000ms</span>
              </div>
              <div>
                <span className="text-slate-500">Route Status: </span>
                <span className={isRouteNotFound ? 'text-rose-400' : 'text-emerald-400'}>
                  {isRouteNotFound ? 'UNMATCHED' : 'ACTIVE'}
                </span>
              </div>
            </div>
          </div>

          {/* Phase 3: Sliding Window Rate Limiting & Quota */}
          <div className="glass-card p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono font-bold text-slate-300 flex items-center space-x-2">
                <Zap className={`w-4 h-4 ${isThrottled ? 'text-amber-400' : 'text-indigo-400'}`} />
                <span>Phase 3: Sliding Window Rate Limit & Quota Decision</span>
              </span>
              <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border ${phase3Badge.color}`}>
                {phase3Badge.label}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-400 pt-1">
              <div>
                <span className="text-slate-500">Sliding Window: </span>
                <span className="text-slate-200">60s Atomic Redis Lua</span>
              </div>
              <div>
                <span className="text-slate-500">Rate Limit: </span>
                <span className="text-white font-bold">{rateLimitLimit} req/min</span>
              </div>
              <div>
                <span className="text-slate-500">Remaining Capacity: </span>
                <span className={`font-bold ${isThrottled ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {rateLimitRemaining} reqs
                </span>
              </div>
              <div>
                <span className="text-slate-500">Monthly Quota: </span>
                <span className="text-cyan-300">{quotaUsed} / {quotaLimit}</span>
              </div>
            </div>
          </div>

          {/* Phase 4: SSRF & Upstream Verification */}
          <div className="glass-card p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono font-bold text-slate-300 flex items-center space-x-2">
                <Server className="w-4 h-4 text-emerald-400" />
                <span>Phase 4: SSRF Guardrails & Connection-Time DNS Check</span>
              </span>
              <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border ${phase4Badge.color}`}>
                {phase4Badge.label}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-400 pt-1">
              <div>
                <span className="text-slate-500">DNS Resolution: </span>
                <span className="text-slate-200">Resolved to internal network</span>
              </div>
              <div>
                <span className="text-slate-500">Cloud Metadata Check: </span>
                <span className="text-emerald-400">Blocked 169.254.169.254</span>
              </div>
              <div>
                <span className="text-slate-500">Private IP Policy: </span>
                <span className="text-slate-300">RFC1918 Guard Active</span>
              </div>
              <div>
                <span className="text-slate-500">Gateway Status: </span>
                <span className="text-slate-200">{request.statusCode}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Response Headers */}
        <div className="space-y-2">
          <div className="text-xs font-mono uppercase text-slate-400 font-bold">Response Headers</div>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto max-h-36">
            {Object.entries(request.headers).length === 0 ? (
              <span className="text-slate-600">No custom response headers.</span>
            ) : (
              Object.entries(request.headers).map(([k, v]) => (
                <div key={k} className="flex space-x-2">
                  <span className="text-indigo-400">{k}:</span>
                  <span className="text-slate-200">{v}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Response Body Payload */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase text-slate-400 font-bold">Response Body</span>
            <button
              onClick={copyPayload}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono flex items-center space-x-1"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy JSON'}</span>
            </button>
          </div>
          <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-emerald-400 overflow-x-auto max-h-56">
            {JSON.stringify(request.payload, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
}
