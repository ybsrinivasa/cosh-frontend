// Minimal ambient typings — d3-force-3d ships without TS defs.
// We only use forceCollide, so a permissive declaration is enough.
declare module 'd3-force-3d' {
  export function forceCollide(radius?: number | ((node: any) => number)): any
  export function forceManyBody(): any
  export function forceLink(): any
}
