# Fier d'être Guinéen — Mur National

National wall of pride for the Semaine de la Fête Nationale An 68 (25 Sept – 2 Oct 2026).
Docs: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Layout

```
web/         Vite + React PWA (GitHub Pages / Netlify)
functions/   Cloud Functions 2nd gen, Node 20, europe-west1
scripts/     seed missions, QR posters, load tests
firebase.json · firestore.rules · storage.rules · database.rules.json · firestore.indexes.json
```

## First run

```bash
# 1. Firebase projects: mur-national-staging and mur-national-prod (Blaze plan), then:
#    enable Auth (Anonymous + Google), Firestore, Realtime Database (europe-west1), Storage, App Check (reCAPTCHA v3)
cp web/.env.example web/.env        # fill in the web config from the Firebase console
cd web && npm install && npm run dev
cd ../functions && npm install && npm run build
npx firebase-tools login
npx firebase-tools deploy --only firestore,storage,database,functions --project staging
```

Local emulators: `npx firebase-tools emulators:start` at the repo root and `VITE_USE_EMULATORS=1` in `web/.env`.

## Deploy

Push to `main`: GitHub Actions builds the PWA and deploys it to Firebase Hosting (`guineen68.com`), then functions and rules to prod.
Repository variables: `VITE_FIREBASE_*`, `VITE_RECAPTCHA_SITE_KEY`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`.
CI auth to Google Cloud is keyless: run `scripts/wif-setup.sh` once (see `docs/FIREBASE_SETUP.md`). Callables need public invokers, which the organization policy blocks by default: apply `scripts/org-policy-public-invoker.yaml` once as an Organization Policy Administrator.
Netlify: connect the repo, `netlify.toml` does the rest.

## Staff roles

Custom claims on Google accounts: `moderator` (L1), `editor` (L2, DCI), `maeiage` (video selection), `admin`, `kiosk` (raised rate limit).
Set them with the Admin SDK, e.g. `admin.auth().setCustomUserClaims(uid, { moderator: true })`.

## Frames

Drop the DCI's official frames as `web/public/frames/A.png`, `B.png`, `C.png` (1080×1080, transparent centre). Until then the studio draws a tricolour placeholder.
