'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, FolderOpen, FileText, Calendar, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProjects } from '@/lib/ProjectsContext'
import type { Visit, Project } from '@/lib/types'

type RecentVisit = Visit & { project: Pick<Project, 'name'> | null }

export default function HomePage() {
  const { projects } = useProjects()
  const [visits, setVisits] = useState<RecentVisit[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [loadingVisits, setLoadingVisits] = useState(true)

  // Fetch visits when selected project changes
  useEffect(() => {
    setLoadingVisits(true)
    const supabase = createClient()
    
    let query = supabase
      .from('visits')
      .select('*, project:projects(name)')
      .order('date', { ascending: false })
      .limit(10)
      
    if (selectedProjectId) {
      query = query.eq('project_id', selectedProjectId)
    }

    query.then(({ data }) => {
      if (data) setVisits(data as RecentVisit[])
      setLoadingVisits(false)
    })
  }, [selectedProjectId])

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
          <p className="text-2xl font-bold mt-2">{projects.length || '—'}</p>
        </Link>
        <Link href="/reports" className="card active:scale-[0.98] transition-transform">
          <div className="flex items-center gap-2 text-text-muted text-xs">
            <FileText className="size-4" /> Reports
          </div>
          <p className="text-2xl font-bold mt-2">Generate</p>
        </Link>
      </div>

      {/* Selectable Projects List */}
      <section>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
          Filter by Project
        </h2>
        <div className="flex overflow-x-auto gap-2 pb-2 -mx-4 px-4 no-scrollbar">
          <button
            onClick={() => setSelectedProjectId(null)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 ${
              selectedProjectId === null
                ? 'bg-accent text-bg-primary shadow-lg shadow-accent/20'
                : 'bg-bg-tertiary text-text-secondary border border-border'
            }`}
          >
            All Projects
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedProjectId(p.id)}
              className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                selectedProjectId === p.id
                  ? 'bg-accent text-bg-primary shadow-lg shadow-accent/20'
                  : 'bg-bg-tertiary text-text-secondary border border-border'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </section>

      {/* Recent visits */}
      <section>
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
          {selectedProjectId 
            ? `Recent Visits: ${projects.find(p => p.id === selectedProjectId)?.name || ''}`
            : 'All Recent Visits'
          }
        </h2>
        
        {loadingVisits ? (
          <div className="card grid place-items-center py-8">
            <Loader2 className="size-6 animate-spin text-accent" />
          </div>
        ) : visits.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-text-muted text-sm">No visits found</p>
            <p className="text-text-muted text-xs mt-1">Tap "New Visit" to start logging</p>
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
