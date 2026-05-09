# Nadzor — Construction Supervision PWA

Mobile-first Progressive Web App for civil engineers. Log weekly site visits with photos, generate AI-summarized monthly PDF reports.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** — dark, high-contrast theme tuned for outdoor visibility
- **Supabase** — Postgres + Auth + Storage
- **IndexedDB (Dexie)** — offline queue for visits
- **Anthropic Claude** — summarizes bullet notes into engineering narrative
- **jsPDF** — formal PDF report with photo appendix (2 per page)
- **Service Worker + Manifest** — installable PWA, works offline

## Quick Start

### 1. Install
```bash
npm install
```

### 2. Configure Supabase
- Create a project at https://supabase.com
- In the SQL Editor, paste & run `supabase/schema.sql` (creates tables, storage bucket, RLS policies)
- Copy your URL + anon key from Settings → API

### 3. Environment variables
```bash
cp .env.local.example .env.local
# Fill in:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   ANTHROPIC_API_KEY (server-only)
#   NEXT_PUBLIC_FIRM_NAME (shown in PDF header)
```

### 4. Run
```bash
npm run dev      # development
npm run build && npm start   # production (SW only registers in production)
```

### 5. Install on phone
- Visit the deployed URL on your phone
- Chrome/Safari → "Add to Home Screen"
- Launches as standalone app, with offline support

## Architecture Notes

### Offline-first flow
1. User fills out visit form (works fully offline)
2. Photos compressed via `browser-image-compression` (max 1.2MB, 1920px)
3. Visit + photo blobs saved to IndexedDB via Dexie
4. Sync engine (`lib/sync.ts`) pushes to Supabase when `navigator.onLine`
5. Auto-retries every 60s; also triggers on `online` event

### Why IndexedDB and not just service worker caching?
Visits with photos can be large (multi-MB). The SW handles static asset caching; visit data needs structured storage with sync state — that's IndexedDB's job.

### PDF report structure
1. **Page 1+**: Firm header, project info, AI-generated narrative, visit log table
2. **Appendix**: Photos, 2 per page, captioned with date and optional caption

### Authentication
The schema includes RLS policies, but auth UI is not built in this scaffold. Add Supabase Auth UI or call `supabase.auth.signInWithOtp()` etc. as needed. For development, you can disable RLS or sign in via the Supabase dashboard.

## File Structure
```
app/
  page.tsx              # Dashboard (recent visits)
  layout.tsx            # PWA meta, bottom nav
  visits/new/page.tsx   # ⭐ Mobile entry form (priority)
  projects/             # Projects CRUD
  reports/page.tsx      # Monthly filter + AI + PDF export
  api/summarize/        # Claude API endpoint
  offline/page.tsx      # SW fallback
components/
  PhotoCapture.tsx      # Camera + gallery + compression
  BottomNav.tsx         # Thumb-zone navigation
  OfflineBanner.tsx     # Shows queued count
  SyncProvider.tsx      # Boots sync engine
lib/
  supabase/             # Browser + server clients
  offline-db.ts         # Dexie schema + queue helpers
  sync.ts               # Push queued visits to Supabase
  pdf.ts                # jsPDF report generator
  types.ts              # DB types
public/
  manifest.json         # PWA manifest
  sw.js                 # Service worker
  icons/                # App icons (replace .svg with .png at 192/512)
supabase/
  schema.sql            # Run in SQL Editor
```

## Next Steps (not in this scaffold)

- Auth UI (login/signup screens)
- Visit detail / edit page
- Project edit / delete
- Camera permission UX (PWA on iOS has quirks)
- Push notifications for sync errors
- Replace SVG icons with proper PNGs at 192px and 512px
- E2E tests
