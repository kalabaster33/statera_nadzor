'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, Check, ImagePlus, MapPin, Pencil, X } from 'lucide-react'
import { compressPhoto } from '@/lib/sync'
import { applyWatermark } from '@/lib/watermark'
import type { Geolocation } from '@/lib/types'

export type LocalPhoto = {
  id: string
  /** Watermarked + compressed blob — this is what gets uploaded */
  blob: Blob
  previewUrl: string
  caption: string
  /** True if watermark was successfully applied */
  watermarked: boolean
}

interface Props {
  photos: LocalPhoto[]
  onChange: (photos: LocalPhoto[]) => void
  /** Current GPS fix from useGeolocation — burned into each photo */
  geo: Geolocation | null
  /** Project name burned into each photo */
  projectName: string
}

/**
 * Processing pipeline per photo:
 *   raw File → applyWatermark (canvas) → compressPhoto (browser-image-compression) → Blob
 *
 * Watermark is applied BEFORE compression so the text is at native resolution.
 * If watermarking fails for any reason we fall through to plain compression
 * and set watermarked=false, so the upload is never blocked.
 */
export function PhotoCapture({ photos, onChange, geo, projectName }: Props) {
  const cameraRef  = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy]         = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  /** Photo currently open in the fullscreen viewer/caption editor */
  const [viewerId, setViewerId] = useState<string | null>(null)
  const viewerPhoto = photos.find((p) => p.id === viewerId) ?? null

  // Lock body scroll while the viewer is open
  useEffect(() => {
    if (!viewerId) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [viewerId])

  async function processFile(file: File): Promise<LocalPhoto> {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    // Step 1 — watermark at native resolution
    let watermarkedBlob: Blob
    let watermarked = false
    try {
      setProgress('Applying watermark…')
      watermarkedBlob = await applyWatermark(file, {
        geo,
        projectName: projectName || 'Unknown Project',
      })
      watermarked = true
    } catch (err) {
      console.warn('[watermark] failed, using original', err)
      watermarkedBlob = file
    }

    // Step 2 — compress (now working on the already-watermarked blob)
    setProgress('Compressing…')
    const compressed = await compressPhoto(watermarkedBlob)

    return {
      id,
      blob: compressed,
      previewUrl: URL.createObjectURL(compressed),
      caption: '',
      watermarked,
    }
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    setBusy(true)
    try {
      const newPhotos: LocalPhoto[] = []
      const files = Array.from(fileList)
      for (let i = 0; i < files.length; i++) {
        setProgress(`Photo ${i + 1} / ${files.length}…`)
        newPhotos.push(await processFile(files[i]))
      }
      onChange([...photos, ...newPhotos])
    } finally {
      setBusy(false)
      setProgress(null)
      if (cameraRef.current)  cameraRef.current.value  = ''
      if (galleryRef.current) galleryRef.current.value = ''
    }
  }

  function removePhoto(id: string) {
    const p = photos.find((p) => p.id === id)
    if (p) URL.revokeObjectURL(p.previewUrl)
    onChange(photos.filter((p) => p.id !== id))
  }

  function updateCaption(id: string, caption: string) {
    onChange(photos.map((p) => (p.id === id ? { ...p, caption } : p)))
  }

  return (
    <div className="space-y-3">
      {/* GPS status nudge — shown only if geo is missing */}
      {!geo && (
        <div className="flex items-center gap-2 rounded-lg bg-warning/10 border border-warning/20 px-3 py-2 text-xs text-warning">
          <MapPin className="size-3.5 shrink-0" />
          No GPS fix yet — watermarks will omit coordinates
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={busy}
          className="btn-primary flex-1"
        >
          <Camera className="size-5" />
          {busy ? (progress ?? 'Processing…') : 'Take Photo'}
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          disabled={busy}
          className="btn-secondary px-4"
          aria-label="Choose from gallery"
        >
          <ImagePlus className="size-5" />
        </button>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((p) => (
            <div
              key={p.id}
              className="relative rounded-xl overflow-hidden bg-bg-secondary border border-border"
            >
              <button
                type="button"
                onClick={() => setViewerId(p.id)}
                className="block w-full"
                aria-label="View photo and edit caption"
              >
                <img
                  src={p.previewUrl}
                  alt=""
                  className="w-full aspect-square object-cover"
                />
              </button>

              {/* Watermark badge */}
              <span
                className={`absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium backdrop-blur ${
                  p.watermarked
                    ? 'bg-success/20 text-success border border-success/30'
                    : 'bg-warning/20 text-warning border border-warning/30'
                }`}
              >
                <MapPin className="size-2.5" />
                {p.watermarked ? 'GPS' : 'No GPS'}
              </span>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => removePhoto(p.id)}
                className="absolute top-1.5 right-1.5 size-7 rounded-full bg-bg-primary/80 backdrop-blur grid place-items-center text-text-primary active:scale-90 transition-transform"
                aria-label="Remove photo"
              >
                <X className="size-4" />
              </button>

              {/* Caption preview — tap to edit fullscreen */}
              <button
                type="button"
                onClick={() => setViewerId(p.id)}
                className="w-full flex items-center gap-1.5 bg-bg-primary/80 backdrop-blur text-xs px-2 py-2 border-t border-border text-left"
              >
                <Pencil className="size-3 shrink-0 text-text-muted" />
                <span className={`truncate ${p.caption ? 'text-text-primary' : 'text-text-muted'}`}>
                  {p.caption || 'Add caption…'}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}

      {photos.length > 0 && (
        <p className="text-xs text-text-muted text-center">
          {photos.length} photo{photos.length === 1 ? '' : 's'} ·{' '}
          {photos.filter((p) => p.watermarked).length} watermarked · compressed
        </p>
      )}

      {/* Fullscreen viewer + large caption editor */}
      {viewerPhoto && (
        <div className="fixed inset-0 z-50 flex flex-col bg-bg-primary">
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <span className="text-sm font-medium text-text-secondary">
              Photo {photos.findIndex((p) => p.id === viewerPhoto.id) + 1} / {photos.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { removePhoto(viewerPhoto.id); setViewerId(null) }}
                className="size-10 rounded-xl bg-danger/10 text-danger border border-danger/20 grid place-items-center active:scale-95"
                aria-label="Delete photo"
              >
                <X className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => setViewerId(null)}
                className="btn-primary px-4 py-2"
              >
                <Check className="size-4" /> Done
              </button>
            </div>
          </div>

          {/* Image */}
          <div className="flex-1 min-h-0 grid place-items-center px-2">
            <img
              src={viewerPhoto.previewUrl}
              alt=""
              className="max-h-full max-w-full object-contain rounded-lg"
            />
          </div>

          {/* Large caption field */}
          <div className="shrink-0 p-4 pb-6 space-y-2 bg-bg-secondary border-t border-border">
            <label className="label">Caption — appears under the photo in the PDF report</label>
            <textarea
              value={viewerPhoto.caption}
              onChange={(e) => updateCaption(viewerPhoto.id, e.target.value)}
              placeholder="e.g. Column C3 — insufficient concrete cover, 12mm observed"
              rows={3}
              autoFocus
              className="input-field resize-none text-base leading-relaxed"
              enterKeyHint="done"
            />
          </div>
        </div>
      )}
    </div>
  )
}

