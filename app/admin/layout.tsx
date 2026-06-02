'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getToken } from '@/lib/auth'
import Sidebar from '@/components/layout/Sidebar'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login')
    } else {
      setReady(true)
    }
  }, [router])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  // The visualization canvas needs the full viewport — skip the centred
  // max-w wrapper for it. All other admin pages keep the standard layout.
  const isFullBleed = pathname.startsWith('/admin/visualization')

  return (
    <div className="flex h-screen overflow-hidden bg-stone-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {isFullBleed ? (
          children
        ) : (
          <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
        )}
      </main>
    </div>
  )
}
