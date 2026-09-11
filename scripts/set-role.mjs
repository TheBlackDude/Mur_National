// Grant or revoke staff roles (custom claims) on a Google-signed-in account.
// Usage: GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/set-role.mjs user@example.com moderator editor
//        GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/set-role.mjs user@example.com --clear
// Roles: moderator (L1), editor (L2 DCI), maeiage (video selection), admin, kiosk (raised rate limit).
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const [email, ...roles] = process.argv.slice(2)
const VALID = ['moderator', 'editor', 'maeiage', 'admin', 'kiosk']
if (!email) { console.error('email required'); process.exit(1) }
initializeApp({ credential: applicationDefault() })
const auth = getAuth()
const user = await auth.getUserByEmail(email).catch(() => null)
if (!user) { console.error(`${email} must sign in once with Google before roles can be set`); process.exit(1) }
const claims = roles.includes('--clear') ? {} : Object.fromEntries(roles.filter((r) => VALID.includes(r)).map((r) => [r, true]))
await auth.setCustomUserClaims(user.uid, claims)
console.log(`${email} (${user.uid}) →`, claims, '\nThe user must sign out and back in to pick up the new roles.')
