'use client'

import { createClient } from './supabase/client'
import { db, getPendingVisits, markError, markSynced, markSyncing } from './offline-db'

const COMPRESSION_OPTS = {
  maxSizeMB: 1.2,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  fileType: 'image/jpeg' as const,
}

export async function compressPhoto(file: File | Blob): Promise<Blob> {
  try {
    const f = file instanceof File ? file : new File([file], 'photo.jpg', { type: 'image/jpeg' })
    const imageCompression = (await import('browser-image-compression')).default
    return await imageCompression(f, COMPRESSION_OPTS)
  } catch (err) {
    console.warn('[sync] compression failed, using original', err)
    return file
  }
}

export async function syncPendingVisits(): Promise<{ synced: number; failed: number }> {
  if (!db || !navigator.onLine) return { synced: 0, failed: 0 }

  const supabase = createClient()

  // Never sync without a session — RLS would reject the inserts and the
  // queue would churn into error state. Visits stay queued until sign-in.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { synced: 0, failed: 0 }

  const pending = await getPendingVisits()
  let synced = 0
  let failed = 0

  for (const q of pending) {
    if (!q.id) continue
    await markSyncing(q.id)
    try {
      // 0. Assign visit_number if it couldn't be determined offline:
      //    server max for the project + 1 (fallback 1 for first visit)
      let visitNumber: number | null = q.visit_number ?? null
      if (visitNumber == null) {
        const { data: maxRows } = await supabase
          .from('visits')
          .select('visit_number')
          .eq('project_id', q.project_id)
          .not('visit_number', 'is', null)
          .order('visit_number', { ascending: false })
          .limit(1)
        visitNumber = (maxRows?.[0]?.visit_number ?? 0) + 1
      }

      // 1. Insert visit — now includes geolocation + record_status + visit_number
      const { data: visit, error: visitErr } = await supabase
        .from('visits')
        .insert({
          project_id: q.project_id,
          date: q.date,
          weather: q.weather,
          notes: q.notes,
          record_status: q.record_status ?? 'Normal',
          visit_number: visitNumber,
          latitude: q.geolocation?.latitude ?? null,
          longitude: q.geolocation?.longitude ?? null,
          location_accuracy: q.geolocation?.accuracy ?? null,
          status: 'draft',
        })
        .select()
        .single()

      if (visitErr || !visit) throw visitErr ?? new Error('Visit insert failed')

      // 2. Upload photos — compressed + optional hi-res
      for (let i = 0; i < q.photos.length; i++) {
        const { blob, hiResBlob, caption } = q.photos[i]
        const ts = `${Date.now()}-${i}`
        const basePath = `${user.id}/${visit.id}/${ts}`

        // Compressed upload (always)
        const compressedPath = `${basePath}.jpg`
        const { error: upErr } = await supabase.storage
          .from('site-photos')
          .upload(compressedPath, blob, { contentType: 'image/jpeg', upsert: false })
        if (upErr) throw upErr
        // Bucket is private: this URL is stored as a stable identifier only.
        // All display/PDF consumers resolve a signed URL from storage_path
        // via lib/photo-url.ts.
        const { data: pub } = supabase.storage.from('site-photos').getPublicUrl(compressedPath)

        // Hi-res upload (if available)
        let hiResUrl: string | null = null
        let hiResPath: string | null = null
        if (hiResBlob) {
          hiResPath = `${basePath}_original.jpg`
          const { error: hrErr } = await supabase.storage
            .from('site-photos')
            .upload(hiResPath, hiResBlob, { contentType: 'image/jpeg', upsert: false })
          if (!hrErr) {
            const { data: hrPub } = supabase.storage.from('site-photos').getPublicUrl(hiResPath)
            hiResUrl = hrPub.publicUrl
          }
        }

        await supabase.from('photos').insert({
          visit_id: visit.id,
          storage_url: pub.publicUrl,
          storage_path: compressedPath,
          hi_res_url: hiResUrl,
          hi_res_path: hiResPath,
          caption: caption ?? null,
        })
      }

      await markSynced(q.id)
      synced++
    } catch (err: any) {
      console.error('[sync] visit failed', err)
      await markError(q.id, err?.message ?? 'Unknown error')
      failed++
    }
  }

  return { synced, failed }
}

// Auto-sync on online + periodic
export function initSyncEngine() {
  if (typeof window === 'undefined') return

  const trigger = () => {
    if (navigator.onLine) syncPendingVisits().catch(() => {})
  }

  window.addEventListener('online', trigger)
  setTimeout(trigger, 2000)
  setInterval(trigger, 60_000)

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'SYNC_VISITS') trigger()
    })
  }
}

export async function uploadToStorage(blob: Blob, prefix: string): Promise<{ publicUrl: string; storagePath: string }> {
  const supabase = createClient()
  const ts = Date.now()
  const storagePath = `${prefix}/${ts}.jpg`
  
  const { error } = await supabase.storage
    .from('site-photos')
    .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: false })
    
  if (error) throw error
  
  const { data } = supabase.storage.from('site-photos').getPublicUrl(storagePath)
  return { publicUrl: data.publicUrl, storagePath }
}

