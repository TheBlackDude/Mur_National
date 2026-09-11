import { onObjectFinalized } from 'firebase-functions/v2/storage'
import sharp from 'sharp'
import { bucket, db, FieldValue } from './lib.js'

/**
 * Runs after every upload under uploads/{uid}/. Produces the thumbnail and the 1080 px rendition
 * in staging paths, computes a perceptual hash and (D3) a Vision SafeSearch verdict, and writes
 * them on the matching contribution document. Files only become public at approval (moderate.ts).
 */
export const onPhotoUploaded = onObjectFinalized({ memory: '1GiB', timeoutSeconds: 60 }, async (event) => {
  const path = event.data.name
  if (!path?.startsWith('uploads/') || !path.endsWith('.jpg')) return
  if (event.data.contentType !== 'image/jpeg') return

  const [buf] = await bucket().file(path).download()
  const base = path.replace(/^uploads\//, '').replace(/\.jpg$/, '') // {uid}/{id}
  const id = base.split('/')[1]

  const [thumb, rendition] = await Promise.all([
    sharp(buf).rotate().resize(400, 400, { fit: 'cover' }).jpeg({ quality: 78 }).toBuffer(),
    sharp(buf).rotate().resize(1080, 1080, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer(),
  ])
  await Promise.all([
    bucket().file(`staging/thumbs/${id}.jpg`).save(thumb, { contentType: 'image/jpeg' }),
    bucket().file(`staging/public/${id}.jpg`).save(rendition, { contentType: 'image/jpeg' }),
  ])

  const phash = await averageHash(buf)
  // Near-duplicate check against the last 48 h: exact-hash match is enough for the first pass;
  // D3 replaces this with a Hamming-distance scan over a small in-memory window.
  const dup = await db.collection('contributions').where('phash', '==', phash).limit(1).get()
  const duplicateOf = dup.empty ? null : dup.docs[0].id

  // TODO(D3): Vision SafeSearch → { adult, violence, racy }; route LIKELY/VERY_LIKELY to status 'review'.
  const safeSearch = null

  // The doc may not exist yet if the callable is still running: retry briefly.
  const q = db.collection('contributions').where('files.original', '==', path).limit(1)
  for (let i = 0; i < 5; i++) {
    const snap = await q.get()
    if (!snap.empty) {
      await snap.docs[0].ref.update({
        phash, duplicateOf, safeSearch,
        'files.thumb': `staging/thumbs/${id}.jpg`,
        'files.public': `staging/public/${id}.jpg`,
        ...(duplicateOf ? { status: 'review' } : {}),
        processedAt: FieldValue.serverTimestamp(),
      })
      return
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
})

/** 8×8 average hash: 64-bit hex string. Good enough to catch re-uploads of the same photo. */
async function averageHash(buf: Buffer): Promise<string> {
  const px = await sharp(buf).rotate().grayscale().resize(8, 8, { fit: 'fill' }).raw().toBuffer()
  const mean = px.reduce((a, b) => a + b, 0) / px.length
  let bits = ''
  for (const v of px) bits += v > mean ? '1' : '0'
  return BigInt('0b' + bits).toString(16).padStart(16, '0')
}
