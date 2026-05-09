'use client'

import type { Geolocation } from './types'

export type WatermarkOptions = {
  geo: Geolocation | null
  projectName: string
  /** ISO date string, defaults to today */
  date?: string
}

/**
 * Draws a metadata watermark onto a copy of the source image using an
 * off-screen Canvas, then returns the result as a JPEG Blob.
 *
 * The watermark is a semi-transparent dark bar pinned to the bottom of the
 * image containing three lines:
 *   • Project name
 *   • GPS coordinates (or "GPS недостапен" if denied)
 *   • Date + time of capture
 *
 * The function never mutates the input blob.
 */
export async function applyWatermark(
  source: Blob,
  opts: WatermarkOptions,
): Promise<Blob> {
  const { geo, projectName, date } = opts

  // Decode the source blob into an ImageBitmap (works in all modern browsers
  // and avoids the synchronous Image.src = dataURL pattern)
  const bitmap = await createImageBitmap(source)
  const { width: W, height: H } = bitmap

  // Create an off-screen canvas at the image's native resolution
  const canvas = document.createElement('canvas')
  canvas.width  = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Draw the original image first
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  // ── Watermark metrics ────────────────────────────────────────────────────────
  // Scale font to ~2.2 % of the shorter dimension so it's legible on any res
  const BASE = Math.min(W, H)
  const FONT_SIZE   = Math.round(BASE * 0.022)
  const LINE_H      = FONT_SIZE * 1.55
  const PADDING     = Math.round(BASE * 0.018)
  const LINES       = 3
  const STRIP_H     = LINE_H * LINES + PADDING * 2

  // ── Watermark content ────────────────────────────────────────────────────────
  const captureDate = date
    ? new Date(date).toLocaleDateString('mk-MK', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('mk-MK', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const captureTime = new Date().toLocaleTimeString('mk-MK', { hour: '2-digit', minute: '2-digit' })

  const geoLine = geo
    ? `GPS: ${geo.latitude.toFixed(5)}°N, ${geo.longitude.toFixed(5)}°E  ±${geo.accuracy}m`
    : 'GPS: недостапен'

  const textLines = [
    `📁 ${projectName}`,
    geoLine,
    `📅 ${captureDate}  ${captureTime}`,
  ]

  // ── Draw strip background ────────────────────────────────────────────────────
  const stripY = H - STRIP_H
  ctx.fillStyle = 'rgba(8, 12, 20, 0.72)'
  ctx.fillRect(0, stripY, W, STRIP_H)

  // ── Subtle top edge line for visual separation ────────────────────────────────
  ctx.strokeStyle = 'rgba(255, 176, 32, 0.6)'   // brand gold
  ctx.lineWidth   = Math.max(1, Math.round(BASE * 0.002))
  ctx.beginPath()
  ctx.moveTo(0, stripY)
  ctx.lineTo(W, stripY)
  ctx.stroke()

  // ── Draw text lines ──────────────────────────────────────────────────────────
  ctx.font         = `${FONT_SIZE}px -apple-system, system-ui, sans-serif`
  ctx.textBaseline = 'top'
  ctx.fillStyle    = 'rgba(255,255,255,0.95)'

  textLines.forEach((line, i) => {
    const x = PADDING
    const y = stripY + PADDING + i * LINE_H
    // Subtle drop shadow for legibility on bright images
    ctx.shadowColor   = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur    = Math.round(BASE * 0.004)
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = 1
    ctx.fillText(line, x, y, W - PADDING * 2)
  })

  // ── Logo mark — small gold dot + "SE" monogram top-right ────────────────────
  const DOT_R  = Math.round(BASE * 0.012)
  const DOT_X  = W - PADDING - DOT_R
  const DOT_Y  = stripY + PADDING + DOT_R
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur  = 0
  ctx.fillStyle   = 'rgba(255, 176, 32, 0.9)'
  ctx.beginPath()
  ctx.arc(DOT_X, DOT_Y, DOT_R, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle  = 'rgba(8,12,20,0.95)'
  ctx.font       = `bold ${Math.round(DOT_R * 1.1)}px system-ui`
  ctx.textAlign  = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('SE', DOT_X, DOT_Y)

  // ── Export ───────────────────────────────────────────────────────────────────
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas toBlob returned null'))
      },
      'image/jpeg',
      0.90,   // quality — high enough to keep watermark text crisp
    )
  })
}
