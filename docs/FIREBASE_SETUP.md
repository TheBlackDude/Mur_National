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
4. Settings tab → **Authorized domains** → add `theblackdude.github.io` (and `fierdetreguineen.gn` when the domain exists). `localhost` is already there.

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

Keep `VITE_BASE=/Mur_National/` while the site lives on github.io.

## 7. App Check (bot protection)
Done with reCAPTCHA Enterprise, which has an API, instead of classic reCAPTCHA v3, which only has a web console:
```bash
gcloud services enable recaptchaenterprise.googleapis.com firebaseappcheck.googleapis.com --project guinea68
gcloud recaptcha keys create --web --display-name="Mur National" --domains=theblackdude.github.io,localhost --integration-type=score --project guinea68
# then register the printed key with App Check (PATCH .../apps/<appId>/recaptchaEnterpriseConfig, siteKey=<key>)
```
The site key goes in `VITE_RECAPTCHA_SITE_KEY`; the client uses `ReCaptchaEnterpriseProvider`. Add `fierdetreguineen.gn` to the key's domains when the domain exists (`gcloud recaptcha keys update`).
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

## 12. Vision SafeSearch (D3) and the exports (D6)
- Google Cloud console → APIs & Services → enable **Cloud Vision API**.
- For the Sheets and Drive exports, enable **Google Sheets API** and **Google Drive API**, then share the target sheet and folder with the service-account email as editor.

## Checklist
- [ ] Blaze plan and budget alert
- [ ] Anonymous + Google sign-in, github.io authorised
- [ ] Firestore, Realtime Database, Storage in europe-west1
- [ ] Web app registered, `web/.env` filled, `scripts/gh-vars.sh` run
- [x] reCAPTCHA Enterprise key and App Check registration
- [ ] `scripts/wif-setup.sh` run (keyless CI auth)
- [ ] First interactive deploy done, APIs enabled
- [ ] First moderator role set
