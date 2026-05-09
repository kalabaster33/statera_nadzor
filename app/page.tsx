'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, FolderOpen, FileText, Calendar, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Visit, Project } from '@/lib/types'

type RecentVisit = Visit & { project: Pick<Project, 'name'> | null }

export default function HomePage() {
  const [visits, setVisits] = useState<RecentVisit[]>([])
  const [projectCount, setProjectCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase
        .from('visits')
        .select('*, project:projects(name)')
        .order('date', { ascending: false })
        .limit(8),
      supabase.from('projects').select('id', { count: 'exact', head: true }),
    ]).then(([v, p]) => {
      if (v.data) setVisits(v.data as RecentVisit[])
      if (typeof p.count === 'number') setProjectCount(p.count)
      setLoading(false)
    })
  }, [])

  return (
    <div className="py-5 space-y-5">
      <header>
        <p className="text-xs font-mono uppercase tracking-wider text-accent">Nadzor</p>
        <h1 className="text-2xl font-bold mt-1">Site Supervision</h1>
        <p className="text-sm text-text-secondary mt-1">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </header>

      {/* Quick action */}
      <Link href="/visits/new" className="btn-primary w-full text-lg py-5">
        <Plus className="size-6" strokeWidth={2.5} />
        New Visit
      </Link>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/projects" className="card active:scale-[0.98] transition-transform">
          <div className="flex items-center gap-2 text-text-muted text-xs">
            <FolderOpen className="size-4" /> Projects
          </div>
          <p className="text-2xl font-bold mt-2">{projectCount ?? '—'}</p>
        </Link>
        <Link href="/reports" className="card active:scale-[0.98] transition-transform">
          <div className="flex items-center gap-2 text-text-muted text-xs">
            <FileText className="size-4" /> Reports
          </div>
          <p className="text-2xl font-bold mt-2">Generate</p>
        </Link>
      </div>

      {/* Recent visits */}
      <section>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
          Recent Visits
        </h2>
        {loading ? (
          <div className="card text-text-muted text-sm">Loading…</div>
        ) : visits.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-text-muted text-sm">No visits logged yet</p>
            <p className="text-text-muted text-xs mt-1">Tap "New Visit" to start</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visits.map((v) => (
              <Link
                key={v.id}
                href={`/visits/${v.id}`}
                className="card flex items-start gap-3 active:scale-[0.99] transition-transform"
              >
                <div className="size-10 rounded-lg bg-accent/15 text-accent grid place-items-center shrink-0">
                  <Calendar className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{v.project?.name ?? 'Unknown project'}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                    <span>{new Date(v.date).toLocaleDateString('en-US')}</span>
                    {v.weather && <span>· {v.weather}</span>}
                  </div>
                  {v.notes && (
                    <p className="text-sm text-text-secondary mt-1.5 line-clamp-2">{v.notes}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
