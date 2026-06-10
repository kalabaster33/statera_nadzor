'use client'

import { createClient } from './supabase/client'
import type { Photo } from './types'

const BUCKET = 'site-photos'
/** Signed URL lifetime in seconds — long enough for a report session */
const DEFAULT_TTL = 60 * 60

/**
 * Derive the storage object path from a stored URL.
 * Handles both legacy public URLs (…/object/public/site-photos/<path>)
 * and previously signed ones (…/object/sign/site-photos/<path>?token=…).
 */
export function storagePathFromUrl(url: string): string | null {
  const m = url.match(/\/object\/(?:public|sign)\/site-photos\/([^?]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

/** Resolve the storage path of a photo row, falling back to URL parsing for older rows. */
export function resolveStoragePath(photo: Pick<Photo, 'storage_url' | 'storage_path'>): string | null {
  return photo.storage_path ?? storagePathFromUrl(photo.storage_url)
}

/** Collect all storage paths (compressed + hi-res) for a set of photo rows. */
export function collectStoragePaths(photos: Photo[]): string[] {
  const paths: string[] = []
  for (const p of photos) {
    const main = resolveStoragePath(p)
    if (main) paths.push(main)
    const hi = p.hi_res_path ?? (p.hi_res_url ? storagePathFromUrl(p.hi_res_url) : null)
    if (hi) paths.push(hi)
  }
  return paths
}

/**
 * Create a signed URL for one photo. Falls back to the stored URL if signing
 * fails (e.g. path missing) so display code never breaks outright.
 */
export async function getSignedPhotoUrl(
  photo: Pick<Photo, 'storage_url' | 'storage_path'>,
  ttl: number = DEFAULT_TTL,
): Promise<string> {
  const path = resolveStoragePath(photo)
  if (!path) return photo.storage_url
  const supabase = createClient()
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, ttl)
  if (error || !data?.signedUrl) return photo.storage_url
  return data.signedUrl
}

/**
 * Batch-sign URLs for many photos in one round trip.
 * Returns a Map keyed by photo id → signed URL (or the stored URL as fallback).
 */
export async function getSignedPhotoUrls<T extends Pick<Photo, 'id' | 'storage_url' | 'storage_path'>>(
  photos: T[],
  ttl: number = DEFAULT_TTL,
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (photos.length === 0) return result

  const entries = photos.map((p) => ({ id: p.id, path: resolveStoragePath(p), fallback: p.storage_url }))
  const signable = entries.filter((e): e is typeof e & { path: string } => e.path !== null)

  // Seed fallbacks first — overwritten below where signing succeeds
  for (const e of entries) result.set(e.id, e.fallback)
  if (signable.length === 0) return result

  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(signable.map((e) => e.path), ttl)

  if (!error && data) {
    data.forEach((d, i) => {
      if (d.signedUrl && !d.error) result.set(signable[i].id, d.signedUrl)
    })
  }
  return result
}
