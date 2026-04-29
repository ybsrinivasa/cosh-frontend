'use client'
import { useState, useEffect, use } from 'react'
import api from '@/lib/api'
import type { Core, CoreDataItem, CoreLanguageConfig, Language } from '@/types'
import { getStoredUser, hasRole } from '@/lib/auth'

interface StockerUser { id: string; name: string; email: string }
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Link from 'next/link'

export default function CoreDetailPage({ params }: { params: Promise<{ coreId: string }> }) {
  const { coreId } = use(params)
  const [core, setCore] = useState<Core | null>(null)
  const [items, setItems] = useState<CoreDataItem[]>([])
  const [languages, setLanguages] = useState<CoreLanguageConfig[]>([])
  const [allLanguages, setAllLanguages] = useState<Language[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'items' | 'languages' | 'upload' | 'settings'>('items')
  const [stockers, setStockers] = useState<StockerUser[]>([])
  const [assignedStockerId, setAssignedStockerId] = useState<string>('')
  const [savingAssignment, setSavingAssignment] = useState(false)
  const [assignmentMsg, setAssignmentMsg] = useState('')
  const [search, setSearch] = useState('')
  const [showAddItem, setShowAddItem] = useState(false)
  const [newValue, setNewValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadResult, setUploadResult] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  // Editing state
  const [editingCoreName, setEditingCoreName] = useState(false)
  const [editedCoreName, setEditedCoreName] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemValue, setEditingItemValue] = useState('')
  const [editingItemSaving, setEditingItemSaving] = useState(false)

  useEffect(() => { load() }, [coreId])

  async function load() {
    try {
      const [c, i, l, al, st] = await Promise.all([
        api.get(`/cores/${coreId}`),
        api.get(`/cores/${coreId}/items`),
        api.get(`/cores/${coreId}/languages`).catch(() => ({ data: [] })),
        api.get('/admin/registries/languages').catch(() => ({ data: [] })),
        api.get('/admin/users/by-role/STOCKER').catch(() => ({ data: [] })),
      ])
      setCore(c.data); setItems(i.data); setLanguages(l.data); setAllLanguages(al.data)
      setStockers(st.data)
      setAssignedStockerId(c.data.assigned_stocker_id || '')
    } finally { setLoading(false) }
  }

  async function addItem() {
    if (!newValue.trim()) return
    setSaving(true); setError('')
    try {
      await api.post(`/cores/${coreId}/items`, { english_value: newValue.trim() })
      setNewValue(''); setShowAddItem(false); load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err.response?.data?.detail || 'Failed to add item')
    } finally { setSaving(false) }
  }

  async function saveAssignment() {
    setSavingAssignment(true); setAssignmentMsg('')
    try {
      await api.put(`/cores/${coreId}`, { assigned_stocker_id: assignedStockerId || null })
      setAssignmentMsg('✓ Saved')
      load()
    } catch {
      setAssignmentMsg('✗ Failed to save')
    } finally { setSavingAssignment(false) }
  }

  async function renameCore() {
    if (!editedCoreName.trim() || !core) return
    try {
      await api.put(`/cores/${coreId}`, { name: editedCoreName.trim() })
      setEditingCoreName(false); load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      alert(err.response?.data?.detail || 'Failed to rename')
    }
  }

  async function saveItemEdit() {
    if (!editingItemValue.trim() || !editingItemId) return
    setEditingItemSaving(true)
    try {
      await api.put(`/cores/${coreId}/items/${editingItemId}`, { english_value: editingItemValue.trim() })
      setEditingItemId(null); load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      alert(err.response?.data?.detail || 'Failed to update')
    } finally { setEditingItemSaving(false) }
  }

  async function toggleStatus(item: CoreDataItem) {
    const newStatus = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    await api.put(`/cores/${coreId}/items/${item.id}/status`, { status: newStatus })
    load()
  }

  async function addLanguage(code: string) {
    try {
      await api.post(`/cores/${coreId}/languages?language_code=${code}`)
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      alert(err.response?.data?.detail || 'Failed to add language')
    }
  }

  async function uploadCsv() {
    if (!uploadFile) return
    setUploading(true); setUploadResult('')
    const form = new FormData()
    form.append('file', uploadFile)
    try {
      const { data } = await api.post(`/cores/${coreId}/items/upload-csv`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setUploadResult(`✓ Created: ${data.created} | Skipped: ${data.skipped_duplicates} | Translations: ${data.translations_imported} | Errors: ${data.errors.length}`)
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setUploadResult(`✗ ${err.response?.data?.detail || 'Upload failed'}`)
    } finally { setUploading(false) }
  }

  const filtered = items.filter(i =>
    i.english_value.toLowerCase().includes(search.toLowerCase())
  )

  const unusedLanguages = allLanguages.filter(
    l => l.status === 'ACTIVE' && l.language_code !== 'en' && !languages.find(cl => cl.language_code === l.language_code)
  )

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
  if (!core) return <p className="text-slate-500">Core not found</p>

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/folders" className="text-sm text-teal-600 hover:underline">← Folders</Link>
        {editingCoreName ? (
          <div className="flex items-center gap-2 mt-2 mb-4">
            <input autoFocus value={editedCoreName} onChange={e => setEditedCoreName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') renameCore(); if (e.key === 'Escape') setEditingCoreName(false) }}
              className="text-xl font-semibold text-slate-900 border-b-2 border-teal-500 focus:outline-none bg-transparent" />
            <button onClick={renameCore} className="text-teal-600 hover:text-teal-800 text-sm font-medium">Save</button>
            <button onClick={() => setEditingCoreName(false)} className="text-slate-400 hover:text-slate-600 text-sm">Cancel</button>
          </div>
        ) : (
          <PageHeader
            title={core.name}
            subtitle={`${core.core_type} Core · ${items.length} items · ${languages.length} language${languages.length !== 1 ? 's' : ''}`}
            action={
              <div className="flex gap-2 items-center">
                {hasRole(getStoredUser(), 'DESIGNER', 'ADMIN') && (
                  <button onClick={() => { setEditingCoreName(true); setEditedCoreName(core.name) }}
                    className="text-slate-400 hover:text-slate-700 text-lg px-1" title="Rename core">✎</button>
                )}
                <Badge label={core.status} variant={core.status} />
                <Badge label={core.core_type} variant={core.core_type} />
              </div>
            }
          />
        )}
      </div>

      {/* Tabs — Settings hidden for Stockers */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {(['items', 'languages', 'upload', 'settings'] as const)
          .filter(t => !(t === 'settings' && core.assigned_stocker_id === getStoredUser()?.id))
          .map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${tab === t ? 'border-b-2 border-teal-600 text-teal-600' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'items' ? `Items (${items.length})` : t === 'languages' ? `Languages (${languages.length})` : t === 'upload' ? 'CSV Upload' : 'Settings'}
          </button>
          ))}
      </div>

      {/* Items tab */}
      {tab === 'items' && (
        <div>
          {/* Read-only banner when Core is assigned to another user */}
          {core.assigned_stocker_id && core.assigned_stocker_id !== getStoredUser()?.id && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              🔒 <span>This Core is assigned to a Stocker for data entry. You can view the data but cannot add or edit items.</span>
            </div>
          )}
          <div className="flex gap-3 mb-4">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search items…"
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            {(!core.assigned_stocker_id || core.assigned_stocker_id === getStoredUser()?.id) && (
              <button onClick={() => { setShowAddItem(true); setError('') }}
                className="px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium">
                + Add Item
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filtered.length === 0 ? (
              <p className="text-center py-10 text-slate-400 text-sm">No items found</p>
            ) : (
              filtered.map((item, idx) => (
                <div key={item.id} className={`border-b border-slate-100 last:border-0 ${item.status === 'INACTIVE' ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-xs text-slate-400 w-6 flex-shrink-0">{idx + 1}</span>
                      {editingItemId === item.id ? (
                        <input autoFocus value={editingItemValue}
                          onChange={e => setEditingItemValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveItemEdit(); if (e.key === 'Escape') setEditingItemId(null) }}
                          className="flex-1 text-sm border-b border-teal-400 focus:outline-none bg-transparent text-slate-800" />
                      ) : (
                        <span className="text-sm text-slate-800 truncate">{item.english_value}</span>
                      )}
                      {item.legacy_item_id && (
                        <span className="text-xs text-slate-400 font-mono hidden sm:inline">{item.legacy_item_id}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {editingItemId === item.id ? (
                        <>
                          <button onClick={saveItemEdit} disabled={editingItemSaving}
                            className="text-xs text-teal-600 hover:text-teal-800 font-medium">
                            {editingItemSaving ? '…' : '✓ Save'}
                          </button>
                          <button onClick={() => setEditingItemId(null)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                        </>
                      ) : (
                        <>
                          {(!core.assigned_stocker_id || core.assigned_stocker_id === getStoredUser()?.id) && item.status === 'ACTIVE' && (
                            <button onClick={() => { setEditingItemId(item.id); setEditingItemValue(item.english_value) }}
                              className="text-slate-300 hover:text-slate-600 text-sm" title="Edit value">✎</button>
                          )}
                          <span className="text-xs text-slate-400">{item.translations.length} trans.</span>
                          <button onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                            className="text-xs text-teal-600 hover:underline">
                            {expandedItem === item.id ? 'hide' : 'view'}
                          </button>
                          <button onClick={() => toggleStatus(item)}
                            className={`text-xs px-2 py-0.5 rounded border transition-colors ${item.status === 'ACTIVE' ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}>
                            {item.status === 'ACTIVE' ? 'Inactivate' : 'Activate'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {expandedItem === item.id && item.translations.length > 0 && (
                    <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {item.translations.map(t => (
                        <div key={t.id} className="bg-slate-50 rounded-lg px-3 py-2">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-mono text-slate-500">{t.language_code}</span>
                            <Badge label={t.validation_status === 'EXPERT_VALIDATED' ? 'Expert' : 'Machine'} variant={t.validation_status} />
                          </div>
                          <p className="text-sm text-slate-800">{t.translated_value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Languages tab */}
      {tab === 'languages' && (
        <div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
            {languages.length === 0 ? (
              <p className="text-center py-8 text-slate-400 text-sm">No languages configured</p>
            ) : (
              languages.map(l => (
                <div key={l.id} className="flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-0">
                  <span className="text-sm font-mono text-slate-700">{l.language_code}</span>
                  <Badge label="Configured" variant="active" />
                </div>
              ))
            )}
          </div>
          {unusedLanguages.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-600 mb-2">Add language:</p>
              <div className="flex flex-wrap gap-2">
                {unusedLanguages.map(l => (
                  <button key={l.language_code} onClick={() => addLanguage(l.language_code)}
                    className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-teal-400 transition-colors">
                    {l.language_name_en} ({l.language_code})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CSV Upload tab */}
      {tab === 'upload' && (
        <div className="max-w-lg">
          {core.assigned_stocker_id && core.assigned_stocker_id !== getStoredUser()?.id && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              🔒 <span>This Core is assigned to a Stocker. Only the assigned Stocker can upload data.</span>
            </div>
          )}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-800">
            <p className="font-medium mb-1">CSV format</p>
            <p>Required column: <code className="bg-blue-100 px-1 rounded">english_value</code></p>
            <p>Optional: <code className="bg-blue-100 px-1 rounded">legacy_id</code>, language value columns e.g. <code className="bg-blue-100 px-1 rounded">hi_value</code>, <code className="bg-blue-100 px-1 rounded">hi_validation_status</code></p>
          </div>
          <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-8 text-center">
            <input type="file" accept=".csv" onChange={e => setUploadFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100" />
          </div>
          {uploadFile && (
            <div className="mt-4">
              <p className="text-sm text-slate-600 mb-2">Selected: <strong>{uploadFile.name}</strong></p>
              <button onClick={uploadCsv}
                disabled={uploading || !!(core.assigned_stocker_id && core.assigned_stocker_id !== getStoredUser()?.id)}
                className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
                {uploading && <LoadingSpinner size="sm" />}
                {uploading ? 'Uploading…' : 'Upload CSV'}
              </button>
            </div>
          )}
          {uploadResult && (
            <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${uploadResult.startsWith('✓') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {uploadResult}
            </div>
          )}
        </div>
      )}

      {/* Settings tab */}
      {tab === 'settings' && (
        <div className="max-w-lg space-y-6">
          {/* Assign stocker */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="font-medium text-slate-800 mb-1">Assigned Stocker</h3>
            <p className="text-sm text-slate-500 mb-4">
              The Stocker responsible for adding and maintaining data items in this Core.
            </p>
            <div className="flex gap-3 items-center">
              <select
                value={assignedStockerId}
                onChange={e => setAssignedStockerId(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">— Unassigned —</option>
                {stockers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button
                onClick={saveAssignment}
                disabled={savingAssignment}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
              >
                {savingAssignment && <LoadingSpinner size="sm" />}
                Save
              </button>
            </div>
            {stockers.length === 0 && (
              <p className="text-xs text-slate-400 mt-2">No Stockers found. Ask an Admin to create a user with the STOCKER role first.</p>
            )}
            {assignmentMsg && (
              <p className={`text-sm mt-2 ${assignmentMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>
                {assignmentMsg}
              </p>
            )}
          </div>

          {/* Core status */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="font-medium text-slate-800 mb-1">Core Status</h3>
            <p className="text-sm text-slate-500 mb-4">
              Inactivating a Core inactivates all its data items and cascades to any Connect Data rows that reference them.
            </p>
            <div className="flex items-center gap-3">
              <Badge label={core.status} variant={core.status} />
              <button
                onClick={async () => {
                  const newStatus = core.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
                  if (newStatus === 'INACTIVE' && !confirm(`Inactivate "${core.name}"? This will inactivate all its items and cascade to Connect Data.`)) return
                  await api.put(`/cores/${coreId}/status`, { status: newStatus })
                  load()
                }}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  core.status === 'ACTIVE'
                    ? 'border-red-200 text-red-600 hover:bg-red-50'
                    : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                }`}
              >
                {core.status === 'ACTIVE' ? 'Inactivate Core' : 'Reactivate Core'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddItem && (() => {
        const suggestions = newValue.trim().length >= 3
          ? items.filter(item =>
              item.english_value.toLowerCase().includes(newValue.toLowerCase().trim())
            ).slice(0, 8)
          : []
        const exactMatch = items.find(i => i.english_value.toLowerCase() === newValue.toLowerCase().trim())
        return (
        <Modal title="Add Item" onClose={() => setShowAddItem(false)}>
          <div className="space-y-4">
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">English value</label>
              <input autoFocus value={newValue} onChange={e => setNewValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addItem()}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="e.g. Tomato — type 3+ letters to see matches" />
              {suggestions.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                  <p className="px-3 py-1.5 text-xs text-slate-400 bg-slate-50 border-b border-slate-100">Existing items matching "{newValue.trim()}"</p>
                  {suggestions.map(s => (
                    <button key={s.id} type="button"
                      onMouseDown={e => { e.preventDefault(); setNewValue(s.english_value) }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between ${s.status === 'INACTIVE' ? 'text-slate-400' : 'text-slate-800'}`}>
                      <span>{s.english_value}</span>
                      <Badge label={s.status} variant={s.status} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {exactMatch && (
              <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠️ "{exactMatch.english_value}" already exists ({exactMatch.status.toLowerCase()}).
                {exactMatch.status === 'INACTIVE' ? ' Reactivate it instead of creating a duplicate.' : ' Saving will be rejected.'}
              </p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddItem(false)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button onClick={addItem} disabled={saving || !newValue.trim()}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
                {saving && <LoadingSpinner size="sm" />} Add Item
              </button>
            </div>
          </div>
        </Modal>
        )
      })()}
    </div>
  )
}
