'use client'

import { useState, useEffect } from 'react'
import { 
  fetchApiKeys, 
  fetchOrganizations, 
  createApiKey, 
  revokeApiKey,
  ApiKey,
  Organization
} from '../../lib/api'
import { 
  KeyRound, 
  Plus, 
  Copy, 
  Check, 
  AlertTriangle, 
  ShieldAlert, 
  Clock, 
  Trash2, 
  Eye, 
  EyeOff,
  CheckCircle2
} from 'lucide-react'

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  
  // Create Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState('')
  const [creating, setCreating] = useState(false)
  const [generatedKey, setGeneratedKey] = useState<ApiKey | null>(null)
  const [copied, setCopied] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    try {
      const [keysData, orgsData] = await Promise.all([
        fetchApiKeys().catch(() => []),
        fetchOrganizations().catch(() => []),
      ])
      setKeys(keysData)
      setOrgs(orgsData)
      if (orgsData.length > 0 && !selectedOrg) {
        setSelectedOrg(orgsData[0].id)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOrg) return
    setCreating(true)
    try {
      const created = await createApiKey(selectedOrg)
      setGeneratedKey(created)
      await loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to create key')
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (identifier: string) => {
    if (!confirm('Are you sure you want to revoke this API key? It will immediately be blocked with 403 Forbidden across all gateways.')) return
    setRevokingId(identifier)
    try {
      await revokeApiKey(identifier)
      await loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to revoke key')
    } finally {
      setRevokingId(null)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-3">
            <KeyRound className="w-6 h-6 text-indigo-400" />
            <span>API Key Management</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Generate, monitor, and instantly revoke SHA-256 hashed multi-tenant credentials.
          </p>
        </div>

        <button
          onClick={() => {
            setGeneratedKey(null)
            setIsModalOpen(true)
          }}
          className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-sm font-semibold shadow-glow-indigo transition-all transform active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Issue New Key</span>
        </button>
      </div>

      {/* API Keys Table */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs font-mono uppercase text-slate-400">
                <th className="pb-3 pl-2">Key Prefix</th>
                <th className="pb-3">Organization</th>
                <th className="pb-3">SHA-256 Hash</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Created</th>
                <th className="pb-3 text-right pr-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {keys.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 font-mono text-xs">
                    No API keys issued yet. Click "Issue New Key" above.
                  </td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-4 pl-2 font-mono text-xs font-bold text-indigo-300">
                      <span className="px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/30">
                        {k.keyPrefix}...
                      </span>
                    </td>
                    <td className="py-4 text-xs font-medium text-white">
                      {k.organizationName || k.organizationSlug || 'Acme Corp'}
                    </td>
                    <td className="py-4 font-mono text-xs text-slate-400">
                      <span className="text-slate-500">{k.keyHash.slice(0, 16)}...{k.keyHash.slice(-8)}</span>
                    </td>
                    <td className="py-4 text-xs">
                      <span className={`px-2.5 py-1 rounded-full font-mono text-[11px] font-bold ${
                        k.status === 'ACTIVE'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}>
                        {k.status}
                      </span>
                    </td>
                    <td className="py-4 text-xs text-slate-500 font-mono">
                      {new Date(k.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-4 text-right pr-2">
                      {k.status === 'ACTIVE' ? (
                        <button
                          onClick={() => handleRevoke(k.keyHash)}
                          disabled={revokingId === k.keyHash}
                          className="px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-medium transition-colors inline-flex items-center space-x-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{revokingId === k.keyHash ? 'Revoking...' : 'Revoke'}</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-600 font-mono">Revoked</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Issue Key Dialog Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="glass-panel max-w-lg w-full p-6 rounded-2xl border border-slate-700 space-y-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <KeyRound className="w-5 h-5 text-indigo-400" />
                <span>Issue Single-View Secret Key</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {!generatedKey ? (
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-slate-400 mb-1.5">
                    Assign Organization / Tenant
                  </label>
                  <select
                    value={selectedOrg}
                    onChange={(e) => setSelectedOrg(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                    required
                  >
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} ({o.slug})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-2 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm hover:bg-slate-800/60"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-glow-indigo"
                  >
                    {creating ? 'Generating...' : 'Generate API Key'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start space-x-3 text-amber-200 text-xs">
                  <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  <div>
                    <span className="font-bold">Save this secret key now!</span>
                    <p className="mt-0.5 text-amber-200/80">
                      For security, GateForge hashes this key with SHA-256 and will never display the raw secret again.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-slate-400 mb-1.5">
                    Your Secret API Key
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedKey.rawKey || ''}
                      className="w-full bg-slate-950 border border-indigo-500/50 rounded-xl px-3.5 py-2.5 font-mono text-sm text-emerald-400 select-all focus:outline-none"
                    />
                    <button
                      onClick={() => copyToClipboard(generatedKey.rawKey || '')}
                      className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm flex items-center space-x-1.5 flex-shrink-0 transition-all active:scale-95"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="pt-3 flex justify-end">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
