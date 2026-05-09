'use client'

import { useRef, useState } from 'react'
import { Camera, ImagePlus, MapPin, X } from 'lucide-react'
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
              <img
                src={p.previewUrl}
                alt=""
                className="w-full aspect-square object-cover"
              />

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

              {/* Caption */}
              <input
                type="text"
                placeholder="Caption (optional)"
                value={p.caption}
                onChange={(e) => updateCaption(p.id, e.target.value)}
                className="w-full bg-bg-primary/80 backdrop-blur text-xs text-text-primary px-2 py-1.5 border-t border-border focus:outline-none focus:bg-bg-primary"
              />
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
    </div>
  )
}

