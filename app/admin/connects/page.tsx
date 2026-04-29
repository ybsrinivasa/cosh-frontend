'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { getStoredUser, hasRole } from '@/lib/auth'
import type { Connect } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function ConnectsPage() {
  const [connects, setConnects] = useState<Connect[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const { data } = await api.get('/connects')
      setConnects(data)
    } finally { setLoading(false) }
  }

  async function renameConnect(id: string) {
    if (!editingName.trim()) return
    try {
      await api.put(`/connects/${id}`, { name: editingName.trim() })
      setEditingId(null); load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      alert(err.response?.data?.detail || 'Failed to rename')
    }
  }

  async function create() {
    if (!form.name.trim()) return
    setSaving(true); setError('')
    try {
      await api.post('/connects', { name: form.name.trim(), description: form.description || null })
      setForm({ name: '', description: '' }); setShowModal(false); load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err.response?.data?.detail || 'Failed to create connect')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>

  return (
    <div>
      <PageHeader
        title="Connects"
        subtitle={`${connects.length} connect${connects.length !== 1 ? 's' : ''}`}
        action={hasRole(getStoredUser(), 'DESIGNER', 'ADMIN') ? (
          <button onClick={() => { setShowModal(true); setError('') }}
            className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium">
            + New Connect
          </button>
        ) : undefined}
      />

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {connects.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-4xl mb-3">🔗</p>
            <p className="font-medium">No connects yet</p>
            <p className="text-sm">Create a Connect to define relationships between Cores</p>
          </div>
        ) : (
          connects.map(connect => (
            <div key={connect.id} className="flex items-center justify-between px-5 py-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
              {editingId === connect.id ? (
                <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
                  <input autoFocus value={editingName} onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') renameConnect(connect.id); if (e.key === 'Escape') setEditingId(null) }}
                    className="font-medium text-slate-800 border-b-2 border-teal-400 focus:outline-none bg-transparent flex-1" />
                  <button onClick={() => renameConnect(connect.id)} className="text-sm text-teal-600 hover:text-teal-800 font-medium">Save</button>
                  <button onClick={() => setEditingId(null)} className="text-sm text-slate-400 hover:text-slate-600">Cancel</button>
                </div>
              ) : (
                <Link href={`/admin/connects/${connect.id}`} className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800">{connect.name}</p>
                  {connect.description && <p className="text-sm text-slate-400 mt-0.5">{connect.description}</p>}
                </Link>
              )}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge label={connect.status} variant={connect.status} />
                {connect.schema_finalised && <Badge label="Schema locked" variant="active" />}
                {connect.is_public && <Badge label="Public" variant="active" />}
                {hasRole(getStoredUser(), 'DESIGNER', 'ADMIN') && editingId !== connect.id && (
                  <button onClick={e => { e.preventDefault(); setEditingId(connect.id); setEditingName(connect.name) }}
                    className="text-slate-300 hover:text-slate-600 text-sm px-1" title="Rename">✎</button>
                )}
                <Link href={`/admin/connects/${connect.id}`} className="text-slate-300">›</Link>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <Modal title="New Connect" onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && create()}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="e.g. Brand to Manufacturer" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description (optional)</label>
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="What does this Connect represent?" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button onClick={create} disabled={saving || !form.name.trim()}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
                {saving && <LoadingSpinner size="sm" />} Create Connect
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
