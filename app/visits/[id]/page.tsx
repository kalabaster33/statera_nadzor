'use client'

import { useEffect, useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, Cloud, Loader2, LocateFixed, LocateOff, Save, X, ShieldCheck, ShieldAlert, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { uploadToStorage } from '@/lib/sync'
import { useGeolocation } from '@/lib/useGeolocation'
import { PhotoCapture, type LocalPhoto } from '@/components/PhotoCapture'
import { WEATHER_OPTIONS } from '@/lib/weather'
import { collectStoragePaths, getSignedPhotoUrls } from '@/lib/photo-url'
import type { Visit, Project, Photo } from '@/lib/types'

type FullVisit = Visit & { project: Pick<Project, 'name'> | null; photos: Photo[] }

export default function EditVisitPage() {
  const params = useParams()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  
  // Data state
  const [visit, setVisit] = useState<FullVisit | null>(null)
  const [loading, setLoading] = useState(true)
  /** Signed display URLs per photo id (bucket is private) */
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map())

  // Edit state
  const [notes, setNotes] = useState('')
  const [recordStatus, setRecordStatus] = useState<'Normal' | 'Critical'>('Normal')
  const [visitNumber, setVisitNumber] = useState<number | ''>('')
  const [date, setDate] = useState('')
  const [weather, setWeather] = useState<string[]>([])

  // Fresh GPS fix so photos added during the edit still get watermarked coordinates
  const { state: geoState, geo, capture: captureGeo } = useGeolocation(true)
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
          setVisitNumber(v.visit_number ?? '')
          setDate(v.date)
          setWeather(v.weather ? v.weather.split(', ').filter(Boolean) : [])
          if (v.photos.length > 0) {
            getSignedPhotoUrls(v.photos).then(setSignedUrls).catch(() => {})
          }
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

        // 1. Update visit fields
        const { error: updateError } = await supabase
          .from('visits')
          .update({
            notes: notes.trim() || null,
            record_status: recordStatus,
            visit_number: visitNumber === '' ? null : visitNumber,
            date,
            weather: weather.join(', ') || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', visit.id)

        if (updateError) throw updateError

        // 2. Delete removed photos — DB rows first, then their storage objects
        if (deletedPhotoIds.size > 0) {
          const idsToDelete = Array.from(deletedPhotoIds)
          const rowsToDelete = visit.photos.filter((p) => deletedPhotoIds.has(p.id))

          const { error: deleteError } = await supabase
            .from('photos')
            .delete()
            .in('id', idsToDelete)
          if (deleteError) throw deleteError

          // Best-effort storage cleanup (rows are gone; orphaned files are the
          // only possible inconsistency, never dangling DB references)
          const paths = collectStoragePaths(rowsToDelete)
          if (paths.length > 0) {
            const { error: storageError } = await supabase.storage.from('site-photos').remove(paths)
            if (storageError) console.warn('[edit] storage cleanup failed', storageError)
          }
        }

        // 3. Upload and insert new photos — user-scoped folder, same layout as sync.ts
        if (newPhotos.length > 0) {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) throw new Error('Session expired — please sign in again')
          for (const p of newPhotos) {
            const { publicUrl, storagePath } = await uploadToStorage(p.blob, `${user.id}/${visit.id}`)
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

    // Photo rows cascade with the visit; storage objects don't — clean them up first
    const paths = collectStoragePaths(visit.photos)

    const { error } = await supabase.from('visits').delete().eq('id', visit.id)

    if (error) {
      alert('Failed to delete visit')
      setDeleting(false)
    } else {
      if (paths.length > 0) {
        const { error: storageError } = await supabase.storage.from('site-photos').remove(paths)
        if (storageError) console.warn('[delete] storage cleanup failed', storageError)
      }
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
        <span>{new Date(date || visit.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        {visitNumber !== '' && (
          <span className="ml-auto font-mono text-xs text-accent">Visit № {visitNumber}</span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-5">

        {/* Date + Visit number */}
        <div className="card grid grid-cols-2 gap-3">
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-field"
              required
            />
          </div>
          <div>
            <label className="label">Visit No.</label>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={visitNumber}
              onChange={(e) => setVisitNumber(e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
              placeholder="not assigned"
              className="input-field"
            />
          </div>
        </div>

        {/* Weather */}
        <div className="card space-y-3">
          <label className="label flex items-center gap-2">
            <Cloud className="size-4" /> Weather Conditions
          </label>
          <div className="flex flex-wrap gap-2">
            {WEATHER_OPTIONS.map((opt) => {
              const active = weather.includes(opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    setWeather((w) => (w.includes(opt.value) ? w.filter((x) => x !== opt.value) : [...w, opt.value]))
                  }
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all active:scale-95 ${
                    active
                      ? 'bg-accent text-bg-primary border-accent'
                      : 'bg-bg-tertiary text-text-secondary border-border'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
        
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
                    <img src={signedUrls.get(p.id) ?? p.storage_url} alt={p.caption || ''} className="w-full h-full object-cover" />
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
          <div className="flex items-center justify-between">
            <label className="label mb-0">Add New Photos</label>
            {geoState.status === 'acquired' ? (
              <span className="flex items-center gap-1 text-[10px] text-success font-mono">
                <LocateFixed className="size-3" />
                {geoState.geo.latitude.toFixed(5)}, {geoState.geo.longitude.toFixed(5)}
              </span>
            ) : geoState.status === 'requesting' ? (
              <span className="flex items-center gap-1 text-[10px] text-text-muted">
                <Loader2 className="size-3 animate-spin" /> Locating…
              </span>
            ) : (
              <button
                type="button"
                onClick={captureGeo}
                className="flex items-center gap-1 text-[10px] text-warning underline"
              >
                <LocateOff className="size-3" /> Get GPS
              </button>
            )}
          </div>
          <PhotoCapture
            photos={newPhotos}
            onChange={setNewPhotos}
            geo={geo}
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
