'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { HardHat, Loader2, LogIn } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signInError) {
        setError(
          signInError.message === 'Invalid login credentials'
            ? 'Wrong email or password'
            : signInError.message
        )
        return
      }
      // Full navigation so the middleware sees the fresh session cookie
      const next = searchParams.get('next')
      window.location.assign(next && next.startsWith('/') ? next : '/')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-[85vh] grid place-items-center">
      <div className="w-full max-w-sm space-y-8">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="size-16 rounded-2xl bg-accent/15 text-accent grid place-items-center mx-auto">
            <HardHat className="size-8" />
          </div>
          <p className="text-xs font-mono uppercase tracking-wider text-accent">Nadzor</p>
          <h1 className="text-2xl font-bold">Site Supervision</h1>
          <p className="text-sm text-text-muted">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="engineer@firm.mk"
              className="input-field"
              autoComplete="email"
              inputMode="email"
              required
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input-field"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="rounded-xl bg-danger/15 border border-danger/30 p-3 text-sm text-danger">
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full py-3.5">
            {submitting
              ? <><Loader2 className="size-5 animate-spin" /> Signing in…</>
              : <><LogIn className="size-5" /> Sign In</>
            }
          </button>

          <p className="text-xs text-text-muted text-center">
            Accounts are created by the firm administrator.
          </p>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[85vh] grid place-items-center">
        <Loader2 className="size-8 animate-spin text-accent" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
