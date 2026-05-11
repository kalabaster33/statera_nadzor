'use client'

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { Project, Visit, Photo } from './types'

export type ReportInput = {
  project: Project
  visits: (Visit & { photos: Photo[] })[]
  monthLabel: string
  summary: string
}

const FIRM = 'Statera Engineering'
const FIRM_SUBTITLE = 'Техничка контрола и надзор на градежни објекти'
const FIRM_LICENSE = 'Лиценца бр. 03-ГН-0421'

// Brand colors as pdf-lib rgb
const C = {
  ink: rgb(0.06, 0.08, 0.12),
  mid: rgb(0.31, 0.34, 0.39),
  muted: rgb(0.59, 0.62, 0.67),
  rule: rgb(0.86, 0.88, 0.90),
  bgLight: rgb(0.97, 0.98, 0.99),
  headerBg: rgb(0.04, 0.06, 0.11),
  accent: rgb(1.0, 0.69, 0.13),
  white: rgb(1, 1, 1),
  green: rgb(0.0, 0.66, 0.42),
  greenBg: rgb(0.86, 0.97, 0.93),
  red: rgb(0.86, 0.21, 0.27),
  redBg: rgb(0.99, 0.89, 0.91),
}

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  return res.arrayBuffer()
}

async function loadImageBytes(url: string): Promise<{ bytes: Uint8Array; isPng: boolean } | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50
    return { bytes, isPng }
  } catch {
    return null
  }
}

export async function generateReportPDF(input: ReportInput): Promise<Blob> {
  const { project, visits, monthLabel, summary } = input

  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)

  // Fetch local TTF fonts which have full Cyrillic support and are compatible with fontkit
  const [regularBytes, boldBytes] = await Promise.all([
    fetchFont('/fonts/Roboto-Regular.ttf'),
    fetchFont('/fonts/Roboto-Bold.ttf'),
  ])

  let fontR: any, fontB: any
  try {
    fontR = await pdfDoc.embedFont(regularBytes)
    fontB = await pdfDoc.embedFont(boldBytes)
  } catch (err) {
    console.error('Failed to embed custom fonts:', err)
    // Fallback to standard font (no Cyrillic, but at least renders something)
    fontR = await pdfDoc.embedFont(StandardFonts.Helvetica)
    fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  }

  const W = 595.28 // A4 width in points
  const H = 841.89 // A4 height in points
  const ML = 45
  const MR = 45
  const CW = W - ML - MR
  const FOOTER_H = 60

  const generatedAt = new Date().toLocaleString('mk-MK', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function addPage() {
    const page = pdfDoc.addPage([W, H])
    // Header bar
    page.drawRectangle({ x: 0, y: H - 30, width: W, height: 30, color: C.headerBg })
    page.drawText(FIRM, { x: ML, y: H - 20, size: 9, font: fontB, color: C.accent })
    page.drawText(FIRM_SUBTITLE, { x: ML + 130, y: H - 20, size: 7, font: fontR, color: C.muted })
    return page
  }

  function drawFooter(page: any, pageNum: number, total: number) {
    page.drawRectangle({ x: 0, y: 0, width: W, height: FOOTER_H, color: C.bgLight })
    page.drawLine({ start: { x: 0, y: FOOTER_H }, end: { x: W, y: FOOTER_H }, thickness: 0.5, color: C.rule })
    page.drawText(`${FIRM}  ·  ${FIRM_LICENSE}`, { x: ML, y: FOOTER_H - 18, size: 7, font: fontR, color: C.muted })
    page.drawText(`Генерирано: ${generatedAt}`, { x: ML, y: FOOTER_H - 30, size: 7, font: fontR, color: C.muted })
    const pageStr = `${pageNum} / ${total}`
    const pageW = fontB.widthOfTextAtSize(pageStr, 9)
    page.drawText(pageStr, { x: W - MR - pageW, y: FOOTER_H - 25, size: 9, font: fontB, color: C.mid })
  }

  function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
    if (!text) return ['—']
    const words = text.split(' ')
    const lines: string[] = []
    let current = ''
    for (const word of words) {
      const test = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
        lines.push(current)
        current = word
      } else {
        current = test
      }
    }
    if (current) lines.push(current)
    return lines.length > 0 ? lines : ['—']
  }

  function statusLabel(status: string): string {
    return status === 'Critical' ? 'КРИТИЧНО' : 'УРЕДНО'
  }

  function statusColor(status: string) {
    return status === 'Critical' ? C.red : C.green
  }

  function statusBg(status: string) {
    return status === 'Critical' ? C.redBg : C.greenBg
  }

  // ── Page 1 — Cover ───────────────────────────────────────────────────────────

  const page1 = pdfDoc.addPage([W, H])

  // Dark banner
  page1.drawRectangle({ x: 0, y: H - 140, width: W, height: 140, color: C.headerBg })
  // Gold bar at bottom of banner
  page1.drawRectangle({ x: 0, y: H - 142, width: W, height: 4, color: C.accent })

  // Firm name
  page1.drawText(FIRM.toUpperCase(), { x: ML, y: H - 60, size: 22, font: fontB, color: C.accent })
  page1.drawText(FIRM_SUBTITLE, { x: ML, y: H - 78, size: 9, font: fontR, color: rgb(0.7, 0.75, 0.85) })
  page1.drawText(FIRM_LICENSE, { x: W - MR - fontR.widthOfTextAtSize(FIRM_LICENSE, 8), y: H - 50, size: 8, font: fontR, color: rgb(0.47, 0.53, 0.63) })

  // Report title
  const titleY = H - 180
  page1.drawText('МЕСЕЧЕН ИЗВЕШТАЈ ЗА НАДЗОР', { x: ML, y: titleY, size: 20, font: fontB, color: C.ink })
  page1.drawText(`Период: ${monthLabel}`, { x: ML, y: titleY - 22, size: 12, font: fontR, color: C.mid })

  // Project info card
  const cardY = H - 280
  const cardH = 120
  page1.drawRectangle({ x: ML, y: cardY, width: CW, height: cardH, color: C.bgLight, borderColor: C.rule, borderWidth: 0.5 })

  const rowY = (i: number) => cardY + cardH - 28 - i * 26
  const labelX = ML + 14
  const valX = ML + 130

  page1.drawText('ПРОЕКТ', { x: labelX, y: rowY(0), size: 8, font: fontB, color: C.mid })
  page1.drawText(project.name || '—', { x: valX, y: rowY(0), size: 10, font: fontB, color: C.ink })

  page1.drawText('ЛОКАЦИЈА', { x: labelX, y: rowY(1), size: 8, font: fontB, color: C.mid })
  page1.drawText(project.location || '—', { x: valX, y: rowY(1), size: 9, font: fontR, color: C.ink })

  page1.drawText('КЛИЕНТ', { x: labelX, y: rowY(2), size: 8, font: fontB, color: C.mid })
  page1.drawText((project.client_info || '—').slice(0, 60), { x: valX, y: rowY(2), size: 9, font: fontR, color: C.ink })

  // Visit count badge
  const badgeX = ML + CW - 70
  const badgeY = cardY + 20
  page1.drawRectangle({ x: badgeX, y: badgeY, width: 56, height: 56, color: C.headerBg })
  const countStr = String(visits.length)
  const countW = fontB.widthOfTextAtSize(countStr, 28)
  page1.drawText(countStr, { x: badgeX + (56 - countW) / 2, y: badgeY + 24, size: 28, font: fontB, color: C.accent })
  const posLabel = 'ПОСЕТИ'
  const posW = fontR.widthOfTextAtSize(posLabel, 7)
  page1.drawText(posLabel, { x: badgeX + (56 - posW) / 2, y: badgeY + 10, size: 7, font: fontR, color: rgb(0.6, 0.69, 0.78) })

  // ── Summary table ─────────────────────────────────────────────────────────────

  let y = H - 310
  const ovStatus = visits.some(v => (v as any).record_status === 'Critical') ? 'Critical' : 'Normal'
  const totalPhotos = visits.reduce((a, v) => a + v.photos.length, 0)
  const critCount = visits.filter(v => (v as any).record_status === 'Critical').length

  // Section heading
  page1.drawRectangle({ x: ML, y: y - 2, width: 6, height: 18, color: C.accent })
  page1.drawText('ПРЕГЛЕД НА МЕСЕЦОТ', { x: ML + 12, y: y + 4, size: 11, font: fontB, color: C.ink })
  y -= 30

  const cols = [
    { label: 'МЕСЕЦ', value: monthLabel, w: 130 },
    { label: 'ПОСЕТИ', value: String(visits.length), w: 80 },
    { label: 'УРЕДНО / КРИТИЧНО', value: `${visits.length - critCount} / ${critCount}`, w: 110 },
    { label: 'ФОТОГРАФИИ', value: String(totalPhotos), w: 100 },
    { label: 'ОПШТ СТАТУС', value: statusLabel(ovStatus), w: CW - 420, isStatus: true },
  ]

  const tblHdrH = 22
  const tblRowH = 26
  page1.drawRectangle({ x: ML, y: y - tblHdrH, width: CW, height: tblHdrH, color: C.headerBg })

  let cx = ML
  for (const col of cols) {
    page1.drawText(col.label, { x: cx + 6, y: y - 14, size: 7, font: fontB, color: rgb(0.63, 0.69, 0.78) })
    cx += col.w
  }
  y -= tblHdrH

  page1.drawRectangle({ x: ML, y: y - tblRowH, width: CW, height: tblRowH, color: C.white, borderColor: C.rule, borderWidth: 0.5 })
  cx = ML
  for (const col of cols) {
    if ((col as any).isStatus) {
      page1.drawRectangle({ x: cx + 4, y: y - tblRowH + 6, width: col.w - 8, height: 14, color: statusBg(ovStatus) })
      page1.drawText(col.value, { x: cx + 10, y: y - tblRowH + 11, size: 8, font: fontB, color: statusColor(ovStatus) })
    } else {
      page1.drawText(col.value, { x: cx + 6, y: y - tblRowH + 9, size: 10, font: fontR, color: C.ink })
    }
    cx += col.w
  }
  y -= tblRowH + 20

  // ── Visit log table ───────────────────────────────────────────────────────────

  page1.drawRectangle({ x: ML, y: y - 2, width: 6, height: 18, color: C.accent })
  page1.drawText('ДНЕВНИК НА ТЕРЕНСКИ ПОСЕТИ', { x: ML + 12, y: y + 4, size: 11, font: fontB, color: C.ink })
  y -= 30

  const vtCols = [
    { label: 'ДАТУМ', x: ML, w: 70 },
    { label: 'ВРЕМЕНСКИ', x: ML + 70, w: 80 },
    { label: 'СТАТУС', x: ML + 150, w: 90 },
    { label: 'БЕЛЕШКИ', x: ML + 240, w: CW - 240 },
  ]

  let currentPage = page1
  let pageCount = 1

  const hdrH = 22
  currentPage.drawRectangle({ x: ML, y: y - hdrH, width: CW, height: hdrH, color: C.headerBg })
  for (const c of vtCols) {
    currentPage.drawText(c.label, { x: c.x + 5, y: y - 14, size: 7, font: fontB, color: rgb(0.63, 0.69, 0.78) })
  }
  y -= hdrH

  for (let i = 0; i < visits.length; i++) {
    const v = visits[i]
    const noteLines = wrapText(v.notes || '—', fontR, 8.5, vtCols[3].w - 8)
    const rowH = Math.max(24, noteLines.length * 13 + 10)

    if (y - rowH < FOOTER_H + 20) {
      currentPage = addPage()
      pageCount++
      y = H - 55
    }

    if (i % 2 === 0) {
      currentPage.drawRectangle({ x: ML, y: y - rowH, width: CW, height: rowH, color: C.bgLight })
    }
    currentPage.drawLine({ start: { x: ML, y: y - rowH }, end: { x: ML + CW, y: y - rowH }, thickness: 0.3, color: C.rule })

    currentPage.drawText(v.date, { x: vtCols[0].x + 5, y: y - 14, size: 8.5, font: fontB, color: C.ink })

    const weatherLines = wrapText(v.weather || '—', fontR, 8, vtCols[1].w - 8)
    weatherLines.slice(0, 2).forEach((l, li) => {
      currentPage.drawText(l, { x: vtCols[1].x + 5, y: y - 14 - li * 11, size: 8, font: fontR, color: C.mid })
    })

    const vs = (v as any).record_status ?? 'Normal'
    currentPage.drawRectangle({ x: vtCols[2].x + 5, y: y - rowH + 6, width: 78, height: 14, color: statusBg(vs) })
    currentPage.drawText(statusLabel(vs), { x: vtCols[2].x + 12, y: y - rowH + 11, size: 8, font: fontB, color: statusColor(vs) })

    noteLines.forEach((l, li) => {
      currentPage.drawText(l, { x: vtCols[3].x + 5, y: y - 14 - li * 11, size: 8.5, font: fontR, color: C.ink })
    })

    y -= rowH
  }

  y -= 20

  // ── Technical narrative ───────────────────────────────────────────────────────

  if (y < FOOTER_H + 60) {
    currentPage = addPage()
    pageCount++
    y = H - 55
  }

  currentPage.drawRectangle({ x: ML, y: y - 2, width: 6, height: 18, color: C.accent })
  currentPage.drawText('ТЕХНИЧКА НАРАЦИЈА', { x: ML + 12, y: y + 4, size: 11, font: fontB, color: C.ink })
  y -= 28

  const paraText = summary || 'Нема генерирана техничка нарација.'
  const paragraphs = paraText.split(/\n+/).filter(Boolean)

  for (const para of paragraphs) {
    const isHeading = /^\d+\./.test(para)
    const fnt = isHeading ? fontB : fontR
    const sz = isHeading ? 10 : 9.5
    const lines = wrapText(para, fnt, sz, CW)

    if (y - lines.length * 14 < FOOTER_H + 20) {
      currentPage = addPage()
      pageCount++
      y = H - 55
    }

    for (const line of lines) {
      currentPage.drawText(line, { x: ML, y, size: sz, font: fnt, color: C.ink })
      y -= 13
    }
    y -= isHeading ? 4 : 8
  }

  // ── Photo appendix ────────────────────────────────────────────────────────────

  const allPhotos: (Photo & { visitDate: string; visitStatus: string; figIndex: number })[] = []
  let figIdx = 1
  for (const v of visits) {
    for (const p of v.photos) {
      allPhotos.push({ ...p, visitDate: v.date, visitStatus: (v as any).record_status ?? 'Normal', figIndex: figIdx++ })
    }
  }

  if (allPhotos.length > 0) {
    currentPage = addPage()
    pageCount++
    y = H - 55

    currentPage.drawRectangle({ x: ML, y: y - 2, width: 6, height: 18, color: C.accent })
    currentPage.drawText(`ФОТОГРАФСКА ДОКУМЕНТАЦИЈА  (${allPhotos.length} фотографии)`, { x: ML + 12, y: y + 4, size: 11, font: fontB, color: C.ink })
    y -= 30

    const COLS = 2
    const GUTTER = 14
    const CELL_W = (CW - GUTTER) / COLS
    const IMG_H = 165
    const CAP_H = 34
    const CELL_H = IMG_H + CAP_H

    let col = 0

    for (const p of allPhotos) {
      const cellX = ML + col * (CELL_W + GUTTER)

      if (y - CELL_H < FOOTER_H + 10) {
        currentPage = addPage()
        pageCount++
        y = H - 55
        col = 0
      }

      // Image background
      currentPage.drawRectangle({ x: cellX, y: y - IMG_H, width: CELL_W, height: IMG_H, color: rgb(0.92, 0.93, 0.95), borderColor: C.rule, borderWidth: 0.5 })

      // Load & embed image
      const imgData = await loadImageBytes(p.storage_url)
      if (imgData) {
        try {
          const embedded = imgData.isPng
            ? await pdfDoc.embedPng(imgData.bytes)
            : await pdfDoc.embedJpg(imgData.bytes)
          const dims = embedded.scaleToFit(CELL_W - 4, IMG_H - 4)
          const drawX = cellX + (CELL_W - dims.width) / 2
          const drawY = y - IMG_H + (IMG_H - dims.height) / 2 + 2
          currentPage.drawImage(embedded, { x: drawX, y: drawY, width: dims.width, height: dims.height })
        } catch { /* skip bad image */ }
      }

      // Status pill over image
      currentPage.drawRectangle({ x: cellX + CELL_W - 75, y: y - 18, width: 70, height: 14, color: statusBg(p.visitStatus) })
      currentPage.drawText(statusLabel(p.visitStatus), { x: cellX + CELL_W - 68, y: y - 13, size: 7.5, font: fontB, color: statusColor(p.visitStatus) })

      // Caption area
      const capY = y - IMG_H
      currentPage.drawRectangle({ x: cellX, y: capY - CAP_H, width: CELL_W, height: CAP_H, color: rgb(0.98, 0.98, 0.99), borderColor: C.rule, borderWidth: 0.5 })

      // Figure badge
      currentPage.drawRectangle({ x: cellX + 5, y: capY - CAP_H + 6, width: 24, height: 20, color: C.headerBg })
      const figStr = `Сл.${p.figIndex}`
      currentPage.drawText(figStr, { x: cellX + 8, y: capY - CAP_H + 14, size: 7.5, font: fontB, color: C.accent })

      // Caption text
      const capText = p.caption || ''
      const capLines = wrapText(capText, fontR, 8, CELL_W - 40)
      currentPage.drawText(capLines[0] ?? '', { x: cellX + 34, y: capY - 10, size: 8, font: fontR, color: C.ink })
      currentPage.drawText(p.visitDate, { x: cellX + 34, y: capY - 22, size: 7.5, font: fontR, color: C.muted })

      col++
      if (col >= COLS) {
        col = 0
        y -= CELL_H + 14
      }
    }
  }

  // ── Stamp footers on all pages ────────────────────────────────────────────────

  const pages = pdfDoc.getPages()
  pages.forEach((pg, i) => drawFooter(pg, i + 1, pages.length))

  const bytes = await pdfDoc.save()
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
}
