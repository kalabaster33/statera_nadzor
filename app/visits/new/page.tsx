'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CheckCircle,
  Cloud,
  History,
  Locate,
  LocateFixed,
  LocateOff,
  Loader2,
  Save,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { queueVisit } from '@/lib/offline-db'
import { syncPendingVisits } from '@/lib/sync'
import { useGeolocation } from '@/lib/useGeolocation'
import { useDraft } from '@/lib/useDraft'
import { PhotoCapture, type LocalPhoto } from '@/components/PhotoCapture'
import type { Project } from '@/lib/types'

const WEATHER_OPTIONS = [
  { value: 'sunny', label: '☀️ Sunny' },
  { value: 'cloudy', label: '☁️ Cloudy' },
  { value: 'rainy', label: '🌧️ Rainy' },
  { value: 'snowy', label: '❄️ Snow' },
  { value: 'windy', label: '💨 Windy' },
  { value: 'hot', label: '🔥 Hot' },
  { value: 'cold', label: '🥶 Cold' },
]

export default function NewVisitPage() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [projects, setProjects] = useState<Project[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)

  // ── Form state ──────────────────────────────────────────────────────────────
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [projectId, setProjectId] = useState('')
  const [weather, setWeather] = useState<string[]>([])
  const [recordStatus, setRecordStatus] = useState<'Normal' | 'Critical'>('Normal')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<LocalPhoto[]>([])
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Draft system ────────────────────────────────────────────────────────────
  const { restoring, restoredAt, restoredPhotos, scheduleTextSave, savePhotosNow, discardDraft } = useDraft()
  const [draftRestored, setDraftRestored] = useState(false)
  const [showDraftBanner, setShowDraftBanner] = useState(false)
  const initialized = useRef(false)

  // Restore draft into form state once on mount
  useEffect(() => {
    if (restoring || initialized.current) return
    initialized.current = true

    if (restoredAt) {
      // Restore photos from draft
      if (restoredPhotos.length > 0) {
        setPhotos(restoredPhotos)
      }
      setShowDraftBanner(true)
      setDraftRestored(true)
    }
  }, [restoring, restoredAt, restoredPhotos])

  // Separate effect to restore scalar fields once projects are loaded
  // (we need project list to validate project_id)
  const [pendingDraftState, setPendingDraftState] = useState<null | {
    project_id: string; date: string; weather: string[]
    record_status: 'Normal' | 'Critical'; notes: string
  }>(null)

  useEffect(() => {
    if (!draftRestored || !pendingDraftState) return
    if (loadingProjects) return // wait for projects

    const { project_id, date: d, weather: w, record_status, notes: n } = pendingDraftState
    if (projects.find((p) => p.id === project_id)) setProjectId(project_id)
    setDate(d)
    setWeather(w)
    setRecordStatus(record_status)
    setNotes(n)
    setPendingDraftState(null)
  }, [draftRestored, pendingDraftState, projects, loadingProjects])

  // Separate draft restoration that reads from IndexedDB
  useEffect(() => {
    if (!draftRestored) return
    import('@/lib/offline-db').then(({ loadDraft }) => {
      loadDraft().then((draft) => {
        if (!draft) return
        setPendingDraftState({
          project_id: draft.project_id,
          date: draft.date,
          weather: draft.weather,
          record_status: draft.record_status,
          notes: draft.notes,
        })
      })
    })
  }, [draftRestored])

  // Auto-save text fields (debounced — waits for pause in typing)
  useEffect(() => {
    if (restoring) return
    scheduleTextSave(
      { project_id: projectId, date, weather, record_status: recordStatus, notes, geolocation: geo },
      photos
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, date, weather, recordStatus, notes])

  // Auto-save photos immediately on change — crash-safe
  const photosRef = useRef(photos)
  useEffect(() => {
    if (restoring) return
    // Only fire when photos actually changed (not on initial mount)
    if (photos === photosRef.current) return
    photosRef.current = photos
    savePhotosNow(
      { project_id: projectId, date, weather, record_status: recordStatus, notes, geolocation: geo },
      photos
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos])

  // ── Geolocation ─────────────────────────────────────────────────────────────
  const { state: geoState, geo, capture: captureGeo } = useGeolocation(true) // auto-capture on mount

  // ── Projects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('projects')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (data) setProjects(data)
        setLoadingProjects(false)
      })
  }, [])

  function toggleWeather(value: string) {
    setWeather((w) => (w.includes(value) ? w.filter((x) => x !== value) : [...w, value]))
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!projectId) { setError('Please select a project'); return }

    startTransition(async () => {
      try {
        await queueVisit({
          localId: `local-${Date.now()}`,
          project_id: projectId,
          date,
          weather: weather.join(', ') || null,
          record_status: recordStatus,
          geolocation: geo,
          notes: notes.trim() || null,
          photos: photos.map((p) => ({ blob: p.blob, caption: p.caption || undefined })),
        })

        if (navigator.onLine) await syncPendingVisits()

        await discardDraft()
        photos.forEach((p) => URL.revokeObjectURL(p.previewUrl))
        setSuccess(true)
        setTimeout(() => router.push('/'), 1200)
      } catch (err: any) {
        setError(err?.message || 'Failed to save')
      }
    })
  }

  // ── Success screen ───────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-[70vh] grid place-items-center text-center">
        <div className="space-y-3">
          <CheckCircle2 className="size-16 text-success mx-auto" strokeWidth={1.5} />
          <h2 className="text-xl font-semibold">Visit saved</h2>
          <p className="text-sm text-text-muted">
            {navigator.onLine ? 'Synced to cloud' : 'Saved locally — will sync when online'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="py-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="size-10 rounded-xl bg-bg-tertiary border border-border grid place-items-center active:scale-95"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-bold flex-1">New Site Visit</h1>
        {/* Auto-save indicator */}
        <span className="text-[10px] font-mono text-text-muted flex items-center gap-1">
          <CheckCircle className="size-3 text-success" /> Auto-saving
        </span>
      </div>

      {/* Draft restore banner */}
      {showDraftBanner && (
        <div className="rounded-xl bg-warning/10 border border-warning/30 p-3 flex items-start gap-3">
          <History className="size-5 text-warning shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-warning">Draft restored</p>
            <p className="text-xs text-text-muted mt-0.5">
              Saved {new Date(restoredAt!).toLocaleTimeString()} — your previous session&apos;s data is back.
            </p>
          </div>
          <button
            onClick={async () => { await discardDraft(); setShowDraftBanner(false) }}
            className="text-xs text-text-muted underline shrink-0"
          >
            Discard
          </button>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* Project + Date */}
        <div className="card space-y-4">
          <div>
            <label className="label">Project *</label>
            {loadingProjects ? (
              <div className="input-field text-text-muted flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : projects.length === 0 ? (
              <div className="input-field text-text-muted text-sm">
                No projects yet.{' '}
                <Link href="/projects/new" className="text-accent underline">
                  Create one
                </Link>
              </div>
            ) : (
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="input-field appearance-none"
                required
              >
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

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
        </div>

        {/* Observation Status — Normal / Critical */}
        <div className="card space-y-3">
          <label className="label">Observation Status</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setRecordStatus('Normal')}
              className={`flex items-center justify-center gap-2.5 rounded-xl border py-3.5 text-sm font-semibold transition-all active:scale-95 ${
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
              className={`flex items-center justify-center gap-2.5 rounded-xl border py-3.5 text-sm font-semibold transition-all active:scale-95 ${
                recordStatus === 'Critical'
                  ? 'bg-danger/15 border-danger text-danger shadow-[0_0_0_3px_rgba(255,71,87,0.15)]'
                  : 'bg-bg-tertiary border-border text-text-secondary'
              }`}
            >
              <ShieldAlert className="size-5" />
              Critical
            </button>
          </div>
          {recordStatus === 'Critical' && (
            <div className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
              Critical visits are flagged in reports and home dashboard
            </div>
          )}
        </div>

        {/* Geolocation */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <label className="label mb-0">Location</label>
            {geoState.status !== 'acquired' && (
              <button
                type="button"
                onClick={captureGeo}
                disabled={geoState.status === 'requesting'}
                className="btn-secondary py-1.5 px-3 text-xs"
              >
                {geoState.status === 'requesting'
                  ? <><Loader2 className="size-3.5 animate-spin" /> Locating…</>
                  : <><Locate className="size-3.5" /> Get GPS</>
                }
              </button>
            )}
          </div>

          {geoState.status === 'acquired' && (
            <div className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/30 px-3 py-2.5">
              <LocateFixed className="size-4 text-success shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-text-primary">
                  {geoState.geo.latitude.toFixed(5)}, {geoState.geo.longitude.toFixed(5)}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">
                  ±{geoState.geo.accuracy}m accuracy
                </p>
              </div>
              <button type="button" onClick={captureGeo} className="text-[10px] text-text-muted underline">
                Refresh
              </button>
            </div>
          )}

          {geoState.status === 'denied' && (
            <div className="flex items-center gap-2 rounded-lg bg-warning/10 border border-warning/30 px-3 py-2 text-xs text-warning">
              <LocateOff className="size-4 shrink-0" />
              {geoState.message} — coordinates won&apos;t be recorded
            </div>
          )}

          {geoState.status === 'idle' && (
            <p className="text-xs text-text-muted">
              GPS coordinates will be captured automatically
            </p>
          )}
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
                  onClick={() => toggleWeather(opt.value)}
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

        {/* Photos */}
        <div className="card space-y-3">
          <label className="label">Photos</label>
          <PhotoCapture
            photos={photos}
            onChange={setPhotos}
            geo={geo}
            projectName={projects.find((p) => p.id === projectId)?.name ?? ''}
          />
        </div>

        {/* Observations */}
        <div className={`card space-y-3 ${recordStatus === 'Critical' ? 'border-danger/40' : ''}`}>
          <label className="label">
            Observations
            <span className="text-text-muted font-normal ml-1">· bullet points work best</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              recordStatus === 'Critical'
                ? '• CRITICAL: Concrete cover insufficient at column C3 — 12mm observed, 35mm required\n• Rebar exposed at foundation edge\n• Immediate remediation required'
                : '• Foundation pour completed\n• Rebar spacing OK\n• Site clean and safe'
            }
            rows={8}
            className={`input-field resize-none font-mono text-sm leading-relaxed ${
              recordStatus === 'Critical' ? 'border-danger/40 focus:border-danger' : ''
            }`}
            autoCapitalize="sentences"
            autoCorrect="on"
            spellCheck={true}
            enterKeyHint="enter"
          />
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>{notes.length} chars</span>
            <span>AI will format this for reports</span>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-danger/15 border border-danger/30 p-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={pending}
          className={`w-full text-lg py-4 ${
            recordStatus === 'Critical' ? 'btn-danger text-lg py-4 font-bold' : 'btn-primary'
          }`}
        >
          {pending
            ? <><Loader2 className="size-5 animate-spin" /> Saving…</>
            : <><Save className="size-5" /> {recordStatus === 'Critical' ? '⚠ Save Critical Visit' : 'Save Visit'}</>
          }
        </button>

        <p className="text-xs text-text-muted text-center pb-4">
          Draft auto-saved · uploads when online
        </p>
      </form>
    </div>
  )
}

