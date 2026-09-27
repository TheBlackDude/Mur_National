// Grant or revoke staff roles (custom claims) on a Google-signed-in account.
// Usage (repo root, gcloud ADC): node scripts/set-role.mjs user@example.com moderator editor
//                                  node scripts/set-role.mjs user@example.com --clear
//        --create pre-creates the account (email verified) when the person has not signed in yet;
//        their first Google sign-in links to it and keeps the roles.
// The claims are REPLACED: list every role the person keeps. firebase-admin comes from functions/node_modules.
// Roles: moderator (L1), editor (L2 DCI), maeiage (video selection), admin, kiosk (raised rate limit),
//        protocol (Cabinet SGG: invitations and cards), gate (agents at the doors: /controle only).
import { createRequire } from 'node:module'
const require = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, applicationDefault } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
process.env.GOOGLE_CLOUD_PROJECT ??= 'guinea68'
process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= 'guinea68' // Identity Toolkit refuses user ADC without a quota project

const [email, ...roles] = process.argv.slice(2)
const create = roles.includes('--create')
const VALID = ['moderator', 'editor', 'maeiage', 'admin', 'kiosk', 'protocol', 'gate']
if (!email) { console.error('email required'); process.exit(1) }
initializeApp({ credential: applicationDefault(), projectId: 'guinea68' })
const auth = getAuth()
let user = await auth.getUserByEmail(email).catch((e) => { if (e.code === 'auth/user-not-found') return null; throw e })
if (!user && create) { user = await auth.createUser({ email, emailVerified: true }); console.log(`${email} created (${user.uid})`) }
if (!user) { console.error(`${email} must sign in once with Google before roles can be set (or pass --create)`); process.exit(1) }
const claims = roles.includes('--clear') ? {} : Object.fromEntries(roles.filter((r) => VALID.includes(r)).map((r) => [r, true]))
await auth.setCustomUserClaims(user.uid, claims)
console.log(`${email} (${user.uid}) →`, claims, '\nThe user must sign out and back in to pick up the new roles.')
