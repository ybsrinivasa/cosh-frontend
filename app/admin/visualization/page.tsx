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
  // Number of rows that produced this edge (Connect-mode only). 1 for
  // slice-mode edges and any Connect edge that came from a single row.
  weight?: number
  // Rows that produced this edge — populated by /viz/connect-slice. Each
  // entry is a ConnectDataItem.id; the frontend can look up its details
  // later for the click-drill-down view.
  row_ids?: string[]
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
        // Same proportions as the original Phase 3 sizing that the
        // user said felt right.
        val: n.node_kind === 'hub' ? 20 : (n.group === 'filter1' ? 10 : 4),
        color: coreColour.get(n.core_id) || '#888',
      })),
      links: slice.edges.map(e => {
        // Edge label for tooltips: show the Connect name (or rel_type for
        // non-IN_ROW edges from slice mode). The old per-position labelling
        // was meaningful when each edge was a hub→item spoke; in the new
        // Full Mode every Connect-mode edge is item↔item so the Connect
        // name is the right summary.
        const label = e.rel_type === 'IN_ROW'
          ? (e.connect_name || 'IN_ROW')
          : e.rel_type
        return {
          source: e.source,
          target: e.target,
          rel_type: e.rel_type,
          connect_name: e.connect_name,
          weight: e.weight ?? 1,
          row_ids: e.row_ids,
          label,
        }
      }),
    }
  }, [slice])

  // Colour legend entries — one per unique Core represented in the slice,
  // with its colour from the same palette mapping the canvas uses and a
  // count so the user can see at a glance which Cores dominate the view.
  const legend = useMemo(() => {
    if (!slice) return [] as { coreName: string; color: string; count: number }[]
    const seen = new Map<string, { coreName: string; color: string; count: number }>()
    for (const n of graphData.nodes as any[]) {
      const key = n.core_name || n.core_id
      const existing = seen.get(key)
      if (existing) {
        existing.count += 1
      } else {
        seen.set(key, { coreName: n.core_name || 'Unknown', color: n.color, count: 1 })
      }
    }
    return Array.from(seen.values()).sort((a, b) => b.count - a.count)
  }, [slice, graphData])

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
      // Don't let edge labels intercept drag/click — keep the underlying
      // node spheres as the only raycast targets.
      sprite.raycast = () => {}
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

  // (Tried always-visible node label sprites here twice — even with
  // nodeThreeObjectExtend and sprite.raycast=noop, react-force-graph-3d
  // 1.29's DragControls binding breaks when nodes carry custom three
  // objects. Drag survival outranks label visibility, so we fall back
  // to HTML overlay labels — computed below.)

  // Tune the force-directed layout when a slice loads. Modest
  // repulsion + slightly longer edges spread the nodes out enough
  // to grab individual ones without overwhelming the simulation.
  // (Earlier iterations cranked these much higher + added a collide
  // force + auto zoomToFit — and node drag stopped working. Keeping
  // the defaults light keeps drag responsive.)
  //
  // Then call fg.refresh() on the next tick to force a full object
  // rebuild. Without this, DragControls is initialised BEFORE every
  // node has its __threeObj sphere assigned, so the controls bind to
  // a partial (or empty) list and drag silently doesn't work on the
  // FIRST Visualise click. After refresh(), the lib re-runs its update
  // pipeline with all meshes in place and DragControls rebinds correctly.
  useEffect(() => {
    if (!slice || !fgRef.current) return
    const fg = fgRef.current
    try {
      fg.d3Force('charge').strength(-200)
      fg.d3Force('link').distance(60)
      fg.d3ReheatSimulation()
    } catch {}
    // Refresh twice: the first call rebuilds three.js objects after the
    // initial render so DragControls binds to fully-formed node meshes
    // (without this, the FIRST Visualise click leaves drag dead). The
    // second call is belt-and-suspenders for slower machines / slices
    // where mesh assignment lags past 250ms. Multiple refresh() calls
    // are idempotent in the lib — the second one is a no-op if the
    // scene is already settled.
    const t1 = setTimeout(() => { try { fg.refresh() } catch {} }, 250)
    const t2 = setTimeout(() => { try { fg.refresh() } catch {} }, 700)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [slice])

  // ── Always-visible HTML-overlay node labels ──────────────────────────────
  // Sprite-based labels (three.js SpriteText set via nodeThreeObject) break
  // DragControls in react-force-graph-3d 1.29 — so labels live in a sibling
  // DOM layer that's positioned per-frame using the lib's screen projector.
  // pointer-events:none keeps drag/click reaching the canvas underneath.
  const labelLayerRef = useRef<HTMLDivElement | null>(null)
  // Above this node count the overlay labels stop being readable — they
  // overlap into clouds of text. Hide them; rely on the colour legend +
  // hover tooltip (`nodeLabel="name"` on the ForceGraph3D) for context.
  const NODE_LABEL_LIMIT = 30
  useEffect(() => {
    if (!slice || !fgRef.current || !labelLayerRef.current) return
    if ((slice.nodes?.length ?? 0) > NODE_LABEL_LIMIT) {
      labelLayerRef.current.innerHTML = ''
      return
    }
    const fg = fgRef.current
    const layer = labelLayerRef.current
    layer.innerHTML = ''

    type LabelEntry = { node: any; el: HTMLDivElement }
    const entries: LabelEntry[] = []
    for (const n of (slice.nodes as VizNode[])) {
      // Hub nodes show the Connect name; ordinary items show their label.
      // Skip empty labels defensively.
      const text = (n.node_kind === 'hub' ? n.core_name : n.label) || ''
      if (!text) continue
      const el = document.createElement('div')
      el.textContent = text.length > 28 ? text.slice(0, 27) + '…' : text
      el.title = text
      el.className =
        'absolute select-none pointer-events-none px-1.5 py-0.5 rounded ' +
        'text-[10px] font-medium tracking-wide leading-none ' +
        (n.node_kind === 'hub'
          ? 'bg-amber-900/50 text-amber-100 border border-amber-500/30'
          : 'bg-black/55 text-white/90 border border-white/10')
      el.style.transform = 'translate(-50%, -50%)'
      el.style.whiteSpace = 'nowrap'
      el.style.willChange = 'transform, left, top'
      el.style.left = '-9999px'
      el.style.top = '-9999px'
      layer.appendChild(el)
      entries.push({ node: n, el })
    }

    // Position labels on every animation frame. Reading positions off the
    // node objects (`n.x/y/z` populated by the simulation each tick) and
    // projecting via the lib's helper means we follow drag, rotation,
    // zoom, and re-heat without any extra wiring.
    let raf = 0
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      for (const { node, el } of entries) {
        const x = node.x, y = node.y, z = node.z
        // Earlier versions of this loop scheduled requestAnimationFrame
        // INSIDE this branch (and again at the end of tick), which
        // multiplied the number of pending frames whenever any node had
        // a not-yet-positioned coordinate. That snowballed within seconds
        // and starved the canvas thread — surfacing as "drag broken" plus
        // an eventual "Page Unresponsive" dialog. The correct shape is:
        // do the per-node work, then schedule ONE next frame at the end.
        if (x == null || y == null) {
          el.style.opacity = '0'
          continue
        }
        try {
          const p = fg.graph2ScreenCoords(x, y, z ?? 0)
          if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
            el.style.opacity = '0'
          } else {
            el.style.opacity = '1'
            el.style.left = `${p.x}px`
            el.style.top = `${p.y}px`
          }
        } catch {
          el.style.opacity = '0'
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      layer.innerHTML = ''
    }
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

      {/* HTML label overlay — must sit above the canvas but be transparent
          to pointer events so drag/rotate go through to the WebGL layer. */}
      {slice && (
        <div
          ref={labelLayerRef}
          className="absolute inset-0 pointer-events-none z-[5]"
          aria-hidden="true"
        />
      )}

      {/* Colour legend — top-right floating panel. Shows each Core's name
          with its node colour. Most useful when adaptive labels hide the
          text overlay because the graph is dense.
          pointer-events-none is critical: without it the panel intercepts
          drag attempts that begin (or land) in the top-right region of the
          canvas. The legend isn't interactive, so blocking pointer events
          on it loses nothing. */}
      {slice && legend.length > 0 && (
        <div className="absolute top-4 right-4 z-10 bg-[#0d1418]/90 backdrop-blur-md
                        border border-white/10 rounded-2xl p-3 shadow-2xl text-white
                        max-h-[50vh] overflow-y-auto text-xs min-w-[180px]
                        pointer-events-none">
          <div className="font-semibold text-green-300 mb-2 tracking-wide">Legend</div>
          <div className="space-y-1.5">
            {legend.map(({ coreName, color, count }) => (
              <div key={coreName} className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-full shrink-0 border border-white/20"
                  style={{ background: color }}
                />
                <span className="text-white/85 flex-1 truncate" title={coreName}>{coreName}</span>
                <span className="text-white/40">{count}</span>
              </div>
            ))}
          </div>
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
          // Static linkWidth (was an accessor function returning a log-
          // scaled value derived from edge weight). Function accessors on
          // link props in react-force-graph-3d 1.29 appear to silently
          // break DragControls binding — same family of bug as the curve
          // accessors we already pulled. Reverting to static restores
          // drag. Density signal moved to the hover tooltip via linkLabel
          // ("Pest Diagnosis · 50 rows"), which is good enough for now.
          linkWidth={1.2}
          linkOpacity={0.85}
          // Note: the per-edge curvature/rotation accessors that powered
          // the 3D fan were removed 2026-06-15. They forced every edge
          // through three.js curve geometry (rebuilt per frame), which
          // starved DragControls of pointer events and broke node drag.
          // With per-(pair, Connect) dedup in place, fans only fired in a
          // rare case anyway; thickness via weight is the kept density
          // signal. If we revisit the fan, do it as a click-to-explode
          // gesture on a single pair — not as a default render mode.
          linkLabel={(l: any) => {
            // Tooltip shows the Connect name + a row count when weight > 1
            // so users can SEE how strong a relationship is on hover.
            const base = l.label || ''
            const w = l.weight ?? 1
            return w > 1 ? `${base}  ·  ${w} rows` : base
          }}
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
          // Canonical react-force-graph-3d drag: pin the node where
          // dropped. Do NOT call d3ReheatSimulation() inside onNodeDrag
          // — it disturbs DragControls' internal state mid-drag and
          // breaks drag entirely. The lib already calls d3AlphaTarget
          // on each drag tick, which is enough to keep neighbours
          // rearranging while you pull a node.
          onNodeDragEnd={(node: any) => {
            node.fx = node.x
            node.fy = node.y
            node.fz = node.z
          }}
          warmupTicks={50}
          // Let the simulation cool down after layout converges instead
          // of running forever. With Infinity, the per-frame force solve
          // + label overlay + particle animations kept the GPU/CPU pinned
          // on a long demo tab and caused hangs (Karnataka Agri Dept demo,
          // 2026-06-15). 400 ticks lets nodes settle visibly; drag re-heats
          // the simulation automatically when the user grabs a node.
          cooldownTicks={400}
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
