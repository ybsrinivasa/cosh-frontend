'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import type { MigrationStatus } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function MigrationPage() {
  const [status, setStatus] = useState<MigrationStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const { data } = await api.get('/admin/migration/status')
      setStatus(data)
    } finally { setLoading(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
  if (!status) return null

  return (
    <div>
      <PageHeader
        title="Migration Status"
        subtitle="Live verification of Cosh 1.0 → 2.0 migration"
        action={
          <div className="flex items-center gap-3">
            <Badge label={status.migration_ready ? 'Ready' : 'Not Ready'} variant={status.migration_ready ? 'active' : 'inactive'} />
            <button onClick={load} className="px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
              Refresh
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PostgreSQL */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
            <h2 className="font-medium text-slate-800">PostgreSQL</h2>
          </div>
          <div className="p-5">
            <div className="flex justify-between text-sm mb-4">
              <span className="text-slate-600">Total Core Data Items</span>
              <span className="font-semibold text-slate-900">{status.postgresql.total_core_data_items.toLocaleString()}</span>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {status.postgresql.cores.map(c => (
                <div key={c.name} className="flex items-center justify-between text-sm py-1 border-b border-slate-50">
                  <span className="text-slate-600 truncate">{c.name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge label={c.type} variant={c.type.toLowerCase()} />
                    <span className="text-slate-800 font-medium w-12 text-right">{c.active_items}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Total Connect Data Items</span>
                <span className="font-semibold text-slate-900">{status.postgresql.total_connect_data_items.toLocaleString()}</span>
              </div>
              <div className="space-y-1 mt-2 max-h-32 overflow-y-auto">
                {status.postgresql.connects.map(c => (
                  <div key={c.name} className="flex items-center justify-between text-sm py-1 border-b border-slate-50">
                    <span className="text-slate-600 truncate">{c.name}</span>
                    <span className="text-slate-800 font-medium">{c.active_items}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Neo4J */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
            <h2 className="font-medium text-slate-800">Neo4J Graph</h2>
          </div>
          <div className="p-5 space-y-3">
            {status.neo4j.error ? (
              <p className="text-red-600 text-sm">{status.neo4j.error}</p>
            ) : (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Total nodes</span>
                  <span className="font-semibold text-slate-900">{status.neo4j.total_nodes?.toLocaleString() ?? '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Active nodes</span>
                  <span className="font-semibold text-slate-900">{status.neo4j.active_nodes?.toLocaleString() ?? '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Total relationships</span>
                  <span className="font-semibold text-slate-900">{status.neo4j.total_relationships?.toLocaleString() ?? '—'}</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-slate-100">
                  <span className="text-slate-600">PostgreSQL ↔ Neo4J match</span>
                  <Badge label={status.neo4j.pg_neo4j_match ? 'Matched ✓' : 'Mismatch ✗'} variant={status.neo4j.pg_neo4j_match ? 'active' : 'failed'} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Translation coverage */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden lg:col-span-2">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h2 className="font-medium text-slate-800">Translation Coverage</h2>
            <span className="text-sm text-slate-500">{status.translations.text_core_items.toLocaleString()} TEXT items</span>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {status.translations.coverage_by_language.map(l => (
                <div key={l.language_code} className="bg-slate-50 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-mono font-medium text-slate-600">{l.language_code}</span>
                    <span className="text-xs font-semibold text-slate-800">{l.coverage_pct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-1">
                    <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${l.coverage_pct}%` }} />
                  </div>
                  <p className="text-xs text-slate-400">{l.translated.toLocaleString()} translated · {l.expert_validated} expert</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Similarity */}
        {Object.keys(status.similarity).length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
              <h2 className="font-medium text-slate-800">Similarity Review</h2>
            </div>
            <div className="p-5 space-y-2">
              {Object.entries(status.similarity).map(([s, n]) => (
                <div key={s} className="flex justify-between text-sm">
                  <Badge label={s} variant={s.toLowerCase()} />
                  <span className="font-medium text-slate-800">{(n as number).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
