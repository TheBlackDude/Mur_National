import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { createSign, generateKeyPairSync, randomInt } from 'node:crypto'
import { db, FieldValue, requireRole } from './lib.js'

/**
 * Invitations protocolaires An 68 (parade of 2 Oct, President's dinner).
 *
 *   events/{eventId}                 settings printed on the card (venue, date, time, dress code, wording), publicKey
 *   events/{eventId}/guests/{gid}    one guest: names, title, category, zone, seat, phone, small photo (data URL),
 *                                    code (8 chars, unique per event), token (the QR payload), status
 *   events/{eventId}/checkins/{gid}  first admitted scan, create-only (rules): the gate, the agent, the time
 *   events/{eventId}/scans/{auto}    every scan, admitted or refused, for the live view
 *   eventKeys/{eventId}              ECDSA P-256 private key (PEM); no client ever reads it
 *
 * The QR carries `A68.<eventCode>.<guestId>.<code>.<signature>`; gate phones verify the signature with the event's
 * public key (WebCrypto) and look the guest up in their offline copy, so a forged or altered code fails without network.
 */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O, 1/I
const EVENT_CODE = /^[A-Z]{3}$/
const MAX_GUESTS_PER_CALL = 1500

function shortCode(): string {
  let s = ''
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

const b64url = (b: Buffer) => b.toString('base64url')

/** The signed part of a token. Kept in one place so the gate app and the server agree byte for byte. */
export const signedPayload = (eventCode: string, guestId: string, code: string) => `${eventCode}.${guestId}.${code}`

function sign(privatePem: string, payload: string): string {
  const s = createSign('SHA256')
  s.update(payload)
  // ieee-p1363: raw r||s, the form WebCrypto verifies; DER would need a decoder on the phone.
  return b64url(s.sign({ key: privatePem, dsaEncoding: 'ieee-p1363' }))
}

type EventReq = {
  name: string; code: string; kind: 'parade' | 'dinner'
  venue?: string; date?: string; time?: string; dressCode?: string
  intro?: string; lead?: string; titleLines?: string[]; zoneLabel?: string; verso?: string; gates?: number
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Creates an event with its signing key pair. Settings can be edited afterwards by the Protocol role (rules), never the key or the code. */
export const createEvent = onCall<EventReq>(async (req) => {
  const auth = requireRole(req, 'protocol')
  const d = req.data ?? ({} as EventReq)
  const name = str(d.name, 120)
  const code = str(d.code, 3).toUpperCase()
  if (!name) throw new HttpsError('invalid-argument', 'Name required')
  if (!EVENT_CODE.test(code)) throw new HttpsError('invalid-argument', 'Event code: three letters')
  if (d.kind !== 'parade' && d.kind !== 'dinner') throw new HttpsError('invalid-argument', 'Bad kind')
  const dup = await db.collection('events').where('code', '==', code).limit(1).get()
  if (!dup.empty) throw new HttpsError('already-exists', `Code ${code} is used by another event`)

  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const spki = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

  const ref = db.collection('events').doc()
  await db.doc(`eventKeys/${ref.id}`).set({ privateKey: pem, createdAt: FieldValue.serverTimestamp() })
  await ref.set({
    name, code, kind: d.kind,
    venue: str(d.venue, 120), date: str(d.date, 60), time: str(d.time, 40), dressCode: str(d.dressCode, 80),
    intro: str(d.intro, 120), lead: str(d.lead, 120), titleLines: Array.isArray(d.titleLines) ? d.titleLines.slice(0, 3).map((l) => str(l, 80)) : [],
    zoneLabel: str(d.zoneLabel, 30) || (d.kind === 'dinner' ? 'Table' : 'Tribune'),
    verso: str(d.verso, 2000), gates: Math.min(20, Math.max(1, Number(d.gates) || (d.kind === 'dinner' ? 2 : 6))),
    publicKey: spki.toString('base64'),
    guestCount: 0, issuedCount: 0,
    createdBy: auth.uid, createdByEmail: (auth.token.email as string | undefined) ?? null,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  })
  return { id: ref.id }
})

type IssueReq = { eventId: string; guestIds?: string[]; reissue?: boolean }

/**
 * Gives every guest of the event (or the listed ones) a short code and a signed token. Idempotent: guests that already
 * hold a token keep it unless `reissue` is set (a lost card: the old QR must stop working, so revoke + reissue).
 */
export const issueInvitations = onCall<IssueReq>({ timeoutSeconds: 120 }, async (req) => {
  requireRole(req, 'protocol')
  const { eventId } = req.data ?? ({} as IssueReq)
  if (!eventId || typeof eventId !== 'string') throw new HttpsError('invalid-argument', 'eventId required')
  const [ev, key] = await Promise.all([db.doc(`events/${eventId}`).get(), db.doc(`eventKeys/${eventId}`).get()])
  if (!ev.exists || !key.exists) throw new HttpsError('not-found', 'No such event')
  const eventCode = String(ev.data()!.code)
  const pem = String(key.data()!.privateKey)

  const guestsRef = ev.ref.collection('guests')
  const all = await guestsRef.select('code', 'token', 'status').get()
  const used = new Set<string>(all.docs.map((d) => d.get('code')).filter(Boolean))
  const wanted = Array.isArray(req.data.guestIds) && req.data.guestIds.length ? new Set(req.data.guestIds.map(String)) : null
  const todo = all.docs.filter((d) => (wanted ? wanted.has(d.id) : true) && (req.data.reissue ? true : !d.get('token')))
  if (todo.length > MAX_GUESTS_PER_CALL) throw new HttpsError('resource-exhausted', `More than ${MAX_GUESTS_PER_CALL} guests in one call`)

  let issued = 0
  for (let i = 0; i < todo.length; i += 400) {
    const batch = db.batch()
    for (const d of todo.slice(i, i + 400)) {
      let code = shortCode()
      while (used.has(code)) code = shortCode()
      used.add(code)
      const token = `A68.${eventCode}.${d.id}.${code}.${sign(pem, signedPayload(eventCode, d.id, code))}`
      batch.update(d.ref, { code, token, issuedAt: FieldValue.serverTimestamp(), ...(d.get('status') === 'revoked' && req.data.reissue ? { status: 'active', revokedAt: null } : {}) })
      issued++
    }
    await batch.commit()
  }
  const issuedCount = all.docs.filter((d) => d.get('token')).length + todo.filter((d) => !d.get('token')).length
  await ev.ref.update({ issuedCount, guestCount: all.size, updatedAt: FieldValue.serverTimestamp() }).catch(() => {})
  return { issued, total: all.size }
})

