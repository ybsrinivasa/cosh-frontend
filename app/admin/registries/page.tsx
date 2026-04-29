'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import type { Language, RelationshipType, Product } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import AccessDenied from '@/components/ui/AccessDenied'
import { getStoredUser, isAdmin } from '@/lib/auth'

interface RelTypeForm {
  label: string
  display_name: string
  description: string
  example: string
}

const emptyForm: RelTypeForm = { label: '', display_name: '', description: '', example: '' }

export default function RegistriesPage() {
  const [languages, setLanguages] = useState<Language[]>([])
  const [relTypes, setRelTypes] = useState<RelationshipType[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'languages' | 'reltypes' | 'products'>('languages')

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState<RelTypeForm>(emptyForm)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Edit state — keyed by rel type id
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<RelTypeForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

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

  // ── Create ──────────────────────────────────────────────────────────────

  async function submitCreate() {
    setCreateError('')
    if (!createForm.label.trim()) { setCreateError('Label is required'); return }
    if (!createForm.display_name.trim()) { setCreateError('Display name is required'); return }
    setCreating(true)
    try {
      await api.post('/admin/registries/relationship-types', {
        label: createForm.label.trim(),
        display_name: createForm.display_name.trim(),
        description: createForm.description.trim() || null,
        example: createForm.example.trim() || null,
      })
      setCreateForm(emptyForm)
      setShowCreate(false)
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setCreateError(err.response?.data?.detail || 'Failed to create')
    } finally { setCreating(false) }
  }

  // ── Edit ─────────────────────────────────────────────────────────────────

  function startEdit(rt: RelationshipType) {
    setEditingId(rt.id)
    setEditForm({
      label: rt.label,
      display_name: rt.display_name,
      description: rt.description || '',
      example: rt.example || '',
    })
    setSaveError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setSaveError('')
  }

  async function submitEdit(rt: RelationshipType) {
    setSaveError('')
    if (!editForm.label.trim()) { setSaveError('Label is required'); return }
    if (!editForm.display_name.trim()) { setSaveError('Display name is required'); return }

    const labelChanged = editForm.label.trim() !== rt.label
    if (labelChanged && rt.usage_count > 0) {
      const confirmed = confirm(
        `Changing the label from "${rt.label}" to "${editForm.label.trim()}" will update ${rt.usage_count} schema position${rt.usage_count !== 1 ? 's' : ''}. Proceed?`
      )
      if (!confirmed) return
    }

    setSaving(true)
    try {
      await api.put(`/admin/registries/relationship-types/${rt.id}`, {
        label: editForm.label.trim(),
        display_name: editForm.display_name.trim(),
        description: editForm.description.trim() || null,
        example: editForm.example.trim() || null,
      })
      setEditingId(null)
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setSaveError(err.response?.data?.detail || 'Failed to save')
    } finally { setSaving(false) }
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
  if (!isAdmin(getStoredUser())) return <AccessDenied />

  return (
    <div>
      <PageHeader title="Registries" subtitle="Languages, relationship types, and products" />

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {(['languages', 'reltypes', 'products'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-green-600 text-green-600' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'languages' ? `Languages (${languages.length})` : t === 'reltypes' ? `Rel Types (${relTypes.length})` : `Products (${products.length})`}
          </button>
        ))}
      </div>

      {/* ── Languages tab ─────────────────────────────────────────────────── */}
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

      {/* ── Rel Types tab ─────────────────────────────────────────────────── */}
      {tab === 'reltypes' && (
        <div>
          {/* Create form */}
          {showCreate ? (
            <div className="bg-white border border-green-200 rounded-xl p-5 mb-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">New Relationship Type</h3>
              <div className="grid grid-cols-2 gap-3 max-w-2xl">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Label <span className="text-red-400">*</span></label>
                  <input value={createForm.label} onChange={e => setCreateForm(f => ({ ...f, label: e.target.value }))}
                    placeholder="e.g. HAS_PART"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Display name <span className="text-red-400">*</span></label>
                  <input value={createForm.display_name} onChange={e => setCreateForm(f => ({ ...f, display_name: e.target.value }))}
                    placeholder="e.g. Has Part"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
                  <input value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="What this relationship means"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Example</label>
                  <input value={createForm.example} onChange={e => setCreateForm(f => ({ ...f, example: e.target.value }))}
                    placeholder="e.g. Wheel has part Tyre"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              {createError && <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{createError}</p>}
              <div className="flex gap-3 mt-4">
                <button onClick={submitCreate} disabled={creating}
                  className="px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium flex items-center gap-2">
                  {creating && <LoadingSpinner size="sm" />} Save
                </button>
                <button onClick={() => { setShowCreate(false); setCreateForm(emptyForm); setCreateError('') }}
                  className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <button onClick={() => setShowCreate(true)}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                + New Rel Type
              </button>
            </div>
          )}

          {/* List */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {relTypes.length === 0 && (
              <p className="px-5 py-6 text-sm text-slate-400 text-center">No relationship types yet.</p>
            )}
            {relTypes.map(rt => (
              <div key={rt.id} className="border-b border-slate-100 last:border-0">
                {editingId === rt.id ? (
                  /* ── Edit row ── */
                  <div className="px-5 py-4 bg-green-50">
                    <div className="grid grid-cols-2 gap-3 max-w-2xl mb-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Label <span className="text-red-400">*</span></label>
                        <input value={editForm.label} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
                        {editForm.label !== rt.label && rt.usage_count > 0 && (
                          <p className="text-xs text-amber-600 mt-1">
                            ⚠ Used in {rt.usage_count} schema position{rt.usage_count !== 1 ? 's' : ''} — will be updated
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Display name <span className="text-red-400">*</span></label>
                        <input value={editForm.display_name} onChange={e => setEditForm(f => ({ ...f, display_name: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
                        <input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Example</label>
                        <input value={editForm.example} onChange={e => setEditForm(f => ({ ...f, example: e.target.value }))}
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white" />
                      </div>
                    </div>
                    {saveError && <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p>}
                    <div className="flex gap-3">
                      <button onClick={() => submitEdit(rt)} disabled={saving}
                        className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium flex items-center gap-2">
                        {saving && <LoadingSpinner size="sm" />} Save
                      </button>
                      <button onClick={cancelEdit}
                        className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-white">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Read row ── */
                  <div className="flex items-start justify-between px-5 py-3 hover:bg-slate-50 group">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <code className="text-sm font-mono bg-slate-100 px-2 py-0.5 rounded text-green-700">{rt.label}</code>
                        <span className="text-sm text-slate-700">{rt.display_name}</span>
                        {rt.usage_count > 0 && (
                          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                            {rt.usage_count} use{rt.usage_count !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      {(rt.description || rt.example) && (
                        <div className="flex gap-4 mt-1">
                          {rt.description && <p className="text-xs text-slate-400">{rt.description}</p>}
                          {rt.example && <p className="text-xs text-slate-400 italic">e.g. {rt.example}</p>}
                        </div>
                      )}
                    </div>
                    <button onClick={() => startEdit(rt)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-green-600 text-base px-2 ml-2 flex-shrink-0"
                      title="Edit">✎</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Products tab ──────────────────────────────────────────────────── */}
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
