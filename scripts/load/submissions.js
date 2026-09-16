// k6: the citizen path at 50 submissions per second — Storage upload + submitContribution — for one minute.
//
//   node scripts/load/prepare.mjs --users=600
//   k6 run scripts/load/submissions.js                       # 50/s for 60 s (3 000 submissions)
//   k6 run -e RATE=20 -e DURATION=30s scripts/load/submissions.js
//
// Each iteration plays one phone: PUT the framed JPEG to uploads/{uid}/{id}.jpg (single-shot upload, the same
// endpoint the resumable uploader finalises on), then call submitContribution with the App Check token.
// A user is reused for five iterations (the per-uid hourly ceiling); prepare.mjs sizes the pool accordingly.
import http from 'k6/http'
import { check } from 'k6'
import exec from 'k6/execution'
import { SharedArray } from 'k6/data'
import { Counter, Trend } from 'k6/metrics'

const RATE = Number(__ENV.RATE || 50)
const DURATION = __ENV.DURATION || '60s'
const PER_USER = 5
const BUCKET = 'guinea68.firebasestorage.app'
const FN = 'https://europe-west1-guinea68.cloudfunctions.net'
const PREFECTURES = ['CKY-KAL', 'CKY-DIX', 'CKY-MAT', 'CKY-RAT', 'CKY-MTT', 'BOF', 'BOK', 'KIN', 'LAB', 'MAM', 'KAN', 'NZE', 'FAR', 'KDA']
const COUNTRIES = ['SN', 'FR', 'US', 'ML', 'CI', 'BE', 'DE']

const pool = new SharedArray('users', () => JSON.parse(open('../out/load/users.json')).users)
const appCheck = JSON.parse(open('../out/load/users.json')).appCheck
const images = []
for (let i = 0; i < 20; i++) images.push(open(`../out/load/images/${i}.jpg`, 'b'))

const uploadMs = new Trend('upload_ms', true)
const submitMs = new Trend('submit_ms', true)
const rateLimited = new Counter('rate_limited')
const participant = new Trend('participant_number')

export const options = {
  scenarios: {
    submissions: {
      executor: 'constant-arrival-rate',
      rate: RATE, timeUnit: '1s', duration: DURATION,
      preAllocatedVUs: Math.max(50, RATE * 3), maxVUs: Math.max(100, RATE * 8),
    },
  },
  thresholds: {
    'checks{step:upload}': ['rate>0.99'],
    'checks{step:submit}': ['rate>0.98'],
    'submit_ms': ['p(95)<4000'],
    'upload_ms': ['p(95)<3000'],
    'http_req_failed': ['rate<0.02'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
}

export function setup() {
  const need = Math.ceil(RATE * parseDuration(DURATION) / PER_USER)
  if (pool.length < need) console.warn(`pool of ${pool.length} users covers ${pool.length * PER_USER} submissions; ${RATE}/s for ${DURATION} needs ${need} users — the rest will hit the hourly limit (429)`)
}
function parseDuration(d) { const m = /^(\d+)(s|m)$/.exec(d); return m ? Number(m[1]) * (m[2] === 'm' ? 60 : 1) : 60 }

export default function () {
  const iter = exec.scenario.iterationInTest
  const user = pool[Math.floor(iter / PER_USER) % pool.length]
  const id = `k6-${iter}-${Date.now().toString(36)}`
  const path = `uploads/${user.uid}/${id}.jpg`

  const up = http.post(`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${encodeURIComponent(path)}&uploadType=media`,
    images[iter % images.length],
    { headers: { Authorization: `Firebase ${user.idToken}`, 'Content-Type': 'image/jpeg', 'X-Firebase-AppCheck': appCheck }, tags: { step: 'upload' }, timeout: '60s' })
  uploadMs.add(up.timings.duration)
  if (!check(up, { 'upload 200': (r) => r.status === 200 }, { step: 'upload' })) return

  const diaspora = iter % 10 === 0
  const data = { path, frame: ['A', 'B', 'C'][iter % 3], consent: { public: true }, ...(diaspora ? { country: COUNTRIES[iter % COUNTRIES.length] } : { prefecture: PREFECTURES[iter % PREFECTURES.length] }) }
  const res = http.post(`${FN}/submitContribution`, JSON.stringify({ data }),
    { headers: { Authorization: `Bearer ${user.idToken}`, 'X-Firebase-AppCheck': appCheck, 'Content-Type': 'application/json' }, tags: { step: 'submit' }, timeout: '60s' })
  submitMs.add(res.timings.duration)
  if (res.status === 429) rateLimited.add(1)
  const okSubmit = check(res, {
    'submit 200': (r) => r.status === 200,
    'has participantNumber': (r) => { try { return typeof r.json('result.participantNumber') === 'number' } catch { return false } },
  }, { step: 'submit' })
  if (okSubmit) participant.add(res.json('result.participantNumber'))
  else if (res.status !== 429) console.warn(`submit ${res.status}: ${String(res.body).slice(0, 160)}`)
}
