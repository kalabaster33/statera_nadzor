'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { clearDraft, loadDraft, saveDraft } from '@/lib/offline-db'
import type { Geolocation } from '@/lib/types'
import type { LocalPhoto } from '@/components/PhotoCapture'

// ─── Timing constants ─────────────────────────────────────────────────────────
/** Debounce for text/field changes — waits for a pause in typing */
const TEXT_DEBOUNCE_MS = 2_000
/** Photos are saved immediately (no debounce) because they're the most
 *  expensive to re-capture if the app crashes mid-session */
const PHOTO_SAVE_IMMEDIATE = true

// ─── Types ────────────────────────────────────────────────────────────────────

export type DraftState = {
  project_id: string
  date: string
  weather: string[]
  record_status: 'Normal' | 'Critical'
  notes: string
  geolocation: Geolocation | null
}

export type UseDraftReturn = {
  /** True only while the initial IndexedDB restore is in-flight */
  restoring: boolean
  /** Timestamp of the recovered draft, or null if no draft existed */
  restoredAt: number | null
  /** Blob-backed LocalPhoto objects rebuilt from the stored draft */
  restoredPhotos: LocalPhoto[]
  /**
   * Call this whenever any text field changes.
   * Internally debounced — does NOT save immediately.
   */
  scheduleTextSave: (state: DraftState, photos: LocalPhoto[]) => void
  /**
   * Call this whenever the photos array changes (add or remove).
   * Saves immediately — no debounce — so a crash right after capture
   * doesn't lose the new photo blob.
   */
  savePhotosNow: (state: DraftState, photos: LocalPhoto[]) => Promise<void>
  /** Remove the draft from IndexedDB (call on successful submit) */
  discardDraft: () => Promise<void>
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDraft(): UseDraftReturn {
  const [restoring, setRestoring]         = useState(true)
  const [restoredAt, setRestoredAt]       = useState<number | null>(null)
  const [restoredPhotos, setRestoredPhotos] = useState<LocalPhoto[]>([])

  // Debounce timer ref
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Always-fresh snapshot of the last state+photos seen — used by the
  // visibilitychange / beforeunload flush handlers
  const latestRef  = useRef<{ state: DraftState; photos: LocalPhoto[] } | null>(null)
  // Guard so we don't fire saves during the initial restore phase
  const readyRef   = useRef(false)

  // ── Initial restore ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadDraft()
      .then((draft) => {
        if (!draft) return
        setRestoredAt(draft.savedAt)
        const photos: LocalPhoto[] = draft.photos.map((p) => ({
          id:          p.id,
          blob:        p.blob,
          previewUrl:  URL.createObjectURL(p.blob),
          caption:     p.caption,
          watermarked: false,   // watermark state isn't persisted; cosmetic only
        }))
        setRestoredPhotos(photos)
      })
      .catch(console.warn)
      .finally(() => {
        setRestoring(false)
        readyRef.current = true
      })
  }, [])

  // ── Core write helper ────────────────────────────────────────────────────────
  const persist = useCallback(async (state: DraftState, photos: LocalPhoto[]) => {
    if (!readyRef.current) return
    try {
      await saveDraft({
        draftId:       'current',
        savedAt:       Date.now(),
        project_id:    state.project_id,
        date:          state.date,
        weather:       state.weather,
        record_status: state.record_status,
        notes:         state.notes,
        geolocation:   state.geolocation,
        photos:        photos.map((p) => ({
          id:      p.id,
          blob:    p.blob,
          caption: p.caption,
        })),
      })
    } catch (err) {
      console.warn('[draft] persist failed', err)
    }
  }, [])

  // ── Text-field save (debounced) ──────────────────────────────────────────────
  const scheduleTextSave = useCallback((state: DraftState, photos: LocalPhoto[]) => {
    latestRef.current = { state, photos }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => persist(state, photos), TEXT_DEBOUNCE_MS)
  }, [persist])

  // ── Photo save (immediate) ───────────────────────────────────────────────────
  const savePhotosNow = useCallback(async (state: DraftState, photos: LocalPhoto[]) => {
    latestRef.current = { state, photos }
    if (timerRef.current) {
      // Cancel any pending text debounce — this write covers it
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    await persist(state, photos)
  }, [persist])

  // ── visibilitychange flush ────────────────────────────────────────────────────
  // Fired when the user switches apps, locks the screen, or tabs away.
  // This is the most reliable crash-recovery hook on mobile — the browser
  // may kill the tab immediately after 'hidden', so we flush synchronously.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden' && latestRef.current) {
        const { state, photos } = latestRef.current
        // Cancel any pending debounce
        if (timerRef.current) clearTimeout(timerRef.current)
        // Fire and forget — browser gives us a short window
        persist(state, photos)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [persist])

  // ── beforeunload flush ────────────────────────────────────────────────────────
  // Belt-and-suspenders for desktop browsers and PWA close gestures.
  // IndexedDB writes inside beforeunload are unreliable in some browsers;
  // we still attempt it as a best-effort. On mobile, visibilitychange is
  // more reliable and fires first.
  useEffect(() => {
    function handleBeforeUnload() {
      if (!latestRef.current) return
      const { state, photos } = latestRef.current
      if (timerRef.current) clearTimeout(timerRef.current)
      // Synchronous-style best-effort — IndexedDB is async so we can't await
      persist(state, photos)
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [persist])

  // ── Cleanup blob URLs on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      restoredPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl))
    }
  }, [restoredPhotos])

  // ── Discard ──────────────────────────────────────────────────────────────────
  const discardDraft = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    latestRef.current = null
    await clearDraft()
  }, [])

  return {
    restoring,
    restoredAt,
    restoredPhotos,
    scheduleTextSave,
    savePhotosNow,
    discardDraft,
  }
}

