/**
 * Minimal PDF writer: one JPEG per page, nothing else. Enough for a print run of invitation cards
 * (one card per page, A5) without shipping a PDF library to every citizen's phone.
 */
export type PdfPage = { jpeg: Uint8Array; widthPx: number; heightPx: number }

export function pdfFromJpegs(pages: PdfPage[], pageWidthPt: number, pageHeightPt: number): Blob {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const write = (s: string | Uint8Array) => { const b = typeof s === 'string' ? enc.encode(s) : s; chunks.push(b); length += b.length }
  const begin = (n: number) => { offsets[n] = length; write(`${n} 0 obj\n`) }

  write('%PDF-1.4\n%âãÏÓ\n')
  const total = 2 + pages.length * 3
  begin(1); write('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  begin(2); write(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>\nendobj\n`)
  pages.forEach((p, i) => {
    const pageN = 3 + i * 3, imgN = pageN + 1, contentN = pageN + 2
    begin(pageN)
    write(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(pageWidthPt)} ${fmt(pageHeightPt)}] /Resources << /XObject << /Im${i} ${imgN} 0 R >> >> /Contents ${contentN} 0 R >>\nendobj\n`)
    begin(imgN)
    write(`<< /Type /XObject /Subtype /Image /Width ${p.widthPx} /Height ${p.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`)
    write(p.jpeg); write('\nendstream\nendobj\n')
    const content = `q ${fmt(pageWidthPt)} 0 0 ${fmt(pageHeightPt)} 0 0 cm /Im${i} Do Q\n`
    begin(contentN)
    write(`<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`)
  })
  const xref = length
  write(`xref\n0 ${total + 1}\n0000000000 65535 f \n`)
  for (let n = 1; n <= total; n++) write(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  write(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString()

/** A5 in PostScript points. */
export const A5_PT = { width: 419.53, height: 595.28 }
