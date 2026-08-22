'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email atau password salah')
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--color-primary)] mb-4 shadow-lg">
            <span className="text-3xl">🛒</span>
          </div>
          <h1 className="text-[22px] font-extrabold text-[var(--color-text)] tracking-tight">Kasir Kantin Mapan</h1>
          <p className="text-[13px] text-[var(--color-muted)] mt-1">Masuk untuk mengelola kasir</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(20,35,25,0.10)] p-6">
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@kantinku.com"
                required
                className="w-full px-3.5 py-2.5 border-[1.5px] border-[var(--color-border)] rounded-xl text-[13px] outline-none focus:border-[var(--color-primary)] placeholder:text-[var(--color-muted)] transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3.5 py-2.5 border-[1.5px] border-[var(--color-border)] rounded-xl text-[13px] outline-none focus:border-[var(--color-primary)] placeholder:text-[var(--color-muted)] transition-colors"
              />
            </div>

            {error && (
              <div className="bg-[var(--color-danger-light)] text-[var(--color-danger)] text-[12px] font-semibold px-3.5 py-2.5 rounded-lg">
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[var(--color-primary)] text-white text-[14px] font-bold mt-1 disabled:opacity-50 hover:bg-[var(--color-primary-mid)] transition-colors"
            >
              {loading ? 'Masuk...' : 'Masuk'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
