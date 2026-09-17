# Operational scripts

Run everything from the repository root with Node 20 or newer.

## Prerequisites

- `gcloud auth application-default login` once on the machine (Application Default Credentials). The scripts call the Firestore REST API with that token; no service-account key is created, which the org policy forbids anyway.
- For the posters: `cd scripts && npm install` (installs `qrcode` and `pdfkit` into `scripts/node_modules`, gitignored).

## `seed-protocol.mjs` — the Presidency and Government links

```bash
node scripts/seed-protocol.mjs            # creates protocolTokens/PRESIDENCE and /GOUVERNEMENT, prints the two links
node scripts/seed-protocol.mjs --rotate   # new tokens (links already handed out stop working)
```

Links: `https://guineen68.com/presidence?t=…` (numbers 1–10; the President's photo is n° 1, his video n° 2) and
`https://guineen68.com/gouvernement?t=…` (numbers 11–60). Output in `scripts/out/protocol.csv` (gitignored).

## `reserve-protocol-numbers.mjs` — free numbers 1–60 (run once)

```bash
node scripts/reserve-protocol-numbers.mjs        # dry run
node scripts/reserve-protocol-numbers.mjs --yes  # every existing contribution moves up by 60, the sequence too
```

## `seed-missions.mjs` — missions and invite links

```bash
node scripts/seed-missions.mjs                          # one mission per country in web/src/data/countries.json
node scripts/seed-missions.mjs --base=https://guineen68.com   # links on the final domain
node scripts/seed-missions.mjs --rotate                 # new tokens for every mission (old links stop working)
```

Writes two documents per mission: `missions/{code}` (public: name, country, contact) and `missionTokens/{code}` (private: token, read only by the `missionInfo` / `submitVideo` callables). Re-runs are idempotent: existing missions keep their token unless `--rotate` is passed. Prints `code · name · link` per mission and writes `scripts/out/missions.csv`.

`scripts/out/missions.csv` contains the tokens. It is gitignored — never commit or share it in the open; hand each mission only its own link.

Until the MAEIAGE list arrives, mission code = ISO country code and the name is « Ambassade de Guinée · {pays} ». Edit names and contacts in the Firebase console (`missions/{code}`); tokens stay valid.

## `qr-posters.mjs` — A4 posters, FR and EN

```bash
node scripts/qr-posters.mjs                 # scripts/out/posters/{code}-fr.pdf and -en.pdf for every mission
node scripts/qr-posters.mjs --only=FR,SN    # a subset
node scripts/qr-posters.mjs --base=https://guineen68.com
```

The QR carries the full invite link (with the token). The URL printed under the QR is the token-less mission page, so a poster never exposes the token in clear text; scanning is the way in. Palette and layout follow the MuduPay identity with the tricolour strip; text uses Helvetica, which covers French accents.

## Reset every store to zero (test rounds, pre-launch)

```
node scripts/reset-data.mjs          # dry run: prints counts, deletes nothing
node scripts/reset-data.mjs --yes    # deletes contributions (+history), reports, blocklist,
                                     # the whole RTDB (counters, seq, rate, stats, alerts, locks),
                                     # Storage staging/ public/ thumbs/ snapshot/ exports/, anonymous users
```

Keeps `config/app`, `missions`, `missionTokens` and every staff account (any user with an e-mail or provider).
`--keep-users` leaves anonymous users in place. The export Google Sheet and the Drive folder are cleared by hand.
Participant numbers restart at 1; `snapshot/latest.json` is rebuilt by the scheduled function within 2 minutes.
Run it with the gcloud ADC of an owner of `guinea68`.

## Rules tests (`tests/`)

```bash
cd tests && npm install          # once: @firebase/rules-unit-testing + the emulator jars on first run
npm test                         # starts the Firestore, Storage and RTDB emulators, runs tests/rules/*.test.mjs
```

Twenty-one cases pin the security model from `docs/ARCHITECTURE.md` §6: approved-only reads on `contributions`, no client writes, staff-only `history`/`reports`/`exports`, editor-only `blocklist` and `config`, mission tokens never readable, `uploads/{uid}` owner-only writes with the JPEG/video size caps, world-readable `public/`, `thumbs/`, `snapshot/`, counters read-only, moderator locks with `uid`+`at`. Run it before every rules change; CI does not (the emulators need Java).

## Load test (`scripts/load/`, k6)

Targets from the roadmap: 50 submissions per second and 2 000 people on the Wall at once.

```bash
node scripts/load/prepare.mjs --users=600     # 20 test JPEGs, an App Check token, 600 anonymous users (tokens last 1 h)
scripts/load/remote.sh both                   # from Google Cloud Shell: 2 000 viewers for 4 min, 50 submissions/s for 60 s on top
scripts/load/remote.sh submissions            # or one scenario at a time
k6 run -e RATE=5 -e DURATION=10s scripts/load/submissions.js   # a small run from the laptop (brew install k6)
```

- `submissions.js` plays the citizen path end to end: Storage upload of a framed JPEG, then `submitContribution` with the App Check header, five submissions per user (the hourly ceiling). Thresholds: upload p95 < 3 s, callable p95 < 4 s, errors < 2 %.
- `viewers.js` plays a visitor: page shell from Hosting, then every 20–40 s the snapshot JSON, the live counter (RTDB REST) and the Wall's first page (Firestore `runQuery`, same query as `Wall.tsx`). Thresholds: p95 < 1.5 s on snapshot and counter, < 2.5 s on the query and the page, errors < 1 %.
- App Check: the callables enforce it. `prepare.mjs` first tries the Admin SDK (needs `iam.serviceAccounts.signBlob` on the compute service account, which the org does not grant to users), then exchanges a **debug token** (`APPCHECK_DEBUG_TOKEN`) registered in Firebase console → App Check → Apps → web app → Manage debug tokens. Delete the debug token after the test: it lets anyone holding it bypass App Check.
- Where to run it: a Conakry hotspot uploads at ~1.5 Mbit/s, far from the 60 Mbit/s that 50 uploads/s need. `remote.sh` copies the scripts and the user pool to Cloud Shell (`gcloud auth login` first; the environment lives in europe-west1 next to the functions, 15 MB/s up) and brings back the k6 summaries into `scripts/out/load/results/`.
- Every run creates real pending contributions and participant numbers, triggers `onPhotoUploaded` (SafeSearch: about 1.5 USD per 1 000 images) and trips the watchdog's backlog alert above 2 000. Run `reset-data.mjs --yes` afterwards.
- Firebase Auth allows 1 000 anonymous sign-ups per IP per hour on this project; `--users` must stay under that.

## Retention (day 60)

The `retention` function runs every day at 04:00 Conakry and deletes objects older than `config/app.retention.days` (default 60, minimum 7) under `uploads/`, `videos/` and `staging/`, then nulls the corresponding `files.*` paths on the contributions and stamps `purgedAt`. `public/` and `thumbs/` stay: the Wall keeps every approved selfie. `config/app.retention = { enabled: false }` pauses it, `{ dryRun: true }` logs what it would delete. Nothing happens before late November 2026 for the campaign's data.
