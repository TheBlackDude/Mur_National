#!/usr/bin/env node
// Renders one A4 poster per mission and language into scripts/out/posters/{code}-{fr|en}.pdf.
// Reads scripts/out/missions.csv (written by seed-missions.mjs). The QR encodes the full invite link (with token);
// the printed URL under it is the token-less mission page, so the poster stays readable if the QR is scanned.
//
// Usage:  node scripts/qr-posters.mjs [--base=https://guineen68.com] [--only=FR,SN]
// Needs:  cd scripts && npm install   (qrcode, pdfkit)
import { createWriteStream, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import PDFDocument from 'pdfkit'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const BASE = (args.find((a) => a.startsWith('--base='))?.slice(7) ?? 'https://theblackdude.github.io/Mur_National').replace(/\/$/, '')
const ONLY = args.find((a) => a.startsWith('--only='))?.slice(7).split(',').map((s) => s.trim().toUpperCase())

const LOGO_PATH = new URL('../web/public/frames/logo-68.png', import.meta.url).pathname
const LOGO = (await import('node:fs')).existsSync(LOGO_PATH) ? LOGO_PATH : null
const C = { primary: '#3273AC', gold: '#EBAB58', ink: '#121826', bg: '#F5F7FA', muted: '#5F6B7A', red: '#CE1126', yellow: '#FCD116', green: '#009460', white: '#FFFFFF' }
const mm = (n) => n * 72 / 25.4
const A4 = { w: mm(210), h: mm(297) }

const T = {
  fr: { title: 'Fier d’être Guinéen', sub: 'Mur National · An 68', invite: 'Scannez pour envoyer votre vidéo', footer: 'Une vidéo de 60 à 90 secondes pour le film de l’An 68', by: 'Une initiative de la Présidence de la République · Semaine de l’Indépendance, 25 sept. – 2 oct. 2026' },
  en: { title: 'Proud to be Guinean', sub: 'National Wall · Year 68', invite: 'Scan to send your video', footer: 'A 60 to 90 second video for the Year 68 film', by: 'An initiative of the Presidency of the Republic · Independence Week, 25 Sept – 2 Oct 2026' },
}

function parseCsv(text) {
  const [head, ...lines] = text.trim().split('\n')
  const cols = head.split(',')
  return lines.map((line) => {
    const vals = []; let cur = '', q = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false; else cur += ch }
      else if (ch === '"') q = true; else if (ch === ',') { vals.push(cur); cur = '' } else cur += ch
    }
    vals.push(cur)
    return Object.fromEntries(cols.map((c, i) => [c, vals[i] ?? '']))
  })
}

const countryNames = Object.fromEntries(JSON.parse(readFileSync(join(ROOT, 'web/src/data/countries.json'), 'utf8')).map((c) => [c.iso, c.name]))

async function poster(m, lang, file) {
  const t = T[lang]
  const link = m.link.startsWith(BASE) ? m.link : `${BASE}/video?mission=${m.code}&t=${m.token}`
  const shortUrl = `${BASE.replace(/^https?:\/\//, '')}/video?mission=${m.code}`
  const png = await QRCode.toBuffer(link, { errorCorrectionLevel: 'M', margin: 0, width: 1200, color: { dark: C.ink, light: C.white } })

  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `${t.title} · ${m.name}`, Author: 'MuduPay pour la Présidence de la République de Guinée' } })
  const out = createWriteStream(file)
  doc.pipe(out)

  // Ground and tricolour strip
  doc.rect(0, 0, A4.w, A4.h).fill(C.bg)
  const strip = mm(6)
  doc.rect(0, 0, A4.w / 3, strip).fill(C.red)
  doc.rect(A4.w / 3, 0, A4.w / 3, strip).fill(C.yellow)
  doc.rect((2 * A4.w) / 3, 0, A4.w / 3, strip).fill(C.green)

  // Header
  doc.fillColor(C.primary).font('Helvetica-Bold').fontSize(34).text(t.title, mm(18), mm(24), { width: A4.w - mm(36) })
  doc.fillColor(C.muted).font('Helvetica').fontSize(14).text(t.sub, mm(18), mm(40), { width: A4.w - mm(36) })

  // Gold 68 mark, top right
  if (LOGO) doc.image(LOGO, A4.w - mm(44), mm(20), { width: mm(28), height: mm(28) })
  else {
    doc.circle(A4.w - mm(30), mm(34), mm(11)).fill(C.gold)
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(30).text('68', A4.w - mm(41), mm(28.5), { width: mm(22), align: 'center' })
  }

  // Mission block
  doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(20).text(m.name, mm(18), mm(60), { width: A4.w - mm(36) })
  doc.fillColor(C.muted).font('Helvetica').fontSize(13).text(countryNames[m.country] ?? m.country, mm(18), mm(70), { width: A4.w - mm(36) })

  // QR card: 100 mm module + 8 mm quiet zone on white
  const qr = mm(100), quiet = mm(8), card = qr + 2 * quiet
  const cx = (A4.w - card) / 2, cy = mm(88)
  doc.roundedRect(cx, cy, card, card, mm(6)).fill(C.white)
  doc.image(png, cx + quiet, cy + quiet, { width: qr, height: qr })

  // Invite + short URL
  doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(18).text(t.invite, mm(18), cy + card + mm(10), { width: A4.w - mm(36), align: 'center' })
  doc.fillColor(C.primary).font('Helvetica').fontSize(13).text(shortUrl, mm(18), cy + card + mm(20), { width: A4.w - mm(36), align: 'center' })

  // Footer
  doc.rect(0, A4.h - mm(34), A4.w, mm(34)).fill(C.primary)
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(14).text(t.footer, mm(18), A4.h - mm(27), { width: A4.w - mm(36), align: 'center' })
  doc.fillColor(C.white).opacity(0.75).font('Helvetica').fontSize(9).text(t.by, mm(18), A4.h - mm(17), { width: A4.w - mm(36), align: 'center' })
  doc.opacity(1)

  doc.end()
  await new Promise((res, rej) => { out.on('finish', res); out.on('error', rej) })
}

const missions = parseCsv(readFileSync(join(ROOT, 'scripts/out/missions.csv'), 'utf8')).filter((m) => !ONLY || ONLY.includes(m.code.toUpperCase()))
const dir = join(ROOT, 'scripts/out/posters')
mkdirSync(dir, { recursive: true })
let n = 0
for (const m of missions) {
  for (const lang of ['fr', 'en']) { await poster(m, lang, join(dir, `${m.code}-${lang}.pdf`)); n++ }
}
const total = readdirSync(dir).filter((f) => f.endsWith('.pdf')).reduce((a, f) => a + statSync(join(dir, f)).size, 0)
console.log(`${n} posters in scripts/out/posters (${(total / 1024 / 1024).toFixed(1)} MB)`)
