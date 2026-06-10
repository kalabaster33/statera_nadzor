'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, FolderOpen, FileText, Calendar, CloudOff, Loader2, LogOut, ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getPendingVisits, type QueuedVisit } from '@/lib/offline-db'
import { useProjects } from '@/lib/ProjectsContext'
import type { Visit, Project } from '@/lib/types'

type RecentVisit = Visit & { project: Pick<Project, 'name'> | null }

export default function HomePage() {
  const { projects } = useProjects()
  const [visits, setVisits] = useState<RecentVisit[]>([])
  const [pendingQueue, setPendingQueue] = useState<QueuedVisit[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [loadingVisits, setLoadingVisits] = useState(true)

  // Load locally queued (not-yet-synced) visits so field work is never "invisible"
  const refreshQueue = useCallback(() => {
    getPendingVisits().then(setPendingQueue).catch(() => {})
  }, [])

  useEffect(() => {
    refreshQueue()
    // Re-check when connectivity returns (sync engine will drain the queue)
    // and when the app regains focus after backgrounding on site
    window.addEventListener('online', refreshQueue)
    window.addEventListener('focus', refreshQueue)
    const interval = setInterval(refreshQueue, 30_000)
    return () => {
      window.removeEventListener('online', refreshQueue)
      window.removeEventListener('focus', refreshQueue)
      clearInterval(interval)
    }
  }, [refreshQueue])

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
      <header className="flex items-start justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-accent">Nadzor</p>
          <h1 className="text-2xl font-bold mt-1">Site Supervision</h1>
          <p className="text-sm text-text-secondary mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            const pending = await getPendingVisits().catch(() => [])
            if (pending.length > 0 && !window.confirm(
              `${pending.length} visit(s) are still waiting to sync and cannot upload while signed out. Sign out anyway?`
            )) return
            await createClient().auth.signOut()
            window.location.assign('/login')
          }}
          className="size-10 rounded-xl bg-bg-tertiary border border-border grid place-items-center text-text-muted active:scale-95"
          aria-label="Sign out"
        >
          <LogOut className="size-4" />
        </button>
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

      {/* Pending sync (saved offline, not yet uploaded) */}
      {(() => {
        const pendingForFilter = selectedProjectId
          ? pendingQueue.filter((q) => q.project_id === selectedProjectId)
          : pendingQueue
        if (pendingForFilter.length === 0) return null
        return (
          <section>
            <h2 className="text-sm font-semibold text-warning uppercase tracking-wider mb-3 flex items-center gap-2">
              <CloudOff className="size-4" /> Pending Sync ({pendingForFilter.length})
            </h2>
            <div className="space-y-2">
              {pendingForFilter.map((q) => (
                <div key={q.localId} className="card flex items-start gap-3 border-warning/30">
                  <div className="size-10 rounded-lg bg-warning/15 text-warning grid place-items-center shrink-0">
                    <CloudOff className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">
                        {projects.find((p) => p.id === q.project_id)?.name ?? 'Unknown project'}
                      </p>
                      {q.record_status === 'Critical' && (
                        <span className="flex items-center gap-1 rounded-full bg-danger/15 text-danger px-2 py-0.5 text-[10px] font-semibold shrink-0">
                          <ShieldAlert className="size-3" /> CRITICAL
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                      {q.visit_number != null && <span className="font-mono text-accent">№{q.visit_number}</span>}
                      <span>{new Date(q.date).toLocaleDateString('en-US')}</span>
                      <span>· {q.photos.length} photo{q.photos.length === 1 ? '' : 's'}</span>
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        q.syncStatus === 'error' ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning'
                      }`}>
                        {q.syncStatus === 'error' ? 'SYNC ERROR' : 'WAITING FOR CONNECTION'}
                      </span>
                    </div>
                    {q.notes && (
                      <p className="text-sm text-text-secondary mt-1.5 line-clamp-2">{q.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })()}

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
                <div className={`size-10 rounded-lg grid place-items-center shrink-0 ${
                  v.record_status === 'Critical' ? 'bg-danger/15 text-danger' : 'bg-accent/15 text-accent'
                }`}>
                  {v.record_status === 'Critical' ? <ShieldAlert className="size-5" /> : <Calendar className="size-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{v.project?.name ?? 'Unknown project'}</p>
                    {v.record_status === 'Critical' && (
                      <span className="rounded-full bg-danger/15 text-danger px-2 py-0.5 text-[10px] font-semibold shrink-0">
                        CRITICAL
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                    {v.visit_number != null && <span className="font-mono text-accent">№{v.visit_number}</span>}
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
