'use client'

import Link from 'next/link'
import { Plus, MapPin, FolderOpen } from 'lucide-react'
import { useProjects } from '@/lib/ProjectsContext'

export default function ProjectsPage() {
  const { projects, loading } = useProjects()

  return (
    <div className="py-5 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Link href="/projects/new" className="btn-primary py-2.5 px-4 text-sm">
          <Plus className="size-4" /> New
        </Link>
      </div>

      {loading ? (
        <div className="card text-text-muted text-sm">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="card text-center py-12">
          <FolderOpen className="size-10 text-text-muted mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-text-secondary">No projects yet</p>
          <Link href="/projects/new" className="btn-primary mt-4 inline-flex">
            <Plus className="size-4" /> Create first project
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="card block active:scale-[0.99] transition-transform">
              <h3 className="font-semibold">{p.name}</h3>
              {p.location && (
                <p className="text-sm text-text-secondary mt-1 flex items-center gap-1.5">
                  <MapPin className="size-3.5" /> {p.location}
                </p>
              )}
              {p.client_info && (
                <p className="text-xs text-text-muted mt-1.5 line-clamp-2">{p.client_info}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
