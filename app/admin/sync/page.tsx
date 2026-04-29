'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { getStoredUser, isAdmin } from '@/lib/auth'
import type { ProductSyncState, ChangeTable, SyncHistory } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import AccessDenied from '@/components/ui/AccessDenied'

export default function SyncPage() {
  const [products, setProducts] = useState<ProductSyncState[]>([])
  const [selected, setSelected] = useState<string>('')
  const [changeTable, setChangeTable] = useState<ChangeTable | null>(null)
  const [history, setHistory] = useState<SyncHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingChanges, setLoadingChanges] = useState(false)
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set())
  const [syncMode, setSyncMode] = useState<'FULL' | 'INCREMENTAL'>('INCREMENTAL')
  const [dispatching, setDispatching] = useState(false)
  const [dispatchResult, setDispatchResult] = useState('')

  useEffect(() => {
    if (!isAdmin(getStoredUser())) { setLoading(false); return }
    loadProducts()
  }, [])

  async function loadProducts() {
    try {
      const { data } = await api.get('/sync/products')
      setProducts(data)
      if (data.length === 1) selectProduct(data[0].product_id)
    } finally { setLoading(false) }
  }

  async function selectProduct(productId: string) {
    setSelected(productId); setSelectedEntities(new Set()); setDispatchResult('')
    setLoadingChanges(true)
    try {
      const [ch, hi] = await Promise.all([
        api.get(`/sync/${productId}/changes`),
        api.get(`/sync/${productId}/history`),
      ])
      setChangeTable(ch.data); setHistory(hi.data)
    } finally { setLoadingChanges(false) }
  }

  function toggleEntity(id: string) {
    const next = new Set(selectedEntities)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedEntities(next)
  }

  async function dispatch() {
    if (!selected) return
    setDispatching(true); setDispatchResult('')
    try {
      const sendAll = syncMode === 'FULL'
      const { data } = await api.post(`/sync/${selected}/dispatch`, {
        sync_mode: syncMode,
        entity_ids: sendAll ? [] : Array.from(selectedEntities),
        send_all: sendAll,
      })
      setDispatchResult(`✓ Dispatched — sync ID: ${data.sync_id} | ${data.message}`)
      if (data.auto_added_dependencies?.length) {
        setDispatchResult(prev => prev + ` | Auto-added: ${data.auto_added_dependencies.join(', ')}`)
      }
      selectProduct(selected)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setDispatchResult(`✗ ${err.response?.data?.detail || 'Dispatch failed'}`)
    } finally { setDispatching(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
  if (!isAdmin(getStoredUser())) return <AccessDenied message="Sync Management is available to Admins only." />

  return (
    <div>
      <PageHeader title="Sync Management" subtitle="Dispatch knowledge data to connected products" />

      {/* Product selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {products.map(p => (
          <button key={p.product_id} onClick={() => selectProduct(p.product_id)}
            className={`text-left p-4 rounded-xl border transition-colors ${selected === p.product_id ? 'border-teal-500 bg-teal-50' : 'bg-white border-slate-200 hover:border-teal-300'}`}>
            <p className="font-medium text-slate-800">{p.product_name}</p>
            <p className="text-sm text-slate-500 mt-1">
              {p.pending_changes} pending change{p.pending_changes !== 1 ? 's' : ''}
            </p>
            {p.last_successful_sync_at && (
              <p className="text-xs text-slate-400 mt-0.5">
                Last sync: {new Date(p.last_successful_sync_at).toLocaleDateString()}
              </p>
            )}
          </button>
        ))}
      </div>

      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Change table */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-medium text-slate-800">Pending Changes</h2>
                {changeTable && (
                  <button onClick={() => {
                    const all = new Set(changeTable.entities.map(e => e.entity_id))
                    setSelectedEntities(selectedEntities.size === all.size ? new Set() : all)
                  }} className="text-sm text-teal-600 hover:underline">
                    {selectedEntities.size === (changeTable?.entities.length || 0) ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>
              {loadingChanges ? (
                <div className="flex justify-center py-8"><LoadingSpinner /></div>
              ) : !changeTable || changeTable.entities.length === 0 ? (
                <p className="text-center py-8 text-slate-400 text-sm">No pending changes</p>
              ) : (
                changeTable.entities.map(entity => (
                  <div key={entity.entity_id} onClick={() => toggleEntity(entity.entity_id)}
                    className={`flex items-center justify-between px-5 py-3 border-b border-slate-100 last:border-0 cursor-pointer transition-colors ${selectedEntities.has(entity.entity_id) ? 'bg-teal-50' : 'hover:bg-slate-50'}`}>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" readOnly checked={selectedEntities.has(entity.entity_id)}
                        className="rounded border-slate-300 text-teal-600" />
                      <div>
                        <p className="text-sm font-medium text-slate-800">{entity.entity_name}</p>
                        <div className="flex gap-1 mt-0.5">
                          <Badge label={entity.entity_category} />
                          {entity.change_types.map(ct => <Badge key={ct} label={ct} />)}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400">{entity.item_count} item{entity.item_count !== 1 ? 's' : ''}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Dispatch panel */}
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="font-medium text-slate-800 mb-3">Dispatch</h2>
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-600 mb-1">Sync mode</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['INCREMENTAL', 'FULL'] as const).map(mode => (
                    <button key={mode} onClick={() => setSyncMode(mode)}
                      className={`py-2 text-sm rounded-lg border transition-colors ${syncMode === mode ? 'border-teal-500 bg-teal-50 text-teal-700 font-medium' : 'border-slate-200 text-slate-600 hover:border-teal-300'}`}>
                      {mode === 'FULL' ? 'Full' : 'Incremental'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  {syncMode === 'FULL' ? 'Sends all active items — use for first sync or cache reset' : 'Sends only changed items since last sync'}
                </p>
              </div>
              {syncMode === 'INCREMENTAL' && (
                <p className="text-xs text-slate-500 mb-3">
                  {selectedEntities.size} of {changeTable?.entities.length || 0} entities selected
                </p>
              )}
              <button onClick={dispatch}
                disabled={dispatching || (syncMode === 'INCREMENTAL' && selectedEntities.size === 0)}
                className="w-full py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {dispatching && <LoadingSpinner size="sm" />}
                {dispatching ? 'Dispatching…' : 'Dispatch Sync'}
              </button>
              {dispatchResult && (
                <p className={`mt-2 text-xs ${dispatchResult.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>
                  {dispatchResult}
                </p>
              )}
            </div>

            {/* History */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200">
                <h2 className="font-medium text-slate-800 text-sm">Sync History</h2>
              </div>
              {history.length === 0 ? (
                <p className="text-center py-4 text-slate-400 text-xs">No syncs yet</p>
              ) : (
                history.slice(0, 8).map(h => (
                  <div key={h.id} className="px-4 py-2.5 border-b border-slate-100 last:border-0">
                    <div className="flex items-center justify-between">
                      <Badge label={h.status} variant={h.status.toLowerCase()} />
                      <span className="text-xs text-slate-400">{h.sync_mode}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{new Date(h.initiated_at).toLocaleString()}</p>
                    {h.total_items && <p className="text-xs text-slate-400">{h.total_items} items</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
