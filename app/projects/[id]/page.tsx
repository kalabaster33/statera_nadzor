'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar, Loader2, MapPin, FileText, Upload, Download, File, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProjects } from '@/lib/ProjectsContext'
import { collectStoragePaths } from '@/lib/photo-url'
import type { Visit, Project, ProjectDocument, Photo } from '@/lib/types'

type ProjectWithRelations = Project & { 
  visits: Visit[];
  project_documents: ProjectDocument[];
}

export default function ProjectDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const [project, setProject] = useState<ProjectWithRelations | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { invalidate } = useProjects()
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!params.id) return
    fetchProject()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  async function fetchProject() {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('projects')
      .select('*, visits(*), project_documents(*)')
      .eq('id', params.id)
      .order('date', { referencedTable: 'visits', ascending: false })
      .order('created_at', { referencedTable: 'project_documents', ascending: false })
      .single()
      
    if (data) setProject(data as ProjectWithRelations)
    if (error) console.error(error)
    setLoading(false)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !project) return

    setUploadingDoc(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Session expired — please sign in again')
      const ts = Date.now()
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
      const storagePath = `${user.id}/${project.id}/${ts}_${safeName}`

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(storagePath, file, { upsert: false })
      
      if (uploadError) throw uploadError

      const { data: pubUrlData } = supabase.storage
        .from('project-documents')
        .getPublicUrl(storagePath)

      // Insert record
      const { error: insertError } = await supabase
        .from('project_documents')
        .insert({
          project_id: project.id,
          name: file.name,
          storage_url: pubUrlData.publicUrl,
          storage_path: storagePath,
          size_bytes: file.size
        })

      if (insertError) throw insertError

      // Refresh project to show new document
      await fetchProject()
    } catch (err) {
      console.error('Upload failed:', err)
      alert('Failed to upload document')
    } finally {
      setUploadingDoc(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /** Open a document via a short-lived signed URL (bucket is private). */
  async function openDocument(doc: ProjectDocument) {
    const supabase = createClient()
    const path =
      doc.storage_path ||
      decodeURIComponent(doc.storage_url.match(/\/object\/(?:public|sign)\/project-documents\/([^?]+)/)?.[1] ?? '')
    if (!path) {
      window.open(doc.storage_url, '_blank', 'noopener')
      return
    }
    const { data } = await supabase.storage.from('project-documents').createSignedUrl(path, 3600)
    window.open(data?.signedUrl ?? doc.storage_url, '_blank', 'noopener')
  }

  function formatBytes(bytes: number) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  async function handleDeleteProject() {
    if (!project) return
    if (!window.confirm(`Are you sure you want to delete "${project.name}"? This will also delete all associated visits, photos, and documents.`)) return
    
    setDeleting(true)
    const supabase = createClient()

    // Collect storage paths BEFORE the cascade delete removes the rows.
    // Best-effort: failures here leave orphaned files, never broken references.
    let photoPaths: string[] = []
    const docPaths = (project.project_documents ?? [])
      .map((d) => d.storage_path)
      .filter(Boolean)
    try {
      const visitIds = (project.visits ?? []).map((v) => v.id)
      if (visitIds.length > 0) {
        const { data: photoRows } = await supabase
          .from('photos')
          .select('id, storage_url, storage_path, hi_res_url, hi_res_path')
          .in('visit_id', visitIds)
        if (photoRows) photoPaths = collectStoragePaths(photoRows as Photo[])
      }
    } catch { /* proceed with delete regardless */ }

    const { error } = await supabase.from('projects').delete().eq('id', project.id)

    if (error) {
      alert('Failed to delete project')
      setDeleting(false)
    } else {
      if (photoPaths.length > 0) {
        const { error: e1 } = await supabase.storage.from('site-photos').remove(photoPaths)
        if (e1) console.warn('[delete project] photo storage cleanup failed', e1)
      }
      if (docPaths.length > 0) {
        const { error: e2 } = await supabase.storage.from('project-documents').remove(docPaths)
        if (e2) console.warn('[delete project] document storage cleanup failed', e2)
      }
      invalidate() // Refresh the global project cache
      router.push('/projects')
    }
  }

  if (loading) {
    return (
      <div className="py-12 grid place-items-center">
        <Loader2 className="size-8 animate-spin text-accent" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="py-12 text-center space-y-4">
        <h1 className="text-xl font-bold">Project not found</h1>
        <button onClick={() => router.back()} className="btn-secondary">Go Back</button>
      </div>
    )
  }

  return (
    <div className="py-4 space-y-5 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="size-10 rounded-xl bg-bg-tertiary border border-border grid place-items-center active:scale-95 shrink-0">
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{project.name}</h1>
        </div>
        <button 
          onClick={handleDeleteProject}
          disabled={deleting}
          className="size-10 rounded-xl bg-danger/10 text-danger border border-danger/20 grid place-items-center active:scale-95 shrink-0 disabled:opacity-50"
        >
          {deleting ? <Loader2 className="size-5 animate-spin" /> : <Trash2 className="size-5" />}
        </button>
      </div>

      {/* Project Details */}
      <div className="card space-y-3">
        {project.location && (
          <div className="flex items-start gap-2 text-sm text-text-secondary">
            <MapPin className="size-4 shrink-0 mt-0.5" />
            <span className="leading-tight">{project.location}</span>
          </div>
        )}
        {project.client_info && (
          <div className="flex items-start gap-2 text-sm text-text-secondary">
            <FileText className="size-4 shrink-0 mt-0.5" />
            <span className="leading-tight whitespace-pre-wrap">{project.client_info}</span>
          </div>
        )}
        {!project.location && !project.client_info && (
          <p className="text-sm text-text-muted">No additional details for this project.</p>
        )}
      </div>

      {/* Documents List */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
            Documents ({project.project_documents?.length || 0})
          </h2>
          <button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={uploadingDoc}
            className="text-xs text-accent font-medium flex items-center gap-1 disabled:opacity-50"
          >
            {uploadingDoc ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
            {uploadingDoc ? 'Uploading...' : 'Upload'}
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
          />
        </div>

        {!project.project_documents || project.project_documents.length === 0 ? (
          <div className="card text-center py-6">
            <p className="text-text-muted text-sm">No documents uploaded</p>
          </div>
        ) : (
          <div className="space-y-2">
            {project.project_documents.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => openDocument(doc)}
                className="card w-full text-left flex items-center gap-3 active:scale-[0.99] transition-transform p-3"
              >
                <div className="size-10 rounded-lg bg-bg-tertiary text-text-secondary grid place-items-center shrink-0">
                  <File className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-text-primary">{doc.name}</p>
                  {doc.size_bytes && <p className="text-xs text-text-muted">{formatBytes(doc.size_bytes)}</p>}
                </div>
                <Download className="size-4 text-text-muted shrink-0" />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Visits List */}
      <section>
        <div className="flex items-center justify-between mb-3 mt-6">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
            Visits ({project.visits?.length || 0})
          </h2>
          <Link href={`/visits/new?projectId=${project.id}`} className="text-xs text-accent font-medium">
            + Log Visit
          </Link>
        </div>

        {!project.visits || project.visits.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-text-muted text-sm">No visits logged yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {project.visits.map((v) => (
              <Link
                key={v.id}
                href={`/visits/${v.id}`}
                className="card flex items-start gap-3 active:scale-[0.99] transition-transform p-3"
              >
                <div className="size-10 rounded-lg bg-accent/15 text-accent grid place-items-center shrink-0">
                  <Calendar className="size-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className="text-sm font-medium">
                      {v.visit_number != null && <span className="font-mono text-accent mr-1.5">№{v.visit_number}</span>}
                      {new Date(v.date).toLocaleDateString('en-US')}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${v.record_status === 'Critical' ? 'bg-danger/20 text-danger' : 'bg-success/20 text-success'}`}>
                      {v.record_status === 'Critical' ? 'Critical' : 'Normal'}
                    </span>
                  </div>
                  {v.weather && <p className="text-xs text-text-muted mt-1">{v.weather}</p>}
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
