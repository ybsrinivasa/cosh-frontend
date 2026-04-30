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

type WorkloadEntry = {
  user_id: string
  name: string
  email: string
  roles: Role[]
  cores_designed: { id: string; name: string; status: string }[]
  cores_stocked: { id: string; name: string; status: string }[]
  connects_designed: { id: string; name: string; status: string }[]
  connects_stocked: { id: string; name: string; status: string }[]
}

export default function UsersPage() {
  const [tab, setTab] = useState<'users' | 'workload'>('users')
  const [users, setUsers] = useState<User[]>([])
  const [workload, setWorkload] = useState<WorkloadEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [workloadLoading, setWorkloadLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', roles: [] as Role[] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAdmin(getStoredUser())) { setLoading(false); return }
    loadUsers()
  }, [])

  useEffect(() => {
    if (tab === 'workload' && workload.length === 0 && isAdmin(getStoredUser())) {
      loadWorkload()
    }
  }, [tab])

  async function loadUsers() {
    try {
      const { data } = await api.get('/admin/users')
      setUsers(data)
    } finally { setLoading(false) }
  }

  async function loadWorkload() {
    setWorkloadLoading(true)
    try {
      const { data } = await api.get('/admin/users/workload')
      setWorkload(data)
    } finally { setWorkloadLoading(false) }
  }

  async function create() {
    if (!form.email || form.roles.length === 0) return
    setSaving(true); setError('')
    try {
      await api.post('/admin/users', form)
      setForm({ email: '', name: '', roles: [] })
      setShowModal(false); loadUsers()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err.response?.data?.detail || 'Failed to create user')
    } finally { setSaving(false) }
  }

  async function toggleStatus(user: User) {
    const newStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    await api.put(`/admin/users/${user.id}/status`, { status: newStatus })
    loadUsers()
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
          tab === 'users' ? (
            <button onClick={() => { setShowModal(true); setError('') }}
              className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
              + New User
            </button>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-slate-200">
        {(['users', 'workload'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'workload' ? 'Team Workload' : 'Users'}
          </button>
        ))}
      </div>

      {/* ── Users tab ── */}
      {tab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {users.map(user => (
            <div key={user.id} className="flex items-center justify-between px-5 py-4 border-b border-slate-100 last:border-0">
              <div>
                <p className="font-medium text-slate-800">{user.name || user.email}</p>
                <p className="text-sm text-slate-400">{user.email}</p>
                <div className="flex gap-1 mt-1">
                  {user.roles.filter(r => r.status === 'ACTIVE').map(r => (
                    <Badge key={r.role} label={r.role} variant={r.role.toLowerCase()} />
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
      )}

      {/* ── Workload tab ── */}
      {tab === 'workload' && (
        workloadLoading
          ? <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
          : workload.length === 0
            ? <p className="text-slate-400 text-sm py-12 text-center">No designers or stockers found.</p>
            : (
              <div className="space-y-4">
                {workload.map(entry => (
                  <div key={entry.user_id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    {/* User header */}
                    <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 bg-slate-50">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                        style={{ background: 'linear-gradient(135deg, #065f46, #059669)' }}>
                        {(entry.name || entry.email)[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-800 text-sm">{entry.name}</p>
                        <p className="text-xs text-slate-400">{entry.email}</p>
                      </div>
                      <div className="ml-auto flex gap-1">
                        {entry.roles.map(r => (
                          <Badge key={r} label={r} variant={r.toLowerCase()} />
                        ))}
                      </div>
                    </div>

                    {/* Workload grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-slate-100">
                      <WorkloadColumn
                        label="Cores designed"
                        items={entry.cores_designed}
                        emptyLabel="None"
                      />
                      <WorkloadColumn
                        label="Cores stocked"
                        items={entry.cores_stocked}
                        emptyLabel="None"
                      />
                      <WorkloadColumn
                        label="Connects designed"
                        items={entry.connects_designed}
                        emptyLabel="None"
                      />
                      <WorkloadColumn
                        label="Connects stocked"
                        items={entry.connects_stocked}
                        emptyLabel="None"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )
      )}

      {/* ── New User modal ── */}
      {showModal && (
        <Modal title="New User" onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" autoFocus value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="user@eywa.farm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Full name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Roles</label>
              <div className="flex gap-2 flex-wrap">
                {ROLES.map(role => (
                  <button key={role} onClick={() => toggleRole(role)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${form.roles.includes(role) ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600 hover:border-green-300'}`}>
                    {role}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-400">
              The user will sign in via email OTP — no password needed.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button onClick={create} disabled={saving || !form.email || form.roles.length === 0}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
                {saving && <LoadingSpinner size="sm" />} Create User
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function WorkloadColumn({
  label,
  items,
  emptyLabel,
}: {
  label: string
  items: { id: string; name: string; status: string }[]
  emptyLabel: string
}) {
  const active = items.filter(i => i.status === 'ACTIVE')
  const inactive = items.filter(i => i.status !== 'ACTIVE')
  return (
    <div className="px-4 py-3">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">{label}</p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-300 italic">{emptyLabel}</p>
      ) : (
        <div className="space-y-1">
          {active.map(item => (
            <p key={item.id} className="text-xs text-slate-700 truncate" title={item.name}>
              {item.name}
            </p>
          ))}
          {inactive.map(item => (
            <p key={item.id} className="text-xs text-slate-400 line-through truncate" title={item.name}>
              {item.name}
            </p>
          ))}
        </div>
      )}
      {items.length > 0 && (
        <p className="text-xs text-slate-300 mt-1">{active.length} active{inactive.length > 0 ? `, ${inactive.length} inactive` : ''}</p>
      )}
    </div>
  )
}
