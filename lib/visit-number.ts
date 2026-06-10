'use client'

import { createClient } from './supabase/client'
import { getPendingVisits } from './offline-db'

/**
 * Computes the next sequential visit number for a project.
 *
 * Sources considered:
 *   1. Supabase `visits.visit_number` max for the project (only when online)
 *   2. Locally queued (not-yet-synced) visits in IndexedDB
 *
 * Returns `null` when the number cannot be determined (fully offline with
 * no queued visits for the project) — the caller should leave the field
 * editable/blank and `lib/sync.ts` will assign max+1 server-side at sync time.
 */
export async function getNextVisitNumber(projectId: string): Promise<number | null> {
  let serverMax = 0
  let known = false

  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('visits')
        .select('visit_number')
        .eq('project_id', projectId)
        .not('visit_number', 'is', null)
        .order('visit_number', { ascending: false })
        .limit(1)
      if (!error) {
        known = true
        serverMax = data?.[0]?.visit_number ?? 0
      }
    } catch {
      /* network hiccup — fall through to queue-only */
    }
  }

  let queuedMax = 0
  try {
    const pending = await getPendingVisits()
    for (const q of pending) {
      if (q.project_id === projectId && typeof q.visit_number === 'number') {
        queuedMax = Math.max(queuedMax, q.visit_number)
        known = true
      }
    }
  } catch {
    /* IndexedDB unavailable — ignore */
  }

  if (!known) return null
  return Math.max(serverMax, queuedMax) + 1
}
