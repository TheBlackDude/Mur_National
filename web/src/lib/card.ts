/**
 * Invitation card renderer (Canvas). Same drawing for the on-screen preview, the PNG download and the print PDF:
 * every size is in millimetres of the 148 × 210 card (u = px per mm), so the layout matches the validated mockup.
 * Everything printed comes from the event document and the guest document; nothing is hard-coded but the arms.
 */
import QRCode from 'qrcode'
import type { EventDoc, Guest } from './invitations'
import { guestName } from './invitations'

export const CARD_MM = { w: 148, h: 210 }
const INK: Record<'parade' | 'dinner', string> = { parade: '#0F3B2E', dinner: '#0B1A33' }
const GOLD = '#C9A24A', IVORY = '#F4EFE3'
const SERIF = '"Cormorant Garamond", Georgia, "Times New Roman", serif'
const SANS = '"DM Sans", system-ui, -apple-system, sans-serif'

let fontsReady: Promise<void> | null = null
/** Cormorant Garamond is only needed here: injected on demand, then awaited so Canvas draws with the real face. */
export function ensureCardFonts(): Promise<void> {
  if (!fontsReady) {
    fontsReady = (async () => {
      if (typeof document === 'undefined') return
      if (!document.getElementById('font-cormorant')) {
        const l = document.createElement('link'); l.id = 'font-cormorant'; l.rel = 'stylesheet'
        l.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&display=swap'
        // The @font-face rules exist only once the stylesheet is in: fonts.load() before that resolves with nothing
        // and the first card would go out in the fallback serif.
        await new Promise<void>((resolve) => { l.onload = () => resolve(); l.onerror = () => resolve(); document.head.appendChild(l); setTimeout(resolve, 8000) })
      }
      const faces = ['600 40px "Cormorant Garamond"', 'italic 500 40px "Cormorant Garamond"', '500 40px "DM Sans"', '700 40px "DM Sans"']
      await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => {})))
    })()
  }
  return fontsReady
}

let armsPromise: Promise<HTMLImageElement | null> | null = null
function loadArms(): Promise<HTMLImageElement | null> {
  if (!armsPromise) {
    armsPromise = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img); img.onerror = () => resolve(null)
      img.src = `${import.meta.env.BASE_URL}armoiries.svg`
    })
  }
  return armsPromise
}

type Ctx = CanvasRenderingContext2D

/** Shrinks the font until the text fits `maxW`; returns the size used. */
function fit(ctx: Ctx, text: string, font: (px: number) => string, px: number, maxW: number, minPx: number): number {
  let size = px
  ctx.font = font(size)
  while (ctx.measureText(text).width > maxW && size > minPx) { size -= px * 0.04; ctx.font = font(size) }
  return size
}

function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const out: string[] = []
  for (const para of text.split(/\r?\n/)) {
    let line = ''
    for (const word of para.split(/\s+/)) {
      const t = line ? `${line} ${word}` : word
      if (ctx.measureText(t).width <= maxW || !line) line = t
      else { out.push(line); line = word }
    }
    out.push(line)
  }
  return out
}

function frame(ctx: Ctx, u: number, bg: string) {
  ctx.fillStyle = bg; ctx.fillRect(0, 0, CARD_MM.w * u, CARD_MM.h * u)
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 0.6 * u; ctx.strokeRect(6 * u, 6 * u, 136 * u, 198 * u)
  ctx.lineWidth = 0.25 * u; ctx.strokeRect(8.5 * u, 8.5 * u, 131 * u, 193 * u)
  const third = 136 / 3
  for (const [i, c] of ['#CE1126', '#FCD116', '#009460'].entries()) { ctx.fillStyle = c; ctx.fillRect((6 + third * i) * u, 6 * u, (third + 0.1) * u, 1.2 * u) }
}

/** Recto. `width` in px; 1748 = 300 dpi. */
export async function renderCard(event: EventDoc, guest: Guest, width = 1748): Promise<HTMLCanvasElement> {
  const [arms] = await Promise.all([loadArms(), ensureCardFonts()])
  const u = width / CARD_MM.w
  const c = document.createElement('canvas'); c.width = width; c.height = Math.round(CARD_MM.h * u)
  const ctx = c.getContext('2d')!
  const cx = (CARD_MM.w / 2) * u
  frame(ctx, u, INK[event.kind] ?? INK.parade)
  if (arms) ctx.drawImage(arms, 59 * u, 18 * u, 30 * u, 35 * u)

  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  const spaced = (text: string, y: number, px: number, spacing: number, color: string) => {
    ctx.fillStyle = color; ctx.font = `500 ${px * u}px ${SANS}`
    ctx.letterSpacing = `${spacing * u}px`; ctx.fillText(text, cx + (spacing * u) / 2, y * u); ctx.letterSpacing = '0px'
  }
  spaced('RÉPUBLIQUE DE GUINÉE', 61, 3.4, 0.9, IVORY)
  spaced('TRAVAIL · JUSTICE · SOLIDARITÉ', 66.5, 2.6, 0.6, GOLD)

  ctx.fillStyle = IVORY
  ctx.font = `600 ${9.5 * u}px ${SERIF}`; ctx.fillText('Le Président de la République', cx, 84 * u)
  if (event.intro) { ctx.font = `italic 500 ${5.2 * u}px ${SERIF}`; ctx.fillText(event.intro, cx, 92 * u) }

  // Guest name: gold, shrinks to the width, splits over two lines when still too long.
  const name = guestName(guest) || '—'
  ctx.fillStyle = GOLD
  const nameFont = (px: number) => `600 ${px * u}px ${SERIF}`
  const size = fit(ctx, name, nameFont, 9, 124 * u, 6.2)
  if (ctx.measureText(name).width <= 124 * u) ctx.fillText(name, cx, 108 * u)
  else {
    const lines = wrap(ctx, name, 124 * u).slice(0, 2)
    ctx.fillText(lines[0], cx, 104 * u); ctx.fillText(lines[1] ?? '', cx, (104 + size * 1.05) * u)
  }
  const sub = [guest.title, guest.category].filter(Boolean).join(' · ')
  if (sub) { ctx.fillStyle = 'rgba(244,239,227,.9)'; fit(ctx, sub, (px) => `500 ${px * u}px ${SANS}`, 3.2, 124 * u, 2.4); ctx.fillText(sub, cx, 114.5 * u) }

  ctx.strokeStyle = GOLD; ctx.lineWidth = 0.3 * u
  ctx.beginPath(); ctx.moveTo(40 * u, 121 * u); ctx.lineTo(108 * u, 121 * u); ctx.stroke()

  // Event: optional italic lead, then the title lines, then date · venue · time · dress code.
  let y = 130
  ctx.fillStyle = IVORY
  if (event.lead) { ctx.font = `italic 500 ${5.2 * u}px ${SERIF}`; ctx.fillText(event.lead, cx, y * u); y += 7.5 }
  for (const line of (event.titleLines ?? []).filter(Boolean).slice(0, 3)) {
    fit(ctx, line, (px) => `600 ${px * u}px ${SERIF}`, 6.6, 124 * u, 4.5); ctx.fillText(line, cx, y * u); y += 6.8
  }
  const when = [event.date, event.venue, event.time, event.dressCode].filter(Boolean).join(' · ')
  ctx.fillStyle = GOLD; fit(ctx, when, (px) => `500 ${px * u}px ${SANS}`, 3.4, 124 * u, 2.4); ctx.fillText(when, cx, (y + 1) * u)

  // Zone, code, notice (left) and the QR (right).
  ctx.textAlign = 'left'
  const label = (text: string, yy: number) => { ctx.fillStyle = GOLD; ctx.font = `500 ${2.6 * u}px ${SANS}`; ctx.letterSpacing = `${0.5 * u}px`; ctx.fillText(text, 14 * u, yy * u); ctx.letterSpacing = '0px' }
  label((event.zoneLabel || 'Tribune').toUpperCase(), 164)
  const zone = [guest.zone, guest.seat].filter(Boolean).join(' · ') || '—'
  ctx.fillStyle = IVORY; fit(ctx, zone, (px) => `700 ${px * u}px ${SANS}`, 7.5, 80 * u, 4); ctx.fillText(zone, 14 * u, 172 * u)
  label('CODE', 180)
  ctx.fillStyle = IVORY; ctx.font = `500 ${4.2 * u}px ${SANS}`; ctx.fillText(guest.code ?? '— — — —', 14 * u, 185.5 * u)
  ctx.fillStyle = 'rgba(244,239,227,.8)'; ctx.font = `400 ${2.4 * u}px ${SANS}`
  ctx.fillText('Carte nominative et non transférable.', 14 * u, 194 * u)
  ctx.fillText("Pièce d'identité exigée à l'entrée.", 14 * u, 197.5 * u)

  drawQr(ctx, u, guest.token ?? null, 98, 157, 36)
  return c
}

/** QR in an ivory box: 36 mm with a 3 mm quiet zone → 30 mm of modules, above the 32 mm print spec once the box counts. */
function drawQr(ctx: Ctx, u: number, token: string | null, x: number, y: number, box: number) {
  ctx.fillStyle = IVORY
  roundRect(ctx, x * u, y * u, box * u, box * u, 1 * u); ctx.fill()
  if (!token) {
    ctx.fillStyle = 'rgba(18,24,38,.35)'; ctx.font = `500 ${2.6 * u}px ${SANS}`; ctx.textAlign = 'center'
    ctx.fillText('QR à émettre', (x + box / 2) * u, (y + box / 2 + 1) * u); ctx.textAlign = 'left'
    return
  }
  const qr = QRCode.create(token, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size, data = qr.modules.data
  const inner = box - 6, m = (inner * u) / n
  const ox = (x + 3) * u, oy = (y + 3) * u
  ctx.fillStyle = '#121826'
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (data[r * n + col]) ctx.fillRect(Math.floor(ox + col * m), Math.floor(oy + r * m), Math.ceil(m), Math.ceil(m))
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

/** Verso: ivory, gold frame, the event name and the Cabinet's instructions. Same for every card of the event. */
export async function renderVerso(event: EventDoc, width = 1748): Promise<HTMLCanvasElement> {
  const [arms] = await Promise.all([loadArms(), ensureCardFonts()])
  const u = width / CARD_MM.w
  const c = document.createElement('canvas'); c.width = width; c.height = Math.round(CARD_MM.h * u)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = IVORY; ctx.fillRect(0, 0, c.width, c.height)
  ctx.strokeStyle = GOLD; ctx.lineWidth = 0.6 * u; ctx.strokeRect(6 * u, 6 * u, 136 * u, 198 * u)
  if (arms) ctx.drawImage(arms, 64 * u, 14 * u, 20 * u, 23.5 * u)
  const cx = (CARD_MM.w / 2) * u
  ctx.textAlign = 'center'; ctx.fillStyle = INK[event.kind] ?? INK.parade
  ctx.font = `600 ${6.5 * u}px ${SERIF}`; ctx.fillText(event.name, cx, 47 * u)
  ctx.fillStyle = GOLD; ctx.font = `500 ${3.2 * u}px ${SANS}`
  ctx.fillText([event.date, event.venue, event.time].filter(Boolean).join(' · '), cx, 53 * u)
  ctx.textAlign = 'left'; ctx.fillStyle = '#121826'; ctx.font = `400 ${3.6 * u}px ${SANS}`
  let y = 66
  for (const line of wrap(ctx, event.verso || '', 120 * u)) {
    if (!line) { y += 2.6; continue }
    ctx.fillText(line, 14 * u, y * u); y += 5.4
    if (y > 196) break
  }
  return c
}

export function canvasJpeg(c: HTMLCanvasElement, quality = 0.86): Promise<Uint8Array> {
  return new Promise((resolve, reject) => c.toBlob(async (b) => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new Error('toBlob'))), 'image/jpeg', quality))
}

export function download(blob: Blob, filename: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

export const safeFile = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-|-$/g, '')
