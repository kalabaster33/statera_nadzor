import { NextResponse } from 'next/server'
import { Resend } from 'resend'

export const runtime = 'nodejs'

// ─── Constants ────────────────────────────────────────────────────────────────

const FIRM_NAME    = 'Statera Engineering'
const FIRM_REPLY   = process.env.REPORT_FROM_EMAIL    ?? 'nadzor@statera.mk'
const FALLBACK_TO  = process.env.REPORT_FALLBACK_EMAIL ?? 'engineer@statera.mk'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the first plausible email address from a free-text client_info string */
function extractEmail(clientInfo: string | null | undefined): string | null {
  if (!clientInfo) return null
  const match = clientInfo.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)
  return match ? match[0] : null
}

// ─── HTML email body ──────────────────────────────────────────────────────────

function buildEmailHtml(params: {
  projectName: string
  monthLabel: string
  visitCount: number
  overallStatus: string
  recipientEmail: string
}) {
  const { projectName, monthLabel, visitCount, overallStatus, recipientEmail } = params
  const statusColor = overallStatus === 'Critical' ? '#DC3545' : '#00A86B'
  const statusLabel = overallStatus === 'Critical' ? 'КРИТИЧНО' : 'УРЕДНО'
  const ts = new Date().toLocaleString('mk-MK', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return `<!DOCTYPE html>
<html lang="mk">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Месечен извештај — ${projectName}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#0a1018;padding:28px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0;font-size:20px;font-weight:700;color:#FFB020;letter-spacing:0.5px;">${FIRM_NAME.toUpperCase()}</p>
                    <p style="margin:4px 0 0;font-size:11px;color:#8a9ab5;">Техничка контрола и надзор на градежни објекти</p>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;padding:4px 12px;background:#FFB020;border-radius:4px;font-size:11px;font-weight:700;color:#0a1018;">ИЗВЕШТАЈ</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px;">
              <p style="margin:0 0 8px;font-size:13px;color:#6b7686;">Почитувани,</p>
              <p style="margin:0 0 24px;font-size:15px;color:#1a212b;line-height:1.6;">
                Во прилог Ви го испраќаме <strong>месечниот извештај за технички надзор</strong>
                за проектот <strong>${projectName}</strong> за периодот <strong>${monthLabel}</strong>.
              </p>

              <!-- Summary card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fb;border-radius:6px;border:1px solid #e2e6eb;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="33%" style="text-align:center;padding:8px;">
                          <p style="margin:0;font-size:11px;color:#6b7686;text-transform:uppercase;letter-spacing:0.5px;">Период</p>
                          <p style="margin:6px 0 0;font-size:15px;font-weight:700;color:#1a212b;">${monthLabel}</p>
                        </td>
                        <td width="33%" style="text-align:center;padding:8px;border-left:1px solid #e2e6eb;">
                          <p style="margin:0;font-size:11px;color:#6b7686;text-transform:uppercase;letter-spacing:0.5px;">Посети</p>
                          <p style="margin:6px 0 0;font-size:15px;font-weight:700;color:#1a212b;">${visitCount}</p>
                        </td>
                        <td width="33%" style="text-align:center;padding:8px;border-left:1px solid #e2e6eb;">
                          <p style="margin:0;font-size:11px;color:#6b7686;text-transform:uppercase;letter-spacing:0.5px;">Статус</p>
                          <p style="margin:6px 0 0;">
                            <span style="display:inline-block;padding:3px 10px;background:${statusColor}20;border-radius:20px;font-size:12px;font-weight:700;color:${statusColor};">
                              ● ${statusLabel}
                            </span>
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px;font-size:14px;color:#3d4a5c;line-height:1.7;">
                Целосниот извештај со технички наод, дневник на теренски посети и фотографска документација
                е приложен во PDF формат. Доколку имате какви било прашања, слободно контактирајте нè.
              </p>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #e2e6eb;margin:28px 0;" />

              <!-- Footer note -->
              <p style="margin:0;font-size:12px;color:#8a9ab5;line-height:1.6;">
                Овој извештај е генериран автоматски на ${ts} преку системот за надзор на ${FIRM_NAME}.
                Приложениот PDF документ е официјален извештај за технички надзор.
              </p>
            </td>
          </tr>

          <!-- Footer bar -->
          <tr>
            <td style="background:#f4f5f7;border-top:1px solid #e2e6eb;padding:16px 36px;">
              <p style="margin:0;font-size:11px;color:#8a9ab5;">${FIRM_NAME} · ${FIRM_REPLY}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'RESEND_API_KEY is not configured' },
        { status: 500 }
      )
    }

    const body = await req.json() as {
      pdfBase64: string        // base64-encoded PDF blob from the client
      projectName: string
      clientInfo?: string      // raw text from projects.client_info
      monthLabel: string
      visitCount: number
      overallStatus: string    // 'Normal' | 'Critical'
      /** Optional override — if provided, send only here regardless of clientInfo */
      recipientEmail?: string
    }

    const {
      pdfBase64,
      projectName,
      clientInfo,
      monthLabel,
      visitCount,
      overallStatus,
      recipientEmail: overrideEmail,
    } = body

    if (!pdfBase64) {
      return NextResponse.json({ error: 'pdfBase64 is required' }, { status: 400 })
    }

    // Resolve recipient: explicit override → extracted from client_info → fallback env
    const to = overrideEmail
      ?? extractEmail(clientInfo)
      ?? FALLBACK_TO

    const filename = `Izvestaj_${projectName.replace(/\s+/g, '_')}_${monthLabel.replace(/\s+/g, '_')}.pdf`

    const resend = new Resend(apiKey)

    const { data, error } = await resend.emails.send({
      from:    `${FIRM_NAME} <${FIRM_REPLY}>`,
      to:      [to],
      replyTo: FIRM_REPLY,
      subject: `Месечен извештај за надзор — ${projectName} — ${monthLabel}`,
      html:    buildEmailHtml({ projectName, monthLabel, visitCount, overallStatus, recipientEmail: to }),
      attachments: [
        {
          filename,
          content: pdfBase64,
        },
      ],
    })

    if (error) {
      console.error('[send-report] Resend error', error)
      return NextResponse.json({ error: error.message }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      messageId: data?.id,
      sentTo: to,
    })
  } catch (err: any) {
    console.error('[send-report]', err)
    return NextResponse.json(
      { error: err?.message ?? 'Unexpected error' },
      { status: 500 }
    )
  }
}
