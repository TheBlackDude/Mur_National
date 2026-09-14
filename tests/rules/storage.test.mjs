import { test, before, after } from 'node:test'
import { ref, uploadBytes, getBytes } from 'firebase/storage'
import { env, who, ok, denied, storageOf } from './env.mjs'

let t, u
const jpeg = (kb) => new Uint8Array(kb * 1024).fill(0xff)
const SMALL = jpeg(64)
const OVER_2MB = jpeg(2049)
const st = storageOf
const put = (c, path, bytes, contentType) => uploadBytes(ref(st(c), path), bytes, { contentType })

// Seeded once: clearStorage() between tests would also drop the loaded ruleset in the emulator
// (every later request fails with « no Storage ruleset is currently loaded »), so writes use unique names.
let n = 0
const fresh = (ext) => `n${++n}-${Date.now().toString(36)}.${ext}`
before(async () => {
  t = await env()
  u = who(t)
  await t.withSecurityRulesDisabled(async (ctx) => {
    const s = storageOf(ctx)
    await uploadBytes(ref(s, 'uploads/citizen-1/abc.jpg'), SMALL, { contentType: 'image/jpeg' })
    await uploadBytes(ref(s, 'videos/FR/clip.mp4'), SMALL, { contentType: 'video/mp4' })
    await uploadBytes(ref(s, 'staging/thumbs/abc.jpg'), SMALL, { contentType: 'image/jpeg' })
    await uploadBytes(ref(s, 'public/abc.jpg'), SMALL, { contentType: 'image/jpeg' })
    await uploadBytes(ref(s, 'thumbs/abc.jpg'), SMALL, { contentType: 'image/jpeg' })
    await uploadBytes(ref(s, 'snapshot/latest.json'), new TextEncoder().encode('{}'), { contentType: 'application/json' })
    await uploadBytes(ref(s, 'exports/chiffre-du-jour.csv'), new TextEncoder().encode('a,b'), { contentType: 'text/csv' })
  })
})

test('uploads: a device writes only under its own uid, JPEG under 2 MB or a video under 80 MB', async () => {
  await ok(put(u.citizen, `uploads/citizen-1/${fresh('jpg')}`, SMALL, 'image/jpeg'))
  await ok(put(u.citizen, `uploads/citizen-1/${fresh('webm')}`, SMALL, 'video/webm'))
  await ok(put(u.citizen, `uploads/citizen-1/${fresh('mp4')}`, SMALL, 'video/mp4'))
  await denied(put(u.citizen, `uploads/citizen-2/${fresh('jpg')}`, SMALL, 'image/jpeg'))
  await denied(put(u.anon, `uploads/citizen-1/${fresh('jpg')}`, SMALL, 'image/jpeg'))
  await denied(put(u.citizen, `uploads/citizen-1/${fresh('jpg')}`, OVER_2MB, 'image/jpeg'))
  await denied(put(u.citizen, `uploads/citizen-1/${fresh('png')}`, SMALL, 'image/png'))
  await denied(put(u.citizen, `uploads/citizen-1/${fresh('txt')}`, SMALL, 'text/plain'))
})

test('uploads: read by the owner and staff only', async () => {
  await ok(getBytes(ref(st(u.citizen), 'uploads/citizen-1/abc.jpg')))
  await denied(getBytes(ref(st(u.other), 'uploads/citizen-1/abc.jpg')))
  await denied(getBytes(ref(st(u.anon), 'uploads/citizen-1/abc.jpg')))
  await ok(getBytes(ref(st(u.moderator), 'uploads/citizen-1/abc.jpg')))
  await ok(getBytes(ref(st(u.maeiage), 'uploads/citizen-1/abc.jpg')))
})

test('videos: any signed-in device sends a video under 150 MB, only staff read them', async () => {
  await ok(put(u.citizen, `videos/FR/${fresh('mp4')}`, SMALL, 'video/mp4'))
  await denied(put(u.anon, `videos/FR/${fresh('mp4')}`, SMALL, 'video/mp4'))
  await denied(put(u.citizen, `videos/FR/${fresh('jpg')}`, SMALL, 'image/jpeg'))
  await denied(getBytes(ref(st(u.citizen), 'videos/FR/clip.mp4')))
  await ok(getBytes(ref(st(u.maeiage), 'videos/FR/clip.mp4')))
  await ok(getBytes(ref(st(u.editor), 'videos/FR/clip.mp4')))
})

test('staging: staff preview, nobody writes', async () => {
  await ok(getBytes(ref(st(u.moderator), 'staging/thumbs/abc.jpg')))
  await denied(getBytes(ref(st(u.citizen), 'staging/thumbs/abc.jpg')))
  await denied(put(u.admin, `staging/thumbs/${fresh('jpg')}`, SMALL, 'image/jpeg'))
})

test('public, thumbs, snapshot: world-readable, function-written', async () => {
  for (const p of ['public/abc.jpg', 'thumbs/abc.jpg', 'snapshot/latest.json']) {
    await ok(getBytes(ref(st(u.anon), p)))
    await denied(put(u.admin, `${p.split('/')[0]}/${fresh('jpg')}`, SMALL, 'image/jpeg'))
  }
})

test('exports: staff only', async () => {
  await ok(getBytes(ref(st(u.editor), 'exports/chiffre-du-jour.csv')))
  await denied(getBytes(ref(st(u.anon), 'exports/chiffre-du-jour.csv')))
  await denied(getBytes(ref(st(u.citizen), 'exports/chiffre-du-jour.csv')))
  await denied(put(u.admin, `exports/${fresh('csv')}`, SMALL, 'text/csv'))
})

test('anything outside the known prefixes is closed', async () => {
  await denied(put(u.admin, `other/${fresh('jpg')}`, SMALL, 'image/jpeg'))
  await denied(put(u.citizen, fresh('jpg'), SMALL, 'image/jpeg'))
})
