'use client'
/**
 * Cosh Knowledge Graph — 3D Visualization
 *
 * Two operating modes:
 *   Slice mode (default): pick two filters (or just one). Renders the
 *     subgraph of Core items matching them via /viz/slice. Each edge is
 *     a real Neo4J CORE→CORE relationship.
 *   Connect mode: pick a single Connect (and optionally an anchor item).
 *     Renders a hub-and-spoke graph via /viz/connect-slice — one hub per
 *     ConnectDataItem, spokes out to every Core item touched by that
 *     row, including those reached through CONNECT-type positions
 *     (e.g., Pest Diagnosis touches Symptom + Pest + PestStage + Crop +
 *     CropStage in 3 schema positions). This is the mode that unlocks
 *     multi-position Connects which are invisible to Neo4J's CORE→CORE
 *     edges.
 *
 * Other goodies:
 *   - Click any item node → camera flies in, side panel shows "Explore
 *     from here" which makes that item the new Filter 1 and re-renders.
 *   - Edges show their relationship type as in-canvas SpriteText labels
 *     and on hover.
 *   - Hub nodes are visually larger so the user can tell rows from items.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import api from '@/lib/api'

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false })

// ── Types matching the backend Pydantic schemas ──────────────────────────────

type FilterType = 'core' | 'item'
type Mode = 'slice' | 'connect'

interface CoreOption { id: string; name: string; active_item_count: number }
interface ConnectOption { id: string; name: string; active_item_count: number; position_count: number }
interface SearchHit { id: string; english_value: string; core_id: string; core_name: string }
interface VizNode {
  id: string
  label: string
  core_id: string
  core_name: string
  group: 'filter1' | 'filter2'
  node_kind: 'item' | 'hub'
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

// ── Stable per-Core / per-Connect-hub colour palette ────────────────────────
const PALETTE = [
  '#4ade80', '#60a5fa', '#fbbf24', '#f472b6', '#a78bfa',
  '#34d399', '#fb923c', '#22d3ee', '#f87171', '#c084fc',
  '#84cc16', '#e879f9', '#facc15', '#38bdf8', '#fb7185',
]
function colourMap(ids: string[]): Map<string, string> {
  const m = new Map<string, string>()
  let i = 0
  for (const id of ids) if (!m.has(id)) { m.set(id, PALETTE[i % PALETTE.length]); i++ }
  return m
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function VisualizationPage() {
  const [mode, setMode] = useState<Mode>('slice')

  // Slice mode
  const [f1Core, setF1Core] = useState<CoreOption | null>(null)
  const [f1Item, setF1Item] = useState<SearchHit | null>(null)
  const [f2Core, setF2Core] = useState<CoreOption | null>(null)
  const [f2Item, setF2Item] = useState<SearchHit | null>(null)

  // Connect mode
  const [pickedConnect, setPickedConnect] = useState<ConnectOption | null>(null)
  const [anchorItem, setAnchorItem] = useState<SearchHit | null>(null)
  // For the anchor autocomplete we want to search across all Cores
  // (because the user knows the value, not the Core).
  const [anchorAllCoresMode, setAnchorAllCoresMode] = useState(true)

  // Dropdown data
  const [allCores, setAllCores] = useState<CoreOption[]>([])
  const [cascadedCores, setCascadedCores] = useState<CoreOption[]>([])
  const [allConnects, setAllConnects] = useState<ConnectOption[]>([])

  // Render state
  const [slice, setSlice] = useState<SliceOut | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedNode, setFocusedNode] = useState<VizNode | null>(null)

  // Lazy import three-spritetext — used for in-canvas edge labels only.
  // (Bloom + sprite-on-node were tried in a previous iteration and made
  // nodes feel smaller because labels expanded the camera's bounding box
  // and the label meshes intercepted node-drag clicks. Particles and the
  // smarter Connect-mode edge labels are the keepers from Phase 4.)
  const [SpriteText, setSpriteText] = useState<any>(null)
  useEffect(() => {
    let cancelled = false
    import('three-spritetext').then(mod => {
      if (!cancelled) setSpriteText(() => mod.default)
    })
    return () => { cancelled = true }
  }, [])

  const fgRef = useRef<any>(null)

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    api.get<{ cores: CoreOption[] }>('/viz/filter-options')
      .then(r => setAllCores(r.data.cores))
      .catch(() => setError('Failed to load Cores'))
    api.get<{ connects: ConnectOption[] }>('/viz/connects-list')
      .then(r => setAllConnects(r.data.connects))
      .catch(() => {})
  }, [])

  // ── Cascade: refresh secondary Core list whenever the primary changes ─────
  useEffect(() => {
    if (mode !== 'slice') return
    if (!f1Core && !f1Item) { setCascadedCores([]); return }
    const params = f1Item
      ? { connected_to_item: f1Item.id }
      : { connected_to_core: f1Core!.id }
    api.get<{ cores: CoreOption[] }>('/viz/filter-options', { params })
      .then(r => setCascadedCores(r.data.cores))
      .catch(() => setCascadedCores([]))
    setF2Core(null)
    setF2Item(null)
  }, [mode, f1Core, f1Item])

  // ── Validation: when can we render? ───────────────────────────────────────
  const canRun = mode === 'slice'
    ? Boolean(f1Core || f1Item)
    : Boolean(pickedConnect)

  // ── Fetch + render ────────────────────────────────────────────────────────
  const visualise = useCallback(async () => {
    if (!canRun) return
    setLoading(true); setError(null); setFocusedNode(null)
    try {
      if (mode === 'slice') {
        const params: Record<string, string> = {
          filter1_type: f1Item ? 'item' : 'core',
          filter1_id:   f1Item ? f1Item.id : f1Core!.id,
        }
        if (f2Core || f2Item) {
          params.filter2_type = f2Item ? 'item' : 'core'
          params.filter2_id   = f2Item ? f2Item.id : f2Core!.id
        }
        const { data } = await api.get<SliceOut>('/viz/slice', { params })
        setSlice(data)
      } else {
        const params: Record<string, string> = { connect_id: pickedConnect!.id }
        if (anchorItem) params.anchor_id = anchorItem.id
        const { data } = await api.get<SliceOut>('/viz/connect-slice', { params })
        setSlice(data)
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load slice')
      setSlice(null)
    } finally {
      setLoading(false)
    }
  }, [canRun, mode, f1Core, f1Item, f2Core, f2Item, pickedConnect, anchorItem])

  // ── Graph data + colour palette + node sizing ─────────────────────────────
  const graphData = useMemo(() => {
    if (!slice) return { nodes: [], links: [] }
    const coreColour = colourMap(slice.nodes.map(n => n.core_id))
    const nodeById = new Map(slice.nodes.map(n => [n.id, n]))
    return {
      nodes: slice.nodes.map(n => ({
        ...n,
        // The canvas uses `name` for tooltips and `val` for sizing.
        name: n.node_kind === 'hub'
          ? `${n.label}  ·  ${n.core_name} (row)`
          : `${n.label}  ·  ${n.core_name}`,
        // Tuned-down sphere sizes that pair with the collide-force above.
        // Too big + tight collide = chaotic; this combo settles cleanly.
        val: n.node_kind === 'hub' ? 18 : (n.group === 'filter1' ? 14 : 8),
        color: coreColour.get(n.core_id) || '#888',
      })),
      links: slice.edges.map(e => {
        const target = nodeById.get(e.target)
        const source = nodeById.get(e.source)
        // Smarter labels:
        //   - IN_ROW (Connect mode spoke): label with the target's Core
        //     name. Repeating the Connect name on every spoke is noise;
        //     the Core name ("Symptom", "Specific Names") tells you
        //     which slot of the row that spoke fills.
        //   - Otherwise: show the relationship type (IS_A, AFFECTS, …).
        let label = e.rel_type
        if (e.rel_type === 'IN_ROW') {
          const itemSide = target?.node_kind === 'item' ? target : source
          label = itemSide?.core_name || e.connect_name || ''
        }
        return {
          source: e.source,
          target: e.target,
          rel_type: e.rel_type,
          connect_name: e.connect_name,
          label,
        }
      }),
    }
  }, [slice])

  // ── Click handler: fly + maybe expand ─────────────────────────────────────
  const handleNodeClick = useCallback((node: any) => {
    setFocusedNode(node)
    if (!fgRef.current) return
    const distance = 80
    const dist = Math.hypot(node.x, node.y, node.z) || 1
    const ratio = 1 + distance / dist
    fgRef.current.cameraPosition(
      { x: node.x * ratio, y: node.y * ratio, z: node.z * ratio },
      node,
      1500
    )
  }, [])

  const exploreFromNode = useCallback((node: VizNode) => {
    if (node.node_kind === 'hub') return
    setMode('slice')
    setF1Core(null)
    setF1Item({
      id: node.id, english_value: node.label,
      core_id: node.core_id, core_name: node.core_name,
    })
    setF2Core(null); setF2Item(null)
    setFocusedNode(null)
    // visualise() will be triggered via the user's next click on Visualise.
    // Auto-triggering is tempting but feels jumpy — leave the button.
  }, [])

  // ── Edge text sprite (built once SpriteText loads) ────────────────────────
  const linkThreeObject = useMemo(() => {
    if (!SpriteText) return undefined
    return (link: any) => {
      const sprite = new SpriteText(link.label || '')
      sprite.color = 'rgba(230, 240, 255, 0.92)'
      sprite.textHeight = 3.2
      sprite.fontWeight = '600'
      sprite.backgroundColor = 'rgba(10, 14, 18, 0.7)'
      sprite.padding = 2
      sprite.borderRadius = 3
      return sprite
    }
  }, [SpriteText])

  const linkPositionUpdate = useCallback((sprite: any, { start, end }: any) => {
    if (!sprite) return
    const mid = {
      x: start.x + (end.x - start.x) / 2,
      y: start.y + (end.y - start.y) / 2,
      z: start.z + (end.z - start.z) / 2,
    }
    Object.assign(sprite.position, mid)
  }, [])

  // When a slice loads, tune the force-directed layout for the
  // "Bloom-like" spread: strong repulsion + long edges + a collision
  // force that physically prevents spheres from overlapping. The result
  // is a constellation you can read at a glance and grab individual
  // nodes out of.
  useEffect(() => {
    if (!slice || !fgRef.current) return
    const fg = fgRef.current
    let cancelled = false
    ;(async () => {
      try {
        // Strong repulsion. -30 (default) keeps Pest Diagnosis's 27
        // hubs huddled around shared items; -1500 forces a proper
        // spread.
        fg.d3Force('charge').strength(-1500)
        // Longer edge "spring" + weaker pull. Lets shared items still
        // attract their hubs without dragging them into a clump.
        fg.d3Force('link').distance(120)
        fg.d3Force('link').strength(0.25)
        // Collision force — hard-stops spheres from overlapping. d3-
        // force-3d is already a transitive dep of react-force-graph-3d.
        const { forceCollide } = await import('d3-force-3d')
        if (cancelled) return
        fg.d3Force('collide', forceCollide(24))
        // Reheat so new forces apply to already-positioned nodes.
        fg.d3ReheatSimulation()
      } catch {}
    })()
    const t = setTimeout(() => {
      try { fg.zoomToFit(1000, 80) } catch {}
    }, 1500)
    return () => { cancelled = true; clearTimeout(t) }
  }, [slice])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#05080a]">
      {/* Filter panel */}
      <div className="absolute top-4 left-4 z-10 w-80 bg-[#0d1418]/90 backdrop-blur-md
                      border border-white/10 rounded-2xl p-5 shadow-2xl text-white
                      max-h-[calc(100vh-2rem)] overflow-y-auto">
        <h2 className="text-sm font-semibold tracking-wide text-green-300 mb-3">
          Knowledge Graph Slice
        </h2>

        {/* Mode toggle */}
        <div className="flex bg-[#1a2228] rounded-lg p-1 mb-5 text-xs">
          <button
            onClick={() => setMode('slice')}
            className={`flex-1 py-1.5 rounded-md transition-colors ${
              mode === 'slice' ? 'bg-green-600 text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            By Cores / Items
          </button>
          <button
            onClick={() => setMode('connect')}
            className={`flex-1 py-1.5 rounded-md transition-colors ${
              mode === 'connect' ? 'bg-green-600 text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            By Connect
          </button>
        </div>

        {mode === 'slice' && (
          <>
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
                  placeholder="(optional) narrow to one item"
                />
              )}
            </div>

            <div className="mb-5">
              <label className="block text-xs uppercase tracking-wider text-white/50 mb-1.5">
                Connected to <span className="text-white/30 normal-case">(optional)</span>
              </label>
              <CoreSelect
                value={f2Core?.id || ''}
                options={cascadedCores}
                onChange={cid => { setF2Core(cascadedCores.find(c => c.id === cid) || null); setF2Item(null) }}
                placeholder={f1Core || f1Item ? 'Any (leave blank to show all neighbours)' : '— pick a primary first —'}
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
          </>
        )}

        {mode === 'connect' && (
          <>
            <div className="mb-5">
              <label className="block text-xs uppercase tracking-wider text-white/50 mb-1.5">
                Connect
              </label>
              <ConnectSelect
                value={pickedConnect?.id || ''}
                options={allConnects}
                onChange={cid => { setPickedConnect(allConnects.find(c => c.id === cid) || null); setAnchorItem(null) }}
                placeholder="Pick a Connect"
              />
              {pickedConnect && (
                <p className="text-[10px] text-white/40 mt-1.5">
                  {pickedConnect.active_item_count.toLocaleString()} rows · {pickedConnect.position_count} positions
                </p>
              )}
            </div>

            <div className="mb-5">
              <label className="block text-xs uppercase tracking-wider text-white/50 mb-1.5">
                Anchor on <span className="text-white/30 normal-case">(optional — e.g., "Tomato")</span>
              </label>
              <ItemAutocomplete
                coreId={null}        // search across all Cores
                value={anchorItem}
                onChange={setAnchorItem}
                placeholder={pickedConnect ? 'Type 2+ chars to search' : '— pick a Connect first —'}
                disabled={!pickedConnect}
              />
            </div>
          </>
        )}

        <button
          onClick={visualise}
          disabled={!canRun || loading}
          className="w-full bg-green-600 hover:bg-green-500 disabled:bg-white/10
                     disabled:text-white/30 text-white font-medium py-2 rounded-lg
                     transition-colors text-sm"
        >
          {loading ? 'Loading…' : 'Visualise →'}
        </button>

        {error && <p className="text-red-400 text-xs mt-3">{error}</p>}

        {slice && (
          <div className="mt-4 pt-4 border-t border-white/10 text-xs text-white/60 space-y-0.5">
            <p>
              <span className="text-white/80">{slice.nodes.length}</span> nodes ·{' '}
              <span className="text-white/80">{slice.edges.length}</span> edges
            </p>
            {slice.truncated && (
              <p className="text-amber-300/80">Result capped — narrow the filters to see more.</p>
            )}
          </div>
        )}
      </div>

      {/* Node detail panel */}
      {focusedNode && (
        <div className="absolute top-4 right-4 z-10 w-72 bg-[#0d1418]/90 backdrop-blur-md
                        border border-white/10 rounded-2xl p-5 shadow-2xl text-white">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-sm font-semibold truncate" title={focusedNode.label}>
              {focusedNode.label}
            </h3>
            <button onClick={() => setFocusedNode(null)} className="text-white/40 hover:text-white text-lg leading-none">×</button>
          </div>
          <p className="text-xs text-white/60 mb-3">
            {focusedNode.core_name}
            {focusedNode.node_kind === 'hub' && <span className="ml-1 text-amber-300/70">· connect row</span>}
          </p>
          {focusedNode.node_kind === 'item' && (
            <button
              onClick={() => exploreFromNode(focusedNode)}
              className="w-full bg-green-600/90 hover:bg-green-500 text-white text-xs
                         font-medium py-2 rounded-lg transition-colors"
            >
              Explore from here →
            </button>
          )}
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
          nodeResolution={20}
          linkColor={() => 'rgba(160, 200, 240, 0.45)'}
          linkWidth={1.2}
          linkOpacity={0.85}
          linkLabel={(l: any) => l.label || ''}
          // In-canvas edge labels via SpriteText. Only render them when
          // the graph is small enough that 135+ floating texts don't
          // smother the scene. Threshold tuned by eye on local data.
          linkThreeObject={(graphData.links.length <= 40 && linkThreeObject) || undefined}
          linkThreeObjectExtend={true}
          linkPositionUpdate={linkPositionUpdate}
          // Edge particles — small dots flowing along each edge for the
          // "data feels alive" effect. Doesn't interfere with node drag.
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={0.006}
          linkDirectionalParticleWidth={2.5}
          linkDirectionalParticleColor={() => 'rgba(160, 240, 200, 0.9)'}
          enableNodeDrag={true}
          enablePointerInteraction={true}
          onNodeClick={handleNodeClick}
          // Explicit drag handlers: set fx/fy/fz during drag so the node
          // follows the cursor, and KEEP them set on release so the node
          // pins where dropped (default lib behaviour varies by version
          // — explicit is safer). The other nodes' physics-driven
          // positions rearrange around the pinned one. That's the Bloom
          // "pull-and-stick" feel.
          onNodeDrag={(node: any) => {
            node.fx = node.x
            node.fy = node.y
            node.fz = node.z
          }}
          onNodeDragEnd={(node: any) => {
            node.fx = node.x
            node.fy = node.y
            node.fz = node.z
          }}
          warmupTicks={50}
          cooldownTicks={150}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm pointer-events-none">
          Pick a filter (or a Connect) and click Visualise.
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

function ConnectSelect({
  value, options, onChange, placeholder, disabled,
}: {
  value: string
  options: ConnectOption[]
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
          {c.name} · {c.active_item_count.toLocaleString()} rows
        </option>
      ))}
    </select>
  )
}

function ItemAutocomplete({
  coreId, value, onChange, placeholder, disabled,
}: {
  coreId: string | null
  value: SearchHit | null
  onChange: (h: SearchHit | null) => void
  placeholder: string
  disabled?: boolean
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!q || q.length < 2) { setHits([]); return }
    let active = true
    const t = setTimeout(() => {
      const params: any = { q, limit: 10 }
      if (coreId) params.core_id = coreId
      api.get<{ hits: SearchHit[] }>('/viz/search', { params })
        .then(r => { if (active) setHits(r.data.hits) })
        .catch(() => active && setHits([]))
    }, 200)
    return () => { active = false; clearTimeout(t) }
  }, [q, coreId])

  if (value) {
    return (
      <div className="mt-2 flex items-center justify-between bg-green-900/30 border border-green-700/40
                      rounded-lg px-3 py-1.5 text-xs text-green-200">
        <span className="truncate">
          {value.english_value}
          {!coreId && <span className="text-green-400/60 ml-1">· {value.core_name}</span>}
        </span>
        <button onClick={() => { onChange(null); setQ('') }} className="text-green-400 hover:text-green-100 ml-2">×</button>
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
        disabled={disabled}
        placeholder={placeholder}
        className="w-full bg-[#1a2228] border border-white/10 rounded-lg px-3 py-1.5 text-xs
                   text-white placeholder-white/30 disabled:opacity-40
                   focus:outline-none focus:border-green-500/60"
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
              {!coreId && <span className="text-white/40 ml-1.5">· {h.core_name}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
