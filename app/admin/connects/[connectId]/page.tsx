'use client'
import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import type { Connect, SchemaPosition, ConnectDataItem, Core } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function ConnectDetailPage({ params }: { params: Promise<{ connectId: string }> }) {
  const { connectId } = use(params)
  const [connect, setConnect] = useState<Connect | null>(null)
  const [schema, setSchema] = useState<SchemaPosition[]>([])
  const [items, setItems] = useState<ConnectDataItem[]>([])
  const [cores, setCores] = useState<Core[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'schema' | 'data' | 'upload'>('schema')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadResult, setUploadResult] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [connectId])

  async function load() {
    try {
      const [c, s, i, cr] = await Promise.all([
        api.get(`/connects/${connectId}`),
        api.get(`/connects/${connectId}/schema`),
        api.get(`/connects/${connectId}/items`),
        api.get('/cores'),
      ])
      setConnect(c.data); setSchema(s.data); setItems(i.data); setCores(cr.data)
    } finally { setLoading(false) }
  }

  const coreMap = Object.fromEntries(cores.map(c => [c.id, c.name]))

  async function uploadExcel() {
    if (!uploadFile) return
    setUploading(true); setUploadResult(''); setError('')
    const form = new FormData()
    form.append('file', uploadFile)
    try {
      const { data } = await api.post(`/connects/${connectId}/items/upload-excel`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setUploadResult(`✓ Resolved: ${data.resolved} rows | Unresolved: ${data.unresolved}`)
      if (data.unresolved_details?.length) {
        setError(data.unresolved_details.map((d: {row: number; errors: string[]}) => `Row ${d.row}: ${d.errors.join(', ')}`).join('\n'))
      }
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setUploadResult(`✗ ${err.response?.data?.detail || 'Upload failed'}`)
    } finally { setUploading(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
  if (!connect) return <p className="text-slate-500">Connect not found</p>

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/connects" className="text-sm text-teal-600 hover:underline">← Connects</Link>
        <PageHeader
          title={connect.name}
          subtitle={connect.description || `${items.length} data rows · ${schema.length} schema positions`}
          action={<div className="flex gap-2"><Badge label={connect.status} variant={connect.status} /></div>}
        />
      </div>

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {(['schema', 'data', 'upload'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${tab === t ? 'border-b-2 border-teal-600 text-teal-600' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'schema' ? 'Schema' : t === 'data' ? `Data (${items.length})` : 'Excel Upload'}
          </button>
        ))}
      </div>

      {tab === 'schema' && (
        <div>
          {schema.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              No schema defined yet. Define positions before adding data.
            </div>
          ) : (
            <div className="flex items-center gap-0 flex-wrap">
              {schema.map((pos, idx) => (
                <div key={pos.id} className="flex items-center gap-0">
                  <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-center min-w-28">
                    <p className="text-xs text-slate-400 mb-1">Position {pos.position_number}</p>
                    <p className="text-sm font-medium text-slate-800">{coreMap[pos.core_id] || pos.core_id}</p>
                  </div>
                  {idx < schema.length - 1 && (
                    <div className="flex flex-col items-center mx-1">
                      <p className="text-xs text-teal-600 font-mono bg-teal-50 px-2 py-1 rounded border border-teal-200">
                        {pos.relationship_type_to_next}
                      </p>
                      <span className="text-slate-400 text-lg">→</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {connect.schema_finalised && (
            <p className="mt-4 text-xs text-slate-400 flex items-center gap-1">🔒 Schema is locked — data has been added</p>
          )}
        </div>
      )}

      {tab === 'data' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {items.length === 0 ? (
            <p className="text-center py-10 text-slate-400 text-sm">No data rows yet. Use Excel Upload to add data.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">#</th>
                  {schema.map(p => (
                    <th key={p.id} className="text-left px-4 py-2 text-xs font-medium text-slate-500">
                      {coreMap[p.core_id] || `Pos ${p.position_number}`}
                    </th>
                  ))}
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, idx) => (
                  <tr key={item.id} className={item.status === 'INACTIVE' ? 'opacity-50' : ''}>
                    <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                    {schema.map(p => {
                      const pos = item.positions.find(ip => ip.position_number === p.position_number)
                      return (
                        <td key={p.id} className="px-4 py-2 text-slate-700 font-mono text-xs">
                          {pos?.core_data_item_id.slice(0, 8) || '—'}…
                        </td>
                      )
                    })}
                    <td className="px-4 py-2"><Badge label={item.status} variant={item.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'upload' && (
        <div className="max-w-lg">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-800">
            <p className="font-medium mb-1">Excel format</p>
            <p>One column per schema position, named after the Core. Values must exactly match English values stored in each Core.</p>
            {schema.length > 0 && (
              <p className="mt-1">Expected columns: {schema.map(p => coreMap[p.core_id] || `Position ${p.position_number}`).join(' | ')}</p>
            )}
          </div>
          <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-8 text-center">
            <input type="file" accept=".xlsx,.xls" onChange={e => setUploadFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100" />
          </div>
          {uploadFile && (
            <div className="mt-4">
              <p className="text-sm text-slate-600 mb-2">Selected: <strong>{uploadFile.name}</strong></p>
              <button onClick={uploadExcel} disabled={uploading}
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
          {error && (
            <pre className="mt-2 p-3 bg-slate-50 rounded-lg text-xs text-slate-600 overflow-auto max-h-40">{error}</pre>
          )}
        </div>
      )}
    </div>
  )
}
