'use client'

import { useEffect, useMemo, useState } from 'react'
import { Calendar, CheckCircle2, Download, Loader2, Mail, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useProjects } from '@/lib/ProjectsContext'
import type { Project, Visit, Photo } from '@/lib/types'

type FullVisit = Visit & { photos: Photo[] }

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/** Convert Blob to base64 string */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload  = () => resolve((r.result as string).split(',')[1])
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

export default function ReportsPage() {
  const { projects } = useProjects()
  const [projectId, setProjectId]   = useState('')
  const [month, setMonth]           = useState(monthKey(new Date()))
  const [visits, setVisits]         = useState<FullVisit[]>([])
  const [loading, setLoading]       = useState(false)
  const [summary, setSummary]       = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [exporting, setExporting]   = useState(false)
  const [sending, setSending]       = useState(false)
  const [sentTo, setSentTo]         = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  // Optional per-send override — populated from the modal input
  const [recipientOverride, setRecipientOverride] = useState('')
  const [showEmailModal, setShowEmailModal]        = useState(false)

  useEffect(() => {
    if (projects.length > 0 && !projectId) setProjectId(projects[0].id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects])

  useEffect(() => {
    if (!projectId || !month) return
    setLoading(true)
    setSummary('')
    const supabase = createClient()
    const [y, m] = month.split('-').map(Number)
    const start = `${month}-01`
    const endDate = new Date(y, m, 0)
    const end = `${month}-${String(endDate.getDate()).padStart(2, '0')}`

    supabase
      .from('visits')
      .select('*, photos(*)')
      .eq('project_id', projectId)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
      .then(({ data }) => {
        if (data) setVisits(data as FullVisit[])
        setLoading(false)
      })
  }, [projectId, month])

  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId])

  async function handleSummarize() {
    if (visits.length === 0 || !project) return
    setSummarizing(true)
    setError(null)
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: project.name,
          monthLabel: monthLabel(month),
          notes: visits.map((v) => ({ date: v.date, weather: v.weather, notes: v.notes, record_status: (v as any).record_status })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setSummary(data.summary)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSummarizing(false)
    }
  }

  /** Build the PDF blob — shared between download and email */
  async function buildPDF(): Promise<Blob> {
    if (!project) throw new Error('No project selected')
    // Lazy load the heavy pdf generator ONLY when exporting
    const { generateReportPDF } = await import('@/lib/pdf')
    
    return generateReportPDF({
      project,
      visits,
      monthLabel: monthLabel(month),
      summary: summary || 'Нема генерирана техничка нарација.',
    })
  }

  async function handleExportPDF() {
    if (!project || visits.length === 0) return
    setExporting(true)
    setError(null)
    try {
      const blob = await buildPDF()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `Izvestaj_${project.name.replace(/\s+/g, '_')}_${month}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setExporting(false)
    }
  }

  async function handleSendEmail() {
    if (!project || visits.length === 0) return
    setSending(true)
    setSentTo(null)
    setError(null)
    setShowEmailModal(false)
    try {
      // 1. Generate PDF on the client (same as download path)
      const blob      = await buildPDF()
      const pdfBase64 = await blobToBase64(blob)

      const overallStatus = visits.some((v) => (v as any).record_status === 'Critical')
        ? 'Critical' : 'Normal'

      // 2. POST to the server route — Resend sends from there
      const res = await fetch('/api/send-report', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfBase64,
          projectName:   project.name,
          clientInfo:    project.client_info,
          monthLabel:    monthLabel(month),
          visitCount:    visits.length,
          overallStatus,
          recipientEmail: recipientOverride.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Send failed')
      setSentTo(data.sentTo)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const totalPhotos = useMemo(() => visits.reduce((acc, v) => acc + v.photos.length, 0), [visits])

  return (
    <div className="py-5 space-y-5">
      <h1 className="text-2xl font-bold">Monthly Reports</h1>

      {/* Filters */}
      <div className="card space-y-4">
        <div>
          <label className="label">Project</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="input-field appearance-none"
          >
            {projects.length === 0 && <option value="">No projects</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label flex items-center gap-2">
            <Calendar className="size-4" /> Month
          </label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      {/* Actions card */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{monthLabel(month)}</h2>
          <span className="chip">
            {loading ? '…' : `${visits.length} посети · ${totalPhotos} фотографии`}
          </span>
        </div>

        {visits.length === 0 && !loading && (
          <p className="text-text-muted text-sm py-4 text-center">No visits in this month</p>
        )}

        {visits.length > 0 && (
          <>
            <button onClick={handleSummarize} disabled={summarizing} className="btn-secondary w-full">
              {summarizing ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
              {summarizing ? 'Генерирање нарација…' : summary ? 'Regenerate AI Narrative' : 'Generate AI Narrative'}
            </button>

            {summary && (
              <div className="rounded-xl bg-bg-secondary border border-border p-4 max-h-64 overflow-y-auto">
                <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">{summary}</p>
              </div>
            )}

            {/* Download */}
            <button onClick={handleExportPDF} disabled={exporting || sending} className="btn-primary w-full">
              {exporting ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />}
              {exporting ? 'Building PDF…' : 'Export PDF Report'}
            </button>

            {/* Email */}
            <button
              onClick={() => setShowEmailModal(true)}
              disabled={sending || exporting}
              className="btn-secondary w-full"
            >
              {sending ? <Loader2 className="size-5 animate-spin" /> : <Mail className="size-5" />}
              {sending ? 'Испраќање…' : 'Email Report to Client'}
            </button>
          </>
        )}

        {/* Sent confirmation */}
        {sentTo && (
          <div className="flex items-center gap-2 rounded-xl bg-success/10 border border-success/30 px-4 py-3 text-sm text-success">
            <CheckCircle2 className="size-5 shrink-0" />
            <span>Испратено до <strong>{sentTo}</strong></span>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-danger/15 border border-danger/30 p-3 text-sm text-danger">
            {error}
          </div>
        )}
      </div>

      {/* Email recipient modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-bg-primary/80 backdrop-blur">
          <div className="card w-full max-w-sm space-y-4">
            <h3 className="font-bold text-lg">Send Report by Email</h3>
            <p className="text-sm text-text-secondary">
              Leave blank to use the email from the project&apos;s client info
              {project?.client_info ? ` (${project.client_info.match(/[\w._%+\-]+@[\w.\-]+\.[a-zA-Z]{2,}/)?.[0] ?? 'none found'})` : ''}
              , or enter an override address.
            </p>
            <div>
              <label className="label">Recipient Email (optional)</label>
              <input
                type="email"
                value={recipientOverride}
                onChange={(e) => setRecipientOverride(e.target.value)}
                placeholder="client@example.com"
                className="input-field"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowEmailModal(false)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button onClick={handleSendEmail} className="btn-primary flex-1">
                <Mail className="size-4" /> Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visit list preview */}
      {visits.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
            Visits in this period
          </h3>
          <div className="space-y-2">
            {visits.map((v) => (
              <div key={v.id} className="card">
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>{new Date(v.date).toLocaleDateString('en-US')}</span>
                  <span>{v.photos.length} photos</span>
                </div>
                {v.notes && <p className="text-sm mt-2 line-clamp-3">{v.notes}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
