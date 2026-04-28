'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getStoredUser, logout, isAdmin, hasRole } from '@/lib/auth'
import { useEffect, useState } from 'react'
import type { User } from '@/types'

// Visible to all authenticated roles
const stockerNav = [
  { href: '/admin/folders',  label: 'Folders & Cores', icon: '📁' },
  { href: '/admin/connects', label: 'Connects',         icon: '🔗' },
]

// Visible to Reviewer, Designer, Admin
const reviewerNav = [
  { href: '/admin/similarity', label: 'Similarity Review', icon: '🔍' },
]

// Visible to Designer and Admin only
const designerNav = [
  { href: '/admin/sync',      label: 'Sync',             icon: '🔄' },
  { href: '/admin/migration', label: 'Migration Status', icon: '📊' },
]

// Visible to Admin only
const adminNav = [
  { href: '/admin/users',      label: 'Users',      icon: '👥' },
  { href: '/admin/registries', label: 'Registries', icon: '📋' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => { setUser(getStoredUser()) }, [])

  const linkClass = (href: string) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
      pathname.startsWith(href)
        ? 'bg-teal-600 text-white font-medium'
        : 'text-slate-300 hover:bg-slate-700 hover:text-white'
    }`

  return (
    <aside className="w-56 flex-shrink-0 bg-slate-800 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-700">
        <span className="text-white font-bold text-lg tracking-tight">Cosh 2.0</span>
        <span className="block text-slate-400 text-xs mt-0.5">Knowledge Management</span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {/* All roles */}
        {stockerNav.map(item => (
          <Link key={item.href} href={item.href} className={linkClass(item.href)}>
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}

        {/* Reviewer, Designer, Admin */}
        {hasRole(user, 'REVIEWER', 'DESIGNER', 'ADMIN') && reviewerNav.map(item => (
          <Link key={item.href} href={item.href} className={linkClass(item.href)}>
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}

        {/* Designer and Admin */}
        {hasRole(user, 'DESIGNER', 'ADMIN') && designerNav.map(item => (
          <Link key={item.href} href={item.href} className={linkClass(item.href)}>
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}

        {isAdmin(user) && (
          <>
            <div className="pt-4 pb-1 px-3">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Admin</span>
            </div>
            {adminNav.map((item) => (
              <Link key={item.href} href={item.href} className={linkClass(item.href)}>
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-slate-700">
        {user && (
          <div className="mb-3">
            <p className="text-white text-sm font-medium truncate">{user.name || user.email}</p>
            <p className="text-slate-400 text-xs truncate">{user.email}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {user.roles.filter(r => r.status === 'ACTIVE').map(r => (
                <span key={r.role} className="text-xs bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                  {r.role}
                </span>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full text-left text-sm text-slate-400 hover:text-white transition-colors"
        >
          Sign out →
        </button>
      </div>
    </aside>
  )
}
