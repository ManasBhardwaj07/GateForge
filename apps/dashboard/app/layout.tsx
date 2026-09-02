import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '../components/Sidebar'
import { Header } from '../components/Header'

export const metadata: Metadata = {
  title: 'GateForge — API Traffic Control Platform',
  description: 'Programmable Multi-Tenant API Traffic Control, Atomic Rate Limiting & Decision Telemetry',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#080C14] text-slate-100 antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
        <div className="flex min-h-screen bg-cyber-grid bg-radial-vignette">
          {/* Persistent Sidebar */}
          <Sidebar />

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-w-0">
            <Header />
            <main className="flex-1 p-8 max-w-7xl w-full mx-auto space-y-8">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
