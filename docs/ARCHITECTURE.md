# Fier d'être Guinéen — Mur National · System Architecture (one-week build)

Source: the campaign concept note (MuduPay, Sept 2026; not in this repository).
Launch: countdown page 22 Sept · public launch 25 Sept · national figure revealed 2 Oct 2026.

## 1. Design goals

| Goal | Consequence |
|---|---|
| Ship in 7 days with 2–3 developers | No custom servers. Static PWA + Firebase (Google) backend-as-a-service. Every feature is a page in one repo plus a handful of Cloud Functions. |
| Deploy on GitHub Pages or Netlify | The frontend is a pure static bundle. It talks to Firebase directly from the browser. Same build works on either host. |
| Survive launch peaks (25 Sept, 2 Oct) | Reads come from Firestore/CDN, not from functions. A 2‑minute JSON snapshot gives the Wall and the giant screen a degraded mode that needs zero database reads. |
| 3G, entry-level Android, < 1 MB first load | Preact/React + Vite, code-split routes, images compressed in the browser to ~250 KB before upload. |
| Nothing public without DCI approval | Clients never write to the public collection. Only a Cloud Function can move a contribution to `approved`. |

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vite + React + TypeScript, `vite-plugin-pwa`, Tailwind, i18n FR/EN (JSON) | Fast to build, PWA out of the box, small bundle. |
| Hosting (static) | GitHub Pages via GitHub Actions. Netlify as drop-in alternative (`netlify.toml`). | Free, CDN-backed on every continent, deploy on push. |
| Identity | Firebase Auth: anonymous sign-in for citizens; Google sign-in + custom claims (`moderator`, `editor`, `maeiage`, `admin`) for staff | Gives every device a stable `uid` for rate-limiting without asking for personal data. |
| Bot protection | Firebase App Check (reCAPTCHA v3) | Blocks scripted uploads to Storage and Functions. |
| Documents | Cloud Firestore | Contributions, reports, blocklist, missions, config. Paginated wall queries. |
| Live counters | Firebase Realtime Database | Participant number sequence + national/prefecture/country counters. Handles high write rates on one node and streams updates to the screen in real time. |
| Files | Cloud Storage for Firebase | Uploaded photos, public renditions, thumbnails, diaspora videos. Download URLs are served through Google's edge cache. |
| Logic | Cloud Functions 2nd gen (Node 20, `europe-west1`) | Submission, moderation, image processing, snapshot, exports. |
| Google APIs | Cloud Vision SafeSearch · Google Sheets API · Google Drive API | Auto pre-filter · "chiffre du jour" sheet for SGG/DCI · rushes export folder for the MAEIAGE film editors. |
| Ops | Firebase console + Cloud Logging, Google Sheet as the human dashboard, Looker Studio optional | No ops tooling to build. |

## 3. Pages (one PWA, one repo)

| Route | Audience | Reads | Writes |
|---|---|---|---|
| `/` | Everyone | RTDB `counters/national`, featured contributions | — |
| `/selfie` | Citizens, kiosks (`?kiosk=1`) | frames config | Storage upload → `submitContribution` |
| `/mur` | Everyone | Firestore `contributions` where `status == approved`, filters region/prefecture/country, infinite scroll (30/page) | `report` callable |
| `/carte` | Everyone | snapshot JSON (per-prefecture + per-country counts) | — |
| `/ecran` | Giant screen, RTG (OBS browser source) | RTDB counters live + snapshot JSON rotation, full-screen, no chrome | — |
| `/video?mission=XX&t=TOKEN` | Diaspora invited by a mission | mission doc | Storage resumable upload (≤ 150 MB) |
| `/admin` | DCI moderators (L1/L2), MAEIAGE selectors, SGG dashboard | `status == pending` / `review` queues, stats | `moderate`, `selectVideo`, `exportDaily` callables |

Routing on GitHub Pages: copy `index.html` to `404.html` at build time. On Netlify: `_redirects` → `/* /index.html 200`.

## 4. Data model

### Firestore

```
contributions/{id}
  uid, participantNumber (int), type: "photo" | "video"
  status: "pending" | "approved" | "rejected" | "review"
  frame: "A" | "B" | "C", prefecture, region, country (ISO), isDiaspora, kiosk (bool)
  consent: { public: true, minorSupervised: bool, at }
  files: { original, public, thumb }          // Storage paths
  phash (string), safeSearch: { adult, violence, racy }, duplicateOf (id | null)
  featured (bool), personality (bool), reports (int)
  createdAt, moderatedBy, moderatedAt, rejectReason
  mission (code, videos only), selected (bool, videos only), durationSec

reports/{id}        contributionId, uid, reason, createdAt
blocklist/{key}     type: "uid" | "phash" | "ip", reason, createdAt
missions/{code}     name, country, token, qrUrl, contact
config/app          frames[], targets{ national, perPrefecture }, launchAt, revealAt, degraded (bool),
                    liveCounter (bool, default true), safeSearch, kioskAutoApprove, autoApproveClean (bool, default false), retention{days}
```

Indexes: `contributions(status, createdAt desc)`, `(status, prefecture, createdAt desc)`, `(status, country, createdAt desc)`, `(status, featured, createdAt desc)`, `(type, mission, selected)`.

### Realtime Database

```
seq/participant                 -> 48213           (transaction: next number)
counters/national               -> 48102
counters/prefectures/{code}     -> 1234
counters/countries/{iso}        -> 87
rate/{uid}/{hourBucket}         -> 3               (max 5 submissions / device / hour, 20 in kiosk mode)
```

### Storage

```
uploads/{uid}/{id}.jpg          framed + watermarked by the browser, ≤ 400 KB   (owner write, function read)
public/{id}.jpg                 1080px canonical rendition after approval        (public read, Cache-Control immutable 1 year)
thumbs/{id}.jpg                 400px, ~30 KB, used by the Wall and screen       (public read, Cache-Control immutable 1 year)
videos/{mission}/{id}.mp4       diaspora videos, ≤ 150 MB                        (owner write, staff read)
snapshot/latest.json            counters + last 120 approved thumbs + per-region/country totals (public read, Cache-Control 60 s)
exports/YYYY-MM-DD.csv          daily certified export                            (admin read)
```

## 5. Core flows

### 5.1 Selfie (target < 60 s, < 2 MB of data)

1. Camera or file input. Browser resizes to max 1600 px, JPEG q0.82 (~250 KB).
2. Canvas composites the official An 68 frame + watermark + "68 ans". The souvenir card (frame + participant number) is also drawn on Canvas and shared with the Web Share API (WhatsApp, Facebook, TikTok) or downloaded.
3. Prefecture or country picker (offline lists bundled in the app).
4. Upload to `uploads/{uid}/{id}.jpg` (App Check enforced), then call `submitContribution({path, frame, prefecture|country, consent, kiosk})`.
5. The function checks blocklist + rate limit, reserves the participant number with an RTDB transaction, creates the `pending` doc and returns `{participantNumber}` in ~1 s. The card shows the number immediately.
6. Storage trigger `onPhotoUploaded` runs asynchronously (1 GiB, 1 vCPU, concurrency 4, up to 100 instances ≈ 200 photos/s): sharp → thumb + 1080 px rendition, perceptual hash (near-duplicate check against the last 48 h), Vision SafeSearch. Results are written on the doc; obvious violations are flagged `review` instead of `pending`. With `config/app.autoApproveClean` on, a SafeSearch-clean, non-duplicate photo is approved on the spot (the volume lever if the backlog outgrows the moderators; off by default).

Browser-side compositing is the one-week trade-off: it is instant and free. Server re-rendering the frame from the raw photo (as the note promises) is a day of work later; human moderation covers tampering in the meantime.

### 5.2 Moderation (two levels, nothing public without DCI)

- L1 queue: `status == pending`, oldest first, keyboard shortcuts A/R, batch approve. Shows SafeSearch flags, duplicate matches and kiosk origin.
- L2 queue (DCI editors): `status == review` (SafeSearch flag, ≥ 3 public reports, duplicates) plus the Featured / Personalities switches.
- `moderate({id, action})` is the only path to `approved`. On approve: copy to `public/` + `thumbs/`, increment RTDB counters (national, prefecture or country) in one multi-path update. On reject: delete files, optional blocklist entry. Reports on an approved item beyond the threshold pull it back to `review` and decrement counters.

### 5.3 Counter, map, giant screen

- `/` and `/ecran` subscribe to `counters/national` over RTDB: the number moves live on the 8‑Novembre screen and on the RTG overlay.
- `snapshot` scheduled function (every 2 min): reads counters + last 120 approved thumbs, writes `snapshot/latest.json`. `/carte`, `/ecran` and the Wall's first paint read that one file. The browser keeps its last copy in `localStorage`, so a refresh on a slow link paints faces before any network answer. The Wall then upgrades to Firestore (12 s deadline per query); a failure or timeout leaves the snapshot on screen with a « Réessayer » link. If `config/app.degraded` is set, the Wall serves only the snapshot: zero Firestore reads under exceptional load.
- Live counter: `/ecran` and the RTG overlay always hold an RTDB connection. `/` does too while `config/app.liveCounter` is true; set it to false to move every phone to the snapshot (polled once a minute) — one RTDB instance accepts 200 000 simultaneous connections, which a launch-day spike on the home page could reach. Either way a phone that gets no RTDB answer within 8 s polls the snapshot.
- Hosting sends `Cache-Control: no-cache` for HTML (browsers used to keep `/` for an hour, so a deploy left phones asking for chunk files that no longer existed: blank Wall until the cache expired); hashed `/assets/**` are immutable for a year. A failed route chunk import triggers one automatic reload (`lazyRoute`, `vite:preloadError`).
- Maps: inline SVG. Guinea prefectures from geoBoundaries ADM2, the eleven prefectures of the decree of 20 Aug 2026 (Kamsar, Timbo, Tokounou, Dialakoro, Sabadou-Baranama, Doko, Siguirini, Kintinian, Sinko, Kouankan, Karala) from their former ADM3 sub-prefecture polygon drawn over the parent; world countries from Natural Earth 110m. Shading is relative to the leading prefecture (gold outline), with a ranking beside each map. Missions light up when `counters/countries/{iso} > 0`. `web/src/data/prefectures.json` is the single source (44 prefectures + 5 Conakry communes, 10 regions); `scripts/sync-prefectures.mjs` regenerates `functions/src/prefectures.ts` so the callable stamps the same `region` the Wall filters by.

### 5.4 Diaspora videos (MAEIAGE)

- Each of the 51 missions gets `/video?mission=XX&t=TOKEN` and a QR poster (generated by a script from `missions/`).
- Resumable upload straight to Storage, 60–90 s enforced on the client (duration read via `<video>` metadata), ≤ 150 MB.
- `/admin/videos`: MAEIAGE selectors watch, tag, and mark `selected`. `exportSelected` copies selected files to a Google Drive shared folder for the film editors and writes an index sheet. No transcoding in v1.

### 5.5 Reporting for SGG / DCI / press

- `/admin/dashboard`: totals, per-prefecture progress against targets, per-country, hourly curve, moderation backlog.
- `exportDaily` (scheduled 23:55 + on demand): CSV to `exports/`, and a row appended to the "Chiffre du jour" Google Sheet shared with SGG/DCI. The 2 October certified figure is the same export, signed with its SHA‑256 in the sheet.

## 6. Security and abuse

- Firestore rules: `contributions` readable only when `status == approved`; no client writes. Staff collections require the matching custom claim.
- Storage rules: `uploads/{uid}/*` writable only by that `uid`, `image/jpeg`, < 2 MB; `videos/*` < 150 MB with a valid mission token checked by the function; `public/`, `thumbs/`, `snapshot/` world-readable.
- App Check on Storage, Firestore and Functions. Rate limit per `uid` per hour in RTDB, higher ceiling for kiosk mode (kiosk devices sign in with a staff account).
- Duplicates: pHash Hamming distance ≤ 6 → `duplicateOf` set, routed to L2.
- Personal data: explicit public-display consent checkbox stored with a timestamp; minors only through supervised kiosks (`kiosk == true` and `minorSupervised`); no email/phone collected; retention policy and legal notice pages in FR/EN. Retention job deletes `uploads/` originals 60 days after the week.
- Sovereignty gap to state openly to the client: the concept note promises hosting on the national Tier III data centre. This design runs on Google Cloud (`europe-west1`). Mitigation: a nightly Firestore export + `gsutil rsync` of Storage to a bucket or server in Conakry, so the State holds a complete sovereign copy, and the post-week platform can be migrated there.

## 7. Capacity notes (500 000 contributions in eight days)

| Component | Ceiling that matters | Where we stand | Lever |
|---|---|---|---|
| `submitContribution` | 50 instances × 80 concurrent, median 1.35 s | 50/s sustained in the D7 test, 0 errors | `minInstances` 2 for the week; raise `maxInstances` in `index.ts` if p95 > 5 s |
| `onPhotoUploaded` | 100 instances × 4 concurrent ≈ 200 photos/s | ~2 s per photo | memory/concurrency in `onPhotoUploaded.ts` |
| Vision SafeSearch | 1 800 requests/min default quota (30/s) | throttled calls store `null` → item goes to L1 as unknown, never lost | request a quota raise on `vision.googleapis.com` before 25 Sept |
| RTDB | 1 000 writes/s, 200 000 simultaneous connections | one transaction per submission + one per approval | `liveCounter=false` moves home-page readers to the snapshot |
| Firestore | 10 000 writes/s per database, 1 write/s per document | distinct documents, indexed `createdAt` under the 500/s sequential-write hotspot limit | none needed |
| Storage egress | ~30 KB per thumbnail view | thumbnails now immutable-cached by browsers and Google's edge | run `scripts/set-cache-control.mjs --yes` once for objects published before 16 Sept |
| Human moderation | ~1 000 decisions/h per moderator with keyboard shortcuts | 500 000 in 8 days ≈ 2 600/h average, 10 000/h at peaks | `autoApproveClean` flag; reserve moderators; SafeSearch keeps the flagged ones in L2 |
| Video selfies | 30 MB per play on the Wall, 80 MB per upload | few so far | keep the 40–90 s cap; consider `type == video` off the main Wall tab if egress grows |

Budget order of magnitude at 500 000 photos: Storage ≈ 220 GB (originals + renditions), Firestore reads ≈ 2 per Wall visit, Functions ≈ 3 invocations per contribution. The egress line dominates and depends on cache hit rate, hence the immutable headers.

## 8. Repository and deployment

```
mur-national/
  web/                 Vite PWA (routes above), src/i18n/{fr,en}.json, src/data/{prefectures,countries}.json
  functions/           submitContribution, onPhotoUploaded, moderate, report, snapshot, exportDaily, exportSelected, retention
  firestore.rules  storage.rules  database.rules.json  firestore.indexes.json  firebase.json
  scripts/             seed missions, generate QR posters, load test (k6)
  .github/workflows/deploy.yml
```

`deploy.yml` on push to `main`:
1. `npm ci && npm run build` in `web/` (env: Firebase web config, public by design).
2. Deploy `web/dist` to GitHub Pages (`actions/deploy-pages`). Netlify alternative: connect the repo, build `npm run build`, publish `web/dist`.
3. `firebase deploy --only functions,firestore,storage,database` with a service-account secret.

Static site on Firebase Hosting (site `guinea68`, custom domain `guineen68.com`, HTTPS automatic, `**` rewritten to index.html so shared links return 200). The old GitHub Pages deployment only redirects github.io links to the domain. Add the domain to Firebase Auth authorized domains and App Check.

Environments: `mur-national-staging` and `mur-national-prod` Firebase projects; `main` → prod, `develop` → staging.

## 8. Capacity and cost (order of magnitude, one week, 100 000 photos)

| Item | Estimate |
|---|---|
| Storage | 100k × (300 KB upload + 250 KB public + 50 KB thumb) ≈ 60 GB → < $2 |
| Egress (Wall + screen) | 1–3 TB of thumbnails → $120–360 (largest line; the snapshot and 50 KB thumbs keep it here) |
| Firestore | ~60 M reads, ~1 M writes → ~$30 |
| Functions | ~500k invocations, ~50 GB-s → < $10 |
| Vision SafeSearch | 100k images → ~$150 (optional, can be limited to L2 items) |
| RTDB, Auth, App Check | free tier |
| **Total** | **≈ $300–600 for the week** on the Blaze plan. Set a budget alert at $500. |

Peak sizing: 100k photos over 8 days is ~0.15/s average; a launch-hour spike of 50 submissions/s stays within Functions autoscaling and RTDB transaction throughput. Firestore reads scale with viewers; the snapshot caps them.

## 9. Seven-day build plan

| Day | Deliverable | Done when |
|---|---|---|
| D1 | Repo, two Firebase projects, Auth + App Check, rules, PWA shell, FR/EN, prefecture/country data, DCI frames imported, deploy pipeline green | A blank PWA is live on the domain from `main`. |
| D2 | Selfie studio (camera, Canvas frame + watermark, compression, souvenir card, share), `submitContribution`, participant number | A phone on 3G submits in < 60 s and gets a number. |
| D3 | Wall with filters and pagination, live counter on `/`, `onPhotoUploaded` (thumb, rendition, pHash, SafeSearch) | Approved photos appear on the Wall within seconds. |
| D4 | `/admin` L1/L2 queues, `moderate`, `report`, blocklist, featured/personalities | A moderator clears 100 items in 10 min on a laptop. |
| D5 | `/ecran`, `/carte` (prefectures + world), `snapshot`, degraded mode, dashboard | The screen feed runs 1 h in OBS without a reload. |
| D6 | Diaspora video route, MAEIAGE queue, Drive export, mission tokens + QR posters, kiosk mode, Sheets export | A test mission uploads a video that lands in the Drive folder. |
| D7 | k6 load test (50 submissions/s, 2 000 concurrent Wall viewers), rules tests, retention job, moderator training, content freeze, seeding by personalities | Staging passes the load test; prod frozen for 22 Sept. |

Deferred after launch: server-side frame re-render, video transcoding, Looker Studio, SMS/USSD entry, national DC migration.

## 10. Team

Two developers (one frontend/PWA, one Firebase/functions), one designer for frames, cards, and the screen layout, one PM/moderation lead with the DCI. Daily 15‑minute check with the DCI on frames, wording and moderation rules.
