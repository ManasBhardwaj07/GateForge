'use client'

import { useState, useEffect } from 'react'
import { 
  fetchOrganizations, 
  fetchApiKeys, 
  fetchRoutes, 
  fetchAuditEvents, 
  fetchHealth,
  fetchPlans,
  fetchUpstreams,
  Organization,
  ApiKey,
  RouteItem,
  AuditEvent,
  HealthStatus,
  Plan,
  Upstream
} from '../lib/api'
import Link from 'next/link'
import { 
  Activity, 
  ShieldCheck, 
  KeyRound, 
  Network, 
  Zap, 
  AlertTriangle, 
  CheckCircle2, 
  Circle,
  ArrowUpRight,
  ArrowRight,
  Clock,
  Sparkles,
  Server,
  Layers,
  Building2
} from 'lucide-react'

export default function OverviewPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [upstreams, setUpstreams] = useState<Upstream[]>([])
  const [routes, setRoutes] = useState<RouteItem[]>([])
  const [keys, setKeys] = useState<ApiKey[]>([])
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
        const [plansData, orgsData, upstreamsData, routesData, keysData, auditsData, healthData] = await Promise.all([
          fetchPlans().catch(() => []),
          fetchOrganizations().catch(() => []),
          fetchUpstreams().catch(() => []),
          fetchRoutes().catch(() => []),
          fetchApiKeys().catch(() => []),
          fetchAuditEvents().catch(() => []),
          fetchHealth(),
        ])
        setPlans(plansData)
        setOrgs(orgsData)
        setUpstreams(upstreamsData)
        setRoutes(routesData)
        setKeys(keysData)
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

  // Setup Dependency Order Checklist
  const setupSteps = [
    {
      id: 1,
      title: 'Plan',
      userExplanation: 'Define traffic limits',
      desc: 'Define rate limit + monthly quota',
      done: plans.length > 0,
      countLabel: `${plans.length} configured`,
      href: '/organizations',
      cta: 'Create Plan',
    },
    {
      id: 2,
      title: 'Organization',
      userExplanation: 'Create a tenant and assign its plan',
      desc: 'Assign the organization to a Plan',
      done: orgs.length > 0,
      countLabel: `${orgs.length} active`,
      href: '/organizations',
      cta: 'Create Organization',
    },
    {
      id: 3,
      title: 'Upstream',
      userExplanation: 'Connect GateForge to your API',
      desc: 'Tell GateForge where your API lives',
      done: upstreams.length > 0,
      countLabel: `${upstreams.length} registered`,
      href: '/routes',
      cta: 'Add Upstream',
    },
    {
      id: 4,
      title: 'Route',
      userExplanation: 'Decide which API path goes to which upstream',
      desc: 'Map an API path to your upstream',
      done: routes.length > 0,
      countLabel: `${routes.length} mapped`,
      href: '/routes',
      cta: 'Create Route',
    },
    {
      id: 5,
      title: 'API Key',
      userExplanation: 'Give a client permission to send requests',
      desc: 'Create credentials for your client',
      done: keys.length > 0,
      countLabel: `${keys.length} issued`,
      href: '/api-keys',
      cta: 'Create API Key',
    },
  ]

  const completedSteps = setupSteps.filter((s) => s.done).length
  const nextPendingStep = setupSteps.find((s) => !s.done)
  const isFullyConfigured = completedSteps === setupSteps.length

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

      {/* Layer 1 — How to set up GateForge */}
      {!isFullyConfigured ? (
        <div className="glass-panel p-6 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/30 via-slate-900/70 to-slate-900/50 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-md">
                  SETUP IN PROGRESS ({completedSteps}/5)
                </span>
                <span className="text-xs text-slate-400 font-mono">Getting Started</span>
              </div>
              <h2 className="text-base font-semibold text-white mt-1">Get Your First Request Through GateForge</h2>
              <p className="text-xs text-slate-400">
                Configure these once, then test the complete pipeline.
              </p>
            </div>
            {nextPendingStep && (
              <Link
                href={nextPendingStep.href}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-600 hover:to-indigo-700 text-white flex items-center space-x-2 shadow-glow-amber shrink-0 transition-all"
              >
                <span>Continue Setup ({nextPendingStep.title})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-amber-500 to-indigo-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(completedSteps / 5) * 100}%` }}
            />
          </div>

          {/* Step-by-Step Progressive Disclosure Checklist */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-1">
            {setupSteps.map((step) => {
              const isNext = step.id === nextPendingStep?.id
              return (
                <div
                  key={step.id}
                  className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                    step.done
                      ? 'bg-slate-900/60 border-emerald-500/30 text-slate-300'
                      : isNext
                      ? 'bg-amber-500/10 border-amber-500/60 text-white shadow-lg ring-1 ring-amber-500/30'
                      : 'bg-slate-950/40 border-slate-800/60 text-slate-500'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] font-mono font-bold ${isNext ? 'text-amber-400' : 'text-slate-400'}`}>
                        Step {step.id}
                      </span>
                      {step.done ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Circle className={`w-4 h-4 ${isNext ? 'text-amber-400 animate-pulse' : 'text-slate-600'}`} />
                      )}
                    </div>
                    <div className={`text-xs font-semibold mt-2 ${isNext ? 'text-white' : step.done ? 'text-slate-200' : 'text-slate-400'}`}>
                      {step.title}
                    </div>
                    <div className={`text-[11px] font-medium mt-0.5 ${isNext ? 'text-amber-200/90' : 'text-slate-400'}`}>
                      {step.userExplanation}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 leading-tight">
                      {step.desc}
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono">
                    <span className={step.done ? 'text-emerald-400 font-semibold' : isNext ? 'text-amber-400 font-semibold' : 'text-slate-500'}>
                      {step.done ? step.countLabel : isNext ? 'Next Action' : 'Pending'}
                    </span>
                    {isNext ? (
                      <Link
                        href={step.href}
                        className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold font-sans text-[11px] transition-colors"
                      >
                        {step.cta} →
                      </Link>
                    ) : (
                      <Link href={step.href} className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 font-sans text-[11px]">
                        {step.cta}
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* Layer 1 — When Configured (5/5) */
        <div className="glass-panel p-6 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/30 via-slate-900/60 to-slate-900/40 space-y-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-3xl">
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-md flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1 inline text-emerald-400" />
                  GATEWAY CONFIGURED (5/5 READY)
                </span>
                <span className="text-xs text-slate-400 font-mono">Ready to Receive Traffic</span>
              </div>
              <h2 className="text-base font-semibold text-white">GateForge is configured</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Your tenant, policy, route, and API key are ready. Test the complete pipeline in the Traffic Playground.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <Link
                href="/playground"
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center space-x-2 shadow-lg shadow-indigo-600/25 transition-all"
              >
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Open Playground →</span>
              </Link>
            </div>
          </div>

          {/* Configured Verification Checklist */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-800/60 font-mono text-[11px]">
            <div className="flex items-center space-x-1.5 text-slate-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Plan (limits set)</span>
            </div>
            <div className="flex items-center space-x-1.5 text-slate-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Organization (tenant)</span>
            </div>
            <div className="flex items-center space-x-1.5 text-slate-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Upstream (API connected)</span>
            </div>
            <div className="flex items-center space-x-1.5 text-slate-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Route (path mapped)</span>
            </div>
            <div className="flex items-center space-x-1.5 text-slate-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>API Key (active)</span>
            </div>
          </div>
        </div>
      )}

      {/* Layer 2 — What Happens When a Request Arrives (Request Lifecycle) */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800/80 bg-slate-950/50 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
              WHAT HAPPENS WHEN A REQUEST ARRIVES
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Request Lifecycle
            </span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
            Evaluation Order: 1 → 2 → 3 → 4 → 5
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5 font-mono text-[11px]">
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-cyan-400 font-bold text-xs">1. API Key</div>
            <div className="text-white font-sans font-semibold text-xs mt-1">Authenticate tenant</div>
            <div className="text-[11px] text-slate-400 font-sans mt-0.5">Verify X-API-Key hash</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-emerald-400 font-bold text-xs">2. Organization</div>
            <div className="text-white font-sans font-semibold text-xs mt-1">Resolve tenant</div>
            <div className="text-[11px] text-slate-400 font-sans mt-0.5">Lookup tenant identity</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-indigo-400 font-bold text-xs">3. Plan</div>
            <div className="text-white font-sans font-semibold text-xs mt-1">Resolve policy</div>
            <div className="text-[11px] text-slate-400 font-sans mt-0.5">Enforce limits & quota</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-amber-400 font-bold text-xs">4. Route Match</div>
            <div className="text-white font-sans font-semibold text-xs mt-1">Find longest prefix</div>
            <div className="text-[11px] text-slate-400 font-sans mt-0.5">Match URI to upstream</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-purple-400 font-bold text-xs">5. Upstream Proxy</div>
            <div className="text-white font-sans font-semibold text-xs mt-1">SSRF-safe forwarding</div>
            <div className="text-[11px] text-slate-400 font-sans mt-0.5">Filter DNS & forward</div>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 font-sans leading-relaxed border-t border-slate-800/60 pt-2.5">
          When a request arrives with <code className="text-slate-200 font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">X-API-Key</code>, GateForge authenticates the key, resolves its organization and policy, matches the route, enforces traffic limits, and proxies the request to the configured upstream.
        </p>
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
          <span>Cluster Infrastructure & Upstream Health</span>
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
