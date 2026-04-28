'use client'
export default function AccessDenied({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-5xl mb-4">🔒</div>
      <h2 className="text-lg font-semibold text-slate-700 mb-1">Access Denied</h2>
      <p className="text-sm text-slate-400">
        {message || "You don't have permission to view this page."}
      </p>
    </div>
  )
}
