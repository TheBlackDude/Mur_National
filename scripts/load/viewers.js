// k6: 2 000 people watching the Wall at once, for four minutes.
//
//   k6 run scripts/load/viewers.js
//   k6 run -e VIEWERS=500 -e HOLD=2m scripts/load/viewers.js
//
// A viewer loads the page shell from Hosting once, then every ~30 s does what the Wall does: reads the
// public snapshot JSON, the live counter over the RTDB REST API and the first page of approved items from
// Firestore (runQuery, the same query as web/src/pages/Wall.tsx). Unauthenticated, like a real visitor.
import http from 'k6/http'
import { check, sleep } from 'k6'
import { Trend } from 'k6/metrics'

const VIEWERS = Number(__ENV.VIEWERS || 2000)
const HOLD = __ENV.HOLD || '4m'
const SITE = __ENV.SITE || 'https://guineen68.com'
const BUCKET = 'guinea68.firebasestorage.app'
const RTDB = 'https://guinea68-default-rtdb.europe-west1.firebasedatabase.app'
const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/guinea68/databases/(default)/documents:runQuery'
const SNAPSHOT = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent('snapshot/latest.json')}?alt=media`

const snapshotMs = new Trend('snapshot_ms', true)
const counterMs = new Trend('counter_ms', true)
const wallMs = new Trend('wall_query_ms', true)
const pageMs = new Trend('page_ms', true)

export const options = {
  scenarios: {
    viewers: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [{ duration: '60s', target: VIEWERS }, { duration: HOLD, target: VIEWERS }, { duration: '20s', target: 0 }],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    'http_req_failed': ['rate<0.01'],
    'snapshot_ms': ['p(95)<1500'],
    'counter_ms': ['p(95)<1500'],
    'wall_query_ms': ['p(95)<2500'],
    'page_ms': ['p(95)<2500'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
}

const wallQuery = JSON.stringify({
  structuredQuery: {
    from: [{ collectionId: 'contributions' }],
    where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'approved' } } },
    orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
    limit: 24,
  },
})

export default function () {
  if (__ITER === 0) {
    const page = http.get(`${SITE}/mur`, { tags: { step: 'page' }, timeout: '30s' })
    pageMs.add(page.timings.duration)
    check(page, { 'page 200': (r) => r.status === 200 }, { step: 'page' })
  }
  const snap = http.get(SNAPSHOT, { tags: { step: 'snapshot' }, timeout: '30s' })
  snapshotMs.add(snap.timings.duration)
  check(snap, { 'snapshot 200': (r) => r.status === 200 }, { step: 'snapshot' })

  const counter = http.get(`${RTDB}/counters/national.json`, { tags: { step: 'counter' }, timeout: '30s' })
  counterMs.add(counter.timings.duration)
  check(counter, { 'counter 200': (r) => r.status === 200 }, { step: 'counter' })

  const wall = http.post(FIRESTORE, wallQuery, { headers: { 'Content-Type': 'application/json' }, tags: { step: 'wall' }, timeout: '30s' })
  wallMs.add(wall.timings.duration)
  check(wall, { 'wall query 200': (r) => r.status === 200 }, { step: 'wall' })

  sleep(20 + Math.random() * 20)
}
