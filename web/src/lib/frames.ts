/**
 * The three An 68 frames, drawn on Canvas so the studio works before (and without) the DCI's PNG files.
 * When public/frames/{A,B,C}.png exist they take over (see compose in image.ts); these stay as the fallback.
 * All sizes are in hundredths of the canvas width so the same drawing serves the 1600 px export and the picker thumbnails.
 */
export type FrameId = 'A' | 'B' | 'C'
export const FRAME_IDS: FrameId[] = ['A', 'B', 'C']
export type Lang = 'fr' | 'en'

/** Public domain printed on every photo and share text. Bought 15 Sept 2026; the slogan and hashtag stay 'Fier d'être Guinéen'. */
export const SITE_DOMAIN = 'guineen68.com'

const GN = { red: '#CE1126', yellow: '#FCD116', green: '#009460' }
const MP = { gold: '#EBAB58', ink: '#121826', muted: '#5F6B7A', white: '#FFFFFF' }
const FONT = '"DM Sans", system-ui, -apple-system, sans-serif'

/** Official An 68 logo (DCI). Its inner figures are white, so it always sits on a white chip. */
let logoPromise: Promise<HTMLImageElement | null> | null = null
export function loadLogo(): Promise<HTMLImageElement | null> {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = `${import.meta.env.BASE_URL}frames/logo-68.png`
    })
  }
  return logoPromise
}

/** White rounded chip with the logo inside; `size` is the chip's side. Falls back to a gold "68" if the logo is missing. */
export function drawLogoChip(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, x: number, y: number, size: number) {
  roundedPath(ctx, x, y, size, size, size * 0.18)
  ctx.fillStyle = MP.white
  ctx.fill()
  if (logo) {
    const pad = size * 0.1
    ctx.drawImage(logo, x + pad, y + pad, size - 2 * pad, size - 2 * pad)
  } else {
    ctx.fillStyle = MP.gold
    ctx.textAlign = 'center'
    ctx.font = font(700, size * 0.55)
    ctx.fillText('68', x + size / 2, y + size * 0.7)
  }
}

/** Where compose() should stamp the domain watermark for this frame. */
export type Watermark = { x: number; y: number; size: number; align: CanvasTextAlign; color: string }

/** Canvas text uses whatever face is loaded at draw time; wait for DM Sans so the export matches the preview. */
export async function ensureFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return
  await Promise.all(['500', '700'].map((wgt) => document.fonts.load(`${wgt} 40px "DM Sans"`))).catch(() => {})
}

const font = (weight: 500 | 700, px: number) => `${weight} ${Math.round(px)}px ${FONT}`

function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Guinea flag: three vertical bands red · yellow · green. */
function flag(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius = 0) {
  ctx.save()
  if (radius > 0) { roundedPath(ctx, x, y, w, h, radius); ctx.clip() }
  const b = w / 3
  ctx.fillStyle = GN.red; ctx.fillRect(x, y, b, h)
  ctx.fillStyle = GN.yellow; ctx.fillRect(x + b, y, b, h)
  ctx.fillStyle = GN.green; ctx.fillRect(x + 2 * b, y, w - 2 * b, h)
  ctx.restore()
}

/** A · Drapeau — full-bleed photo, tricolour hairline on top, ink band with the flag, the slogan and a big gold 68. */
function drawA(ctx: CanvasRenderingContext2D, photo: HTMLCanvasElement, w: number, lang: Lang, logo: HTMLImageElement | null): Watermark {
  const u = w / 100
  ctx.drawImage(photo, 0, 0, w, w)
  flag(ctx, 0, 0, w, 1.4 * u)

  const bh = 17 * u, y0 = w - bh
  ctx.fillStyle = MP.ink
  ctx.fillRect(0, y0, w, bh)
  flag(ctx, 5 * u, y0 + 4 * u, 13.5 * u, 9 * u, 1 * u)

  ctx.textAlign = 'left'
  ctx.fillStyle = MP.white
  ctx.font = font(700, 4.4 * u)
  ctx.fillText(lang === 'fr' ? 'FIER D’ÊTRE GUINÉEN' : 'PROUD TO BE GUINEAN', 22 * u, y0 + 7.8 * u)
  ctx.fillStyle = MP.gold
  ctx.font = font(500, 2.6 * u)
  ctx.fillText(lang === 'fr' ? '68 ans d’indépendance · 2 octobre 2026' : '68 years of independence · 2 October 2026', 22 * u, y0 + 12.3 * u)

  drawLogoChip(ctx, logo, w - 5 * u - 13 * u, y0 + 2 * u, 13 * u)

  return { x: w - 5 * u, y: 5.6 * u, size: 2.2 * u, align: 'right', color: 'rgba(255,255,255,.85)' }
}

/** B · Or — double gold border, flag chip, soft ink gradient at the foot, slogan left and a large gold 68 right. */
function drawB(ctx: CanvasRenderingContext2D, photo: HTMLCanvasElement, w: number, lang: Lang, logo: HTMLImageElement | null): Watermark {
  const u = w / 100
  ctx.drawImage(photo, 0, 0, w, w)

  const g = ctx.createLinearGradient(0, w - 40 * u, 0, w)
  g.addColorStop(0, 'rgba(18,24,38,0)')
  g.addColorStop(1, 'rgba(18,24,38,.78)')
  ctx.fillStyle = g
  ctx.fillRect(0, w - 40 * u, w, 40 * u)

  ctx.strokeStyle = MP.gold
  ctx.lineWidth = 0.7 * u
  ctx.strokeRect(3.2 * u, 3.2 * u, w - 6.4 * u, w - 6.4 * u)
  ctx.lineWidth = 0.22 * u
  ctx.strokeRect(5 * u, 5 * u, w - 10 * u, w - 10 * u)

  flag(ctx, w - 17.5 * u, 7.5 * u, 10 * u, 6.6 * u, 0.8 * u)
  ctx.strokeStyle = 'rgba(255,255,255,.9)'
  ctx.lineWidth = 0.35 * u
  roundedPath(ctx, w - 17.5 * u, 7.5 * u, 10 * u, 6.6 * u, 0.8 * u)
  ctx.stroke()

  ctx.textAlign = 'left'
  ctx.fillStyle = MP.white
  ctx.font = font(700, 4.8 * u)
  ctx.fillText(lang === 'fr' ? 'Fier d’être Guinéen' : 'Proud to be Guinean', 8 * u, w - 15.5 * u)
  ctx.fillStyle = MP.gold
  ctx.font = font(500, 2.7 * u)
  ctx.fillText(lang === 'fr' ? 'An 68 · République de Guinée' : 'Year 68 · Republic of Guinea', 8 * u, w - 11.3 * u)

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,.35)'
  ctx.shadowBlur = 1.2 * u
  drawLogoChip(ctx, logo, w - 8 * u - 16 * u, w - 8 * u - 16 * u, 16 * u)
  ctx.restore()

  return { x: 8 * u, y: w - 7.6 * u, size: 2.2 * u, align: 'left', color: 'rgba(255,255,255,.7)' }
}

/** C · Fête — white polaroid mount, rounded photo, tricolour ribbon on the corner, hashtag and a gold 68 badge. */
function drawC(ctx: CanvasRenderingContext2D, photo: HTMLCanvasElement, w: number, lang: Lang, logo: HTMLImageElement | null): Watermark {
  const u = w / 100
  ctx.fillStyle = MP.white
  ctx.fillRect(0, 0, w, w)

  const m = 4 * u, pw = w - 2 * m, ph = w - m - 20 * u
  const srcH = photo.width * (ph / pw), sy = (photo.height - srcH) / 2
  ctx.save()
  roundedPath(ctx, m, m, pw, ph, 2.5 * u)
  ctx.clip()
  ctx.drawImage(photo, 0, sy, photo.width, srcH, m, m, pw, ph)
  ctx.restore()

  ctx.save()
  ctx.translate(w - 12 * u, 12 * u)
  ctx.rotate(Math.PI / 4)
  const rb = 2.8 * u
  ctx.fillStyle = GN.red; ctx.fillRect(-30 * u, -1.5 * rb, 60 * u, rb)
  ctx.fillStyle = GN.yellow; ctx.fillRect(-30 * u, -0.5 * rb, 60 * u, rb)
  ctx.fillStyle = GN.green; ctx.fillRect(-30 * u, 0.5 * rb, 60 * u, rb)
  ctx.restore()

  ctx.textAlign = 'left'
  ctx.fillStyle = MP.ink
  ctx.font = font(700, 5 * u)
  ctx.fillText('#FierDetreGuineen', 6 * u, w - 10.2 * u)
  ctx.fillStyle = MP.muted
  ctx.font = font(500, 2.7 * u)
  ctx.fillText(lang === 'fr' ? 'Mur National · An 68 · ' : 'National Wall · Year 68 · ', 6 * u, w - 5.6 * u)
  const tail = ctx.measureText(lang === 'fr' ? 'Mur National · An 68 · ' : 'National Wall · Year 68 · ').width

  if (logo) ctx.drawImage(logo, w - 6 * u - 15 * u, w - 17.5 * u, 15 * u, 15 * u)
  else drawLogoChip(ctx, null, w - 6 * u - 14 * u, w - 17 * u, 14 * u)

  return { x: 6 * u + tail, y: w - 5.6 * u, size: 2.7 * u, align: 'left', color: MP.muted }
}

const DRAW: Record<FrameId, (ctx: CanvasRenderingContext2D, photo: HTMLCanvasElement, w: number, lang: Lang, logo: HTMLImageElement | null) => Watermark> = { A: drawA, B: drawB, C: drawC }

/** Draws frame `id` around the square `photo` onto `ctx` (canvas of width `w`) and returns where the watermark goes. */
export function drawFrame(ctx: CanvasRenderingContext2D, photo: HTMLCanvasElement, w: number, id: FrameId, lang: Lang, logo: HTMLImageElement | null): Watermark {
  ctx.textBaseline = 'alphabetic'
  return DRAW[id](ctx, photo, w, lang, logo)
}
