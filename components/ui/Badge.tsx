'use client'
const variants: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-500',
  pending: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  partial: 'bg-orange-100 text-orange-700',
  dispatched: 'bg-blue-100 text-blue-700',
  admin: 'bg-purple-100 text-purple-700',
  designer: 'bg-blue-100 text-blue-700',
  stocker: 'bg-green-100 text-green-700',
  reviewer: 'bg-amber-100 text-amber-700',
  text: 'bg-sky-100 text-sky-700',
  media: 'bg-violet-100 text-violet-700',
  expert_validated: 'bg-emerald-100 text-emerald-700',
  machine_generated: 'bg-slate-100 text-slate-500',
  default: 'bg-slate-100 text-slate-600',
}

export default function Badge({ label, variant }: { label: string; variant?: string }) {
  const key = (variant || label).toLowerCase().replace(/\s+/g, '_')
  const cls = variants[key] || variants.default
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}
