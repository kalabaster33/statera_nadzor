'use client'

import { jsPDF } from 'jspdf'
import type { Project, Visit, Photo } from './types'

// ─── Constants ────────────────────────────────────────────────────────────────

const FIRM_NAME     = 'Statera Engineering'
const FIRM_SUBTITLE = 'Техничка контрола и надзор на градежни објекти'
const FIRM_LICENSE  = 'Лиценца бр. 03-ГН-0421'
const FIRM_CONTACT  = 'www.statera.mk  ·  info@statera.mk  ·  +389 2 000 0000'

// A4 dimensions, margins, content width
const W  = 210
const H  = 297
const ML = 16   // left margin
const MR = 16   // right margin
const CW = W - ML - MR   // 178 mm content width
const FOOTER_H = 22       // reserved footer height
const CONTENT_BOTTOM = H - FOOTER_H  // y limit before footer

// Brand palette
const C = {
  ink:         [15,  20,  30 ] as const,   // near-black text
  mid:         [80,  88, 100 ] as const,   // secondary text
  muted:       [150, 158, 170] as const,   // captions / rules
  rule:        [220, 224, 230] as const,   // hairlines
  bgLight:     [248, 249, 251] as const,   // table zebra
  headerBg:    [10,  16,  28 ] as const,   // header strip bg
  accent:      [255, 176,  32] as const,   // brand gold
  accentText:  [10,  16,  28 ] as const,   // text on gold bg
  green:       [0,  168, 107 ] as const,   // status OK
  greenBg:     [220, 247, 238] as const,
  red:         [220,  53,  69] as const,   // status Critical
  redBg:       [252, 228, 231] as const,
  yellow:      [230, 162,   0] as const,   // status Warning
  yellowBg:    [255, 243, 205] as const,
  logoBox:     [30,  40,  58 ] as const,   // logo placeholder box
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReportInput = {
  project:    Project
  visits:     (Visit & { photos: Photo[] })[]
  monthLabel: string
  summary:    string
}

type RGB = readonly [number, number, number]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fetch a remote image and return base64 data + natural dimensions */
async function loadImage(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res  = await fetch(url, { mode: 'cors' })
    const blob = await res.blob()
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload  = () => resolve(r.result as string)
      r.onerror = reject
      r.readAsDataURL(blob)
    })
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img   = new Image()
      img.onload  = () => resolve({ w: img.width, h: img.height })
      img.onerror = () => resolve({ w: 4, h: 3 })
      img.src     = data
    })
    return { data, ...dims }
  } catch {
    return null
  }
}

/** Derive overall status from visits array */
function overallStatus(visits: (Visit & { photos: Photo[] })[]) {
  const hasCritical = visits.some(
    (v) => (v as any).record_status === 'Critical' || (v as any).record_status === 'Red'
  )
  if (hasCritical) return 'Critical'
  return 'Normal'
}

/** Return color triple for a status string */
function statusColors(status: string): { dot: RGB; bg: RGB; text: RGB; label: string } {
  switch (status) {
    case 'Critical':
    case 'Red':
      return { dot: C.red,    bg: C.redBg,    text: C.red,    label: 'КРИТИЧНО' }
    case 'Warning':
    case 'Yellow':
      return { dot: C.yellow, bg: C.yellowBg, text: C.yellow, label: 'ПРЕДУПРЕДУВАЊЕ' }
    default:
      return { dot: C.green,  bg: C.greenBg,  text: C.green,  label: 'УРЕДНО' }
  }
}

/** Draw a filled circle status dot */
function dot(doc: jsPDF, x: number, y: number, color: RGB) {
  doc.setFillColor(...color)
  doc.circle(x, y, 1.6, 'F')
}

/** Draw a status pill (dot + label text inside a rounded rect) */
function statusPill(
  doc: jsPDF,
  x: number,
  cy: number,             // vertical centre
  status: string,
  fontSize = 8
) {
  const { dot: dotC, bg, text, label } = statusColors(status)
  const pill_h = fontSize * 0.45 + 3.6
  const pill_w = fontSize * label.length * 0.22 + 10

  doc.setFillColor(...bg)
  doc.roundedRect(x, cy - pill_h / 2, pill_w, pill_h, 1.5, 1.5, 'F')
  dot(doc, x + 3.5, cy, dotC)
  doc.setFontSize(fontSize)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...text)
  doc.text(label, x + 6.5, cy + fontSize * 0.13)
  return pill_w
}

/** Draw a horizontal rule */
function rule(doc: jsPDF, y: number, lw = 0.25) {
  doc.setDrawColor(...C.rule)
  doc.setLineWidth(lw)
  doc.line(ML, y, W - MR, y)
}

/** Section heading */
function sectionHeading(doc: jsPDF, text: string, y: number): number {
  // Gold left bar
  doc.setFillColor(...C.accent)
  doc.rect(ML, y - 3.5, 2.5, 5.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...C.ink)
  doc.text(text, ML + 5, y)
  return y + 8
}

/** Ensure there's at least `need` mm before the content bottom; add page if not */
function ensureSpace(doc: jsPDF, y: number, need: number): number {
  if (y + need > CONTENT_BOTTOM) {
    doc.addPage()
    return ML + 2
  }
  return y
}

// ─── Header (repeated on every page via stamp pass) ───────────────────────────

function drawPageHeader(doc: jsPDF, isFirstPage: boolean) {
  if (isFirstPage) return   // first page has its own full cover header
  // Compact repeat header for continuation pages
  doc.setFillColor(...C.headerBg)
  doc.rect(0, 0, W, 10, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.accent)
  doc.text(FIRM_NAME, ML, 6.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(180, 188, 200)
  doc.text(FIRM_SUBTITLE, ML + 38, 6.5)
}

// ─── Footer stamp (applied retroactively on every page) ──────────────────────

function stampFooters(doc: jsPDF, monthLabel: string, generatedAt: string, totalPages: number) {
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)

    // Footer background strip
    doc.setFillColor(248, 249, 251)
    doc.rect(0, H - FOOTER_H, W, FOOTER_H, 'F')
    rule(doc, H - FOOTER_H)

    // Left: firm + timestamp
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...C.muted)
    doc.text(`${FIRM_NAME}  ·  ${FIRM_LICENSE}`, ML, H - 14)
    doc.text(`Генерирано: ${generatedAt}`, ML, H - 9)

    // Centre: digital signature placeholder
    const sigX = W / 2
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7)
    doc.setTextColor(...C.muted)
    doc.text('Дигитален потпис / Печат на надзорен инженер', sigX, H - 14, { align: 'center' })
    doc.setDrawColor(...C.rule)
    doc.setLineWidth(0.3)
    doc.line(sigX - 28, H - 9, sigX + 28, H - 9)

    // Right: page numbering
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...C.mid)
    doc.text(`${p} / ${totalPages}`, W - MR, H - 9, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...C.muted)
    doc.text('Страница', W - MR, H - 14, { align: 'right' })
  }
}

// ─── Cover page ───────────────────────────────────────────────────────────────

function drawCoverHeader(doc: jsPDF, project: Project, monthLabel: string, visits: (Visit & { photos: Photo[] })[]) {
  // ── Dark top banner ──────────────────────────────────────────────────────
  const bannerH = 52
  doc.setFillColor(...C.headerBg)
  doc.rect(0, 0, W, bannerH, 'F')

  // Logo placeholder box (left side)
  doc.setFillColor(...C.logoBox)
  doc.roundedRect(ML, 8, 28, 18, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...C.accent)
  doc.text('ЛОГО', ML + 14, 17.5, { align: 'center' })
  doc.setFontSize(5.5)
  doc.setTextColor(100, 115, 140)
  doc.text('[REPLACE WITH LOGO]', ML + 14, 21.5, { align: 'center' })

  // Firm name + subtitle (right of logo)
  const tx = ML + 33
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...C.accent)
  doc.text(FIRM_NAME.toUpperCase(), tx, 17)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(180, 190, 210)
  doc.text(FIRM_SUBTITLE, tx, 22.5)

  // License number — top-right corner
  doc.setFontSize(7.5)
  doc.setTextColor(120, 135, 160)
  doc.text(FIRM_LICENSE, W - MR, 10, { align: 'right' })
  doc.text(FIRM_CONTACT,  W - MR, 15, { align: 'right' })

  // Gold accent bar at bottom of banner
  doc.setFillColor(...C.accent)
  doc.rect(0, bannerH - 2.5, W, 2.5, 'F')

  // ── Report title block ───────────────────────────────────────────────────
  let y = bannerH + 12
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...C.ink)
  doc.text('МЕСЕЧЕН ИЗВЕШТАЈ ЗА НАДЗОР', ML, y)

  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(...C.mid)
  doc.text(`Период: ${monthLabel}`, ML, y)

  // ── Project info card ────────────────────────────────────────────────────
  y += 10
  const cardH = 38
  doc.setFillColor(...C.bgLight)
  doc.setDrawColor(...C.rule)
  doc.setLineWidth(0.3)
  doc.roundedRect(ML, y, CW, cardH, 2, 2, 'FD')

  // Left column of card
  const col1x = ML + 5
  const col2x = ML + 55
  let cy = y + 7

  const infoRow = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...C.mid)
    doc.text(label, col1x, cy)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...C.ink)
    const lines = doc.splitTextToSize(value || '—', CW - 45)
    doc.text(lines, col2x, cy)
    cy += Math.max(6, lines.length * 5)
  }

  infoRow('ПРОЕКТ', project.name, true)
  infoRow('ЛОКАЦИЈА', project.location || '—')
  infoRow('ИНВЕСТИТОР / КЛИЕНТ', project.client_info || '—')

  // Right-side visit count badge
  const badgeX = ML + CW - 26
  const badgeY = y + 6
  doc.setFillColor(...C.headerBg)
  doc.roundedRect(badgeX, badgeY, 22, 22, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...C.accent)
  doc.text(String(visits.length), badgeX + 11, badgeY + 13, { align: 'center' })
  doc.setFontSize(6.5)
  doc.setTextColor(160, 175, 200)
  doc.text('ПОСЕТИ', badgeX + 11, badgeY + 19, { align: 'center' })

  return y + cardH + 6
}

// ─── Summary table ────────────────────────────────────────────────────────────

function drawSummaryTable(doc: jsPDF, visits: (Visit & { photos: Photo[] })[], monthLabel: string, y: number): number {
  y = ensureSpace(doc, y, 55)
  y = sectionHeading(doc, 'ПРЕГЛЕД НА МЕСЕЦОТ', y)

  const status  = overallStatus(visits)
  const { label, dot: dotC, bg, text: textC } = statusColors(status)
  const criticalCount = visits.filter((v) => (v as any).record_status === 'Critical').length
  const normalCount   = visits.length - criticalCount
  const totalPhotos   = visits.reduce((a, v) => a + v.photos.length, 0)

  // Table columns: [label, value, width%]
  type Col = { label: string; value: string; w: number; status?: string }
  const cols: Col[] = [
    { label: 'МЕСЕЦ',            value: monthLabel,          w: 45 },
    { label: 'БРОЈ НА ПОСЕТИ',   value: String(visits.length), w: 35 },
    { label: 'УРЕДНО / КРИТИЧНО', value: `${normalCount} / ${criticalCount}`, w: 40 },
    { label: 'ВКУПНО ФОТОГРАФИИ', value: String(totalPhotos), w: 38 },
    { label: 'ОПШТ СТАТУС',      value: label,               w: 38, status },
  ]

  const rowH   = 10
  const hdrH   = 7
  const tblW   = CW
  let   cx     = ML

  // Header row
  doc.setFillColor(...C.headerBg)
  doc.rect(ML, y, tblW, hdrH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(160, 175, 200)

  for (const col of cols) {
    const colW = (col.w / 196) * tblW
    doc.text(col.label, cx + 3, y + 4.8)
    cx += colW
  }
  y += hdrH

  // Data row
  cx = ML
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(...C.rule)
  doc.setLineWidth(0.25)
  doc.rect(ML, y, tblW, rowH, 'FD')

  for (const col of cols) {
    const colW = (col.w / 196) * tblW
    if (col.status) {
      // Draw pill in cell
      doc.setFillColor(...bg)
      doc.roundedRect(cx + 2, y + 2, colW - 5, 6, 1.5, 1.5, 'F')
      dot(doc, cx + 5.5, y + 5, dotC)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...textC)
      doc.text(col.value, cx + 8.5, y + 5.8)
    } else {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...C.ink)
      doc.text(col.value, cx + 3, y + 6.5)
    }
    // Column divider
    doc.setDrawColor(...C.rule)
    doc.setLineWidth(0.2)
    doc.line(cx + colW, y, cx + colW, y + rowH)
    cx += colW
  }
  y += rowH + 8
  return y
}

// ─── Visit log table ──────────────────────────────────────────────────────────

function drawVisitLog(doc: jsPDF, visits: (Visit & { photos: Photo[] })[], y: number): number {
  y = ensureSpace(doc, y, 40)
  y = sectionHeading(doc, 'ДНЕВНИК НА ТЕРЕНСКИ ПОСЕТИ', y)

  // Column definitions (mm from ML, label, width)
  const cols = [
    { label: 'ДАТУМ',     x: ML,      w: 24 },
    { label: 'ВРЕМЕНСКИ', x: ML + 24, w: 30 },
    { label: 'СТАТУС',    x: ML + 54, w: 30 },
    { label: 'БЕЛЕШКИ',   x: ML + 84, w: CW - 84 },
  ]

  const hdrH = 7
  doc.setFillColor(...C.headerBg)
  doc.rect(ML, y, CW, hdrH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(160, 175, 200)
  for (const c of cols) doc.text(c.label, c.x + 2, y + 4.8)
  y += hdrH

  doc.setFont('helvetica', 'normal')
  let rowIdx = 0
  for (const v of visits) {
    const noteLines  = doc.splitTextToSize(v.notes || '—', cols[3].w - 4)
    const rowH       = Math.max(9, noteLines.length * 4.5 + 4)

    y = ensureSpace(doc, y, rowH + 1)

    // Zebra
    if (rowIdx % 2 === 0) {
      doc.setFillColor(...C.bgLight)
      doc.rect(ML, y, CW, rowH, 'F')
    }

    // Date
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(...C.ink)
    doc.text(v.date, cols[0].x + 2, y + 6)

    // Weather
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...C.mid)
    const weatherLines = doc.splitTextToSize(v.weather || '—', cols[1].w - 3)
    doc.text(weatherLines, cols[1].x + 2, y + 6)

    // Status pill
    const vs = (v as any).record_status ?? 'Normal'
    statusPill(doc, cols[2].x + 2, y + rowH / 2, vs, 7.5)

    // Notes
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...C.ink)
    doc.text(noteLines, cols[3].x + 2, y + 6)

    // Row bottom rule
    doc.setDrawColor(...C.rule)
    doc.setLineWidth(0.2)
    doc.line(ML, y + rowH, ML + CW, y + rowH)

    y += rowH
    rowIdx++
  }
  return y + 8
}

// ─── Technical narrative ──────────────────────────────────────────────────────

function drawNarrative(doc: jsPDF, summary: string, y: number): number {
  y = ensureSpace(doc, y, 30)
  y = sectionHeading(doc, 'ТЕХНИЧКА НАРАЦИЈА', y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...C.ink)

  const paragraphs = summary
    ? summary.split(/\n{1,}/).filter(Boolean)
    : ['Нема генерирана техничка нарација.']

  for (const para of paragraphs) {
    // Detect section headings like "1. Напредок..." inside the narrative
    const isHeading = /^\d+\.\s/.test(para)
    if (isHeading) {
      y = ensureSpace(doc, y, 16)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...C.ink)
      const hlines = doc.splitTextToSize(para, CW)
      doc.text(hlines, ML, y)
      y += hlines.length * 5.5 + 2
    } else {
      const lines = doc.splitTextToSize(para, CW)
      for (const line of lines) {
        y = ensureSpace(doc, y, 6)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(...C.ink)
        doc.text(line, ML, y)
        y += 5.5
      }
      y += 3 // paragraph gap
    }
  }
  return y + 6
}

// ─── Photo grid (2 columns per row, rows stacked down the page) ──────────────

async function drawPhotoAppendix(
  doc: jsPDF,
  visits: (Visit & { photos: Photo[] })[]
): Promise<void> {
  type TaggedPhoto = Photo & { visitDate: string; visitStatus: string; figIndex: number }

  const allPhotos: TaggedPhoto[] = []
  let figIdx = 1
  for (const v of visits) {
    for (const p of v.photos) {
      allPhotos.push({
        ...p,
        visitDate:   v.date,
        visitStatus: (v as any).record_status ?? 'Normal',
        figIndex:    figIdx++,
      })
    }
  }
  if (allPhotos.length === 0) return

  doc.addPage()

  // Appendix title page header
  doc.setFillColor(...C.headerBg)
  doc.rect(0, 0, W, 10, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.accent)
  doc.text(FIRM_NAME, ML, 6.5)

  let y = 18
  y = sectionHeading(doc, `ФОТОГРАФСКА ДОКУМЕНТАЦИЈА  (${allPhotos.length} фотографии)`, y)
  y += 4

  // Grid constants — 2 columns with a gutter
  const COLS      = 2
  const GUTTER    = 5                         // mm between columns
  const CELL_W    = (CW - GUTTER * (COLS - 1)) / COLS  // ~86.5 mm
  const IMG_H     = 62                        // image display height (fixed)
  const CAP_H     = 12                        // caption area height
  const CELL_H    = IMG_H + CAP_H             // total cell height

  let col = 0

  for (const p of allPhotos) {
    const cellX = ML + col * (CELL_W + GUTTER)

    // Does this cell fit on the current page?
    if (y + CELL_H > CONTENT_BOTTOM - 4) {
      doc.addPage()
      // Compact continuation header
      doc.setFillColor(...C.headerBg)
      doc.rect(0, 0, W, 10, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...C.accent)
      doc.text(FIRM_NAME, ML, 6.5)
      y  = 16
      col = 0
    }

    // ── Image area ──────────────────────────────────────────────────────────
    // Light border / background for the image slot
    doc.setFillColor(235, 238, 243)
    doc.setDrawColor(...C.rule)
    doc.setLineWidth(0.25)
    doc.roundedRect(cellX, y, CELL_W, IMG_H, 1.5, 1.5, 'FD')

    const img = await loadImage(p.storage_url)
    if (img) {
      const ratio  = img.w / img.h
      let drawW    = CELL_W - 2
      let drawH    = drawW / ratio
      if (drawH > IMG_H - 2) { drawH = IMG_H - 2; drawW = drawH * ratio }
      const drawX  = cellX + (CELL_W - drawW) / 2
      const drawY  = y + (IMG_H - drawH) / 2
      try {
        doc.addImage(img.data, 'JPEG', drawX, drawY, drawW, drawH, undefined, 'MEDIUM')
      } catch { /* skip bad image */ }
    } else {
      // Placeholder text if image failed to load
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(8)
      doc.setTextColor(...C.muted)
      doc.text('[Сликата не е достапна]', cellX + CELL_W / 2, y + IMG_H / 2, { align: 'center' })
    }

    // Status indicator — small pill overlaid top-right of image
    statusPill(doc, cellX + CELL_W - 27, y + 5.5, p.visitStatus, 6.5)

    // ── Caption area ─────────────────────────────────────────────────────────
    const capY = y + IMG_H
    doc.setFillColor(250, 251, 252)
    doc.setDrawColor(...C.rule)
    doc.roundedRect(cellX, capY, CELL_W, CAP_H, 0, 0, 'FD')

    // Figure number badge
    doc.setFillColor(...C.headerBg)
    doc.roundedRect(cellX + 2, capY + 2, 10, 8, 1, 1, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...C.accent)
    doc.text(`Сл.${p.figIndex}`, cellX + 7, capY + 6.8, { align: 'center' })

    // Caption text
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...C.ink)
    const capText  = p.caption || ''
    const capLines = doc.splitTextToSize(capText, CELL_W - 16)
    doc.text(capLines[0] ?? '', cellX + 14, capY + 5.5)

    // Date line
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7)
    doc.setTextColor(...C.muted)
    doc.text(p.visitDate, cellX + 14, capY + 9.5)

    // ── Advance grid position ─────────────────────────────────────────────
    col++
    if (col >= COLS) {
      col  = 0
      y   += CELL_H + 6  // row gap
    }
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateReportPDF(input: ReportInput): Promise<Blob> {
  const { project, visits, monthLabel, summary } = input
  const generatedAt = new Date().toLocaleString('mk-MK', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })

  // ── Page 1: cover header ────────────────────────────────────────────────────
  let y = drawCoverHeader(doc, project, monthLabel, visits)

  // ── Summary table ───────────────────────────────────────────────────────────
  y = drawSummaryTable(doc, visits, monthLabel, y)

  // ── Visit log ───────────────────────────────────────────────────────────────
  y = drawVisitLog(doc, visits, y)

  // ── Technical narrative ─────────────────────────────────────────────────────
  y = drawNarrative(doc, summary, y)

  // ── Photo appendix ──────────────────────────────────────────────────────────
  await drawPhotoAppendix(doc, visits)

  // ── Stamp footers (retroactive — must be last) ──────────────────────────────
  stampFooters(doc, monthLabel, generatedAt, doc.getNumberOfPages())

  return doc.output('blob')
}
