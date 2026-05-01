'use client'
import { useState, FormEvent, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { requestOtp, verifyOtp, getToken } from '@/lib/auth'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

// ── Background network graph ───────────────────────────────────────────────
const NODES = [
  { cx: 8,  cy: 10 }, { cx: 24, cy: 6  }, { cx: 42, cy: 14 },
  { cx: 60, cy: 8  }, { cx: 78, cy: 14 }, { cx: 92, cy: 7  },
  { cx: 14, cy: 32 }, { cx: 31, cy: 40 }, { cx: 50, cy: 33 },
  { cx: 68, cy: 42 }, { cx: 84, cy: 34 }, { cx: 96, cy: 28 },
  { cx: 5,  cy: 58 }, { cx: 22, cy: 65 }, { cx: 40, cy: 56 },
  { cx: 57, cy: 63 }, { cx: 74, cy: 57 }, { cx: 90, cy: 67 },
]
const EDGES = [
  [0,1],[1,2],[2,3],[3,4],[4,5],
  [0,6],[1,7],[2,8],[3,9],[4,10],[5,11],
  [6,7],[7,8],[8,9],[9,10],[10,11],
  [6,12],[7,13],[8,14],[9,15],[10,16],[11,17],
  [12,13],[13,14],[14,15],[15,16],[16,17],
  [1,8],[3,10],[7,14],[9,16],
]

type Step = 'email' | 'otp'

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep]         = useState<Step>('email')
  const [email, setEmail]       = useState('')
  const [otp, setOtp]           = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [resendTimer, setResendTimer] = useState(0)

  useEffect(() => {
    if (getToken()) router.replace('/admin/folders')
  }, [router])

  useEffect(() => {
    if (resendTimer <= 0) return
    const id = setTimeout(() => setResendTimer(t => t - 1), 1000)
    return () => clearTimeout(id)
  }, [resendTimer])

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await requestOtp(email)
      setStep('otp')
      setResendTimer(30)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      const detail = err.response?.data?.detail
      setError(detail || 'Failed to send code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleOtpSubmit(e: FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await verifyOtp(email, otp.trim())
      router.replace('/admin/folders')
    } catch {
      setError('Invalid or expired code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (resendTimer > 0) return
    setError(''); setLoading(true)
    try {
      await requestOtp(email)
      setResendTimer(30)
      setOtp('')
    } catch {
      setError('Failed to resend. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); opacity: 0.6; }
          50%       { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes pulse-line {
          0%, 100% { opacity: 0.12; }
          50%       { opacity: 0.28; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .node-float { animation: float 4s ease-in-out infinite; }
        .edge-pulse { animation: pulse-line 4s ease-in-out infinite; }
        .fade-up    { animation: fadeUp 0.7s ease both; }
        .fade-up-1  { animation: fadeUp 0.7s 0.1s ease both; }
        .fade-up-2  { animation: fadeUp 0.7s 0.2s ease both; }
        .fade-up-3  { animation: fadeUp 0.7s 0.35s ease both; }
      `}</style>

      <div className="min-h-screen flex">

        {/* ── Left panel: brand + visual ───────────────────────────────────── */}
        <div
          className="hidden lg:flex lg:w-3/5 xl:w-2/3 relative flex-col justify-between overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #071e12 0%, #0d3320 50%, #0a2919 100%)' }}
        >
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 100 80"
            preserveAspectRatio="xMidYMid slice"
          >
            {EDGES.map(([a, b], i) => (
              <line
                key={i}
                className="edge-pulse"
                x1={NODES[a].cx} y1={NODES[a].cy}
                x2={NODES[b].cx} y2={NODES[b].cy}
                stroke="#4ade80" strokeWidth="0.18"
                style={{ animationDelay: `${(i * 0.17) % 4}s` }}
              />
            ))}
            {NODES.map((n, i) => (
              <circle
                key={i}
                className="node-float"
                cx={n.cx} cy={n.cy}
                r={i % 3 === 0 ? 0.7 : i % 3 === 1 ? 0.5 : 0.4}
                fill="#4ade80"
                style={{ animationDelay: `${(i * 0.3) % 4}s` }}
              />
            ))}
          </svg>

          <svg
            className="absolute bottom-0 left-0 right-0 w-full"
            viewBox="0 0 1200 160"
            preserveAspectRatio="xMidYMax slice"
          >
            <path d="M0 120 Q300 100 600 115 Q900 130 1200 110 L1200 160 L0 160 Z"
              fill="#0a2919" opacity="0.8" />
            {Array.from({ length: 48 }, (_, i) => {
              const x = 12 + i * 24.5
              const h = 45 + (i % 5) * 10 + ((i * 7) % 15)
              const sway = (i % 2 === 0 ? -1 : 1) * (3 + (i % 4))
              return (
                <g key={i}>
                  <line x1={x} y1={130} x2={x + sway * 0.4} y2={130 - h}
                    stroke="#1a5c38" strokeWidth="2.5" strokeLinecap="round" />
                  <ellipse cx={x + sway * 0.4} cy={130 - h - 6}
                    rx="3.5" ry="7"
                    fill="#1a5c38" opacity="0.9"
                    transform={`rotate(${sway * 4} ${x + sway * 0.4} ${130 - h - 6})`} />
                </g>
              )
            })}
          </svg>

          <div className="relative z-10 p-12 pt-16 fade-up">
            <div className="flex items-center gap-3 mb-8">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="19" stroke="#4ade80" strokeWidth="1.5" opacity="0.4" />
                <circle cx="20" cy="20" r="5" fill="#4ade80" />
                <circle cx="8"  cy="12" r="3" fill="#4ade80" opacity="0.7" />
                <circle cx="32" cy="12" r="3" fill="#4ade80" opacity="0.7" />
                <circle cx="8"  cy="28" r="3" fill="#4ade80" opacity="0.7" />
                <circle cx="32" cy="28" r="3" fill="#4ade80" opacity="0.7" />
                <line x1="20" y1="20" x2="8"  y2="12" stroke="#4ade80" strokeWidth="1" opacity="0.5" />
                <line x1="20" y1="20" x2="32" y2="12" stroke="#4ade80" strokeWidth="1" opacity="0.5" />
                <line x1="20" y1="20" x2="8"  y2="28" stroke="#4ade80" strokeWidth="1" opacity="0.5" />
                <line x1="20" y1="20" x2="32" y2="28" stroke="#4ade80" strokeWidth="1" opacity="0.5" />
              </svg>
              <span className="text-green-400 text-sm font-medium tracking-widest uppercase opacity-80">
                Neytiri Eywafarm Agritech
              </span>
            </div>
            <h1 className="text-5xl xl:text-6xl font-bold text-white leading-tight tracking-tight">
              Cosh 2.0
            </h1>
            <p className="text-green-300 text-lg mt-3 font-light">Agricultural Knowledge Graph</p>
            <p className="text-green-500 text-sm mt-1 opacity-70">Knowledge Management System</p>
          </div>

          <div className="relative z-10 p-12 pb-16">
            <p className="text-green-400 text-sm opacity-60 leading-relaxed max-w-xs">
              Connecting agronomic knowledge across crops, languages, and farming communities.
            </p>
          </div>
        </div>

        {/* ── Right panel: login form ───────────────────────────────────────── */}
        <div className="flex-1 flex items-center justify-center bg-white px-8 py-12">
          <div className="w-full max-w-sm">

            {/* Mobile brand */}
            <div className="lg:hidden text-center mb-8">
              <div
                className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
                style={{ background: 'linear-gradient(135deg, #071e12, #0d3320)' }}
              >
                <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
                  <circle cx="20" cy="20" r="5" fill="#4ade80" />
                  <circle cx="8"  cy="12" r="3" fill="#4ade80" opacity="0.7" />
                  <circle cx="32" cy="12" r="3" fill="#4ade80" opacity="0.7" />
                  <line x1="20" y1="20" x2="8"  y2="12" stroke="#4ade80" strokeWidth="1.5" />
                  <line x1="20" y1="20" x2="32" y2="12" stroke="#4ade80" strokeWidth="1.5" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Cosh 2.0</h1>
              <p className="text-slate-500 text-sm">Agricultural Knowledge Graph</p>
            </div>

            {/* ── Step 1: Email ── */}
            {step === 'email' && (
              <>
                <div className="mb-8 fade-up-1">
                  <h2 className="text-2xl font-bold text-slate-900">Sign in</h2>
                  <p className="text-slate-500 text-sm mt-1">
                    Enter your email and we'll send a one-time code
                  </p>
                </div>

                <form onSubmit={handleEmailSubmit} className="space-y-5">
                  <div className="fade-up-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Email address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      autoFocus
                      placeholder="you@eywa.farm"
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:border-transparent transition-all placeholder:text-slate-400"
                      style={{ '--tw-ring-color': '#059669' } as React.CSSProperties}
                    />
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                      <span>⚠</span> {error}
                    </div>
                  )}

                  <div className="fade-up-3 pt-1">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full text-white font-semibold py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 shadow-lg shadow-green-900/20"
                      style={{ background: loading ? '#059669' : 'linear-gradient(135deg, #065f46, #059669)' }}
                    >
                      {loading ? <LoadingSpinner size="sm" /> : null}
                      {loading ? 'Sending code…' : 'Send sign-in code'}
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* ── Step 2: OTP ── */}
            {step === 'otp' && (
              <>
                <div className="mb-8 fade-up-1">
                  <button
                    onClick={() => { setStep('email'); setOtp(''); setError('') }}
                    className="text-sm text-slate-400 hover:text-slate-600 mb-4 flex items-center gap-1"
                  >
                    ← Back
                  </button>
                  <h2 className="text-2xl font-bold text-slate-900">Check your email</h2>
                  <p className="text-slate-500 text-sm mt-1">
                    We sent a 6-digit code to
                  </p>
                  <p className="text-slate-700 text-sm font-medium">{email}</p>
                </div>

                <form onSubmit={handleOtpSubmit} className="space-y-5">
                  <div className="fade-up-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Sign-in code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                      required
                      autoFocus
                      placeholder="123456"
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:border-transparent transition-all placeholder:text-slate-400 tracking-widest text-center text-lg font-mono"
                      style={{ '--tw-ring-color': '#059669' } as React.CSSProperties}
                    />
                    <p className="text-xs text-slate-400 mt-1.5">Code expires in 10 minutes</p>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                      <span>⚠</span> {error}
                    </div>
                  )}

                  <div className="fade-up-3 pt-1">
                    <button
                      type="submit"
                      disabled={loading || otp.length < 6}
                      className="w-full text-white font-semibold py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 shadow-lg shadow-green-900/20"
                      style={{ background: loading ? '#059669' : 'linear-gradient(135deg, #065f46, #059669)' }}
                    >
                      {loading ? <LoadingSpinner size="sm" /> : null}
                      {loading ? 'Verifying…' : 'Sign in'}
                    </button>
                  </div>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={resendTimer > 0 || loading}
                      className="text-sm text-slate-500 hover:text-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {resendTimer > 0
                        ? `Resend code in ${resendTimer}s`
                        : "Didn't receive a code? Resend"}
                    </button>
                  </div>
                </form>
              </>
            )}

            <p className="text-center text-xs text-slate-400 mt-10">
              Neytiri Eywafarm Agritech Pvt Ltd
            </p>
          </div>
        </div>

      </div>
    </>
  )
}
