'use client'

import { useEffect, useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, Loader2, Save, X, AlertTriangle, ShieldCheck, ShieldAlert, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { uploadToStorage } from '@/lib/sync'
import { PhotoCapture, type LocalPhoto } from '@/components/PhotoCapture'
import type { Visit, Project, Photo } from '@/lib/types'

type FullVisit = Visit & { project: Pick<Project, 'name'> | null; photos: Photo[] }

export default function EditVisitPage() {
  const params = useParams()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  
  // Data state
  const [visit, setVisit] = useState<FullVisit | null>(null)
  const [loading, setLoading] = useState(true)

  // Edit state
  const [notes, setNotes] = useState('')
  const [recordStatus, setRecordStatus] = useState<'Normal' | 'Critical'>('Normal')
  const [newPhotos, setNewPhotos] = useState<LocalPhoto[]>([])
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!params.id) return
    const supabase = createClient()
    supabase
      .from('visits')
      .select('*, project:projects(name), photos(*)')
      .eq('id', params.id)
      .single()
      .then(({ data, error }) => {
        if (data) {
          const v = data as FullVisit
          setVisit(v)
          setNotes(v.notes || '')
          setRecordStatus(v.record_status === 'Critical' ? 'Critical' : 'Normal')
        }
        if (error) console.error(error)
        setLoading(false)
      })
  }, [params.id])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!visit) return

    startTransition(async () => {
      try {
        const supabase = createClient()

        // 1. Update visit text and status
        const { error: updateError } = await supabase
          .from('visits')
          .update({ 
            notes: notes.trim() || null,
            record_status: recordStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', visit.id)

        if (updateError) throw updateError

        // 2. Delete removed photos
        if (deletedPhotoIds.size > 0) {
          const idsToDelete = Array.from(deletedPhotoIds)
          // Note: To be fully clean we should also delete from storage, but for simplicity we'll just delete the DB rows
          const { error: deleteError } = await supabase
            .from('photos')
            .delete()
            .in('id', idsToDelete)
          if (deleteError) throw deleteError
        }

        // 3. Upload and insert new photos
        if (newPhotos.length > 0) {
          for (const p of newPhotos) {
            const { publicUrl, storagePath } = await uploadToStorage(p.blob, 'anonymous')
            const { error: insertError } = await supabase.from('photos').insert({
              visit_id: visit.id,
              storage_url: publicUrl,
              storage_path: storagePath,
              caption: p.caption || null
            })
            if (insertError) throw insertError
          }
        }

        setSuccess(true)
        setTimeout(() => {
          router.back()
        }, 1000)

      } catch (err: any) {
        setError(err?.message || 'Failed to update visit')
      }
    })
  }

  function toggleDeletePhoto(id: string) {
    setDeletedPhotoIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleDeleteVisit() {
    if (!visit) return
    if (!window.confirm('Are you sure you want to delete this visit? This action cannot be undone.')) return
    
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('visits').delete().eq('id', visit.id)
    
    if (error) {
      alert('Failed to delete visit')
      setDeleting(false)
    } else {
      router.back()
    }
  }

  if (loading) {
    return (
      <div className="py-12 grid place-items-center">
        <Loader2 className="size-8 animate-spin text-accent" />
      </div>
    )
  }

  if (!visit) {
    return (
      <div className="py-12 text-center space-y-4">
        <h1 className="text-xl font-bold">Visit not found</h1>
        <button onClick={() => router.back()} className="btn-secondary">Go Back</button>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-[70vh] grid place-items-center text-center">
        <div className="space-y-3">
          <div className="size-16 rounded-full bg-success/20 text-success grid place-items-center mx-auto mb-4">
            <Save className="size-8" />
          </div>
          <h2 className="text-xl font-semibold">Changes Saved!</h2>
        </div>
      </div>
    )
  }

  const existingPhotos = visit.photos.filter(p => !deletedPhotoIds.has(p.id))

  return (
    <div className="py-4 space-y-5 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()} className="size-10 rounded-xl bg-bg-tertiary border border-border grid place-items-center active:scale-95 shrink-0">
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-text-muted font-mono mb-0.5">EDIT VISIT</p>
          <h1 className="text-lg font-bold truncate">{visit.project?.name || 'Unknown Project'}</h1>
        </div>
        <button 
          type="button"
          onClick={handleDeleteVisit}
          disabled={deleting}
          className="size-10 rounded-xl bg-danger/10 text-danger border border-danger/20 grid place-items-center active:scale-95 shrink-0 disabled:opacity-50"
        >
          {deleting ? <Loader2 className="size-5 animate-spin" /> : <Trash2 className="size-5" />}
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm text-text-secondary px-2">
        <Calendar className="size-4" />
        <span>{new Date(visit.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        
        {/* Observation Status */}
        <div className="card space-y-3">
          <label className="label">Observation Status</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setRecordStatus('Normal')}
              className={`flex items-center justify-center gap-2.5 rounded-xl border py-3 text-sm font-semibold transition-all active:scale-95 ${
                recordStatus === 'Normal'
                  ? 'bg-success/15 border-success text-success shadow-[0_0_0_3px_rgba(0,200,150,0.15)]'
                  : 'bg-bg-tertiary border-border text-text-secondary'
              }`}
            >
              <ShieldCheck className="size-5" />
              Normal
            </button>
            <button
              type="button"
              onClick={() => setRecordStatus('Critical')}
              className={`flex items-center justify-center gap-2.5 rounded-xl border py-3 text-sm font-semibold transition-all active:scale-95 ${
                recordStatus === 'Critical'
                  ? 'bg-danger/15 border-danger text-danger shadow-[0_0_0_3px_rgba(255,71,87,0.15)]'
                  : 'bg-bg-tertiary border-border text-text-secondary'
              }`}
            >
              <ShieldAlert className="size-5" />
              Critical
            </button>
          </div>
        </div>

        {/* Observations Text */}
        <div className={`card space-y-3 ${recordStatus === 'Critical' ? 'border-danger/40' : ''}`}>
          <label className="label">Observations</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={8}
            className={`input-field resize-none font-mono text-sm leading-relaxed ${
              recordStatus === 'Critical' ? 'border-danger/40 focus:border-danger' : ''
            }`}
            autoCapitalize="sentences"
          />
        </div>

        {/* Existing Photos */}
        {visit.photos.length > 0 && (
          <div className="card space-y-3">
            <label className="label">Existing Photos</label>
            {existingPhotos.length === 0 && (
              <p className="text-sm text-text-muted italic">All existing photos marked for deletion.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {visit.photos.map((p) => {
                const isDeleted = deletedPhotoIds.has(p.id)
                return (
                  <div key={p.id} className={`relative rounded-xl overflow-hidden bg-bg-secondary border border-border aspect-square transition-all ${isDeleted ? 'opacity-30 grayscale' : ''}`}>
                    <img src={p.storage_url} alt={p.caption || ''} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => toggleDeletePhoto(p.id)}
                      className="absolute top-2 right-2 size-8 rounded-full bg-bg-primary/90 backdrop-blur grid place-items-center active:scale-90"
                    >
                      {isDeleted ? <span className="text-xs font-bold text-text-primary">UNDO</span> : <X className="size-4 text-danger" />}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Add New Photos */}
        <div className="card space-y-3">
          <label className="label">Add New Photos</label>
          <PhotoCapture
            photos={newPhotos}
            onChange={setNewPhotos}
            geo={null} // We don't re-poll GPS for edits to keep it simple, or we could pass a cached one
            projectName={visit.project?.name ?? ''}
          />
        </div>

        {error && (
          <div className="rounded-xl bg-danger/15 border border-danger/30 p-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Save Button */}
        <div className="pt-4">
          <button
            type="submit"
            disabled={pending}
            className={`w-full text-lg py-4 ${
              recordStatus === 'Critical' ? 'btn-danger text-lg py-4 font-bold' : 'btn-primary'
            }`}
          >
            {pending
              ? <><Loader2 className="size-5 animate-spin" /> Saving Changes…</>
              : <><Save className="size-5" /> Save Changes</>
            }
          </button>
        </div>
      </form>
    </div>
  )
}
