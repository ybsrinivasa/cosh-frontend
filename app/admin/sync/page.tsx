'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { getStoredUser, isAdmin } from '@/lib/auth'
import type { ProductSyncState, ChangeTable, SyncHistory } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import AccessDenied from '@/components/ui/AccessDenied'

interface TaggedEntity {
  entity_id: string
  entity_kind: 'CORE' | 'CONNECT'
  entity_name: string
  entity_type_label: string | null
  core_type?: string
}

export default function SyncPage() {
  const [products, setProducts] = useState<ProductSyncState[]>([])
  const [selected, setSelected] = useState<string>('')
  const [changeTable, setChangeTable] = useState<ChangeTable | null>(null)
  const [taggedEntities, setTaggedEntities] = useState<TaggedEntity[]>([])
  const [history, setHistory] = useState<SyncHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingChanges, setLoadingChanges] = useState(false)
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set())
  const [selectedFullEntities, setSelectedFullEntities] = useState<Set<string>>(new Set())
  const [syncMode, setSyncMode] = useState<'FULL' | 'INCREMENTAL'>('INCREMENTAL')
  const [dispatching, setDispatching] = useState(false)
  const [dispatchResult, setDispatchResult] = useState('')

  // Sync History row expansion — click a row to see product_response and counts
  type HistoryDetail = {
    id: string; status: string; sync_mode: string;
    initiated_at: string; completed_at: string | null;
    total_items: number | null; items_inserted: number | null;
    items_updated: number | null; items_failed: number | null;
    product_response: unknown
  }
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  const [historyDetails, setHistoryDetails] = useState<Record<string, HistoryDetail>>({})
  const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null)

  async function toggleHistoryRow(productId: string, syncId: string) {
    if (expandedHistoryId === syncId) { setExpandedHistoryId(null); return }
    setExpandedHistoryId(syncId)
    if (historyDetails[syncId]) return
    setLoadingHistoryId(syncId)
    try {
      const { data } = await api.get(`/sync/${productId}/history/${syncId}`)
      setHistoryDetails(prev => ({ ...prev, [syncId]: data }))
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setHistoryDetails(prev => ({ ...prev, [syncId]: { id: syncId, status: 'ERROR', sync_mode: '', initiated_at: '', completed_at: null, total_items: null, items_inserted: null, items_updated: null, items_failed: null, product_response: { error: err.response?.data?.detail || 'Failed to load detail' } } }))
    } finally { setLoadingHistoryId(null) }
  }

  // True while any sync for the selected product is still in flight.
  // Drives both the auto-poll below and the Dispatch button's guard.
  const hasInFlight = history.some(h => h.status === 'DISPATCHED')

  useEffect(() => {
    if (!isAdmin(getStoredUser())) { setLoading(false); return }
    loadProducts()
  }, [])

  // While a sync row is DISPATCHED, the Celery task hasn't committed yet:
  // pending-changes counts and entity-selector contents are stale until it
  // does. Poll history (cheap) + products + change table so the UI catches up
  // on its own. Stops the moment no DISPATCHED rows remain.
  useEffect(() => {
    if (!selected || !hasInFlight) return
    let cancelled = false
    const tick = async () => {
      try {
        const [hi, pr] = await Promise.all([
          api.get(`/sync/${selected}/history`),
          api.get('/sync/products'),
        ])
        if (cancelled) return
        setHistory(hi.data)
        setProducts(pr.data)
        const stillInFlight = hi.data.some((h: SyncHistory) => h.status === 'DISPATCHED')
        if (!stillInFlight) {
          const ch = await api.get(`/sync/${selected}/changes`)
          if (!cancelled) setChangeTable(ch.data)
        }
      } catch { /* keep polling on transient errors */ }
    }
    const interval = setInterval(tick, 3000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [selected, hasInFlight])

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
      const [ch, hi, te] = await Promise.all([
        api.get(`/sync/${productId}/changes`),
        api.get(`/sync/${productId}/history`),
        api.get(`/sync/${productId}/tagged-entities`).catch(() => ({ data: [] })),
      ])
      setChangeTable(ch.data); setHistory(hi.data); setTaggedEntities(te.data)
      // FULL mode default = everything tagged is selected (mirrors old behaviour)
      setSelectedFullEntities(new Set(te.data.map((e: TaggedEntity) => e.entity_id)))
    } finally { setLoadingChanges(false) }
  }

  function toggleEntity(id: string) {
    const next = new Set(selectedEntities)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedEntities(next)
  }

  function toggleFullEntity(id: string) {
    const next = new Set(selectedFullEntities)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedFullEntities(next)
  }

  async function dispatch() {
    if (!selected) return
    setDispatching(true); setDispatchResult('')
    try {
      // FULL: if user picked the full set, send_all=true (preserves tombstoning intent
      // for the whole product universe). If user picked a subset, send entity_ids
      // explicitly so other tagged entities aren't touched.
      const fullSendAll = syncMode === 'FULL' && selectedFullEntities.size === taggedEntities.length
      const { data } = await api.post(`/sync/${selected}/dispatch`, {
        sync_mode: syncMode,
        entity_ids: fullSendAll
          ? []
          : Array.from(syncMode === 'FULL' ? selectedFullEntities : selectedEntities),
        send_all: fullSendAll,
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
            className={`text-left p-4 rounded-xl border transition-colors ${selected === p.product_id ? 'border-green-500 bg-green-50' : 'bg-white border-slate-200 hover:border-green-300'}`}>
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
          {/* Centre panel — Pending Changes (Incremental) or Tagged Entities (Full) */}
          <div className="lg:col-span-2">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-medium text-slate-800">
                  {syncMode === 'FULL' ? 'Tagged Entities — pick what to send' : 'Pending Changes'}
                </h2>
                {syncMode === 'INCREMENTAL' && changeTable && (
                  <button onClick={() => {
                    const all = new Set(changeTable.entities.map(e => e.entity_id))
                    setSelectedEntities(selectedEntities.size === all.size ? new Set() : all)
                  }} className="text-sm text-green-600 hover:underline">
                    {selectedEntities.size === (changeTable?.entities.length || 0) ? 'Deselect all' : 'Select all'}
                  </button>
                )}
                {syncMode === 'FULL' && taggedEntities.length > 0 && (
                  <button onClick={() => {
                    const all = new Set(taggedEntities.map(e => e.entity_id))
                    setSelectedFullEntities(selectedFullEntities.size === all.size ? new Set() : all)
                  }} className="text-sm text-green-600 hover:underline">
                    {selectedFullEntities.size === taggedEntities.length ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>

              {loadingChanges ? (
                <div className="flex justify-center py-8"><LoadingSpinner /></div>
              ) : syncMode === 'INCREMENTAL' ? (
                !changeTable || changeTable.entities.length === 0 ? (
                  <p className="text-center py-8 text-slate-400 text-sm">No pending changes</p>
                ) : (
                  changeTable.entities.map(entity => (
                    <div key={entity.entity_id} onClick={() => toggleEntity(entity.entity_id)}
                      className={`flex items-center justify-between px-5 py-3 border-b border-slate-100 last:border-0 cursor-pointer transition-colors ${selectedEntities.has(entity.entity_id) ? 'bg-green-50' : 'hover:bg-slate-50'}`}>
                      <div className="flex items-center gap-3">
                        <input type="checkbox" readOnly checked={selectedEntities.has(entity.entity_id)}
                          className="rounded border-slate-300 text-green-600" />
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
                )
              ) : (
                taggedEntities.length === 0 ? (
                  <p className="text-center py-8 text-slate-400 text-sm">No entities tagged to this product yet — tag a Core or Connect first.</p>
                ) : (
                  taggedEntities.map(entity => (
                    <div key={entity.entity_id} onClick={() => toggleFullEntity(entity.entity_id)}
                      className={`flex items-center justify-between px-5 py-3 border-b border-slate-100 last:border-0 cursor-pointer transition-colors ${selectedFullEntities.has(entity.entity_id) ? 'bg-green-50' : 'hover:bg-slate-50'}`}>
                      <div className="flex items-center gap-3">
                        <input type="checkbox" readOnly checked={selectedFullEntities.has(entity.entity_id)}
                          className="rounded border-slate-300 text-green-600" />
                        <div>
                          <p className="text-sm font-medium text-slate-800">{entity.entity_name}</p>
                          <div className="flex gap-1 mt-0.5">
                            <Badge label={entity.entity_kind} />
                            {entity.entity_type_label && (
                              <span className="text-xs font-mono text-slate-500 bg-slate-50 border border-slate-200 px-1.5 rounded">
                                {entity.entity_type_label}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )
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
                      className={`py-2 text-sm rounded-lg border transition-colors ${syncMode === mode ? 'border-green-500 bg-green-50 text-green-700 font-medium' : 'border-slate-200 text-slate-600 hover:border-green-300'}`}>
                      {mode === 'FULL' ? 'Full' : 'Incremental'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  {syncMode === 'FULL'
                    ? 'Sends all active items of the selected entities. Tick everything for a true full reset, or pick a subset to surgically push only those entities.'
                    : 'Sends only changed items since last sync'}
                </p>
              </div>
              {syncMode === 'INCREMENTAL' ? (
                <p className="text-xs text-slate-500 mb-3">
                  {selectedEntities.size} of {changeTable?.entities.length || 0} entities selected
                </p>
              ) : (
                <p className="text-xs text-slate-500 mb-3">
                  {selectedFullEntities.size} of {taggedEntities.length} tagged entities selected
                </p>
              )}
              <button onClick={dispatch}
                disabled={
                  dispatching ||
                  hasInFlight ||
                  (syncMode === 'INCREMENTAL' && selectedEntities.size === 0) ||
                  (syncMode === 'FULL' && selectedFullEntities.size === 0)
                }
                className="w-full py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {dispatching && <LoadingSpinner size="sm" />}
                {dispatching ? 'Dispatching…' : hasInFlight ? 'Sync in flight…' : 'Dispatch Sync'}
              </button>
              {hasInFlight && (
                <p className="mt-2 text-xs text-amber-600">
                  A sync is still running for this product. Counts above will refresh automatically when it completes.
                </p>
              )}
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
                history.slice(0, 8).map(h => {
                  const isExpanded = expandedHistoryId === h.id
                  const detail = historyDetails[h.id]
                  return (
                    <div key={h.id} className="border-b border-slate-100 last:border-0">
                      <button
                        type="button"
                        onClick={() => toggleHistoryRow(selected, h.id)}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge label={h.status} variant={h.status.toLowerCase()} />
                            <span className="text-xs text-slate-300">{isExpanded ? '▾' : '▸'}</span>
                          </div>
                          <span className="text-xs text-slate-400">{h.sync_mode}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{new Date(h.initiated_at).toLocaleString()}</p>
                        {h.total_items && <p className="text-xs text-slate-400">{h.total_items} items</p>}
                      </button>
                      {isExpanded && (
                        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 text-xs">
                          {loadingHistoryId === h.id || !detail ? (
                            <p className="text-slate-400">Loading…</p>
                          ) : (
                            <>
                              <div className="grid grid-cols-2 gap-y-1 mb-2 text-slate-600">
                                {detail.completed_at && (
                                  <>
                                    <span className="text-slate-400">Completed</span>
                                    <span>{new Date(detail.completed_at).toLocaleString()}</span>
                                  </>
                                )}
                                {detail.total_items != null && (
                                  <>
                                    <span className="text-slate-400">Total items</span>
                                    <span>{detail.total_items}</span>
                                  </>
                                )}
                                {detail.items_inserted != null && (
                                  <>
                                    <span className="text-slate-400">Inserted</span>
                                    <span>{detail.items_inserted}</span>
                                  </>
                                )}
                                {detail.items_updated != null && (
                                  <>
                                    <span className="text-slate-400">Updated</span>
                                    <span>{detail.items_updated}</span>
                                  </>
                                )}
                                {detail.items_failed != null && detail.items_failed > 0 && (
                                  <>
                                    <span className="text-slate-400">Failed</span>
                                    <span className="text-red-600 font-medium">{detail.items_failed}</span>
                                  </>
                                )}
                              </div>
                              <p className="text-slate-400 font-medium mb-1">Response from RootsTalk</p>
                              <pre className="bg-white border border-slate-200 rounded p-2 text-[10px] text-slate-700 max-h-80 overflow-auto whitespace-pre-wrap break-all">
                                {detail.product_response
                                  ? JSON.stringify(detail.product_response, null, 2)
                                  : '(no response captured)'}
                              </pre>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
