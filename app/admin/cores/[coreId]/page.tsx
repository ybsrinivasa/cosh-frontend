'use client'
import { useState, useEffect, use } from 'react'
import api from '@/lib/api'
import type { Core, CoreDataItem, CoreLanguageConfig, Language } from '@/types'
import { getStoredUser, hasRole } from '@/lib/auth'
import { formatDate } from '@/lib/format'

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
  const [newMediaUrl, setNewMediaUrl] = useState('')
  const [addImageMode, setAddImageMode] = useState<'url' | 'file'>('file')
  const [newImageFile, setNewImageFile] = useState<File | null>(null)
  const [newImagePreview, setNewImagePreview] = useState<string>('')
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
  const [editingItemUrl, setEditingItemUrl] = useState('')
  const [editingItemSaving, setEditingItemSaving] = useState(false)
  // MEDIA lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  // Inline translation edit
  const [editingTranslation, setEditingTranslation] = useState<{ itemId: string; langCode: string } | null>(null)
  const [editingTranslationValue, setEditingTranslationValue] = useState('')
  const [savingTranslation, setSavingTranslation] = useState(false)
  // Per-language translate button state
  const [translatingLang, setTranslatingLang] = useState<string | null>(null)
  const [translateMsg, setTranslateMsg] = useState<Record<string, string>>({})

  useEffect(() => { load() }, [coreId])

  async function load() {
    try {
      const [c, i, l, al, st] = await Promise.all([
        api.get(`/cores/${coreId}`),
        api.get(`/cores/${coreId}/items?status_filter=ALL`),
        api.get(`/cores/${coreId}/languages`).catch(() => ({ data: [] })),
        api.get('/admin/registries/languages').catch(() => ({ data: [] })),
        api.get('/admin/users/by-role/STOCKER').catch(() => ({ data: [] })),
      ])
      setCore(c.data); setItems(i.data); setLanguages(l.data); setAllLanguages(al.data)
      setStockers(st.data)
      setAssignedStockerId(c.data.assigned_stocker_id || '')
    } finally { setLoading(false) }
  }

  const isMedia = core?.core_type === 'MEDIA'
  const canWrite = !core?.assigned_stocker_id || core?.assigned_stocker_id === getStoredUser()?.id

  function clearAddImageModal() {
    setNewValue(''); setNewMediaUrl(''); setNewImageFile(null)
    setNewImagePreview(''); setError('')
  }

  function handleImageFileSelect(file: File | null) {
    setNewImageFile(file)
    if (file) {
      const url = URL.createObjectURL(file)
      setNewImagePreview(url)
      // Auto-fill name from filename if empty
      if (!newValue.trim()) {
        setNewValue(file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '))
      }
    } else {
      setNewImagePreview('')
    }
  }

  async function addItem() {
    if (!newValue.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      if (isMedia) {
        if (addImageMode === 'file') {
          if (!newImageFile) { setError('Please select an image file'); setSaving(false); return }
          const form = new FormData()
          form.append('file', newImageFile)
          await api.post(`/cores/${coreId}/items/upload-image?name=${encodeURIComponent(newValue.trim())}`, form, {
            headers: { 'Content-Type': 'multipart/form-data' }
          })
        } else {
          if (!newMediaUrl.trim()) { setError('Image URL is required'); setSaving(false); return }
          await api.post(`/cores/${coreId}/items`, { english_value: newValue.trim(), s3_url: newMediaUrl.trim() })
        }
      } else {
        await api.post(`/cores/${coreId}/items`, { english_value: newValue.trim() })
      }
      clearAddImageModal(); setShowAddItem(false); load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err.response?.data?.detail || 'Failed to add item')
    } finally { setSaving(false) }
  }

  async function saveAssignment() {
    setSavingAssignment(true); setAssignmentMsg('')
    try {
      await api.put(`/cores/${coreId}`, { assigned_stocker_id: assignedStockerId || null })
      setAssignmentMsg('✓ Saved'); load()
    } catch { setAssignmentMsg('✗ Failed to save') }
    finally { setSavingAssignment(false) }
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
      await api.put(`/cores/${coreId}/items/${editingItemId}`, {
        english_value: editingItemValue.trim(),
        ...(isMedia ? { s3_url: editingItemUrl.trim() || undefined } : {}),
      })
      setEditingItemId(null); load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      alert(err.response?.data?.detail || 'Failed to update')
    } finally { setEditingItemSaving(false) }
  }

  async function toggleStatus(item: CoreDataItem) {
    const newStatus = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    try {
      await api.put(`/cores/${coreId}/items/${item.id}/status`, { status: newStatus })
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      alert(err.response?.data?.detail || `Failed to ${newStatus === 'INACTIVE' ? 'inactivate' : 'activate'} item`)
    }
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

  async function downloadTranslationCsv(langCode: string, langName: string) {
    try {
      const response = await api.get(`/cores/${coreId}/export-translations?lang=${langCode}`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `${core?.name}_${langCode}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      alert(`Failed to download ${langName} CSV`)
    }
  }

  const [importingLang, setImportingLang] = useState<string | null>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState('')
  const [importLoading, setImportLoading] = useState(false)

  async function importTranslationCsv(langCode: string) {
    if (!importFile) return
    setImportLoading(true); setImportResult('')
    const form = new FormData()
    form.append('file', importFile)
    try {
      const { data } = await api.post(
        `/cores/${coreId}/import-translations?lang=${langCode}`, form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      setImportResult(`✓ Updated: ${data.updated} | Skipped: ${data.skipped}${data.errors?.length ? ` | Errors: ${data.errors.length}` : ''}`)
      setImportFile(null)
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setImportResult(`✗ ${err.response?.data?.detail || 'Import failed'}`)
    } finally { setImportLoading(false) }
  }

  async function triggerTranslate(langCode: string, mode: 'machine_generated_only' | 'all') {
    setTranslatingLang(langCode)
    setTranslateMsg(prev => ({ ...prev, [langCode]: '' }))
    try {
      const { data } = await api.put(
        `/cores/${coreId}/retranslate?lang=${langCode}&mode=${mode}`
      )
      setTranslateMsg(prev => ({ ...prev, [langCode]: `✓ ${data.message}` }))
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setTranslateMsg(prev => ({ ...prev, [langCode]: `✗ ${err.response?.data?.detail || 'Failed'}` }))
    } finally { setTranslatingLang(null) }
  }

  async function saveTranslationEdit() {
    if (!editingTranslation || !editingTranslationValue.trim()) return
    setSavingTranslation(true)
    try {
      await api.put(
        `/cores/${coreId}/items/${editingTranslation.itemId}/translations/${editingTranslation.langCode}?translated_value=${encodeURIComponent(editingTranslationValue.trim())}`
      )
      setEditingTranslation(null)
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      alert(err.response?.data?.detail || 'Failed to save translation')
    } finally { setSavingTranslation(false) }
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
      if (isMedia) {
        setUploadResult(`✓ Added: ${data.created} | Skipped (already exist): ${data.skipped_duplicates} | Errors: ${data.errors.length}`)
      } else {
        setUploadResult(`✓ Created: ${data.created} | Skipped: ${data.skipped_duplicates} | Translations: ${data.translations_imported} | Errors: ${data.errors.length}`)
      }
      if (data.errors?.length) setUploadResult(prev => prev + '\n' + data.errors.join('\n'))
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setUploadResult(`✗ ${err.response?.data?.detail || 'Upload failed'}`)
    } finally { setUploading(false) }
  }

  const activeItems = items.filter(i => i.status === 'ACTIVE')
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
      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Preview" className="max-w-full max-h-full rounded-lg shadow-2xl object-contain" />
          <button className="absolute top-4 right-4 text-white text-2xl hover:text-slate-300">✕</button>
        </div>
      )}

      <div className="mb-6">
        <Link href="/admin/folders" className="text-sm text-green-600 hover:underline">← Folders</Link>
        {editingCoreName ? (
          <div className="flex items-center gap-2 mt-2 mb-4">
            <input autoFocus value={editedCoreName} onChange={e => setEditedCoreName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') renameCore(); if (e.key === 'Escape') setEditingCoreName(false) }}
              className="text-xl font-semibold text-slate-900 border-b-2 border-green-500 focus:outline-none bg-transparent" />
            <button onClick={renameCore} className="text-green-600 hover:text-green-800 text-sm font-medium">Save</button>
            <button onClick={() => setEditingCoreName(false)} className="text-slate-400 hover:text-slate-600 text-sm">Cancel</button>
          </div>
        ) : (
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-slate-900">{core.name}</h1>
                {hasRole(getStoredUser(), 'DESIGNER', 'ADMIN') && (
                  <button onClick={() => { setEditingCoreName(true); setEditedCoreName(core.name) }}
                    className="text-slate-400 hover:text-green-600 text-base px-1 flex-shrink-0" title="Rename core">✎</button>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                {core.core_type} Core · {activeItems.length} active {isMedia ? 'image' : 'item'}{activeItems.length !== 1 ? 's' : ''}{items.length !== activeItems.length ? ` · ${items.length - activeItems.length} inactive` : ''}
                {!isMedia && ` · ${languages.length} language${languages.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <Badge label={core.status} variant={core.status} />
              <Badge label={core.core_type} variant={core.core_type} />
              {isMedia && core.content_type && <Badge label={core.content_type} />}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {(['items', ...(isMedia ? [] : ['languages']), 'upload', 'settings'] as const)
          .filter(t => !(t === 'settings' && core.assigned_stocker_id === getStoredUser()?.id))
          .map(t => (
            <button key={t} onClick={() => setTab(t as typeof tab)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${tab === t ? 'border-b-2 border-green-600 text-green-600' : 'text-slate-500 hover:text-slate-700'}`}>
              {t === 'items' ? `${isMedia ? 'Images' : 'Items'} (${activeItems.length}${items.length !== activeItems.length ? `+${items.length - activeItems.length}` : ''})` : t === 'languages' ? `Languages (${languages.length})` : t === 'upload' ? (isMedia ? 'Bulk Import' : 'CSV Upload') : 'Settings'}
            </button>
          ))}
      </div>

      {/* ── Items / Images tab ─────────────────────────────────────────────── */}
      {tab === 'items' && (
        <div>
          {core.assigned_stocker_id && core.assigned_stocker_id !== getStoredUser()?.id && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              🔒 <span>This Core is assigned to a Stocker. You can view but not add or edit.</span>
            </div>
          )}

          <div className="flex gap-3 mb-4">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={isMedia ? 'Search by name…' : 'Search items…'}
              className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            {canWrite && (
              <button onClick={() => { setShowAddItem(true); setError('') }}
                className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                + {isMedia ? 'Add Image' : 'Add Item'}
              </button>
            )}
          </div>

          {isMedia ? (
            /* ── Image grid ───────────────────────────────────────────────── */
            filtered.length === 0 ? (
              <p className="text-center py-10 text-slate-400 text-sm">No images found</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filtered.map(item => (
                  <div key={item.id} className={`bg-white border border-slate-200 rounded-xl overflow-hidden group ${item.status === 'INACTIVE' ? 'opacity-50' : ''}`}>
                    {editingItemId === item.id ? (
                      /* Edit mode */
                      <div className="p-3 space-y-2">
                        <input autoFocus value={editingItemValue} onChange={e => setEditingItemValue(e.target.value)}
                          placeholder="Name"
                          className="w-full text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500" />
                        <input value={editingItemUrl} onChange={e => setEditingItemUrl(e.target.value)}
                          placeholder="Image URL"
                          className="w-full text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500" />
                        <div className="flex gap-2">
                          <button onClick={saveItemEdit} disabled={editingItemSaving}
                            className="flex-1 text-xs bg-green-600 text-white rounded px-2 py-1 hover:bg-green-700 disabled:opacity-50">
                            {editingItemSaving ? '…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingItemId(null)}
                            className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Thumbnail */}
                        <div className="aspect-square bg-slate-100 relative cursor-pointer"
                          onClick={() => item.s3_url && setLightboxUrl(item.s3_url)}>
                          {item.s3_url ? (
                            <img src={item.s3_url} alt={item.english_value}
                              className="w-full h-full object-cover"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300 text-3xl">🖼</div>
                          )}
                        </div>
                        {/* Caption + actions */}
                        <div className="p-2">
                          <p className="text-xs text-slate-700 font-medium truncate" title={item.english_value}>{item.english_value}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{item.created_by_name || ''}</p>
                          <div className="flex items-center gap-1.5 mt-2">
                            {canWrite && item.status === 'ACTIVE' && (
                              <button onClick={() => { setEditingItemId(item.id); setEditingItemValue(item.english_value); setEditingItemUrl(item.s3_url || '') }}
                                className="text-xs text-slate-400 hover:text-green-600 px-1" title="Edit">✎</button>
                            )}
                            {canWrite && (
                              <button onClick={() => toggleStatus(item)}
                                className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${item.status === 'ACTIVE' ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}>
                                {item.status === 'ACTIVE' ? 'Inactivate' : 'Activate'}
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            /* ── Text list ────────────────────────────────────────────────── */
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
                            className="flex-1 text-sm border-b border-green-400 focus:outline-none bg-transparent text-slate-800" />
                        ) : (
                          <div className="min-w-0">
                            <span className="text-sm text-slate-800 truncate block">{item.english_value}</span>
                            <span className="text-xs text-slate-400">
                              {item.created_by_name ? `${item.created_by_name} · ` : ''}{formatDate(item.created_at)}
                            </span>
                          </div>
                        )}
                        {item.legacy_item_id && (
                          <span className="text-xs text-slate-400 font-mono hidden sm:inline">{item.legacy_item_id}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {editingItemId === item.id ? (
                          <>
                            <button onClick={saveItemEdit} disabled={editingItemSaving}
                              className="text-xs text-green-600 hover:text-green-800 font-medium">
                              {editingItemSaving ? '…' : '✓ Save'}
                            </button>
                            <button onClick={() => setEditingItemId(null)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                          </>
                        ) : (
                          <>
                            {canWrite && item.status === 'ACTIVE' && (
                              <button onClick={() => { setEditingItemId(item.id); setEditingItemValue(item.english_value) }}
                                className="text-slate-300 hover:text-slate-600 text-sm" title="Edit value">✎</button>
                            )}
                            <span className="text-xs text-slate-400">{item.translations.length} trans.</span>
                            <button onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                              className="text-xs text-green-600 hover:underline">
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
                    {expandedItem === item.id && (
                      <div className="px-4 pb-3">
                        {item.translations.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">No translations yet — go to Languages tab to trigger translation.</p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {item.translations.map(t => {
                              const isEditingThis = editingTranslation?.itemId === item.id && editingTranslation?.langCode === t.language_code
                              return (
                                <div key={t.id} className="bg-slate-50 rounded-lg px-3 py-2 group">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-mono text-slate-500">{t.language_code}</span>
                                    <div className="flex items-center gap-1">
                                      <Badge label={t.validation_status === 'EXPERT_VALIDATED' ? 'Expert' : 'Machine'} variant={t.validation_status} />
                                      {canWrite && !isEditingThis && (
                                        <button
                                          onClick={() => { setEditingTranslation({ itemId: item.id, langCode: t.language_code }); setEditingTranslationValue(t.translated_value) }}
                                          className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-green-600 text-xs ml-1"
                                          title="Edit translation">✎</button>
                                      )}
                                    </div>
                                  </div>
                                  {isEditingThis ? (
                                    <div>
                                      <textarea
                                        autoFocus
                                        value={editingTranslationValue}
                                        onChange={e => setEditingTranslationValue(e.target.value)}
                                        rows={2}
                                        className="w-full text-sm border border-green-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-500 bg-white resize-none"
                                      />
                                      <div className="flex gap-1.5 mt-1">
                                        <button onClick={saveTranslationEdit} disabled={savingTranslation}
                                          className="text-xs text-green-700 font-medium hover:text-green-900 disabled:opacity-50">
                                          {savingTranslation ? '…' : '✓ Save'}
                                        </button>
                                        <button onClick={() => setEditingTranslation(null)}
                                          className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-sm text-slate-800">{t.translated_value}</p>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Languages tab (TEXT only) ─────────────────────────────────────── */}
      {tab === 'languages' && !isMedia && (
        <div className="space-y-4">

          {/* How it works info box */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            <p className="font-medium mb-1">Translation Round-Trip Workflow</p>
            <p>1. <strong>Download CSV</strong> for a language → share with expert for correction.</p>
            <p>2. Expert fills in / corrects the translation column and saves the file.</p>
            <p>3. Designer <strong>uploads the corrected CSV</strong> → all rows are marked Expert Validated.</p>
          </div>

          {/* Configured languages */}
          {languages.length === 0 ? (
            <p className="text-center py-8 text-slate-400 text-sm bg-white border border-slate-200 rounded-xl">
              No languages configured — add one below
            </p>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {languages.map(l => {
                const langInfo = allLanguages.find(al => al.language_code === l.language_code)
                const isImporting = importingLang === l.language_code
                return (
                  <div key={l.id} className="border-b border-slate-100 last:border-0">
                    {/* Language header row */}
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <span className="text-sm font-medium text-slate-800">
                          {langInfo?.language_name_en || l.language_code}
                        </span>
                        <span className="ml-2 text-xs font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                          {l.language_code}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Translate button */}
                        <button
                          onClick={() => triggerTranslate(l.language_code, 'machine_generated_only')}
                          disabled={translatingLang === l.language_code}
                          className="px-3 py-1.5 text-xs font-medium border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 flex items-center gap-1">
                          {translatingLang === l.language_code ? <LoadingSpinner size="sm" /> : '⟳'}
                          Translate
                        </button>
                        {/* Download button */}
                        <button
                          onClick={() => downloadTranslationCsv(l.language_code, langInfo?.language_name_en || l.language_code)}
                          className="px-3 py-1.5 text-xs font-medium border border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition-colors flex items-center gap-1">
                          ↓ Download CSV
                        </button>
                        {/* Toggle import form */}
                        <button
                          onClick={() => {
                            setImportingLang(isImporting ? null : l.language_code)
                            setImportFile(null); setImportResult('')
                          }}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${isImporting ? 'bg-green-600 text-white border-green-600' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                          ↑ Upload Corrected
                        </button>
                      </div>
                    </div>

                    {/* Translate feedback */}
                    {translateMsg[l.language_code] && (
                      <div className={`px-4 py-2 text-xs ${translateMsg[l.language_code].startsWith('✓') ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>
                        {translateMsg[l.language_code]}
                      </div>
                    )}

                    {/* Import form — shown when expanded */}
                    {isImporting && (
                      <div className="px-4 pb-4 bg-green-50 border-t border-green-100">
                        <p className="text-xs text-slate-500 mt-3 mb-2">
                          Upload the corrected CSV for <strong>{langInfo?.language_name_en}</strong>.
                          All rows will be marked Expert Validated.
                        </p>
                        <div className="flex items-center gap-3">
                          <input type="file" accept=".csv"
                            onChange={e => { setImportFile(e.target.files?.[0] || null); setImportResult('') }}
                            className="text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-white file:text-green-700 hover:file:bg-green-50" />
                          {importFile && (
                            <button
                              onClick={() => importTranslationCsv(l.language_code)}
                              disabled={importLoading}
                              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1 flex-shrink-0">
                              {importLoading && <LoadingSpinner size="sm" />}
                              {importLoading ? 'Uploading…' : 'Upload'}
                            </button>
                          )}
                        </div>
                        {importResult && (
                          <p className={`mt-2 text-xs font-medium ${importResult.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>
                            {importResult}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Add language */}
          {unusedLanguages.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-600 mb-2">Add language:</p>
              <div className="flex flex-wrap gap-2">
                {unusedLanguages.map(l => (
                  <button key={l.language_code} onClick={() => addLanguage(l.language_code)}
                    className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-green-400 transition-colors">
                    {l.language_name_en} ({l.language_code})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CSV Upload tab ────────────────────────────────────────────────── */}
      {tab === 'upload' && (
        <div className="max-w-lg">
          {core.assigned_stocker_id && core.assigned_stocker_id !== getStoredUser()?.id && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              🔒 <span>This Core is assigned to a Stocker. Only the assigned Stocker can upload data.</span>
            </div>
          )}
          {isMedia && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-4 text-sm text-violet-800">
              <p className="font-medium mb-1">What is Bulk Import?</p>
              <p>Use this to import many images at once from a CSV. The CSV contains the image <strong>names</strong> and their existing <strong>S3 URLs</strong> — it does not upload image files. To upload a single new image file from your computer, use <strong>+ Add Image</strong> on the Images tab instead.</p>
            </div>
          )}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-800">
            <p className="font-medium mb-1">{isMedia ? 'CSV format — required columns' : 'CSV format'}</p>
            {isMedia ? (
              <>
                <ul className="mt-1 ml-3 space-y-0.5">
                  <li><code className="bg-blue-100 px-1 rounded">English_name</code> — image label</li>
                  <li><code className="bg-blue-100 px-1 rounded">English_url</code> — full S3 URL of the image</li>
                </ul>
                <p className="mt-1.5">Optional: <code className="bg-blue-100 px-1 rounded">id</code> (stored as legacy ID)</p>
                <p className="mt-1.5 text-xs text-blue-600">Names already in the Core are skipped. Existing URLs are updated if the name matches.</p>
              </>
            ) : (
              <>
                <p>Required: <code className="bg-blue-100 px-1 rounded">english_value</code></p>
                <p>Optional: <code className="bg-blue-100 px-1 rounded">legacy_id</code>, language columns e.g. <code className="bg-blue-100 px-1 rounded">hi_value</code>, <code className="bg-blue-100 px-1 rounded">hi_validation_status</code></p>
              </>
            )}
          </div>
          <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-8 text-center">
            <input type="file" accept=".csv" onChange={e => setUploadFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100" />
          </div>
          {uploadFile && (
            <div className="mt-4">
              <p className="text-sm text-slate-600 mb-2">Selected: <strong>{uploadFile.name}</strong></p>
              <button onClick={uploadCsv}
                disabled={uploading || !!(core.assigned_stocker_id && core.assigned_stocker_id !== getStoredUser()?.id)}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
                {uploading && <LoadingSpinner size="sm" />}
                {uploading ? 'Uploading…' : 'Upload CSV'}
              </button>
            </div>
          )}
          {uploadResult && (
            <div className={`mt-4 p-3 rounded-lg text-sm font-medium whitespace-pre-wrap ${uploadResult.startsWith('✓') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {uploadResult}
            </div>
          )}
        </div>
      )}

      {/* ── Settings tab ─────────────────────────────────────────────────── */}
      {tab === 'settings' && (
        <div className="max-w-lg space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="font-medium text-slate-800 mb-1">Assigned Stocker</h3>
            <p className="text-sm text-slate-500 mb-4">The Stocker responsible for adding and maintaining data in this Core.</p>
            <div className="flex gap-3 items-center">
              <select value={assignedStockerId} onChange={e => setAssignedStockerId(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">— Unassigned —</option>
                {stockers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button onClick={saveAssignment} disabled={savingAssignment}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 flex-shrink-0">
                {savingAssignment && <LoadingSpinner size="sm" />} Save
              </button>
            </div>
            {stockers.length === 0 && (
              <p className="text-xs text-slate-400 mt-2">No Stockers found. Ask an Admin to create a user with the STOCKER role first.</p>
            )}
            {assignmentMsg && (
              <p className={`text-sm mt-2 ${assignmentMsg.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>{assignmentMsg}</p>
            )}
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="font-medium text-slate-800 mb-1">Core Status</h3>
            <p className="text-sm text-slate-500 mb-4">Inactivating a Core inactivates all its items and cascades to Connect Data rows that reference them.</p>
            <div className="flex items-center gap-3">
              <Badge label={core.status} variant={core.status} />
              <button
                onClick={async () => {
                  const newStatus = core.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
                  if (newStatus === 'INACTIVE' && !confirm(`Inactivate "${core.name}"? This will inactivate all its items and cascade to Connect Data.`)) return
                  await api.put(`/cores/${coreId}/status`, { status: newStatus })
                  load()
                }}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${core.status === 'ACTIVE' ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}>
                {core.status === 'ACTIVE' ? 'Inactivate Core' : 'Reactivate Core'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Item / Add Image modal ─────────────────────────────────────── */}
      {showAddItem && (() => {
        const suggestions = !isMedia && newValue.trim().length >= 3
          ? activeItems.filter(item => item.english_value.toLowerCase().includes(newValue.toLowerCase().trim())).slice(0, 8)
          : []
        const exactMatch = !isMedia && items.find(i =>
          i.english_value.toLowerCase() === newValue.toLowerCase().trim() && i.status === 'ACTIVE'
        )
        const previewSrc = addImageMode === 'file' ? newImagePreview : newMediaUrl
        return (
          <Modal title={isMedia ? 'Add Image' : 'Add Item'} onClose={() => { setShowAddItem(false); clearAddImageModal() }}>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">{isMedia ? 'Name' : 'English value'}</label>
                <input autoFocus value={newValue} onChange={e => setNewValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !isMedia) addItem() }}
                  placeholder={isMedia ? 'e.g. Cotton — Vegetative — Leaf' : 'Enter value…'}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>

              {isMedia && (
                <div>
                  {/* Mode toggle */}
                  <div className="flex gap-2 mb-3">
                    <button onClick={() => setAddImageMode('file')}
                      className={`px-3 py-1.5 text-xs rounded-full border font-medium transition-colors ${addImageMode === 'file' ? 'bg-green-600 text-white border-green-600' : 'border-slate-300 text-slate-500 hover:border-slate-400'}`}>
                      Upload file
                    </button>
                    <button onClick={() => setAddImageMode('url')}
                      className={`px-3 py-1.5 text-xs rounded-full border font-medium transition-colors ${addImageMode === 'url' ? 'bg-green-600 text-white border-green-600' : 'border-slate-300 text-slate-500 hover:border-slate-400'}`}>
                      Paste URL
                    </button>
                  </div>

                  {addImageMode === 'file' ? (
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center">
                      <input type="file" accept="image/*"
                        onChange={e => handleImageFileSelect(e.target.files?.[0] || null)}
                        className="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100" />
                      {newImageFile && <p className="text-xs text-slate-400 mt-1">{newImageFile.name} · {(newImageFile.size / 1024).toFixed(0)} KB</p>}
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Image URL</label>
                      <input value={newMediaUrl} onChange={e => setNewMediaUrl(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addItem() }}
                        placeholder="https://…"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-xs" />
                    </div>
                  )}

                  {/* Preview */}
                  {previewSrc && (
                    <img src={previewSrc} alt="preview"
                      className="mt-2 h-32 w-auto rounded-lg object-cover border border-slate-200 mx-auto block"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  )}
                </div>
              )}

              {!isMedia && suggestions.length > 0 && (
                <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-amber-700 mb-1">Similar existing items:</p>
                  {suggestions.map(s => (
                    <p key={s.id} className="text-xs text-amber-600">• {s.english_value}</p>
                  ))}
                </div>
              )}
              {!isMedia && exactMatch && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  This exact value already exists in the Core.
                </p>
              )}
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button onClick={addItem} disabled={saving || (!isMedia && !!exactMatch)}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 font-medium">
                  {saving && <LoadingSpinner size="sm" />} {saving && isMedia && addImageMode === 'file' ? 'Uploading…' : 'Save'}
                </button>
                <button onClick={() => { setShowAddItem(false); clearAddImageModal() }}
                  className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </div>
          </Modal>
        )
      })()}
    </div>
  )
}
