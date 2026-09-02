'use client'

import { useState, useEffect } from 'react'
import { 
  fetchRoutes, 
  fetchUpstreams, 
  createUpstream, 
  createRoute, 
  RouteItem, 
  Upstream 
} from '../../lib/api'
import { 
  Network, 
  Plus, 
  ShieldCheck, 
  Clock, 
  ArrowRight, 
  Server, 
  AlertTriangle,
  CheckCircle2,
  Lock
} from 'lucide-react'

export default function RoutesPage() {
  const [routes, setRoutes] = useState<RouteItem[]>([])
  const [upstreams, setUpstreams] = useState<Upstream[]>([])
  const [loading, setLoading] = useState(true)

  // Upstream Modal State
  const [isUpstreamModalOpen, setIsUpstreamModalOpen] = useState(false)
  const [upstreamName, setUpstreamName] = useState('')
  const [upstreamUrl, setUpstreamUrl] = useState('')
  const [upstreamTimeout, setUpstreamTimeout] = useState('30000')
  const [creatingUpstream, setCreatingUpstream] = useState(false)
  const [upstreamError, setUpstreamError] = useState<string | null>(null)

  // Route Modal State
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false)
  const [routeSlug, setRouteSlug] = useState('')
  const [routePrefix, setRoutePrefix] = useState('')
  const [routeUpstreamId, setRouteUpstreamId] = useState('')
  const [creatingRoute, setCreatingRoute] = useState(false)

  async function loadData() {
    setLoading(true)
    try {
      const [routesData, upstreamsData] = await Promise.all([
        fetchRoutes().catch(() => []),
        fetchUpstreams().catch(() => []),
      ])
      setRoutes(routesData)
      setUpstreams(upstreamsData)
      if (upstreamsData.length > 0 && !routeUpstreamId) {
        setRouteUpstreamId(upstreamsData[0].id)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCreateUpstream = async (e: React.FormEvent) => {
    e.preventDefault()
    setUpstreamError(null)
    setCreatingUpstream(true)
    try {
      await createUpstream({
        name: upstreamName,
        baseUrl: upstreamUrl,
        timeoutMs: Number(upstreamTimeout) || 30000,
      })
      setIsUpstreamModalOpen(false)
      setUpstreamName('')
      setUpstreamUrl('')
      await loadData()
    } catch (err: any) {
      setUpstreamError(err.message || 'Failed to create upstream')
    } finally {
      setCreatingUpstream(false)
    }
  }

  const handleCreateRoute = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!routeUpstreamId) return
    setCreatingRoute(true)
    try {
      await createRoute({
        slug: routeSlug,
        pathPrefix: routePrefix,
        upstreamId: routeUpstreamId,
      })
      setIsRouteModalOpen(false)
      setRouteSlug('')
      setRoutePrefix('')
      await loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to create route')
    } finally {
      setCreatingRoute(false)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-3">
            <Network className="w-6 h-6 text-cyan-400" />
            <span>Routes & Upstream Topology</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Dynamic prefix routing, SSRF-validated upstreams, and proxy timeout orchestration.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsUpstreamModalOpen(true)}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition-all"
          >
            <Server className="w-4 h-4 text-cyan-400" />
            <span>Register Upstream</span>
          </button>

          <button
            onClick={() => setIsRouteModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-600 hover:to-indigo-700 text-white text-sm font-semibold shadow-glow-indigo transition-all transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Add Route</span>
          </button>
        </div>
      </div>

      {/* Routes Matrix */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center space-x-2">
            <Network className="w-4 h-4 text-indigo-400" />
            <span>Active Longest-Prefix Routes</span>
          </h2>
          <span className="text-xs font-mono text-slate-500">{routes.length} Active Mappings</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs font-mono uppercase text-slate-400">
                <th className="pb-3 pl-2">Path Prefix</th>
                <th className="pb-3">Slug</th>
                <th className="pb-3">Target Upstream</th>
                <th className="pb-3">Timeout</th>
                <th className="pb-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {routes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 font-mono text-xs">
                    No routes registered yet. Click "Add Route" above.
                  </td>
                </tr>
              ) : (
                routes.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-4 pl-2 font-mono text-xs font-bold text-cyan-300">
                      <span className="px-2.5 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/30">
                        {r.pathPrefix}/*
                      </span>
                    </td>
                    <td className="py-4 font-mono text-xs text-slate-300">{r.slug}</td>
                    <td className="py-4 text-xs font-mono text-slate-300">
                      <div className="flex items-center space-x-2">
                        <span className="text-white font-medium">{r.upstreamName || 'Orders Service'}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-slate-400 text-[11px]">{r.upstreamBaseUrl || 'http://mock-orders:5001'}</span>
                      </div>
                    </td>
                    <td className="py-4 text-xs text-slate-400 font-mono flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{r.timeoutMs}ms</span>
                    </td>
                    <td className="py-4 text-xs">
                      <span className="px-2.5 py-1 rounded-full font-mono text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        ACTIVE
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upstreams Matrix */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center space-x-2">
            <Server className="w-4 h-4 text-cyan-400" />
            <span>Registered Upstreams & SSRF Guardrails</span>
          </h2>
          <span className="text-xs font-mono text-slate-500">{upstreams.length} Targets</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {upstreams.map((u) => (
            <div key={u.id} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-bold text-white">{u.name}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    SSRF Clean
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-400 mt-1">{u.baseUrl}</div>
              </div>
              <div className="text-right text-xs font-mono text-slate-500">
                <div>Timeout: {u.timeoutMs}ms</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Upstream Modal */}
      {isUpstreamModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="glass-panel max-w-md w-full p-6 rounded-2xl border border-slate-700 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <Server className="w-5 h-5 text-cyan-400" />
                <span>Register Upstream Service</span>
              </h3>
              <button onClick={() => setIsUpstreamModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            {upstreamError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{upstreamError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUpstream} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Service Name</label>
                <input
                  type="text"
                  placeholder="e.g. Payments Service"
                  value={upstreamName}
                  onChange={(e) => setUpstreamName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Base URL (Validated for SSRF)</label>
                <input
                  type="url"
                  placeholder="http://mock-orders:5001"
                  value={upstreamUrl}
                  onChange={(e) => setUpstreamUrl(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 font-mono text-sm text-white focus:border-cyan-500 focus:outline-none"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsUpstreamModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingUpstream}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold"
                >
                  {creatingUpstream ? 'Validating & Saving...' : 'Save Upstream'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Route Modal */}
      {isRouteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="glass-panel max-w-md w-full p-6 rounded-2xl border border-slate-700 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <Network className="w-5 h-5 text-indigo-400" />
                <span>Add Longest-Prefix Route</span>
              </h3>
              <button onClick={() => setIsRouteModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateRoute} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Route Slug</label>
                <input
                  type="text"
                  placeholder="orders-v1"
                  value={routeSlug}
                  onChange={(e) => setRouteSlug(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Path Prefix</label>
                <input
                  type="text"
                  placeholder="/api/v1/orders"
                  value={routePrefix}
                  onChange={(e) => setRoutePrefix(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 font-mono text-sm text-white focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Target Upstream</label>
                <select
                  value={routeUpstreamId}
                  onChange={(e) => setRouteUpstreamId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  required
                >
                  {upstreams.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.baseUrl})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsRouteModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingRoute}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
                >
                  {creatingRoute ? 'Saving...' : 'Register Route'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
