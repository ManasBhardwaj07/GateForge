'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  ShieldAlert, 
  Activity, 
  KeyRound, 
  Network, 
  Building2, 
  Zap, 
  FileText,
  Sliders,
  Terminal
} from 'lucide-react'

const navItems = [
  { name: 'Overview', href: '/', icon: Activity },
  { name: 'API Keys', href: '/api-keys', icon: KeyRound },
  { name: 'Routes & Upstreams', href: '/routes', icon: Network },
  { name: 'Tenants & Plans', href: '/organizations', icon: Building2 },
  { name: 'Traffic Playground', href: '/playground', icon: Zap, badge: 'v2.1' },
  { name: 'Audit Logs', href: '/audit', icon: FileText },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 border-r border-slate-800/80 glass-panel flex flex-col h-screen sticky top-0 z-30 select-none">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-emerald-500 p-0.5 shadow-glow-indigo flex items-center justify-center">
            <div className="w-full h-full bg-[#080C14] rounded-[10px] flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-emerald-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg tracking-wider text-white">GATEFORGE</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[11px] font-mono uppercase tracking-widest text-emerald-400/90 font-medium">Data Plane Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-mono tracking-widest uppercase text-slate-500 font-semibold">
          Traffic Control & Observability
        </div>
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-500/15 to-emerald-500/10 text-white border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.15)]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50 hover:border hover:border-slate-700/50'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'}`} />
                <span>{item.name}</span>
              </div>
              {item.badge && (
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-md">
                  {item.badge}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      {/* System Telemetry Indicator Footer */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-900/30">
        <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
          <span className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Gateway :4000</span>
          </span>
          <span className="text-slate-500 text-[11px]">v2.1-FINAL</span>
        </div>
      </div>
    </aside>
  )
}
