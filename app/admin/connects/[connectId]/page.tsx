'use client'
import { useState, useEffect, use, useCallback, useRef } from 'react'
import Link from 'next/link'
import { getStoredUser, hasRole } from '@/lib/auth'
import api from '@/lib/api'
import type { Connect, SchemaPosition, ConnectDataItem, Core, RelationshipType } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Combobox, { ComboboxItem } from '@/components/ui/Combobox'

interface StockerUser { id: string; name: string; email: string }

export default function ConnectDetailPage({ params }: { params: Promise<{ connectId: string }> }) {
  const { connectId } = use(params)

  // Core data
  const [connect, setConnect] = useState<Connect | null>(null)
  const [schema, setSchema] = useState<SchemaPosition[]>([])
  const [items, setItems] = useState<ConnectDataItem[]>([])
  const [cores, setCores] = useState<Core[]>([])
  const [relTypes, setRelTypes] = useState<RelationshipType[]>([])
  const [stockers, setStockers] = useState<StockerUser[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'schema' | 'data' | 'upload' | 'settings'>('schema')

  // Core items for dropdowns — loaded lazily when Data tab opens
  const [coreItemsMap, setCoreItemsMap] = useState<Record<string, ComboboxItem[]>>({})
  const [coreItemsLoading, setCoreItemsLoading] = useState(false)
  const coreItemsFetchedRef = useRef(false)  // ref guard prevents loop

  // Connect rename state
  const [editingConnectName, setEditingConnectName] = useState(false)
  const [editedConnectName, setEditedConnectName] = useState('')

  // Manual entry form state — also used for editing existing rows
  // selection: position_number → core_data_item_id
  const [selection, setSelection] = useState<Record<number, string>>({})
  const [editingRowId, setEditingRowId] = useState<string | null>(null)  // null = new row, id = editing existing
  const [savingRow, setSavingRow] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')

  // Schema builder state
  const [positions, setPositions] = useState<{ core_id: string; relationship_type_to_next: string }[]>([
    { core_id: '', relationship_type_to_next: '' },
    { core_id: '', relationship_type_to_next: '' },
  ])
  const [savingSchema, setSavingSchema] = useState(false)
  const [schemaError, setSchemaError] = useState('')

  // Excel upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadResult, setUploadResult] = useState('')
  const [uploadErrors, setUploadErrors] = useState('')
  const [uploading, setUploading] = useState(false)

  // Stocker assignment
  const [assignedStockerId, setAssignedStockerId] = useState('')
  const [savingAssignment, setSavingAssignment] = useState(false)
  const [assignmentMsg, setAssignmentMsg] = useState('')

  // Value lookup map for displaying English values in table
  const [itemValueMap, setItemValueMap] = useState<Record<string, string>>({})

  useEffect(() => { load() }, [connectId])

  async function load() {
    try {
      const [c, s, i, cr, rt, st] = await Promise.all([
        api.get(`/connects/${connectId}`),
        api.get(`/connects/${connectId}/schema`),
        api.get(`/connects/${connectId}/items`),
        api.get('/cores'),
        api.get('/admin/registries/relationship-types'),
        api.get('/admin/users/by-role/STOCKER').catch(() => ({ data: [] })),
      ])
      setConnect(c.data)
      setSchema(s.data)
      setItems(i.data)
      setCores(cr.data)
      setRelTypes(rt.data)
      setStockers(st.data)
      setAssignedStockerId(c.data.assigned_stocker_id || '')

      // Build initial value map from already-loaded core items
      const schemaCoreIds = [...new Set((s.data as SchemaPosition[]).map(p => p.core_id))]
      const results = await Promise.all(
        schemaCoreIds.map(cid => api.get(`/cores/${cid}/items`).catch(() => ({ data: [] })))
      )
      const vm: Record<string, string> = {}
      results.forEach(r => r.data.forEach((item: { id: string; english_value: string }) => {
        vm[item.id] = item.english_value
      }))
      setItemValueMap(vm)
    } finally {
      setLoading(false)
    }
  }

  const loadCoreItems = useCallback(async () => {
    // ref guard: runs exactly once per schema version, even if component re-renders
    if (coreItemsFetchedRef.current || schema.length === 0) return
    coreItemsFetchedRef.current = true
    setCoreItemsLoading(true)
    try {
      const map: Record<string, ComboboxItem[]> = {}
      const valueUpdates: Record<string, string> = {}
      await Promise.all(
        schema.map(async pos => {
          const { data } = await api.get(`/cores/${pos.core_id}/items?status_filter=ACTIVE`)
          map[pos.core_id] = data.map((item: { id: string; english_value: string }) => ({
            id: item.id,
            label: item.english_value,
          }))
          data.forEach((item: { id: string; english_value: string }) => {
            valueUpdates[item.id] = item.english_value
          })
        })
      )
      setCoreItemsMap(map)
      setItemValueMap(prev => ({ ...prev, ...valueUpdates }))
    } catch {
      // If fetch fails, allow retry on next tab switch
      coreItemsFetchedRef.current = false
    } finally {
      setCoreItemsLoading(false)
    }
  }, [schema])  // only recreate when schema changes

  // Load core items when Data tab opens
  useEffect(() => {
    if (tab === 'data') loadCoreItems()
  }, [tab, loadCoreItems])

  const coreMap = Object.fromEntries(cores.map(c => [c.id, c.name]))
  const activeCores = cores.filter(c => c.status === 'ACTIVE')

  // ── Manual row entry ────────────────────────────────────────────────────────

  function setPos(posNum: number, itemId: string) {
    setSelection(prev => ({ ...prev, [posNum]: itemId }))
    setSaveError('')
    setSaveSuccess('')
  }

  function clearForm() {
    setSelection({})
    setSaveError('')
    setSaveSuccess('')
    setEditingRowId(null)
  }

  function buildFingerprint(sel: Record<number, string>): string {
    return schema
      .map(p => `${p.position_number}:${sel[p.position_number] || ''}`)
      .join('|')
  }

  async function toggleRowStatus(cdiId: string, currentStatus: string) {
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    await api.put(`/connects/${connectId}/items/${cdiId}/status`, { status: newStatus })
    load()
  }

  async function renameConnect() {
    if (!editedConnectName.trim()) return
    try {
      await api.put(`/connects/${connectId}`, { name: editedConnectName.trim() })
      setEditingConnectName(false); load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      alert(err.response?.data?.detail || 'Failed to rename')
    }
  }

  async function saveRow() {
    setSaveError('')
    setSaveSuccess('')

    // Validate all positions selected
    for (const pos of schema) {
      if (!selection[pos.position_number]) {
        setSaveError(`Please select a value for "${pos.core_name || `Position ${pos.position_number}`}"`)
        return
      }
    }

    // Client-side duplicate check (exclude the row being edited)
    const newFp = buildFingerprint(selection)
    const isDuplicate = items.some(item => {
      if (editingRowId && item.id === editingRowId) return false  // skip self when editing
      const fp = item.positions
        .slice()
        .sort((a, b) => a.position_number - b.position_number)
        .map(p => `${p.position_number}:${p.core_data_item_id}`)
        .join('|')
      return fp === newFp
    })
    if (isDuplicate) {
      setSaveError('This combination already exists in this Connect')
      return
    }

    setSavingRow(true)
    try {
      const payload = schema.map(pos => ({
        position_number: pos.position_number,
        core_data_item_id: selection[pos.position_number],
      }))
      if (editingRowId) {
        // Update existing row
        await api.put(`/connects/${connectId}/items/${editingRowId}`, payload)
        setSaveSuccess('Row updated')
        setEditingRowId(null)
      } else {
        // Create new row
        const { data } = await api.post(`/connects/${connectId}/items`, payload)
        setItems(prev => [...prev, data])
        setSaveSuccess('Row saved')
      }
      clearForm()
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setSaveError(err.response?.data?.detail || 'Failed to save row')
    } finally {
      setSavingRow(false)
    }
  }

  // ── Schema builder ─────────────────────────────────────────────────────────

  function addPosition() {
    setPositions(prev => [...prev, { core_id: '', relationship_type_to_next: '' }])
  }

  function removePosition(idx: number) {
    if (positions.length <= 2) return
    setPositions(prev => prev.filter((_, i) => i !== idx))
  }

  function updateSchemaPosition(idx: number, field: 'core_id' | 'relationship_type_to_next', value: string) {
    setPositions(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))
  }

  async function saveSchema() {
    setSchemaError('')
    for (let i = 0; i < positions.length; i++) {
      if (!positions[i].core_id) {
        setSchemaError(`Please select a Core for Position ${i + 1}`)
        return
      }
      if (i < positions.length - 1 && !positions[i].relationship_type_to_next) {
        setSchemaError(`Please select a relationship type between Position ${i + 1} and Position ${i + 2}`)
        return
      }
    }
    const payload = positions.map((p, i) => ({
      position_number: i + 1,
      core_id: p.core_id,
      relationship_type_to_next: i < positions.length - 1 ? p.relationship_type_to_next : null,
    }))
    setSavingSchema(true)
    try {
      await api.post(`/connects/${connectId}/schema`, payload)
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setSchemaError(err.response?.data?.detail || 'Failed to save schema')
    } finally {
      setSavingSchema(false)
    }
  }

  // ── Excel upload ──────────────────────────────────────────────────────────

  async function uploadExcel() {
    if (!uploadFile) return
    setUploading(true); setUploadResult(''); setUploadErrors('')
    const form = new FormData()
    form.append('file', uploadFile)
    try {
      const { data } = await api.post(`/connects/${connectId}/items/upload-excel`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      let msg = `✓ Added: ${data.resolved}`
      if (data.skipped_duplicates) msg += ` | Skipped (already exist): ${data.skipped_duplicates}`
      if (data.unresolved) msg += ` | Unresolved: ${data.unresolved}`
      setUploadResult(msg)
      if (data.unresolved_details?.length) {
        setUploadErrors(
          data.unresolved_details
            .map((d: { row: number; errors: string[] }) => `Row ${d.row}: ${d.errors.join(', ')}`)
            .join('\n')
        )
      }
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setUploadResult(`✗ ${err.response?.data?.detail || 'Upload failed'}`)
    } finally {
      setUploading(false)
    }
  }

  // ── Stocker assignment ───────────────────────────────────────────────────

  async function saveAssignment() {
    setSavingAssignment(true); setAssignmentMsg('')
    try {
      await api.put(`/connects/${connectId}`, { assigned_stocker_id: assignedStockerId || null })
      setAssignmentMsg('✓ Saved')
      load()
    } catch {
      setAssignmentMsg('✗ Failed to save')
    } finally { setSavingAssignment(false) }
  }

  // ──────────────────────────────────────────────────────────────────────────

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
  if (!connect) return <p className="text-slate-500">Connect not found</p>

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/connects" className="text-sm text-teal-600 hover:underline">← Connects</Link>
        {editingConnectName ? (
          <div className="flex items-center gap-2 mt-2 mb-4">
            <input autoFocus value={editedConnectName} onChange={e => setEditedConnectName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') renameConnect(); if (e.key === 'Escape') setEditingConnectName(false) }}
              className="text-xl font-semibold text-slate-900 border-b-2 border-teal-500 focus:outline-none bg-transparent" />
            <button onClick={renameConnect} className="text-teal-600 hover:text-teal-800 text-sm font-medium">Save</button>
            <button onClick={() => setEditingConnectName(false)} className="text-slate-400 hover:text-slate-600 text-sm">Cancel</button>
          </div>
        ) : (
          <PageHeader
            title={connect.name}
            subtitle={connect.description || `${items.length} data row${items.length !== 1 ? 's' : ''} · ${schema.length} position${schema.length !== 1 ? 's' : ''}`}
            action={
              <div className="flex gap-2 items-center">
                {hasRole(getStoredUser(), 'DESIGNER', 'ADMIN') && (
                  <button onClick={() => { setEditingConnectName(true); setEditedConnectName(connect.name) }}
                    className="text-slate-400 hover:text-slate-700 text-lg px-1" title="Rename connect">✎</button>
                )}
                <Badge label={connect.status} variant={connect.status} />
              </div>
            }
          />
        )}
      </div>

      {/* Tabs — Settings hidden for Stockers */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {(['schema', 'data', 'upload', 'settings'] as const)
          .filter(t => !(t === 'settings' && connect.assigned_stocker_id === getStoredUser()?.id))
          .map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-teal-600 text-teal-600' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'schema' ? 'Schema' : t === 'data' ? `Data (${items.length})` : t === 'upload' ? 'Excel Upload' : 'Settings'}
          </button>
          ))}
      </div>

      {/* ── Schema tab ──────────────────────────────────────────────────────── */}
      {tab === 'schema' && (
        <div>
          {schema.length > 0 ? (
            <div>
              <div className="flex items-center flex-wrap gap-0 mb-4">
                {schema.map((pos, idx) => (
                  <div key={pos.id} className="flex items-center">
                    <div className="bg-white border-2 border-slate-200 rounded-xl px-5 py-3 text-center min-w-32">
                      <p className="text-xs text-slate-400 mb-1">Position {pos.position_number}</p>
                      <p className="text-sm font-semibold text-slate-800">{pos.core_name || pos.core_id}</p>
                    </div>
                    {idx < schema.length - 1 && (
                      <div className="flex flex-col items-center mx-3">
                        <span className="text-xs font-mono text-teal-700 bg-teal-50 border border-teal-200 px-2 py-1 rounded whitespace-nowrap">
                          {pos.relationship_type_to_next}
                        </span>
                        <span className="text-slate-400 text-xl mt-0.5">→</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {connect.schema_finalised
                ? <p className="text-xs text-slate-400">🔒 Schema is locked — data rows have been added</p>
                : <p className="text-xs text-slate-400">Schema will lock when the first data row is added</p>
              }
            </div>
          ) : (
            <div className="max-w-2xl">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-sm text-blue-800">
                <p className="font-medium mb-1">Define the schema first</p>
                <p>A schema defines which Cores appear at each position and how they are connected. Minimum 2 positions. Locks permanently once the first data row is added.</p>
              </div>
              <div className="space-y-0">
                {positions.map((pos, idx) => (
                  <div key={idx}>
                    <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
                      <div className="w-20 text-xs font-medium text-slate-500 flex-shrink-0">Position {idx + 1}</div>
                      <select value={pos.core_id} onChange={e => updateSchemaPosition(idx, 'core_id', e.target.value)}
                        className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                        <option value="">Select a Core…</option>
                        {activeCores.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {positions.length > 2 && (
                        <button onClick={() => removePosition(idx)} className="text-slate-300 hover:text-red-400 text-lg flex-shrink-0">✕</button>
                      )}
                    </div>
                    {idx < positions.length - 1 && (
                      <div className="flex items-center gap-3 py-2 pl-24 pr-10">
                        <div className="flex flex-col items-start">
                          <div className="w-px h-2 bg-slate-300 ml-4" />
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">↓</span>
                            <select value={pos.relationship_type_to_next} onChange={e => updateSchemaPosition(idx, 'relationship_type_to_next', e.target.value)}
                              className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-teal-50 text-teal-800 font-mono">
                              <option value="">Select relationship type…</option>
                              {relTypes.map(rt => <option key={rt.id} value={rt.label}>{rt.label} — {rt.display_name}</option>)}
                            </select>
                          </div>
                          <div className="w-px h-2 bg-slate-300 ml-4" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 mt-4">
                <button onClick={addPosition} className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600 font-medium">+ Add Position</button>
                <button onClick={saveSchema} disabled={savingSchema}
                  className="px-5 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium flex items-center gap-2">
                  {savingSchema && <LoadingSpinner size="sm" />} Save Schema
                </button>
              </div>
              {schemaError && <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{schemaError}</p>}
            </div>
          )}
        </div>
      )}

      {/* ── Data tab ────────────────────────────────────────────────────────── */}
      {tab === 'data' && (
        <div>
          {schema.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              ⚠️ Define the schema first (on the Schema tab) before adding data rows.
            </div>
          ) : (
            <>
              {/* Read-only banner when Connect is assigned to another user */}
              {connect.assigned_stocker_id && connect.assigned_stocker_id !== getStoredUser()?.id && (
                <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                  🔒 <span>This Connect is assigned to a Stocker for data entry. You can view the data but cannot add rows.</span>
                </div>
              )}

              {/* ── Manual entry form — hidden when read-only ────────────────── */}
              {(!connect.assigned_stocker_id || connect.assigned_stocker_id === getStoredUser()?.id) && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
                <h3 className="text-sm font-semibold text-slate-800 mb-4">
                  {editingRowId ? '✎ Edit row' : 'Add new row'}
                </h3>

                <div className="space-y-1 max-w-xl">
                  {schema.map((pos, idx) => (
                    <div key={pos.id}>
                      {/* Position row */}
                      <div className="flex items-center gap-3">
                        <div className="w-36 flex-shrink-0">
                          <p className="text-xs font-medium text-slate-500 truncate">
                            {pos.core_name || `Position ${pos.position_number}`}
                          </p>
                        </div>
                        <div className="flex-1">
                          <Combobox
                            items={coreItemsMap[pos.core_id] || []}
                            value={selection[pos.position_number] || ''}
                            onChange={id => setPos(pos.position_number, id)}
                            placeholder={coreItemsLoading ? 'Loading…' : `Search ${pos.core_name || ''}…`}
                            loading={coreItemsLoading}
                          />
                        </div>
                      </div>

                      {/* Relationship type between positions */}
                      {idx < schema.length - 1 && (
                        <div className="flex items-center gap-2 py-1 pl-36 ml-3">
                          <div className="w-px h-3 bg-slate-200" />
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-300 text-sm">↓</span>
                            <span className="text-xs font-mono text-teal-600 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
                              {pos.relationship_type_to_next}
                            </span>
                            <span className="text-slate-300 text-sm">↓</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 mt-5">
                  <button onClick={saveRow} disabled={savingRow}
                    className="px-5 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium flex items-center gap-2">
                    {savingRow && <LoadingSpinner size="sm" />}
                    {editingRowId ? 'Update Row' : 'Save Row'}
                  </button>
                  <button onClick={clearForm} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50">
                    Clear
                  </button>
                </div>

                {saveError && (
                  <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {saveError}
                  </p>
                )}
                {saveSuccess && (
                  <p className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    ✓ {saveSuccess}
                  </p>
                )}
              </div>
              )}  {/* end conditional entry form */}

              {/* ── Data table ───────────────────────────────────────────────── */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <p className="text-sm font-medium text-slate-700">
                    {items.length === 0 ? 'No rows yet' : `${items.filter(i => i.status === 'ACTIVE').length} active row${items.filter(i => i.status === 'ACTIVE').length !== 1 ? 's' : ''}`}
                  </p>
                </div>
                {items.length === 0 ? (
                  <p className="text-center py-10 text-slate-400 text-sm">Add your first row using the form above</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-slate-100">
                        <tr>
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 w-10">#</th>
                          {schema.map(p => (
                            <th key={p.id} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">
                              {p.core_name || `Position ${p.position_number}`}
                            </th>
                          ))}
                          <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {items.map((item, idx) => (
                          <tr key={item.id} className={`transition-colors hover:bg-slate-50 ${item.status === 'INACTIVE' ? 'opacity-40' : ''}`}>
                            <td className="px-4 py-3 text-slate-400 text-xs">{idx + 1}</td>
                            {schema.map(p => {
                              const pos = item.positions.find(ip => ip.position_number === p.position_number)
                              const label = pos
                                ? (itemValueMap[pos.core_data_item_id] || pos.core_data_item_id.slice(0, 8) + '…')
                                : '—'
                              return (
                                <td key={p.id} className="px-4 py-3 text-slate-800 font-medium">{label}</td>
                              )
                            })}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Badge label={item.status} variant={item.status} />
                                {(!connect.assigned_stocker_id || connect.assigned_stocker_id === getStoredUser()?.id) && (
                                  <>
                                    {item.status === 'ACTIVE' && (
                                      <button
                                        onClick={() => {
                                          const preselect: Record<number, string> = {}
                                          item.positions.forEach(p => { preselect[p.position_number] = p.core_data_item_id })
                                          setSelection(preselect)
                                          setEditingRowId(item.id)
                                          setSaveError(''); setSaveSuccess('')
                                        }}
                                        className="text-xs text-teal-600 hover:text-teal-800 border border-teal-200 px-2 py-0.5 rounded hover:bg-teal-50 transition-colors"
                                      >
                                        Edit
                                      </button>
                                    )}
                                    <button
                                      onClick={() => toggleRowStatus(item.id, item.status)}
                                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${item.status === 'ACTIVE' ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}
                                    >
                                      {item.status === 'ACTIVE' ? 'Inactivate' : 'Activate'}
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Excel Upload tab ────────────────────────────────────────────────── */}
      {tab === 'upload' && (
        <div className="max-w-lg">
          {schema.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-800">
              ⚠️ Define the schema first before uploading data.
            </div>
          )}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-800">
            <p className="font-medium mb-1">Excel format</p>
            <p>One column per schema position, header must match Core name exactly. Values must match English values stored in Cosh.</p>
            {schema.length > 0 && (
              <p className="mt-2 font-mono text-xs bg-blue-100 px-2 py-1 rounded">
                Expected columns: {schema.map(p => p.core_name || `Position ${p.position_number}`).join(' | ')}
              </p>
            )}
            <p className="mt-1.5 text-xs text-blue-600">Duplicate rows are automatically skipped.</p>
          </div>
          <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-8 text-center">
            <input type="file" accept=".xlsx,.xls"
              onChange={e => setUploadFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100" />
          </div>
          {uploadFile && (
            <div className="mt-4">
              <p className="text-sm text-slate-600 mb-2">Selected: <strong>{uploadFile.name}</strong></p>
              <button onClick={uploadExcel}
                disabled={uploading || schema.length === 0 || !!(connect.assigned_stocker_id && connect.assigned_stocker_id !== getStoredUser()?.id)}
                className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
                {uploading && <LoadingSpinner size="sm" />}
                {uploading ? 'Processing…' : 'Upload Excel'}
              </button>
            </div>
          )}
          {uploadResult && (
            <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${uploadResult.startsWith('✓') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {uploadResult}
            </div>
          )}
          {uploadErrors && (
            <pre className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 overflow-auto max-h-48 whitespace-pre-wrap">
              {uploadErrors}
            </pre>
          )}
        </div>
      )}

      {/* ── Settings tab ────────────────────────────────────────────────────── */}
      {tab === 'settings' && (
        <div className="max-w-lg">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="font-medium text-slate-800 mb-1">Assigned Stocker</h3>
            <p className="text-sm text-slate-500 mb-4">The Stocker responsible for uploading data to this Connect.</p>
            <div className="flex gap-3 items-center">
              <select value={assignedStockerId} onChange={e => setAssignedStockerId(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="">— Unassigned —</option>
                {stockers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button onClick={saveAssignment} disabled={savingAssignment}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2 flex-shrink-0">
                {savingAssignment && <LoadingSpinner size="sm" />} Save
              </button>
            </div>
            {stockers.length === 0 && (
              <p className="text-xs text-slate-400 mt-2">No Stockers found. Ask an Admin to create a Stocker user first.</p>
            )}
            {assignmentMsg && (
              <p className={`text-sm mt-2 ${assignmentMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>{assignmentMsg}</p>
            )}
          </div>

          {/* Connect status */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="font-medium text-slate-800 mb-1">Connect Status</h3>
            <p className="text-sm text-slate-500 mb-4">
              Inactivating a Connect inactivates all its data rows and their Neo4J relationships.
            </p>
            <div className="flex items-center gap-3">
              <Badge label={connect.status} variant={connect.status} />
              <button
                onClick={async () => {
                  const newStatus = connect.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
                  if (newStatus === 'INACTIVE' && !confirm(`Inactivate "${connect.name}"? All data rows will be inactivated.`)) return
                  await api.put(`/connects/${connectId}/status`, { status: newStatus })
                  load()
                }}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  connect.status === 'ACTIVE'
                    ? 'border-red-200 text-red-600 hover:bg-red-50'
                    : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                }`}
              >
                {connect.status === 'ACTIVE' ? 'Inactivate Connect' : 'Reactivate Connect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
