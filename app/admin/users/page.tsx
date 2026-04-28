'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import type { User, Role } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { getStoredUser, isAdmin } from '@/lib/auth'
import AccessDenied from '@/components/ui/AccessDenied'

const ROLES: Role[] = ['ADMIN', 'DESIGNER', 'STOCKER', 'REVIEWER']

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', password: '', roles: [] as Role[] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAdmin(getStoredUser())) { setLoading(false); return }
    load()
  }, [])

  async function load() {
    try {
      const { data } = await api.get('/admin/users')
      setUsers(data)
    } finally { setLoading(false) }
  }

  async function create() {
    if (!form.email || !form.password || form.roles.length === 0) return
    setSaving(true); setError('')
    try {
      await api.post('/admin/users', form)
      setForm({ email: '', name: '', password: '', roles: [] })
      setShowModal(false); load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err.response?.data?.detail || 'Failed to create user')
    } finally { setSaving(false) }
  }

  async function toggleStatus(user: User) {
    const newStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    await api.put(`/admin/users/${user.id}/status`, { status: newStatus })
    load()
  }

  function toggleRole(role: Role) {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role]
    }))
  }

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
  if (!isAdmin(getStoredUser())) return <AccessDenied />

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle={`${users.length} user${users.length !== 1 ? 's' : ''}`}
        action={
          <button onClick={() => { setShowModal(true); setError('') }}
            className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium">
            + New User
          </button>
        }
      />

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {users.map(user => (
          <div key={user.id} className="flex items-center justify-between px-5 py-4 border-b border-slate-100 last:border-0">
            <div>
              <p className="font-medium text-slate-800">{user.name || user.email}</p>
              <p className="text-sm text-slate-400">{user.email}</p>
              <div className="flex gap-1 mt-1">
                {user.roles.filter(r => r.status === 'ACTIVE').map(r => (
                  <Badge key={r.id} label={r.role} variant={r.role.toLowerCase()} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge label={user.status} variant={user.status} />
              <button onClick={() => toggleStatus(user)}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${user.status === 'ACTIVE' ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}>
                {user.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <Modal title="New User" onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" autoFocus value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="user@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Full name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Roles</label>
              <div className="flex gap-2 flex-wrap">
                {ROLES.map(role => (
                  <button key={role} onClick={() => toggleRole(role)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${form.roles.includes(role) ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600 hover:border-teal-300'}`}>
                    {role}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button onClick={create} disabled={saving || !form.email || !form.password || form.roles.length === 0}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
                {saving && <LoadingSpinner size="sm" />} Create User
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
