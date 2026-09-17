/** Invitations protocolaires An 68: shared types, CSV import, guest photos, QR token parsing and verification. */
import type { Timestamp } from 'firebase/firestore'
import type { EventKind } from './firebase'

export type EventDoc = {
  id: string; name: string; code: string; kind: EventKind
  venue: string; date: string; time: string; dressCode: string
  intro: string; lead: string; titleLines: string[]; zoneLabel: string; verso: string; gates: number
  publicKey: string; guestCount?: number; issuedCount?: number
  createdAt?: Timestamp; updatedAt?: Timestamp
}
export type GuestStatus = 'active' | 'revoked'
export type Guest = {
  id: string
  civility: string; firstName: string; lastName: string; title: string; category: string
  zone: string; seat: string; phone: string
  /** Small JPEG data URL (≈ 20 KB), shown to the gate agent; never printed. */
  photo: string | null
  code?: string | null; token?: string | null; issuedAt?: Timestamp | null
  status: GuestStatus
  createdAt?: Timestamp; updatedAt?: Timestamp; revokedAt?: Timestamp | null
}
export type Checkin = { id: string; at: Timestamp | null; gate: number; by: string; byEmail: string | null; offline?: boolean }
export type ScanResult = 'admitted' | 'refused'
export type RefusalReason = 'unknown' | 'bad_signature' | 'other_event' | 'revoked' | 'already' | 'unreadable'
export type Scan = { id: string; at: Timestamp | null; gate: number; by: string; byEmail: string | null; guestId: string | null; result: ScanResult; reason: RefusalReason | null }

/** Defaults the Cabinet edits in the admin; everything printed on a card comes from the event document. */
export const EVENT_PRESETS: Record<EventKind, Pick<EventDoc, 'name' | 'code' | 'venue' | 'date' | 'time' | 'dressCode' | 'intro' | 'lead' | 'titleLines' | 'zoneLabel' | 'gates'>> = {
  parade: { name: 'Défilé militaire du 2 octobre', code: 'DEF', venue: 'Palais du Peuple', date: 'Vendredi 2 octobre 2026', time: '9 h', dressCode: '', intro: "a l'honneur d'inviter", lead: '', titleLines: ['Défilé militaire du 68e anniversaire', "de l'Indépendance nationale"], zoneLabel: 'Tribune', gates: 6 },
  dinner: { name: 'Dîner du Président de la République', code: 'DIN', venue: 'Palais présidentiel', date: 'Vendredi 2 octobre 2026', time: '20 h', dressCode: 'Tenue de soirée', intro: 'prie', lead: "de lui faire l'honneur d'assister au", titleLines: ['Dîner de la Fête Nationale'], zoneLabel: 'Table', gates: 2 },
}

export const CATEGORY_SUGGESTIONS = ['Membre du Gouvernement', 'Institution républicaine', 'Corps diplomatique', 'Délégation étrangère', 'Forces de défense et de sécurité', 'Invité officiel', 'Presse']

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
/** 10 random letters and digits: short enough for a version-7 QR, unguessable (59 bits). */
export function newGuestId(): string {
  const b = crypto.getRandomValues(new Uint8Array(10))
  return Array.from(b, (x) => ID_ALPHABET[x % ID_ALPHABET.length]).join('')
}

export const guestName = (g: Pick<Guest, 'civility' | 'firstName' | 'lastName'>) => [g.civility, g.firstName, g.lastName].filter(Boolean).join(' ').trim()

/* ---------- CSV import (Google Sheets or Excel export; comma or semicolon; quoted fields) ---------- */

export type ImportRow = Pick<Guest, 'civility' | 'firstName' | 'lastName' | 'title' | 'category' | 'zone' | 'seat' | 'phone'>
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const HEADERS: Record<string, keyof ImportRow> = {
  civilite: 'civility', civility: 'civility', titre_civilite: 'civility',
  prenom: 'firstName', prenoms: 'firstName', firstname: 'firstName', 'first name': 'firstName',
  nom: 'lastName', noms: 'lastName', lastname: 'lastName', 'last name': 'lastName', 'nom de famille': 'lastName',
  fonction: 'title', titre: 'title', qualite: 'title', title: 'title', poste: 'title',
  categorie: 'category', category: 'category', groupe: 'category',
  zone: 'zone', tribune: 'zone', table: 'zone', secteur: 'zone',
  siege: 'seat', place: 'seat', rang: 'seat', seat: 'seat',
  telephone: 'phone', tel: 'phone', phone: 'phone', mobile: 'phone', portable: 'phone',
}

function splitCsv(text: string): string[][] {
  const rows: string[][] = []
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const delim = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : first.includes('\t') && !first.includes(',') ? '\t' : ','
  let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false }
      else field += c
    } else if (c === '"') quoted = true
    else if (c === delim) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((v) => v.trim()))
}

/** Parses a guest list; unknown columns are ignored, rows without a last name are reported and skipped. */
export function parseGuestCsv(text: string): { rows: ImportRow[]; skipped: number; unknownColumns: string[] } {
  const table = splitCsv(text.replace(/^﻿/, ''))
  if (table.length === 0) return { rows: [], skipped: 0, unknownColumns: [] }
  const header = table[0].map(strip)
  const map = header.map((h) => HEADERS[h] ?? HEADERS[h.replace(/[^a-z ]/g, '')] ?? null)
  const unknownColumns = header.filter((_, i) => !map[i] && header[i])
  const rows: ImportRow[] = []
  let skipped = 0
  for (const r of table.slice(1)) {
    const g: ImportRow = { civility: '', firstName: '', lastName: '', title: '', category: '', zone: '', seat: '', phone: '' }
    r.forEach((v, i) => { const k = map[i]; if (k) g[k] = v.trim().slice(0, 120) })
    if (!g.lastName && !g.firstName) { skipped++; continue }
    rows.push(g)
  }
  return { rows, skipped, unknownColumns }
}

/* ---------- Guest photo: small JPEG data URL, stored in the document ---------- */

export async function photoDataUrl(file: File, w = 360, h = 450): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  const s = Math.max(w / bmp.width, h / bmp.height)
  const dw = bmp.width * s, dh = bmp.height * s
  ctx.drawImage(bmp, (w - dw) / 2, (h - dh) / 2, dw, dh)
  let q = 0.74, url = c.toDataURL('image/jpeg', q)
  while (url.length > 80_000 && q > 0.4) { q -= 0.08; url = c.toDataURL('image/jpeg', q) }
  return url
}

/* ---------- QR token: A68.<eventCode>.<guestId>.<code>.<signature> ---------- */

export type ParsedToken = { eventCode: string; guestId: string; code: string; sig: string }
const TOKEN = /^A68\.([A-Z]{3})\.([A-Za-z0-9]{10})\.([A-Z2-9]{4}-[A-Z2-9]{4})\.([A-Za-z0-9_-]{86})$/

export function parseToken(text: string): ParsedToken | null {
  const m = text.trim().match(TOKEN)
  return m ? { eventCode: m[1], guestId: m[2], code: m[3], sig: m[4] } : null
}

function bytes(binary: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}
const b64urlToBytes = (s: string) => bytes(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')))
const b64ToBytes = (s: string) => bytes(atob(s))

/** The event's public key (SPKI, base64 in the event document) as a WebCrypto key. */
export function importEventKey(spkiB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', b64ToBytes(spkiB64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
}

/** True when the signature matches `<eventCode>.<guestId>.<code>` under the event's key. */
export async function verifyToken(key: CryptoKey, t: ParsedToken): Promise<boolean> {
  try {
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64urlToBytes(t.sig), new TextEncoder().encode(`${t.eventCode}.${t.guestId}.${t.code}`))
  } catch { return false }
}

export const normalizeCode = (s: string) => {
  const raw = s.toUpperCase().replace(/[^A-Z2-9]/g, '').replace(/O/g, '0').replace(/[0I]/g, (c) => (c === '0' ? 'O' : 'I'))
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : s.toUpperCase().trim()
}
