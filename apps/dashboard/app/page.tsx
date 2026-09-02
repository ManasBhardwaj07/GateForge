'use client'

import { useState, useEffect } from 'react'
import { 
  fetchOrganizations, 
  fetchApiKeys, 
  fetchRoutes, 
  fetchAuditEvents, 
  fetchHealth,
  Organization,
  ApiKey,
  RouteItem,
  AuditEvent,
  HealthStatus
} from '../lib/api'
import { 
  Activity, 
  ShieldCheck, 
  KeyRound, 
  Network, 
  Zap, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowUpRight,
  Clock,
  Sparkles,
  Server
} from 'lucide-react'

export default function OverviewPage() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [routes, setRoutes] = useState<RouteItem[]>([])
  const [audits, setAudits] = useState<AuditEvent[]>([])
  const [health, setHealth] = useState<HealthStatus>({
    gateway: 'checking',
    controlApi: 'checking',
    redis: null,
    orders: 'checking',
    payments: 'checking',
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const [orgsData, keysData, routesData, auditsData, healthData] = await Promise.all([
          fetchOrganizations().catch(() => []),
          fetchApiKeys().catch(() => []),
          fetchRoutes().catch(() => []),
          fetchAuditEvents().catch(() => []),
          fetchHealth(),
        ])
        setOrgs(orgsData)
        setKeys(keysData)
        setRoutes(routesData)
        setAudits(auditsData)
        setHealth(healthData)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const activeKeysCount = keys.filter((k) => k.status === 'ACTIVE').length
  const activeRoutesCount = routes.filter((r) => r.isActive).length

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Hero Welcome & Cluster Telemetry */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-3">
            <span>System Telemetry Overview</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              LIVE DATA PLANE
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time proxy pipeline enforcement, sliding window rate limits, and quota telemetry.
          </p>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {/* Active API Keys */}
        <div className="glass-card specular-edge p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Active API Keys</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <KeyRound className="w-4 h-4 text-indigo-400" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline space-x-2">
            <span className="text-3xl font-bold font-mono text-white">{activeKeysCount}</span>
            <span className="text-xs text-slate-500 font-mono">/ {keys.length} total</span>
          </div>
          <div className="mt-2 flex items-center text-xs text-emerald-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            <span>SHA-256 Hash Verified</span>
          </div>
        </div>

        {/* Registered Routes */}
        <div className="glass-card specular-edge p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Registered Routes</span>
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Network className="w-4 h-4 text-cyan-400" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline space-x-2">
            <span className="text-3xl font-bold font-mono text-white">{activeRoutesCount}</span>
            <span className="text-xs text-slate-500 font-mono">Active prefixes</span>
          </div>
          <div className="mt-2 flex items-center text-xs text-cyan-400 font-medium">
            <Zap className="w-3.5 h-3.5 mr-1" />
            <span>Longest-Prefix Match</span>
          </div>
        </div>

        {/* Multi-Tenant Orgs */}
        <div className="glass-card specular-edge p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Tenants & Plans</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline space-x-2">
            <span className="text-3xl font-bold font-mono text-white">{orgs.length}</span>
            <span className="text-xs text-slate-500 font-mono">Organizations</span>
          </div>
          <div className="mt-2 flex items-center text-xs text-indigo-400 font-medium">
            <Clock className="w-3.5 h-3.5 mr-1" />
            <span>Deterministic Policy</span>
          </div>
        </div>

        {/* Rate Limiting Engine */}
        <div className="glass-card specular-edge p-5 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Rate Limiting</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Activity className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline space-x-2">
            <span className="text-3xl font-bold font-mono text-white">60s</span>
            <span className="text-xs text-slate-500 font-mono">Sliding Window</span>
          </div>
          <div className="mt-2 flex items-center text-xs text-amber-400 font-medium">
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            <span>Atomic Redis Lua</span>
          </div>
        </div>
      </div>

      {/* Cluster Nodes & Services Health Matrix */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <h2 className="text-base font-semibold text-white flex items-center space-x-2">
          <Server className="w-4 h-4 text-indigo-400" />
          <span>Cluster Service Mesh Telemetry</span>
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
          {/* Gateway Data Plane */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-xs font-mono text-slate-400">GATEWAY DATA PLANE</div>
              <div className="text-sm font-bold text-white mt-1">Port :4000</div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
              health.gateway === 'online' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-400'
            }`}>
              {health.gateway === 'online' ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          {/* Redis Lua Engine */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-xs font-mono text-slate-400">REDIS 7 ATOMIC LUA</div>
              <div className="text-sm font-bold text-white mt-1">Port :6379</div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
              health.redis ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30' : 'bg-rose-500/10 text-rose-400'
            }`}>
              {health.redis ? 'CONNECTED' : 'OFFLINE'}
            </span>
          </div>

          {/* Mock Orders Upstream */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-xs font-mono text-slate-400">MOCK ORDERS UPSTREAM</div>
              <div className="text-sm font-bold text-white mt-1">Port :5001</div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
              health.orders === 'online' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' : 'bg-slate-800 text-slate-500'
            }`}>
              {health.orders === 'online' ? 'UPSTREAM' : 'CHECKING'}
            </span>
          </div>

          {/* Mock Payments Upstream */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-xs font-mono text-slate-400">MOCK PAYMENTS UPSTREAM</div>
              <div className="text-sm font-bold text-white mt-1">Port :5002</div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
              health.payments === 'online' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' : 'bg-slate-800 text-slate-500'
            }`}>
              {health.payments === 'online' ? 'UPSTREAM' : 'CHECKING'}
            </span>
          </div>
        </div>
      </div>

      {/* Real-time Audit & Activity Log */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center space-x-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Recent Administrative & Telemetry Audit Feed</span>
          </h2>
          <span className="text-xs font-mono text-slate-500">Live DB Stream</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs font-mono uppercase text-slate-400">
                <th className="pb-3 pl-2">Action</th>
                <th className="pb-3">Target</th>
                <th className="pb-3">Actor</th>
                <th className="pb-3">Organization</th>
                <th className="pb-3 text-right pr-2">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {audits.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 font-mono text-xs">
                    No recent audit events recorded.
                  </td>
                </tr>
              ) : (
                audits.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 pl-2 font-mono text-xs">
                      <span className={`px-2.5 py-1 rounded-md font-bold text-[11px] ${
                        item.action.includes('revoke')
                          ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                          : item.action.includes('create')
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                      }`}>
                        {item.action}
                      </span>
                    </td>
                    <td className="py-3.5 font-mono text-xs text-slate-300">
                      {item.targetType} <span className="text-slate-500 text-[10px]">({item.targetId.slice(0, 8)}...)</span>
                    </td>
                    <td className="py-3.5 text-xs text-slate-400 font-mono">{item.actor}</td>
                    <td className="py-3.5 text-xs text-slate-300">{item.organizationName || 'System Global'}</td>
                    <td className="py-3.5 text-xs text-slate-500 font-mono text-right pr-2">
                      {new Date(item.createdAt).toLocaleTimeString()}
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
