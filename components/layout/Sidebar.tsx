'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getStoredUser, logout, isAdmin, hasRole } from '@/lib/auth'
import { useEffect, useState } from 'react'
import type { User } from '@/types'

const stockerNav = [
  { href: '/admin/folders',  label: 'Folders & Cores', icon: '📁' },
  { href: '/admin/connects', label: 'Connects',         icon: '🔗' },
]
const reviewerNav = [
  { href: '/admin/similarity', label: 'Similarity Review', icon: '🔍' },
]
const designerNav = [
  { href: '/admin/migration', label: 'Migration Status', icon: '📊' },
]
const adminOnlyNav = [
  { href: '/admin/sync', label: 'Sync', icon: '🔄' },
]
const adminNav = [
  { href: '/admin/users',      label: 'Users',      icon: '👥' },
  { href: '/admin/registries', label: 'Registries', icon: '📋' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => { setUser(getStoredUser()) }, [])

  const linkClass = (href: string) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
      pathname.startsWith(href)
        ? 'bg-green-600 text-white font-medium shadow-sm shadow-green-900/40'
        : 'text-green-200/70 hover:bg-white/8 hover:text-green-100'
    }`

  return (
    <aside
      className="w-56 flex-shrink-0 flex flex-col h-screen sticky top-0"
      style={{ background: 'linear-gradient(180deg, #071e12 0%, #0a2619 60%, #071e12 100%)' }}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b border-green-900/60">
        <div className="flex items-center gap-2.5">
          <svg width="22" height="22" viewBox="0 0 40 40" fill="none" className="flex-shrink-0">
            <circle cx="20" cy="20" r="4.5" fill="#4ade80" />
            <circle cx="8"  cy="12" r="2.5" fill="#4ade80" opacity="0.65" />
            <circle cx="32" cy="12" r="2.5" fill="#4ade80" opacity="0.65" />
            <circle cx="8"  cy="28" r="2.5" fill="#4ade80" opacity="0.65" />
            <circle cx="32" cy="28" r="2.5" fill="#4ade80" opacity="0.65" />
            <line x1="20" y1="20" x2="8"  y2="12" stroke="#4ade80" strokeWidth="1.2" opacity="0.5" />
            <line x1="20" y1="20" x2="32" y2="12" stroke="#4ade80" strokeWidth="1.2" opacity="0.5" />
            <line x1="20" y1="20" x2="8"  y2="28" stroke="#4ade80" strokeWidth="1.2" opacity="0.5" />
            <line x1="20" y1="20" x2="32" y2="28" stroke="#4ade80" strokeWidth="1.2" opacity="0.5" />
          </svg>
          <div>
            <span className="text-white font-bold text-base tracking-tight leading-none">Cosh 2.0</span>
            <span className="block text-green-500 text-[10px] mt-0.5 tracking-wide">Knowledge Graph</span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {stockerNav.map(item => (
          <Link key={item.href} href={item.href} className={linkClass(item.href)}>
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}

        {hasRole(user, 'REVIEWER', 'DESIGNER', 'ADMIN') && reviewerNav.map(item => (
          <Link key={item.href} href={item.href} className={linkClass(item.href)}>
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}

        {hasRole(user, 'DESIGNER', 'ADMIN') && designerNav.map(item => (
          <Link key={item.href} href={item.href} className={linkClass(item.href)}>
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}

        {isAdmin(user) && adminOnlyNav.map(item => (
          <Link key={item.href} href={item.href} className={linkClass(item.href)}>
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}

        {isAdmin(user) && (
          <>
            <div className="pt-5 pb-1.5 px-3">
              <span className="text-[10px] font-semibold text-green-700 uppercase tracking-widest">Admin</span>
            </div>
            {adminNav.map(item => (
              <Link key={item.href} href={item.href} className={linkClass(item.href)}>
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-green-900/60">
        {user && (
          <div className="mb-3">
            <p className="text-green-100 text-sm font-medium truncate">{user.name || user.email}</p>
            <p className="text-green-600 text-xs truncate">{user.email}</p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {user.roles.filter(r => r.status === 'ACTIVE').map(r => (
                <span key={r.role}
                  className="text-[10px] bg-green-900/60 text-green-400 px-1.5 py-0.5 rounded border border-green-800/50">
                  {r.role}
                </span>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full text-left text-xs text-green-600 hover:text-green-300 transition-colors"
        >
          Sign out →
        </button>
      </div>
    </aside>
  )
}
