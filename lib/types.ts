// ─── Core DB row types ───────────────────────────────────────────────────────

export type Project = {
  id: string
  user_id: string
  name: string
  location: string | null
  client_info: string | null
  created_at: string
  updated_at: string
}

export type ProjectDocument = {
  id: string
  project_id: string
  name: string
  storage_url: string
  storage_path: string
  size_bytes: number | null
  created_at: string
}

/**
 * DB row for the `visits` table.
 * `record_status` = the new Normal/Critical flag (renamed to avoid collision
 *  with the existing `status` draft/final lifecycle field).
 */
export type Visit = {
  id: string
  user_id: string
  project_id: string
  date: string
  weather: string | null
  notes: string | null
  ai_summary: string | null
  /** Lifecycle: whether the report has been finalized */
  status: 'draft' | 'final'
  /** Observation severity, new field — requires schema migration */
  record_status: 'Normal' | 'Critical'
  /** GPS captured at visit time */
  latitude: number | null
  longitude: number | null
  location_accuracy: number | null // metres
  created_at: string
  updated_at: string
}

/**
 * DB row for the `photos` table.
 * `storage_url`     = compressed version (upload target, used in-app)
 * `hi_res_url`      = original-quality URL (new field, optional)
 */
export type Photo = {
  id: string
  visit_id: string
  /** Compressed JPEG stored in Supabase Storage (always present) */
  storage_url: string
  storage_path: string | null
  /** Full-resolution original, stored separately (nullable — added later) */
  hi_res_url: string | null
  hi_res_path: string | null
  caption: string | null
  /** Width × height of the original capture, px */
  original_width: number | null
  original_height: number | null
  created_at: string
}

// ─── Canonical VisitLog JSON ──────────────────────────────────────────────────

/**
 * VisitLog is the single authoritative structure used for:
 *   - the IndexedDB offline queue (QueuedVisit extends this)
 *   - the API response shape (VisitWithRelations)
 *   - PDF / AI report inputs
 *
 * Example JSON:
 * {
 *   "id": "d4f8...",
 *   "project_id": "a1b2...",
 *   "date": "2025-05-08",
 *   "weather": "sunny, hot",
 *   "record_status": "Critical",
 *   "status": "draft",
 *   "geolocation": {
 *     "latitude": 41.9981,
 *     "longitude": 21.4254,
 *     "accuracy": 8
 *   },
 *   "notes": "• Column C3 cover insufficient\n• Pour completed",
 *   "photos": [
 *     {
 *       "id": "ph1...",
 *       "storage_url": "https://…/compressed.jpg",
 *       "hi_res_url": "https://…/original.jpg",
 *       "caption": "Column C3 detail",
 *       "original_width": 4032,
 *       "original_height": 3024
 *     }
 *   ],
 *   "project": { "id": "a1b2...", "name": "Riverside Tower", … }
 * }
 */
export type Geolocation = {
  latitude: number
  longitude: number
  /** Accuracy radius in metres returned by the browser Geolocation API */
  accuracy: number
}

export type VisitLogPhoto = {
  id: string
  storage_url: string
  hi_res_url: string | null
  caption: string | null
  original_width: number | null
  original_height: number | null
}

export type VisitLog = {
  id: string
  project_id: string
  user_id: string
  date: string
  weather: string | null
  /** Normal = routine observations. Critical = safety/structural issue found. */
  record_status: 'Normal' | 'Critical'
  /** Lifecycle: draft until engineer finalises for the month. */
  status: 'draft' | 'final'
  /** Captured from device GPS at time of visit. Null if denied/unavailable. */
  geolocation: Geolocation | null
  notes: string | null
  ai_summary: string | null
  photos: VisitLogPhoto[]
  project: Project
  created_at: string
  updated_at: string
}

// ─── Derived / helper types ───────────────────────────────────────────────────

export type VisitWithRelations = Visit & {
  project: Project
  photos: Photo[]
}

/** Partial VisitLog used while the form is being filled — stored as the draft */
export type VisitDraft = {
  draftId: string
  savedAt: number
  project_id: string
  date: string
  weather: string[]
  record_status: 'Normal' | 'Critical'
  notes: string
  geolocation: Geolocation | null
  /** We can't store Blobs in localStorage; store preview data-URLs and re-use captions */
  photoMeta: { id: string; caption: string; previewDataUrl: string }[]
}
