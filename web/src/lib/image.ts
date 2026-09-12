/** Client-side image pipeline: resize, compose the official frame, watermark, export JPEG. */
import { drawFrame, drawLogoChip, ensureFonts, loadLogo, SITE_DOMAIN, type FrameId, type Lang, type Watermark } from './frames'

export const MAX_EDGE = 1600
export const JPEG_QUALITY = 0.82

export async function fileToBitmap(file: File | Blob): Promise<ImageBitmap> {
  // imageOrientation honours EXIF rotation from phone cameras.
  return createImageBitmap(file, { imageOrientation: 'from-image' })
}

/** Square crop centred, downscaled to MAX_EDGE. Frames are designed for 1080×1080 and 1080×1350. */
export function drawSquare(bmp: ImageBitmap, size = MAX_EDGE): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const s = Math.min(bmp.width, bmp.height)
  const sx = (bmp.width - s) / 2
  const sy = (bmp.height - s) / 2
  ctx.drawImage(bmp, sx, sy, s, s, 0, 0, size, size)
  return c
}

/** Square centre crop of the frame currently shown by a <video>, for the poster of a video selfie. */
export function posterFromVideo(video: HTMLVideoElement, size = MAX_EDGE): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const vw = video.videoWidth || 1, vh = video.videoHeight || 1
  const s = Math.min(vw, vh)
  ctx.drawImage(video, (vw - s) / 2, (vh - s) / 2, s, s, 0, 0, size, size)
  return c
}

const frameCache = new Map<string, Promise<HTMLImageElement>>()
export function loadFrame(id: FrameId): Promise<HTMLImageElement> {
  if (!frameCache.has(id)) {
    frameCache.set(id, new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = `${import.meta.env.BASE_URL}frames/${id}.png`
    }))
  }
  return frameCache.get(id)!
}

/** Frame + watermark over the square photo. Official PNG frames win when present; otherwise the Canvas frames in frames.ts. */
export async function compose(photo: HTMLCanvasElement, frameId: FrameId, lang: Lang = 'fr'): Promise<HTMLCanvasElement> {
  const out = document.createElement('canvas')
  out.width = out.height = photo.width
  const ctx = out.getContext('2d')!
  const w = out.width
  const [, logo] = await Promise.all([ensureFonts(), loadLogo()])
  let wm: Watermark
  try {
    const frame = await loadFrame(frameId)
    ctx.drawImage(photo, 0, 0)
    ctx.drawImage(frame, 0, 0, w, w)
    wm = { x: w * 0.06, y: w * 0.955, size: w * 0.022, align: 'left', color: 'rgba(255,255,255,.85)' }
  } catch {
    wm = drawFrame(ctx, photo, w, frameId, lang, logo)
  }
  ctx.font = `500 ${Math.round(wm.size)}px "DM Sans", sans-serif`
  ctx.fillStyle = wm.color
  ctx.textAlign = wm.align
  ctx.fillText(SITE_DOMAIN, wm.x, wm.y)
  return out
}

/** Downscaled copy of a square canvas, for the frame picker thumbnails. */
export function scaled(src: HTMLCanvasElement, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = size
  c.getContext('2d')!.drawImage(src, 0, 0, size, size)
  return c
}

/** Souvenir card: composed photo + participant number band. */
export function souvenirCard(composed: HTMLCanvasElement, participantNumber: number, lang: 'fr' | 'en', logo: HTMLImageElement | null = null): HTMLCanvasElement {
  const w = composed.width, band = Math.round(w * 0.22)
  const c = document.createElement('canvas')
  c.width = w; c.height = w + band
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#3273AC'; ctx.fillRect(0, 0, w, c.height)
  ctx.drawImage(composed, 0, 0)
  drawLogoChip(ctx, logo, w * 0.05, w + band * 0.15, band * 0.7)
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `500 ${Math.round(w * 0.035)}px "DM Sans", sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(lang === 'fr' ? 'Participant n°' : 'Participant no.', w / 2, w + band * 0.38)
  ctx.font = `700 ${Math.round(w * 0.09)}px "DM Sans", sans-serif`
  ctx.fillStyle = '#EBAB58'
  ctx.fillText(participantNumber.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB'), w / 2, w + band * 0.82)
  return c
}

export function toJpeg(canvas: HTMLCanvasElement, quality = JPEG_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', quality))
}

/** Reduce quality until the blob fits the target (Storage rule caps at 2 MB; we aim for ~300 KB). */
export async function toJpegUnder(canvas: HTMLCanvasElement, maxBytes = 400_000): Promise<Blob> {
  let q = JPEG_QUALITY
  let blob = await toJpeg(canvas, q)
  while (blob.size > maxBytes && q > 0.5) {
    q -= 0.08
    blob = await toJpeg(canvas, q)
  }
  return blob
}

export async function shareOrDownload(blob: Blob, filename: string, text: string) {
  const file = new File([blob], filename, { type: 'image/jpeg' })
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return } catch { /* user cancelled */ }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
