'use client'

import { useState, useEffect } from 'react'
import { fetchHealth, HealthStatus } from '../lib/api'
import { Server, Database, Layers, Radio, RefreshCw } from 'lucide-react'

export function Header() {
  const [health, setHealth] = useState<HealthStatus>({
    gateway: 'checking',
    controlApi: 'checking',
    redis: null,
    orders: 'checking',
    payments: 'checking',
  })
  const [loading, setLoading] = useState(false)

  const checkStatus = async () => {
    setLoading(true)
    const res = await fetchHealth()
    setHealth(res)
    setLoading(false)
  }

  useEffect(() => {
    checkStatus()
    const timer = setInterval(checkStatus, 10000)
    return () => clearInterval(timer)
  }, [])

  return (
    <header className="h-16 border-b border-slate-800/80 glass-panel px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Search / Breadcrumb */}
      <div className="flex items-center space-x-3 text-sm">
        <span className="font-mono text-xs px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300">
          PROD-CLUSTER-1
        </span>
        <span className="text-slate-600">/</span>
        <span className="text-slate-300 font-medium">Programmable Traffic Control Engine</span>
      </div>

      {/* Cluster Node Health Telemetry */}
      <div className="flex items-center space-x-4">
        <div className="hidden md:flex items-center space-x-3 text-xs font-mono bg-slate-900/60 border border-slate-800/80 px-3.5 py-1.5 rounded-xl">
          {/* Gateway Status */}
          <div className="flex items-center space-x-1.5" title="Data Plane Gateway (:4000)">
            <span className={`w-2 h-2 rounded-full ${health.gateway === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
            <span className="text-slate-400">GW:4000</span>
          </div>

          <span className="text-slate-700">|</span>

          {/* Redis Status */}
          <div className="flex items-center space-x-1.5" title="Redis Atomic Lua Engine (:6379)">
            <span className={`w-2 h-2 rounded-full ${health.redis ? 'bg-indigo-400' : 'bg-rose-500'}`} />
            <span className="text-slate-400">REDIS 7</span>
          </div>

          <span className="text-slate-700">|</span>

          {/* Mock Orders */}
          <div className="flex items-center space-x-1.5" title="Mock Orders Upstream (:5001)">
            <span className={`w-2 h-2 rounded-full ${health.orders === 'online' ? 'bg-cyan-400' : 'bg-slate-600'}`} />
            <span className="text-slate-400">ORDERS:5001</span>
          </div>

          <span className="text-slate-700">|</span>

          {/* Mock Payments */}
          <div className="flex items-center space-x-1.5" title="Mock Payments Upstream (:5002)">
            <span className={`w-2 h-2 rounded-full ${health.payments === 'online' ? 'bg-cyan-400' : 'bg-slate-600'}`} />
            <span className="text-slate-400">PAYMENTS:5002</span>
          </div>
        </div>

        {/* Refresh button */}
        <button
          onClick={checkStatus}
          disabled={loading}
          className="p-2 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-800/60 text-slate-400 hover:text-white transition-colors"
          title="Refresh cluster health"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
        </button>
      </div>
    </header>
  )
}
