'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function NewProjectPage() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [clientInfo, setClientInfo] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Please sign in first')
        return
      }
      const { error: err } = await supabase.from('projects').insert({
        user_id: user.id,
        name: name.trim(),
        location: location.trim() || null,
        client_info: clientInfo.trim() || null,
      })
      if (err) setError(err.message)
      else router.push('/projects')
    })
  }

  return (
    <div className="py-4 space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/projects" className="size-10 rounded-xl bg-bg-tertiary border border-border grid place-items-center active:scale-95">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-bold">New Project</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="card space-y-4">
          <div>
            <label className="label">Project Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Riverside Office Tower"
              required
              className="input-field"
              autoCapitalize="words"
            />
          </div>
          <div>
            <label className="label">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. 123 Main St, Skopje"
              className="input-field"
              autoCapitalize="words"
            />
          </div>
          <div>
            <label className="label">Client Info</label>
            <textarea
              value={clientInfo}
              onChange={(e) => setClientInfo(e.target.value)}
              placeholder="Client name, contact details…"
              rows={3}
              className="input-field resize-none"
              autoCapitalize="sentences"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-danger/15 border border-danger/30 p-3 text-sm text-danger">
            {error}
          </div>
        )}

        <button type="submit" disabled={pending || !name.trim()} className="btn-primary w-full">
          <Save className="size-5" />
          {pending ? 'Saving…' : 'Create Project'}
        </button>
      </form>
    </div>
  )
}
