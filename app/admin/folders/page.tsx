'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import type { Folder, Core } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function FoldersPage() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [cores, setCores] = useState<Core[]>([])
  const [loading, setLoading] = useState(true)
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [showCoreModal, setShowCoreModal] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState<string>('')
  const [newFolderName, setNewFolderName] = useState('')
  const [newCore, setNewCore] = useState({ name: '', folder_id: '', core_type: 'TEXT', description: '', language_mode: 'TRANSLATION' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [f, c] = await Promise.all([api.get('/folders'), api.get('/cores')])
      setFolders(f.data)
      setCores(c.data)
    } finally {
      setLoading(false)
    }
  }

  async function createFolder() {
    if (!newFolderName.trim()) return
    setSaving(true); setError('')
    try {
      await api.post('/folders', { name: newFolderName.trim() })
      setNewFolderName(''); setShowFolderModal(false); load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err.response?.data?.detail || 'Failed to create folder')
    } finally { setSaving(false) }
  }

  async function createCore() {
    if (!newCore.name.trim() || !newCore.folder_id) return
    setSaving(true); setError('')
    try {
      await api.post('/cores', { ...newCore, name: newCore.name.trim() })
      setNewCore({ name: '', folder_id: '', core_type: 'TEXT', description: '', language_mode: 'TRANSLATION' })
      setShowCoreModal(false); load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err.response?.data?.detail || 'Failed to create core')
    } finally { setSaving(false) }
  }

  const foldersWithCores = folders.map(f => ({
    ...f,
    cores: cores.filter(c => c.folder_id === f.id)
  }))

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>

  return (
    <div>
      <PageHeader
        title="Folders & Cores"
        subtitle={`${folders.length} folders · ${cores.length} cores`}
        action={
          <div className="flex gap-2">
            <button onClick={() => { setShowCoreModal(true); setError('') }}
              className="px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50 font-medium">
              + New Core
            </button>
            <button onClick={() => { setShowFolderModal(true); setError('') }}
              className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium">
              + New Folder
            </button>
          </div>
        }
      />

      <div className="space-y-4">
        {foldersWithCores.map(folder => (
          <div key={folder.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200 cursor-pointer"
              onClick={() => setSelectedFolder(selectedFolder === folder.id ? '' : folder.id)}
            >
              <div className="flex items-center gap-2">
                <span className="text-slate-400">{selectedFolder === folder.id ? '▾' : '▸'}</span>
                <span className="font-medium text-slate-800">📁 {folder.name}</span>
                <span className="text-xs text-slate-400">{folder.cores.length} core{folder.cores.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
            {selectedFolder === folder.id && (
              <div className="divide-y divide-slate-100">
                {folder.cores.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-slate-400">No cores yet</p>
                ) : (
                  folder.cores.map(core => (
                    <Link key={core.id} href={`/admin/cores/${core.id}`}
                      className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">{core.core_type === 'TEXT' ? '📝' : '🖼️'}</span>
                        <div>
                          <p className="text-sm font-medium text-slate-800">{core.name}</p>
                          {core.description && <p className="text-xs text-slate-400">{core.description}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge label={core.core_type} variant={core.core_type} />
                        <Badge label={core.status} variant={core.status} />
                        {core.is_public && <Badge label="Public" variant="active" />}
                        <span className="text-slate-300 text-sm">›</span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
        {folders.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-4xl mb-3">📁</p>
            <p className="font-medium">No folders yet</p>
            <p className="text-sm">Create a folder to get started</p>
          </div>
        )}
      </div>

      {showFolderModal && (
        <Modal title="New Folder" onClose={() => setShowFolderModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Folder name</label>
              <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createFolder()}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="e.g. Crops & Varieties" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowFolderModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
              <button onClick={createFolder} disabled={saving || !newFolderName.trim()}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
                {saving && <LoadingSpinner size="sm" />} Create Folder
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showCoreModal && (
        <Modal title="New Core" onClose={() => setShowCoreModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Core name</label>
              <input autoFocus value={newCore.name} onChange={e => setNewCore({ ...newCore, name: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="e.g. Crops" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Folder</label>
              <select value={newCore.folder_id} onChange={e => setNewCore({ ...newCore, folder_id: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="">Select folder…</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <select value={newCore.core_type} onChange={e => setNewCore({ ...newCore, core_type: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                  <option value="TEXT">TEXT</option>
                  <option value="MEDIA">MEDIA</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Language mode</label>
                <select value={newCore.language_mode} onChange={e => setNewCore({ ...newCore, language_mode: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                  <option value="TRANSLATION">Translation</option>
                  <option value="TRANSLITERATION">Transliteration</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description (optional)</label>
              <input value={newCore.description} onChange={e => setNewCore({ ...newCore, description: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Brief description" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCoreModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancel</button>
              <button onClick={createCore} disabled={saving || !newCore.name.trim() || !newCore.folder_id}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
                {saving && <LoadingSpinner size="sm" />} Create Core
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
