'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import type { SimilarityPair, SimilarityQueue } from '@/types'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const REASON_LABELS: Record<string, string> = {
  EXACT_DUPLICATE: 'Exact Duplicate',
  FORMAT_DIFFERENCE: 'Format Difference',
  SPELLING_ERROR: 'Spelling Error',
  REARRANGED_WORDS: 'Rearranged Words',
  MISSING_WORDS: 'Missing Words',
}

export default function SimilarityPage() {
  const [queue, setQueue] = useState<SimilarityQueue | null>(null)
  const [loading, setLoading] = useState(true)
  const [activePair, setActivePair] = useState<SimilarityPair | null>(null)
  const [action, setAction] = useState<string>('')
  const [removeItemId, setRemoveItemId] = useState<string>('')
  const [canonicalValue, setCanonicalValue] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [triggeringFirstPass, setTriggeringFirstPass] = useState(false)
  const [firstPassResult, setFirstPassResult] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const { data } = await api.get('/similarity/queue')
      setQueue(data)
    } finally { setLoading(false) }
  }

  async function submitReview() {
    if (!activePair || !action) return
    setSubmitting(true)
    try {
      await api.post(`/similarity/${activePair.id}/review`, {
        action,
        remove_item_id: action === 'REMOVE_ONE' ? removeItemId : undefined,
        canonical_value: action === 'MERGED' ? canonicalValue : undefined,
      })
      setActivePair(null); setAction(''); setRemoveItemId(''); setCanonicalValue('')
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      alert(err.response?.data?.detail || 'Review failed')
    } finally { setSubmitting(false) }
  }

  async function triggerFirstPass() {
    setTriggeringFirstPass(true); setFirstPassResult('')
    try {
      const { data } = await api.post('/similarity/first-pass')
      setFirstPassResult(`Dispatched — task ID: ${data.task_id}`)
    } catch {
      setFirstPassResult('Failed to trigger first pass')
    } finally { setTriggeringFirstPass(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>

  return (
    <div>
      <PageHeader
        title="Similarity Review"
        subtitle={queue ? `${queue.total_pending} pair${queue.total_pending !== 1 ? 's' : ''} pending review` : ''}
        action={
          <div className="flex gap-2 items-center">
            {firstPassResult && <span className="text-xs text-slate-500">{firstPassResult}</span>}
            <button onClick={triggerFirstPass} disabled={triggeringFirstPass}
              className="px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50 font-medium flex items-center gap-2 disabled:opacity-50">
              {triggeringFirstPass && <LoadingSpinner size="sm" />}
              Run First Pass
            </button>
          </div>
        }
      />

      {!queue || queue.pairs.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-4xl mb-3">✓</p>
          <p className="font-medium">No pending pairs</p>
          <p className="text-sm">Run First Pass after migration to populate the queue</p>
        </div>
      ) : (
        <div className="space-y-3">
          {queue.pairs.map(pair => (
            <div key={pair.id} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-3">
                    {pair.core_name && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{pair.core_name}</span>}
                    <Badge label={REASON_LABELS[pair.similarity_reason || ''] || pair.similarity_reason || ''} />
                    <span className="text-xs text-slate-400">Score: {(pair.similarity_score * 100).toFixed(0)}%</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-1">Item A</p>
                      <p className="text-sm font-medium text-slate-800">{pair.english_value_a}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-1">Item B</p>
                      <p className="text-sm font-medium text-slate-800">{pair.english_value_b}</p>
                    </div>
                  </div>
                </div>
                <button onClick={() => { setActivePair(pair); setAction(''); setRemoveItemId(''); setCanonicalValue('') }}
                  className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 flex-shrink-0">
                  Review
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activePair && (
        <Modal title="Review Similarity Pair" onClose={() => setActivePair(null)} width="max-w-xl">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">Item A</p>
                <p className="text-sm font-semibold">{activePair.english_value_a}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">Item B</p>
                <p className="text-sm font-semibold">{activePair.english_value_b}</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Choose action:</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'KEEP_BOTH', label: 'Keep Both', desc: 'Both are valid, different items' },
                  { value: 'REMOVE_ONE', label: 'Remove One', desc: 'One is a duplicate — inactivate it' },
                  { value: 'MERGED', label: 'Merge', desc: 'Combine into one canonical value' },
                  { value: 'IGNORED', label: 'Ignore', desc: 'Dismiss permanently' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setAction(opt.value)}
                    className={`p-3 rounded-lg border text-left transition-colors ${action === opt.value ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-teal-300'}`}>
                    <p className="text-sm font-medium text-slate-800">{opt.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {action === 'REMOVE_ONE' && (
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Which item to remove?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setRemoveItemId(activePair.item_id_a)}
                    className={`p-2 rounded-lg border text-sm ${removeItemId === activePair.item_id_a ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-200 hover:border-red-300'}`}>
                    Remove A: "{activePair.english_value_a}"
                  </button>
                  <button onClick={() => setRemoveItemId(activePair.item_id_b)}
                    className={`p-2 rounded-lg border text-sm ${removeItemId === activePair.item_id_b ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-200 hover:border-red-300'}`}>
                    Remove B: "{activePair.english_value_b}"
                  </button>
                </div>
              </div>
            )}

            {action === 'MERGED' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Canonical value (item A will be updated to this)</label>
                <input value={canonicalValue} onChange={e => setCanonicalValue(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Type the correct value…" />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setActivePair(null)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button onClick={submitReview} disabled={submitting || !action || (action === 'REMOVE_ONE' && !removeItemId) || (action === 'MERGED' && !canonicalValue)}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
                {submitting && <LoadingSpinner size="sm" />} Confirm
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
