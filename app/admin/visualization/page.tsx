'use client'
/**
 * Cosh Knowledge Graph — 3D Visualization
 *
 * Two-level cascading filter feeds /viz/slice; result renders in a
 * full-bleed react-force-graph-3d canvas. Dark-theme baseline; Phase 4
 * will add bloom-shader edges, smooth camera flights, and a curated
 * "demo mode" starter view.
 *
 * SSR is disabled for the canvas — three.js touches window on import.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import api from '@/lib/api'

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false })

// ── Types matching the backend Pydantic schemas ──────────────────────────────

type FilterType = 'core' | 'item'

interface CoreOption { id: string; name: string; active_item_count: number }
interface SearchHit { id: string; english_value: string; core_id: string; core_name: string }
interface VizNode {
  id: string
  label: string
  core_id: string
  core_name: string
  group: 'filter1' | 'filter2'
}
interface VizEdge {
  source: string
  target: string
  rel_type: string
  connect_id: string
  connect_name?: string
}
interface SliceOut {
  nodes: VizNode[]
  edges: VizEdge[]
  truncated: boolean
}

// ── Stable per-Core colour palette ───────────────────────────────────────────
// First-seen Core gets the first slot, etc. Deterministic across renders for
// the same data set; not session-stable across DBs (which is fine).
const PALETTE = [
  '#4ade80', '#60a5fa', '#fbbf24', '#f472b6', '#a78bfa',
  '#34d399', '#fb923c', '#22d3ee', '#f87171', '#c084fc',
  '#84cc16', '#e879f9', '#facc15', '#38bdf8', '#fb7185',
]
function colourMap(coreIds: string[]): Map<string, string> {
  const m = new Map<string, string>()
  let i = 0
  for (const cid of coreIds) {
    if (!m.has(cid)) { m.set(cid, PALETTE[i % PALETTE.length]); i++ }
  }
  return m
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function VisualizationPage() {
  // Filter 1
  const [f1Core, setF1Core] = useState<CoreOption | null>(null)
  const [f1Item, setF1Item] = useState<SearchHit | null>(null)
  // Filter 2 (cascaded — only Cores reachable from filter 1)
  const [f2Core, setF2Core] = useState<CoreOption | null>(null)
  const [f2Item, setF2Item] = useState<SearchHit | null>(null)

  const [allCores, setAllCores] = useState<CoreOption[]>([])
  const [cascadedCores, setCascadedCores] = useState<CoreOption[]>([])

  const [slice, setSlice] = useState<SliceOut | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedNode, setFocusedNode] = useState<VizNode | null>(null)

  const fgRef = useRef<any>(null)

  // ── Bootstrap: load all Cores once for the primary dropdown ────────────────
  useEffect(() => {
    api.get<{ cores: CoreOption[] }>('/viz/filter-options')
      .then(r => setAllCores(r.data.cores))
      .catch(() => setError('Failed to load Cores'))
  }, [])

  // ── Cascade: refresh secondary Core list whenever the primary changes ─────
  useEffect(() => {
    if (!f1Core && !f1Item) { setCascadedCores([]); return }
    const params = f1Item
      ? { connected_to_item: f1Item.id }
      : { connected_to_core: f1Core!.id }
    api.get<{ cores: CoreOption[] }>('/viz/filter-options', { params })
      .then(r => setCascadedCores(r.data.cores))
      .catch(() => setCascadedCores([]))
    // Reset secondary picks when primary changes — they may no longer apply.
    setF2Core(null)
    setF2Item(null)
  }, [f1Core, f1Item])

  // ── Disable visualise until both sides have a pick ────────────────────────
  const canRun = (f1Core || f1Item) && (f2Core || f2Item)

  const visualise = useCallback(async () => {
    if (!canRun) return
    setLoading(true); setError(null); setFocusedNode(null)
    try {
      const { data } = await api.get<SliceOut>('/viz/slice', {
        params: {
          filter1_type: f1Item ? 'item' : 'core' as FilterType,
          filter1_id:   f1Item ? f1Item.id : f1Core!.id,
          filter2_type: f2Item ? 'item' : 'core' as FilterType,
          filter2_id:   f2Item ? f2Item.id : f2Core!.id,
        },
      })
      setSlice(data)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load slice')
      setSlice(null)
    } finally {
      setLoading(false)
    }
  }, [canRun, f1Core, f1Item, f2Core, f2Item])

  // ── Memoised graph data + colour palette + node sizing ─────────────────────
  const { graphData, coreColour } = useMemo(() => {
    if (!slice) return { graphData: { nodes: [], links: [] }, coreColour: new Map() }
    const coreColour = colourMap(slice.nodes.map(n => n.core_id))
    return {
      graphData: {
        nodes: slice.nodes.map(n => ({
          ...n,
          // The canvas wants `name` for tooltips and `val` for size.
          name: `${n.label} · ${n.core_name}`,
          val: n.group === 'filter1' ? 10 : 4,
          color: coreColour.get(n.core_id) || '#888',
        })),
        links: slice.edges.map(e => ({
          source: e.source,
          target: e.target,
          rel_type: e.rel_type,
          connect_name: e.connect_name,
        })),
      },
      coreColour,
    }
  }, [slice])

  // ── Click a node: fly the camera in and surface details ───────────────────
  const handleNodeClick = useCallback((node: any) => {
    setFocusedNode(node)
    if (!fgRef.current) return
    // Distance offset from the node — keeps it framed pleasantly.
    const distance = 80
    const dist = Math.hypot(node.x, node.y, node.z) || 1
    const ratio = 1 + distance / dist
    fgRef.current.cameraPosition(
      { x: node.x * ratio, y: node.y * ratio, z: node.z * ratio },
      node,
      1500
    )
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#05080a]">
      {/* Filter panel — fixed top-left */}
      <div className="absolute top-4 left-4 z-10 w-72 bg-[#0d1418]/90 backdrop-blur-md
                      border border-white/10 rounded-2xl p-5 shadow-2xl text-white">
        <h2 className="text-sm font-semibold tracking-wide text-green-300 mb-4">
          Knowledge Graph Slice
        </h2>

        {/* Filter 1 */}
        <div className="mb-5">
          <label className="block text-xs uppercase tracking-wider text-white/50 mb-1.5">
            Show me
          </label>
          <CoreSelect
            value={f1Core?.id || ''}
            options={allCores}
            onChange={cid => { setF1Core(allCores.find(c => c.id === cid) || null); setF1Item(null) }}
            placeholder="Pick a category"
          />
          {f1Core && (
            <ItemAutocomplete
              coreId={f1Core.id}
              value={f1Item}
              onChange={setF1Item}
              placeholder={`(optional) narrow to one item`}
            />
          )}
        </div>

        {/* Filter 2 (cascaded) */}
        <div className="mb-5">
          <label className="block text-xs uppercase tracking-wider text-white/50 mb-1.5">
            Connected to
          </label>
          <CoreSelect
            value={f2Core?.id || ''}
            options={cascadedCores}
            onChange={cid => { setF2Core(cascadedCores.find(c => c.id === cid) || null); setF2Item(null) }}
            placeholder={f1Core || f1Item ? 'Pick a connected category' : '— pick a primary first —'}
            disabled={!f1Core && !f1Item}
          />
          {f2Core && (
            <ItemAutocomplete
              coreId={f2Core.id}
              value={f2Item}
              onChange={setF2Item}
              placeholder="(optional) narrow to one item"
            />
          )}
        </div>

        <button
          onClick={visualise}
          disabled={!canRun || loading}
          className="w-full bg-green-600 hover:bg-green-500 disabled:bg-white/10
                     disabled:text-white/30 text-white font-medium py-2 rounded-lg
                     transition-colors text-sm"
        >
          {loading ? 'Loading…' : 'Visualise →'}
        </button>

        {error && (
          <p className="text-red-400 text-xs mt-3">{error}</p>
        )}

        {slice && (
          <div className="mt-4 pt-4 border-t border-white/10 text-xs text-white/60 space-y-0.5">
            <p><span className="text-white/80">{slice.nodes.length}</span> nodes · <span className="text-white/80">{slice.edges.length}</span> edges</p>
            {slice.truncated && (
              <p className="text-amber-300/80">Result capped — narrow the filters to see more.</p>
            )}
          </div>
        )}
      </div>

      {/* Node detail panel — top-right when a node is focused */}
      {focusedNode && (
        <div className="absolute top-4 right-4 z-10 w-72 bg-[#0d1418]/90 backdrop-blur-md
                        border border-white/10 rounded-2xl p-5 shadow-2xl text-white">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-sm font-semibold truncate" title={focusedNode.label}>
              {focusedNode.label}
            </h3>
            <button
              onClick={() => setFocusedNode(null)}
              className="text-white/40 hover:text-white text-lg leading-none"
            >×</button>
          </div>
          <p className="text-xs text-white/60 mb-3">{focusedNode.core_name}</p>
          <p className="text-[10px] uppercase tracking-wider text-white/40">{focusedNode.group === 'filter1' ? 'Primary' : 'Connected'}</p>
        </div>
      )}

      {/* The canvas */}
      {slice ? (
        <ForceGraph3D
          ref={fgRef}
          graphData={graphData}
          backgroundColor="#05080a"
          nodeLabel="name"
          nodeColor={(n: any) => n.color}
          nodeVal={(n: any) => n.val}
          nodeOpacity={0.95}
          linkColor={() => 'rgba(180, 200, 220, 0.35)'}
          linkWidth={0.8}
          linkOpacity={0.7}
          linkDirectionalParticles={0}
          enableNodeDrag={true}
          onNodeClick={handleNodeClick}
          warmupTicks={50}
          cooldownTicks={150}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm pointer-events-none">
          Pick a primary category and what it's connected to, then click Visualise.
        </div>
      )}
    </div>
  )
}

// ── Sub-components: dropdowns ────────────────────────────────────────────────

function CoreSelect({
  value, options, onChange, placeholder, disabled,
}: {
  value: string
  options: CoreOption[]
  onChange: (id: string) => void
  placeholder: string
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="w-full bg-[#1a2228] border border-white/10 rounded-lg px-3 py-2 text-sm
                 text-white disabled:opacity-40 focus:outline-none focus:border-green-500/60"
    >
      <option value="">{placeholder}</option>
      {options.map(c => (
        <option key={c.id} value={c.id}>
          {c.name} ({c.active_item_count.toLocaleString()})
        </option>
      ))}
    </select>
  )
}

function ItemAutocomplete({
  coreId, value, onChange, placeholder,
}: {
  coreId: string
  value: SearchHit | null
  onChange: (h: SearchHit | null) => void
  placeholder: string
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!q || q.length < 2) { setHits([]); return }
    let active = true
    const t = setTimeout(() => {
      api.get<{ hits: SearchHit[] }>('/viz/search', { params: { q, core_id: coreId, limit: 10 } })
        .then(r => { if (active) setHits(r.data.hits) })
        .catch(() => active && setHits([]))
    }, 200)
    return () => { active = false; clearTimeout(t) }
  }, [q, coreId])

  if (value) {
    return (
      <div className="mt-2 flex items-center justify-between bg-green-900/30 border border-green-700/40
                      rounded-lg px-3 py-1.5 text-xs text-green-200">
        <span className="truncate">{value.english_value}</span>
        <button
          onClick={() => { onChange(null); setQ('') }}
          className="text-green-400 hover:text-green-100 ml-2"
        >×</button>
      </div>
    )
  }

  return (
    <div className="relative mt-2">
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
        className="w-full bg-[#1a2228] border border-white/10 rounded-lg px-3 py-1.5 text-xs
                   text-white placeholder-white/30 focus:outline-none focus:border-green-500/60"
      />
      {open && hits.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-[#1a2228] border border-white/10 rounded-lg
                        max-h-48 overflow-y-auto shadow-xl">
          {hits.map(h => (
            <li
              key={h.id}
              onMouseDown={() => { onChange(h); setQ(''); setOpen(false) }}
              className="px-3 py-1.5 text-xs text-white/80 hover:bg-green-900/40 cursor-pointer"
            >
              {h.english_value}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
