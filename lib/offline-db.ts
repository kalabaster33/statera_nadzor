'use client'

import Dexie, { Table } from 'dexie'
import type { Geolocation, VisitDraft } from './types'

// ─── Queued visits (pending sync) ────────────────────────────────────────────

export interface QueuedVisit {
  id?: number
  localId: string
  project_id: string
  date: string
  weather: string | null
  record_status: 'Normal' | 'Critical'
  geolocation: Geolocation | null
  notes: string | null
  /** Compressed blob for upload + optional hi-res blob */
  photos: { blob: Blob; hiResBlob?: Blob; caption?: string }[]
  createdAt: number
  syncStatus: 'pending' | 'syncing' | 'synced' | 'error'
  error?: string
}

// ─── Form drafts (survive refresh) ───────────────────────────────────────────

/**
 * Stored in IndexedDB so that:
 *  - Blobs (photos) survive a page refresh (localStorage can't hold them)
 *  - Draft is auto-restored when the user re-opens the New Visit form
 *
 * Each user session has at most ONE active draft (draftId = 'current').
 */
export interface StoredDraft {
  id?: number
  draftId: string                   // always 'current' for the active form draft
  savedAt: number
  project_id: string
  date: string
  weather: string[]
  record_status: 'Normal' | 'Critical'
  notes: string
  geolocation: Geolocation | null
  /** Full blobs — so photos survive without needing re-capture */
  photos: { id: string; blob: Blob; caption: string }[]
}

// ─── Dexie DB ─────────────────────────────────────────────────────────────────

class NadzorDB extends Dexie {
  queuedVisits!: Table<QueuedVisit, number>
  drafts!: Table<StoredDraft, number>

  constructor() {
    super('nadzor-pwa')
    this.version(2).stores({
      queuedVisits: '++id, localId, syncStatus, createdAt',
      drafts: '++id, draftId, savedAt',
    })
  }
}

export const db = typeof window !== 'undefined' ? new NadzorDB() : (null as unknown as NadzorDB)

// ─── Queue helpers ────────────────────────────────────────────────────────────

export async function queueVisit(visit: Omit<QueuedVisit, 'id' | 'createdAt' | 'syncStatus'>) {
  if (!db) throw new Error('DB not available')
  return db.queuedVisits.add({
    ...visit,
    createdAt: Date.now(),
    syncStatus: 'pending',
  })
}

export async function getPendingVisits() {
  if (!db) return []
  return db.queuedVisits.where('syncStatus').anyOf('pending', 'error').toArray()
}

export async function markSynced(id: number) {
  if (!db) return
  return db.queuedVisits.delete(id)
}

export async function markError(id: number, error: string) {
  if (!db) return
  return db.queuedVisits.update(id, { syncStatus: 'error', error })
}

export async function markSyncing(id: number) {
  if (!db) return
  return db.queuedVisits.update(id, { syncStatus: 'syncing' })
}

// ─── Draft helpers ─────────────────────────────────────────────────────────────

const DRAFT_KEY = 'current'

export async function saveDraft(draft: Omit<StoredDraft, 'id'>) {
  if (!db) return
  const existing = await db.drafts.where('draftId').equals(DRAFT_KEY).first()
  if (existing?.id) {
    await db.drafts.update(existing.id, { ...draft, savedAt: Date.now() })
  } else {
    await db.drafts.add({ ...draft, savedAt: Date.now() })
  }
}

export async function loadDraft(): Promise<StoredDraft | null> {
  if (!db) return null
  return (await db.drafts.where('draftId').equals(DRAFT_KEY).first()) ?? null
}

export async function clearDraft() {
  if (!db) return
  await db.drafts.where('draftId').equals(DRAFT_KEY).delete()
}

