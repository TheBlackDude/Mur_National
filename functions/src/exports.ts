import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions/v2'
import { createHash } from 'node:crypto'
import { bucket, db, exportsConfig, FieldValue, googleAccessToken, requireRole, rtdb } from './lib.js'

const SHEETS = 'https://www.googleapis.com/auth/spreadsheets'
const DRIVE = 'https://www.googleapis.com/auth/drive'
const CSV_PATH = 'exports/chiffre-du-jour.csv'
const HEADER = ['date', 'national', 'newToday', 'prefecturesLit', 'countriesLit', 'videosSelected', 'backlog', 'sha256']

export type Daily = { date: string; national: number; newToday: number; prefecturesLit: number; countriesLit: number; videosSelected: number; backlog: number }
type DailyResult = Daily & { sheet: boolean; csvPath: string }

const lit = (o: Record<string, number> | null) => Object.values(o ?? {}).filter((n) => n > 0).length
const count = async (...clauses: [string, FirebaseFirestore.WhereFilterOp, unknown][]) => {
  let q: FirebaseFirestore.Query = db.collection('contributions')
  for (const [f, op, v] of clauses) q = q.where(f, op, v)
  return (await q.count().get()).data().count
}

/** The one number everyone quotes: computed from the live counters, Conakry is UTC so the day key is the UTC date. */
export async function computeDaily(): Promise<Daily> {
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const dayKey = date.replace(/-/g, '')
  const [national, prefectures, countries, hourly, videosSelected, pending, review] = await Promise.all([
    rtdb.ref('counters/national').get().then((s) => (s.val() as number | null) ?? 0),
    rtdb.ref('counters/prefectures').get().then((s) => s.val() as Record<string, number> | null),
    rtdb.ref('counters/countries').get().then((s) => s.val() as Record<string, number> | null),
    rtdb.ref('stats/hourly').orderByKey().startAt(`${dayKey}00`).endAt(`${dayKey}23`).get().then((s) => s.val() as Record<string, number> | null),
    count(['type', '==', 'video'], ['selected', '==', true]),
    count(['status', '==', 'pending']),
    count(['status', '==', 'review']),
  ])
  return {
    date, national,
    newToday: Object.values(hourly ?? {}).reduce((a, b) => a + b, 0),
    prefecturesLit: lit(prefectures), countriesLit: lit(countries),
    videosSelected, backlog: pending + review,
  }
}

const rowOf = (d: Daily) => [d.date, d.national, d.newToday, d.prefecturesLit, d.countriesLit, d.videosSelected, d.backlog].map(String)
const sha256 = (row: string[]) => createHash('sha256').update(row.join(';')).digest('hex')

/** Appends to the running CSV and writes the day's own file; the digest lets the 2 October figure be certified. */
async function writeCsv(d: Daily): Promise<string> {
  const row = rowOf(d)
  const line = [...row, sha256(row)].join(',')
  const header = HEADER.join(',')
  const running = bucket().file(CSV_PATH)
  let existing = ''
  if ((await running.exists())[0]) existing = (await running.download())[0].toString('utf8').trimEnd()
  const body = (existing ? existing : header) + '\n' + line + '\n'
  const daily = `exports/chiffre-du-jour-${d.date}.csv`
  await Promise.all([
    running.save(body, { contentType: 'text/csv; charset=utf-8' }),
    bucket().file(daily).save(header + '\n' + line + '\n', { contentType: 'text/csv; charset=utf-8' }),
  ])
  return daily
}

async function sheetsFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  if (!res.ok) throw new Error(`Sheets ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json() as Promise<Record<string, unknown>>
}

async function appendRows(token: string, sheetId: string, rows: (string | number)[][], header: string[]) {
  const first = (await sheetsFetch(token, `${sheetId}/values/A1:${String.fromCharCode(64 + header.length)}1`)) as { values?: unknown[] }
  const values = first.values?.length ? rows : [header, ...rows]
  await sheetsFetch(token, `${sheetId}/values/A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values }) })
}

/** Row to the shared "Chiffre du jour" sheet; a missing or unreachable sheet never fails the export. */
async function appendToSheet(d: Daily): Promise<boolean> {
  const { sheetId } = await exportsConfig()
  if (!sheetId) { logger.info('exportDaily: no config/app.exports.sheetId, sheet skipped'); return false }
  try {
    const row = rowOf(d)
    await appendRows(await googleAccessToken([SHEETS]), sheetId, [[...row, sha256(row)]], HEADER)
    return true
  } catch (e) {
    logger.error('exportDaily: sheet append failed', { error: String(e) })
    return false
  }
}

async function runDaily(): Promise<DailyResult> {
  const d = await computeDaily()
  const [csvPath, sheet] = await Promise.all([writeCsv(d), appendToSheet(d)])
  logger.info('exportDaily', { ...d, sheet, csvPath })
  return { ...d, sheet, csvPath }
}

/** 18:00 Conakry every day during the campaign; the SGG validates this row for the press release. */
export const exportDaily = onSchedule({ schedule: '0 18 * * *', timeZone: 'Africa/Conakry', timeoutSeconds: 120 }, async () => { await runDaily() })

/** « Exporter maintenant » in the dashboard. */
export const exportDailyNow = onCall({ timeoutSeconds: 120 }, async (req) => {
  requireRole(req, 'editor')
  return runDaily()
})

// ---------------------------------------------------------------------------------------------
// Selected diaspora videos → the film editors' Drive folder + an index sheet inside it.

const INDEX_NAME = 'Index rushes An 68'
const INDEX_HEADER = ['mission', 'participantNumber', 'firstName', 'city', 'durationSec', 'tags', 'notes', 'driveFileId', 'exportedAt']

async function driveFetch(token: string, url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } })
  if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res
}

/**
 * The destination must sit in a Shared Drive: since 2025 a service account has no My Drive quota, so uploads into a
 * personal folder fail with 403 on every file. Checked once per run so the dashboard gets one clear sentence.
 */
async function requireSharedDriveFolder(token: string, folderId: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,driveId,mimeType&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 404) throw new HttpsError('failed-precondition', `Dossier Drive ${folderId} introuvable ou non partagé avec le compte de service`)
  if (!res.ok) throw new HttpsError('failed-precondition', `Drive ${res.status}: ${(await res.text()).slice(0, 120)}`)
  const f = (await res.json()) as { driveId?: string; mimeType?: string }
  if (!f.driveId) throw new HttpsError('failed-precondition', "Le dossier d'export doit être dans un Drive partagé (Google Workspace) : un compte de service n'a pas de quota « Mon Drive »")
}

/** Resumable upload in one PUT: rushes are ≤ 150 MB and the function has 1 GiB. */
async function uploadToDrive(token: string, folderId: string, name: string, data: Buffer, mimeType: string): Promise<string> {
  const start = await driveFetch(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mimeType, 'X-Upload-Content-Length': String(data.length) },
    body: JSON.stringify({ name, parents: [folderId], mimeType }),
  })
  const session = start.headers.get('location')
  if (!session) throw new Error('Drive: no upload session')
  const done = await driveFetch(token, session, { method: 'PUT', headers: { 'Content-Type': mimeType, 'Content-Length': String(data.length) }, body: new Uint8Array(data) })
  const { id } = (await done.json()) as { id: string }
  return id
}

const MIME: Record<string, string> = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' }

async function findOrCreateIndexSheet(token: string, folderId: string): Promise<string> {
  const q = encodeURIComponent(`name = '${INDEX_NAME}' and '${folderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`)
  const list = (await (await driveFetch(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`)).json()) as { files?: { id: string }[] }
  if (list.files?.[0]) return list.files[0].id
  const created = (await (await driveFetch(token, 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: INDEX_NAME, parents: [folderId], mimeType: 'application/vnd.google-apps.spreadsheet' }),
  })).json()) as { id: string }
  return created.id
}

const safeName = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)

/** Copies every selected, not-yet-exported video to Drive and appends it to the index sheet. Re-runs only pick up new selections. */
export const exportSelected = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async (req) => {
  requireRole(req, 'maeiage', 'editor')
  const snap = await db.collection('contributions').where('type', '==', 'video').where('selected', '==', true).orderBy('createdAt', 'desc').get()
  const docs = snap.docs.filter((d) => !d.data().exportedAt)
  const skipped = snap.size - docs.length
  const { driveFolderId } = await exportsConfig()
  if (!driveFolderId) { logger.warn('exportSelected: no config/app.exports.driveFolderId'); return { exported: 0, skipped, folder: null } }

  const token = await googleAccessToken([DRIVE, SHEETS])
  if (docs.length) await requireSharedDriveFolder(token, driveFolderId)
  const rows: (string | number)[][] = []
  let exported = 0
  let firstError: string | null = null
  for (const d of docs) {
    const c = d.data()
    // Film videos keep the clip in files.original; video selfies keep the framed poster there and the clip in files.video.
    const path = (c.files?.video ?? c.files?.original) as string | undefined
    if (!path) { logger.warn('exportSelected: no file', { id: d.id }); continue }
    try {
      const [data] = await bucket().file(path).download()
      const ext = (path.match(/\.(mp4|mov|webm)$/i)?.[1] ?? 'mp4').toLowerCase()
      const name = `${safeName(c.mission ?? c.country ?? 'GN')}_${c.participantNumber}_${safeName(c.firstName) || 'anonyme'}.${ext}`
      const driveFileId = await uploadToDrive(token, driveFolderId, name, data, MIME[ext] ?? 'video/mp4')
      const exportedAt = new Date().toISOString()
      await d.ref.update({ exportedAt: FieldValue.serverTimestamp(), driveFileId })
      rows.push([c.mission ?? '', c.participantNumber ?? '', c.firstName ?? '', c.city ?? '', c.durationSec ?? '', (c.tags ?? []).join(' '), c.notes ?? '', driveFileId, exportedAt])
      exported++
    } catch (e) {
      firstError ??= String(e)
      logger.error('exportSelected: item failed', { id: d.id, error: String(e) })
    }
  }
  // Nothing went through although there was work: say why instead of reporting zero.
  if (!exported && docs.length && firstError) throw new HttpsError('internal', firstError.slice(0, 200))
  if (rows.length) {
    try { await appendRows(token, await findOrCreateIndexSheet(token, driveFolderId), rows, INDEX_HEADER) }
    catch (e) { logger.error('exportSelected: index sheet failed', { error: String(e) }); throw new HttpsError('internal', `Index sheet: ${String(e).slice(0, 120)}`) }
  }
  return { exported, skipped, folder: driveFolderId }
})
