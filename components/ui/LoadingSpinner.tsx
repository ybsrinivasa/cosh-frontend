'use client'
export default function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-10 h-10' : 'w-6 h-6'
  return (
    <div className={`${s} border-2 border-slate-200 border-t-green-600 rounded-full animate-spin`} />
  )
}
