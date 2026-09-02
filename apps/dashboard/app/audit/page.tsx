'use client'

import { useState, useEffect } from 'react'
import { fetchAuditEvents, AuditEvent } from '../../lib/api'
import { FileText, ShieldAlert, Clock, User, Filter, RefreshCw } from 'lucide-react'

export default function AuditPage() {
  const [audits, setAudits] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')

  async function loadData() {
    setLoading(true)
    try {
      const data = await fetchAuditEvents()
      setAudits(data)
    } catch (e) {
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredAudits = audits.filter((item) => {
    if (filter === 'ALL') return true
    if (filter === 'KEY') return item.targetType === 'ApiKey'
    if (filter === 'ORG') return item.targetType === 'Organization'
    if (filter === 'ROUTE') return item.targetType === 'Route' || item.targetType === 'Upstream'
    return true
  })

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-3">
            <FileText className="w-6 h-6 text-indigo-400" />
            <span>Administrative Audit Trail</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Immutable log of key creation, revocation, route changes, and policy modifications.
          </p>
        </div>

        <button
          onClick={loadData}
          className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          <span>Refresh Feed</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-2">
        {['ALL', 'KEY', 'ORG', 'ROUTE'].map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
              filter === tab
                ? 'bg-indigo-600 text-white shadow-glow-indigo'
                : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-white'
            }`}
          >
            {tab === 'ALL' ? 'All Events' : tab === 'KEY' ? 'API Keys' : tab === 'ORG' ? 'Organizations' : 'Routes & Upstreams'}
          </button>
        ))}
      </div>

      {/* Audit Log Table */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs font-mono uppercase text-slate-400">
                <th className="pb-3 pl-2">Action</th>
                <th className="pb-3">Target Type</th>
                <th className="pb-3">Target ID</th>
                <th className="pb-3">Actor</th>
                <th className="pb-3">Metadata</th>
                <th className="pb-3 text-right pr-2">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredAudits.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-mono text-xs">
                    No audit records match the current filter.
                  </td>
                </tr>
              ) : (
                filteredAudits.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-4 pl-2 font-mono text-xs">
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
                    <td className="py-4 font-mono text-xs text-white">{item.targetType}</td>
                    <td className="py-4 font-mono text-xs text-slate-400">
                      {item.targetId.length > 16 ? `${item.targetId.slice(0, 16)}...` : item.targetId}
                    </td>
                    <td className="py-4 text-xs font-mono text-slate-300">{item.actor}</td>
                    <td className="py-4 text-xs font-mono text-slate-400">
                      {item.metadata ? (
                        <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                          {JSON.stringify(item.metadata)}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-4 text-xs text-slate-500 font-mono text-right pr-2">
                      {new Date(item.createdAt).toLocaleString()}
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
