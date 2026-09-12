/** Duration of a video file without uploading it. The element must be in the DOM for Chrome to load metadata;
 *  WebM from MediaRecorder reports Infinity until seeked; as a last resort the MP4/MOV `mvhd` box is parsed. */
export async function readVideoDuration(file: Blob, timeoutMs = 15_000): Promise<number> {
  const fromElement = await new Promise<number | null>((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    v.playsInline = true
    v.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none'
    const url = URL.createObjectURL(file)
    let settled = false
    const finish = (d: number | null) => { if (settled) return; settled = true; clearTimeout(timer); v.remove(); URL.revokeObjectURL(url); resolve(d) }
    const timer = window.setTimeout(() => finish(null), timeoutMs)
    v.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(v.duration) && v.duration > 0) { finish(v.duration); return }
      // Infinity: force the browser to find the end, then read it.
      const onSeek = () => { v.removeEventListener('durationchange', onSeek); if (Number.isFinite(v.duration) && v.duration > 0) finish(v.duration) }
      v.addEventListener('durationchange', onSeek)
      try { v.currentTime = 1e9 } catch { finish(null) }
    })
    v.addEventListener('error', () => finish(null))
    document.body.appendChild(v)
    v.src = url
    v.load()
  })
  if (fromElement !== null) return fromElement
  const parsed = await mp4Duration(file).catch(() => null)
  if (parsed !== null) return parsed
  throw new Error('duration unreadable')
}

/** Walks the top-level boxes for `moov` → `mvhd` (version 0 or 1) and returns duration / timescale. */
async function mp4Duration(file: Blob): Promise<number | null> {
  const head = new DataView(await file.slice(0, Math.min(file.size, 64 * 1024 * 1024)).arrayBuffer())
  const len = head.byteLength
  const box = (off: number) => ({ size: head.getUint32(off), type: String.fromCharCode(head.getUint8(off + 4), head.getUint8(off + 5), head.getUint8(off + 6), head.getUint8(off + 7)) })
  let off = 0
  while (off + 8 <= len) {
    const b = box(off)
    let size = b.size, hdr = 8
    if (size === 1 && off + 16 <= len) { size = Number(head.getBigUint64(off + 8)); hdr = 16 }
    if (size === 0) size = len - off
    if (b.type === 'moov') {
      let o = off + hdr
      while (o + 8 <= Math.min(off + size, len)) {
        const c = box(o)
        if (c.type === 'mvhd') {
          const version = head.getUint8(o + 8)
          if (version === 1) return Number(head.getBigUint64(o + 32)) / head.getUint32(o + 28)
          return head.getUint32(o + 24) / head.getUint32(o + 20)
        }
        if (c.size < 8) break
        o += c.size
      }
      return null
    }
    if (size < 8) break
    off += size
  }
  return null
}
