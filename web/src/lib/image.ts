/** Client-side image pipeline: resize, compose the official frame, watermark, export JPEG. */

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

const frameCache = new Map<string, Promise<HTMLImageElement>>()
export function loadFrame(id: 'A' | 'B' | 'C'): Promise<HTMLImageElement> {
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

/** Frame + watermark over the square photo. Returns the composed canvas. */
export async function compose(photo: HTMLCanvasElement, frameId: 'A' | 'B' | 'C'): Promise<HTMLCanvasElement> {
  const out = document.createElement('canvas')
  out.width = out.height = photo.width
  const ctx = out.getContext('2d')!
  ctx.drawImage(photo, 0, 0)
  try {
    const frame = await loadFrame(frameId)
    ctx.drawImage(frame, 0, 0, out.width, out.height)
  } catch {
    // Placeholder until the DCI delivers the official PNG frames: tricolour border + "68 ans".
    const w = out.width, b = Math.round(w * 0.045)
    ctx.fillStyle = '#CE1126'; ctx.fillRect(0, 0, w, b)
    ctx.fillStyle = '#FCD116'; ctx.fillRect(0, w - b, w, b)
    ctx.fillStyle = '#009460'; ctx.fillRect(0, 0, b, w); ctx.fillRect(w - b, 0, b, w)
    ctx.fillStyle = 'rgba(18,24,38,.75)'
    ctx.font = `700 ${Math.round(w * 0.06)}px "DM Sans", sans-serif`
    ctx.textAlign = 'right'
    ctx.fillText('68 ans · Fier d’être Guinéen', w - b * 1.6, w - b * 1.8)
  }
  // Watermark
  ctx.font = `500 ${Math.round(out.width * 0.022)}px "DM Sans", sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,.85)'
  ctx.textAlign = 'left'
  ctx.fillText('fierdetreguineen.gn', Math.round(out.width * 0.06), Math.round(out.height * 0.955))
  return out
}

/** Souvenir card: composed photo + participant number band. */
export function souvenirCard(composed: HTMLCanvasElement, participantNumber: number, lang: 'fr' | 'en'): HTMLCanvasElement {
  const w = composed.width, band = Math.round(w * 0.22)
  const c = document.createElement('canvas')
  c.width = w; c.height = w + band
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#3273AC'; ctx.fillRect(0, 0, w, c.height)
  ctx.drawImage(composed, 0, 0)
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
