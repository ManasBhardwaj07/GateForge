'use client'

import { useState, useEffect } from 'react'
import { 
  fetchOrganizations, 
  fetchPlans, 
  createOrganization, 
  createPlan, 
  Organization, 
  Plan 
} from '../../lib/api'
import { 
  Building2, 
  Plus, 
  ShieldCheck, 
  Clock, 
  Layers, 
  TrendingUp, 
  Activity 
} from 'lucide-react'

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)

  // Modals
  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [orgPlanId, setOrgPlanId] = useState('')
  const [creatingOrg, setCreatingOrg] = useState(false)

  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false)
  const [planName, setPlanName] = useState('')
  const [rateLimit, setRateLimit] = useState('100')
  const [quota, setQuota] = useState('50000')
  const [creatingPlan, setCreatingPlan] = useState(false)

  async function loadData() {
    setLoading(true)
    try {
      const [orgsData, plansData] = await Promise.all([
        fetchOrganizations().catch(() => []),
        fetchPlans().catch(() => []),
      ])
      setOrgs(orgsData)
      setPlans(plansData)
      if (plansData.length > 0 && !orgPlanId) {
        setOrgPlanId(plansData[0].id)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orgPlanId) return
    setCreatingOrg(true)
    try {
      await createOrganization({
        name: orgName,
        slug: orgSlug,
        planId: orgPlanId,
      })
      setIsOrgModalOpen(false)
      setOrgName('')
      setOrgSlug('')
      await loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to create organization')
    } finally {
      setCreatingOrg(false)
    }
  }

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreatingPlan(true)
    try {
      await createPlan({
        name: planName,
        rateLimitPerMinute: Number(rateLimit),
        quotaPerMonth: Number(quota),
      })
      setIsPlanModalOpen(false)
      setPlanName('')
      await loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to create plan')
    } finally {
      setCreatingPlan(false)
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-3">
            <Building2 className="w-6 h-6 text-emerald-400" />
            <span>Multi-Tenant Organizations & Plans</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage tenant boundaries, rate limit policies, and monthly request quotas.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsPlanModalOpen(true)}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition-all"
          >
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>New Plan</span>
          </button>

          <button
            onClick={() => setIsOrgModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-600 hover:to-indigo-700 text-white text-sm font-semibold shadow-glow-emerald transition-all transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Add Tenant Org</span>
          </button>
        </div>
      </div>

      {/* Plans Matrix Cards */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-white flex items-center space-x-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <span>Active Rate-Limit & Quota Tiers</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((p) => (
            <div key={p.id} className="glass-card specular-edge p-6 rounded-2xl relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-white">{p.name}</span>
                <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                  TIER
                </span>
              </div>

              <div className="mt-5 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/50 border border-slate-800">
                  <span className="text-slate-400">Rate Limit:</span>
                  <span className="text-emerald-400 font-bold">{p.rateLimitPerMinute} req/min</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/50 border border-slate-800">
                  <span className="text-slate-400">Monthly Quota:</span>
                  <span className="text-cyan-400 font-bold">
                    {p.quotaPerMonth === -1 ? 'Unlimited' : `${p.quotaPerMonth.toLocaleString()} reqs`}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Organizations Table */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white flex items-center space-x-2">
            <Building2 className="w-4 h-4 text-emerald-400" />
            <span>Registered Tenant Organizations</span>
          </h2>
          <span className="text-xs font-mono text-slate-500">{orgs.length} Tenants Active</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs font-mono uppercase text-slate-400">
                <th className="pb-3 pl-2">Organization</th>
                <th className="pb-3">Slug</th>
                <th className="pb-3">Assigned Plan</th>
                <th className="pb-3">Rate Policy</th>
                <th className="pb-3 text-right pr-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {orgs.map((o) => (
                <tr key={o.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-4 pl-2 font-medium text-white">{o.name}</td>
                  <td className="py-4 font-mono text-xs text-indigo-300">
                    <span className="px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/30">
                      {o.slug}
                    </span>
                  </td>
                  <td className="py-4 text-xs font-bold text-white">
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      {o.planName || 'Pro'}
                    </span>
                  </td>
                  <td className="py-4 text-xs font-mono text-slate-400">
                    {o.rateLimitPerMinute || 100} req/min • {o.quotaPerMonth?.toLocaleString() || 50000}/mo
                  </td>
                  <td className="py-4 text-xs text-slate-500 font-mono text-right pr-2">
                    {new Date(o.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Org Modal */}
      {isOrgModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="glass-panel max-w-md w-full p-6 rounded-2xl border border-slate-700 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-emerald-400" />
                <span>Register Tenant Organization</span>
              </h3>
              <button onClick={() => setIsOrgModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateOrg} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Organization Name</label>
                <input
                  type="text"
                  placeholder="e.g. Stark Industries"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Unique Slug</label>
                <input
                  type="text"
                  placeholder="stark-corp"
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 font-mono text-sm text-white focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Assigned Plan</label>
                <select
                  value={orgPlanId}
                  onChange={(e) => setOrgPlanId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  required
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.rateLimitPerMinute} req/min)
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsOrgModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingOrg}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
                >
                  {creatingOrg ? 'Creating...' : 'Create Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Plan Modal */}
      {isPlanModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="glass-panel max-w-md w-full p-6 rounded-2xl border border-slate-700 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                <span>Create Policy Plan Tier</span>
              </h3>
              <button onClick={() => setIsPlanModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreatePlan} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Plan Name</label>
                <input
                  type="text"
                  placeholder="e.g. Ultra"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Rate Limit (Requests / Minute)</label>
                <input
                  type="number"
                  value={rateLimit}
                  onChange={(e) => setRateLimit(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 font-mono text-sm text-white focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-slate-400 mb-1">Monthly Quota (-1 for unlimited)</label>
                <input
                  type="number"
                  value={quota}
                  onChange={(e) => setQuota(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 font-mono text-sm text-white focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsPlanModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingPlan}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
                >
                  {creatingPlan ? 'Creating...' : 'Save Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
