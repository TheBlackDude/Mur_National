# Firebase setup for the Guinea68 project

Console: https://console.firebase.google.com/project/_/overview — pick **Guinea68**.
Do the steps in this order; later steps depend on earlier ones.

## 1. Project ID and billing
1. Gear icon → **Project settings** → General. Note the **Project ID** (may be `guinea68` or `guinea68-xxxxx`). Put it in `.firebaserc` for `default`, `staging` and `prod`.
2. Bottom-left **Upgrade** → **Blaze (pay as you go)**. Required for Cloud Functions 2nd gen, the default Storage bucket on new projects, and the Vision API.
3. In the Blaze dialog set a **budget alert**: 500 USD.

## 2. Authentication
1. Build → **Authentication** → Get started.
2. Sign-in method → enable **Anonymous**.
3. Sign-in method → enable **Google**, choose the project support email, save.
4. Settings tab → **Authorized domains** → add `theblackdude.github.io`, `guineen68.com` and `www.guineen68.com`. `localhost` is already there.

## 3. Cloud Firestore
1. Build → **Firestore Database** → Create database.
2. Location **europe-west1 (Belgium)**. This cannot be changed later.
3. **Production mode** (locked). The real rules come from `firestore.rules` at deploy time.

## 4. Realtime Database
1. Build → **Realtime Database** → Create database.
2. Location **Belgium (europe-west1)**.
3. **Locked mode**. Copy the database URL shown at the top, of the form `https://<project-id>-default-rtdb.europe-west1.firebasedatabase.app`. You need it for `VITE_FIREBASE_DATABASE_URL`.

## 5. Cloud Storage
1. Build → **Storage** → Get started.
2. **Production mode**, location **europe-west1**.
3. Note the bucket name in the header. New projects get `<project-id>.firebasestorage.app`, not `appspot.com`. That value is `VITE_FIREBASE_STORAGE_BUCKET`.

The Wall's degraded mode, the map and the screen feed `fetch()` `snapshot/latest.json` from the browser, which needs CORS on the bucket (Firebase Storage does not send it by default). Apply the read-only policy in `scripts/storage-cors.json` once:

```bash
gcloud storage buckets update gs://guinea68.firebasestorage.app --cors-file=scripts/storage-cors.json
```

## 6. Register the web app and collect the config
1. Project settings → General → **Your apps** → **Add app** → Web (`</>`).
2. Nickname `Mur National web`. Leave Firebase Hosting unticked. Register.
3. Copy the `firebaseConfig` values into `web/.env` (start from `web/.env.example`):

| Config key | `.env` variable |
|---|---|
| apiKey | `VITE_FIREBASE_API_KEY` |
| authDomain | `VITE_FIREBASE_AUTH_DOMAIN` |
| projectId | `VITE_FIREBASE_PROJECT_ID` |
| storageBucket | `VITE_FIREBASE_STORAGE_BUCKET` |
| messagingSenderId | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
| appId | `VITE_FIREBASE_APP_ID` |
| databaseURL (from step 4) | `VITE_FIREBASE_DATABASE_URL` |

`VITE_BASE` is `/` now that the site is served from `guineen68.com` (it was `/Mur_National/` on github.io).

## 7. App Check (bot protection)
Done with reCAPTCHA Enterprise, which has an API, instead of classic reCAPTCHA v3, which only has a web console:
```bash
gcloud services enable recaptchaenterprise.googleapis.com firebaseappcheck.googleapis.com --project guinea68
gcloud recaptcha keys create --web --display-name="Mur National" --domains=theblackdude.github.io,localhost --integration-type=score --project guinea68
# then register the printed key with App Check (PATCH .../apps/<appId>/recaptchaEnterpriseConfig, siteKey=<key>)
```
The site key goes in `VITE_RECAPTCHA_SITE_KEY`; the client uses `ReCaptchaEnterpriseProvider`. `guineen68.com` and `www.guineen68.com` were added to the key on 14 Sept 2026 (`gcloud recaptcha keys update`).
Enterprise is free up to 10 000 assessments a month, then about 1 USD per 1 000; App Check tokens last an hour, so a week at 100 000 participants costs on the order of 100 USD.
Leave enforcement in the App Check → APIs tab in **monitoring** until the D7 load test; callables already enforce App Check in code.

## 8. Push the web config to GitHub
```bash
scripts/gh-vars.sh            # reads web/.env and sets each VITE_* repository variable
```
Then re-run the Deploy workflow (Actions → Deploy → Run workflow) or push a commit. The live counter stops showing a dash once this is done.

## 9. CI deploys without a key (Workload Identity Federation)
Google's organization policy blocks service-account key creation, so GitHub Actions authenticates keylessly instead.
```bash
gcloud auth login                 # as a project owner
scripts/wif-setup.sh              # creates the pool, provider and github-deploy service account, sets the GitHub variables
```
After it runs, every push to `main` deploys functions and rules. No secret is needed.

## 10. First deploy from your laptop (enables the Google Cloud APIs)
The first deploy must be interactive so the CLI can enable Cloud Functions, Cloud Build, Artifact Registry, Eventarc, Pub/Sub and Cloud Scheduler on the project.
```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore,storage,database --project prod
npx firebase-tools deploy --only functions --project prod        # answer Yes to every "enable API" prompt
```
Wait about two minutes after enabling APIs if a deploy fails on permissions, then retry. After that, pushes to `main` deploy everything automatically.

## 11. Staff accounts
Each moderator signs in once with Google at `/admin`, then you grant the role:
```bash
GOOGLE_APPLICATION_CREDENTIALS=~/Downloads/guinea68-xxxx.json node scripts/set-role.mjs someone@gmail.com moderator
```
Roles: `moderator` (L1), `editor` (L2 DCI), `maeiage`, `admin`, `kiosk`. The person signs out and in again to pick it up.

## 12. Vision SafeSearch, the exports and the alerts
The Cloud Vision, Google Sheets and Google Drive APIs are enabled on `guinea68`. The functions call them as the compute service account **3206736012-compute@developer.gserviceaccount.com**, so the destinations only need to be shared with that address.

**Chiffre du jour (Sheets + CSV)**
1. Create a Google Sheet named **Chiffre du jour An 68** in the SGG/DCI shared drive. Share it with the service-account email above as *Editor*.
2. Copy the id from its URL (`/spreadsheets/d/<id>/edit`) into Firestore `config/app` → `exports.sheetId`.
3. Every day at 18:00 Conakry the `exportDaily` function appends a row (date, national, newToday, prefecturesLit, countriesLit, videosSelected, backlog, sha256). « Exporter maintenant » on `/admin/tableau` runs the same export on demand. The CSV twin is written to Storage `exports/chiffre-du-jour.csv` (running file) and `exports/chiffre-du-jour-YYYY-MM-DD.csv`; staff can download them from the Storage console. The sha256 column certifies the row for 2 October.

**Rushes for the film (Drive)**
1. Create a Drive folder **Rushes An 68** for the MAEIAGE film editors. Share it with the service-account email as *Editor* (or add the account as a member of the shared drive).
2. Put the folder id (`/folders/<id>`) into `config/app` → `exports.driveFolderId`.
3. « Exporter les retenues vers Drive » on `/admin/videos` copies each selected video as `{mission}_{participantNumber}_{firstName}.mp4` and appends it to the spreadsheet **Index rushes An 68** created inside the folder. Re-running only exports videos not yet marked `exportedAt`.

**Alerts to the war room**
- The `watchdog` function runs every 5 minutes and fires (once per hour per check, with a recovery message) on: moderation backlog above 2 000, moderation p95 above 2 h over the last two hours, snapshot older than 10 minutes. Each alert is a Cloud Logging error line starting with `[alert]` and, if `config/app` → `exports.alertWebhook` holds a Slack-compatible incoming-webhook URL, a message in that channel.
- Two alerts stay in Cloud Monitoring: Monitoring → Alerting → create a policy on the Cloud Run metric *Request count* filtered on response class 5xx / total above 2 % over 5 minutes, and Billing → Budgets & alerts → a 500 USD budget on the project with email notification to the on-call engineers. Point both notification channels at the war-room channel.

## Checklist
- [ ] Blaze plan and budget alert
- [ ] Anonymous + Google sign-in, github.io and guineen68.com authorised
- [ ] Firestore, Realtime Database, Storage in europe-west1
- [ ] Web app registered, `web/.env` filled, `scripts/gh-vars.sh` run
- [x] reCAPTCHA Enterprise key and App Check registration
- [ ] `scripts/wif-setup.sh` run (keyless CI auth)
- [ ] First interactive deploy done, APIs enabled
- [ ] First moderator role set
