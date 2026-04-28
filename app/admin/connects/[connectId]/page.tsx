'use client'
import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import type { Connect, SchemaPosition, ConnectDataItem, Core, RelationshipType } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

interface PositionRow {
  core_id: string
  relationship_type_to_next: string  // empty string for last position
}

export default function ConnectDetailPage({ params }: { params: Promise<{ connectId: string }> }) {
  const { connectId } = use(params)
  const [connect, setConnect] = useState<Connect | null>(null)
  const [schema, setSchema] = useState<SchemaPosition[]>([])
  const [items, setItems] = useState<ConnectDataItem[]>([])
  const [cores, setCores] = useState<Core[]>([])
  const [relTypes, setRelTypes] = useState<RelationshipType[]>([])
  const [itemValueMap, setItemValueMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'schema' | 'data' | 'upload'>('schema')

  // Schema builder state
  const [positions, setPositions] = useState<PositionRow[]>([
    { core_id: '', relationship_type_to_next: '' },
    { core_id: '', relationship_type_to_next: '' },
  ])
  const [savingSchema, setSavingSchema] = useState(false)
  const [schemaError, setSchemaError] = useState('')

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadResult, setUploadResult] = useState<string>('')
  const [uploadErrors, setUploadErrors] = useState<string>('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => { load() }, [connectId])

  async function load() {
    try {
      const [c, s, i, cr, rt] = await Promise.all([
        api.get(`/connects/${connectId}`),
        api.get(`/connects/${connectId}/schema`),
        api.get(`/connects/${connectId}/items`),
        api.get('/cores'),
        api.get('/admin/registries/relationship-types'),
      ])
      setConnect(c.data)
      setSchema(s.data)
      setItems(i.data)
      setCores(cr.data)
      setRelTypes(rt.data)

      // Fetch English values for all cores in schema positions
      const schemaCoreIds = [...new Set((s.data as SchemaPosition[]).map(p => p.core_id))]
      if (schemaCoreIds.length > 0) {
        const results = await Promise.all(
          schemaCoreIds.map(cid => api.get(`/cores/${cid}/items`).catch(() => ({ data: [] })))
        )
        const valueMap: Record<string, string> = {}
        results.forEach(r => {
          r.data.forEach((item: { id: string; english_value: string }) => {
            valueMap[item.id] = item.english_value
          })
        })
        setItemValueMap(valueMap)
      }
    } finally { setLoading(false) }
  }

  const coreMap = Object.fromEntries(cores.map(c => [c.id, c.name]))
  const activeCores = cores.filter(c => c.status === 'ACTIVE')

  // ── Schema builder ────────────────────────────────────────────────────────

  function addPosition() {
    setPositions(prev => [...prev, { core_id: '', relationship_type_to_next: '' }])
  }

  function removePosition(idx: number) {
    if (positions.length <= 2) return
    setPositions(prev => prev.filter((_, i) => i !== idx))
  }

  function updatePosition(idx: number, field: keyof PositionRow, value: string) {
    setPositions(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))
  }

  async function saveSchema() {
    setSchemaError('')

    // Validate
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
    } finally { setSavingSchema(false) }
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
      setUploadResult(`✓ Resolved: ${data.resolved} rows | Unresolved: ${data.unresolved}`)
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
    } finally { setUploading(false) }
  }

  // ─────────────────────────────────────────────────────────────────────────

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

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {(['schema', 'data', 'upload'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-teal-600 text-teal-600' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'schema' ? 'Schema' : t === 'data' ? `Data (${items.length})` : 'Excel Upload'}
          </button>
        ))}
      </div>

      {/* ── Schema tab ─────────────────────────────────────────────────────── */}
      {tab === 'schema' && (
        <div>
          {schema.length > 0 ? (
            /* Defined schema — show diagram */
            <div>
              <div className="flex items-center flex-wrap gap-0 mb-4">
                {schema.map((pos, idx) => (
                  <div key={pos.id} className="flex items-center">
                    <div className="bg-white border-2 border-slate-200 rounded-xl px-5 py-3 text-center min-w-32">
                      <p className="text-xs text-slate-400 mb-1">Position {pos.position_number}</p>
                      <p className="text-sm font-semibold text-slate-800">{coreMap[pos.core_id] || pos.core_id}</p>
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
                ? <p className="text-xs text-slate-400">🔒 Schema is locked — data rows have been added and cannot be changed</p>
                : <p className="text-xs text-slate-400">Schema not yet locked — it will lock automatically when the first data row is added</p>
              }
            </div>
          ) : (
            /* Schema builder — no schema defined yet */
            <div className="max-w-2xl">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-sm text-blue-800">
                <p className="font-medium mb-1">Define the schema first</p>
                <p>A schema defines which Cores appear at each position and how they are related.
                   Minimum 2 positions. The schema locks permanently once the first data row is added.</p>
              </div>

              <div className="space-y-0">
                {positions.map((pos, idx) => (
                  <div key={idx}>
                    {/* Position row */}
                    <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
                      <div className="w-20 text-xs font-medium text-slate-500 flex-shrink-0">
                        Position {idx + 1}
                      </div>
                      <select
                        value={pos.core_id}
                        onChange={e => updatePosition(idx, 'core_id', e.target.value)}
                        className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="">Select a Core…</option>
                        {activeCores.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      {positions.length > 2 && (
                        <button onClick={() => removePosition(idx)}
                          className="text-slate-300 hover:text-red-400 text-lg flex-shrink-0 transition-colors"
                          title="Remove position">
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Relationship type selector between this and next position */}
                    {idx < positions.length - 1 && (
                      <div className="flex items-center gap-3 py-2 pl-24 pr-10">
                        <div className="flex flex-col items-center mr-1">
                          <div className="w-px h-2 bg-slate-300" />
                          <span className="text-slate-400 text-base">↓</span>
                          <div className="w-px h-2 bg-slate-300" />
                        </div>
                        <select
                          value={pos.relationship_type_to_next}
                          onChange={e => updatePosition(idx, 'relationship_type_to_next', e.target.value)}
                          className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-teal-50 text-teal-800 font-mono"
                        >
                          <option value="">Select relationship type…</option>
                          {relTypes.map(rt => (
                            <option key={rt.id} value={rt.label}>{rt.label} — {rt.display_name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button onClick={addPosition}
                  className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600 font-medium">
                  + Add Position
                </button>
                <button onClick={saveSchema} disabled={savingSchema}
                  className="px-5 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium flex items-center gap-2">
                  {savingSchema && <LoadingSpinner size="sm" />}
                  Save Schema
                </button>
              </div>

              {schemaError && (
                <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {schemaError}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Data tab ───────────────────────────────────────────────────────── */}
      {tab === 'data' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {items.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-3xl mb-2">📋</p>
              <p className="font-medium text-sm">No data rows yet</p>
              <p className="text-xs mt-1">
                {schema.length === 0 ? 'Define the schema first, then use Excel Upload to add data' : 'Use the Excel Upload tab to add data rows'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 w-10">#</th>
                  {schema.map(p => (
                    <th key={p.id} className="text-left px-4 py-2 text-xs font-medium text-slate-500">
                      {coreMap[p.core_id] || `Position ${p.position_number}`}
                    </th>
                  ))}
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, idx) => (
                  <tr key={item.id} className={item.status === 'INACTIVE' ? 'opacity-40' : ''}>
                    <td className="px-4 py-2 text-slate-400 text-xs">{idx + 1}</td>
                    {schema.map(p => {
                      const pos = item.positions.find(ip => ip.position_number === p.position_number)
                      const label = pos ? (itemValueMap[pos.core_data_item_id] || pos.core_data_item_id.slice(0, 8) + '…') : '—'
                      return (
                        <td key={p.id} className="px-4 py-2 text-slate-800">{label}</td>
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

      {/* ── Excel Upload tab ───────────────────────────────────────────────── */}
      {tab === 'upload' && (
        <div className="max-w-lg">
          {schema.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-800">
              ⚠️ Define the schema first before uploading data.
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm text-blue-800">
            <p className="font-medium mb-1">Excel format</p>
            <p>One column header per schema position, named <strong>exactly</strong> after the Core name. Values must match English values in Cosh exactly.</p>
            {schema.length > 0 && (
              <p className="mt-2 font-mono text-xs bg-blue-100 px-2 py-1 rounded">
                Expected columns: {schema.map(p => coreMap[p.core_id] || `Position ${p.position_number}`).join(' | ')}
              </p>
            )}
          </div>

          <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-8 text-center">
            <input type="file" accept=".xlsx,.xls"
              onChange={e => setUploadFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100" />
          </div>

          {uploadFile && (
            <div className="mt-4">
              <p className="text-sm text-slate-600 mb-2">Selected: <strong>{uploadFile.name}</strong></p>
              <button onClick={uploadExcel} disabled={uploading || schema.length === 0}
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
    </div>
  )
}
