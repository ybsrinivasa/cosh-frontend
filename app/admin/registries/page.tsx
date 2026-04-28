'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import type { Language, RelationshipType, Product } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import AccessDenied from '@/components/ui/AccessDenied'
import { getStoredUser, isAdmin } from '@/lib/auth'

export default function RegistriesPage() {
  const [languages, setLanguages] = useState<Language[]>([])
  const [relTypes, setRelTypes] = useState<RelationshipType[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'languages' | 'reltypes' | 'products'>('languages')

  useEffect(() => {
    if (!isAdmin(getStoredUser())) { setLoading(false); return }
    load()
  }, [])

  async function load() {
    try {
      const [l, r, p] = await Promise.all([
        api.get('/admin/registries/languages'),
        api.get('/admin/registries/relationship-types'),
        api.get('/admin/registries/products'),
      ])
      setLanguages(l.data); setRelTypes(r.data); setProducts(p.data)
    } finally { setLoading(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
  if (!isAdmin(getStoredUser())) return <AccessDenied />

  return (
    <div>
      <PageHeader title="Registries" subtitle="Languages, relationship types, and products" />

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {(['languages', 'reltypes', 'products'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-teal-600 text-teal-600' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'languages' ? `Languages (${languages.length})` : t === 'reltypes' ? `Rel Types (${relTypes.length})` : `Products (${products.length})`}
          </button>
        ))}
      </div>

      {tab === 'languages' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {languages.map(l => (
            <div key={l.id} className="flex items-center justify-between px-5 py-3 border-b border-slate-100 last:border-0">
              <div className="flex items-center gap-4">
                <span className="font-mono text-sm text-slate-500 w-8">{l.language_code}</span>
                <div>
                  <p className="font-medium text-slate-800 text-sm">{l.language_name_en}</p>
                  <p className="text-slate-400 text-xs">{l.language_name_native} · {l.script}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {l.direction === 'RTL' && <Badge label="RTL" />}
                <Badge label={l.status} variant={l.status} />
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'reltypes' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {relTypes.map(rt => (
            <div key={rt.id} className="px-5 py-3 border-b border-slate-100 last:border-0">
              <div className="flex items-center gap-3">
                <code className="text-sm font-mono bg-slate-100 px-2 py-0.5 rounded text-teal-700">{rt.label}</code>
                <span className="text-sm text-slate-700">{rt.display_name}</span>
              </div>
              {rt.example && <p className="text-xs text-slate-400 mt-1 ml-0">e.g. {rt.example}</p>}
            </div>
          ))}
        </div>
      )}

      {tab === 'products' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {products.map(p => (
            <div key={p.id} className="px-5 py-4 border-b border-slate-100 last:border-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-800">{p.display_name}</p>
                  <p className="text-sm text-slate-400 font-mono">{p.name}</p>
                  {p.sync_endpoint_url && (
                    <p className="text-xs text-slate-400 mt-0.5">Endpoint: {p.sync_endpoint_url}</p>
                  )}
                </div>
                <Badge label={p.status} variant={p.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
