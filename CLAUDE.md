# Mur National — working notes for Claude

- Product and design docs live in `docs/`. Read `docs/ARCHITECTURE.md` before touching data flow; `docs/ROADMAP.md` fixes what ships on which day.
- Visual identity: MuduPay palette (primary blue #3273AC, gold #EBAB58, ink #121826, 12 px button radius, 20 px card radius). Tokens are in `web/src/styles.css` under `@theme`; use those, never ad-hoc colours. The Guinea tricolour is reserved for the flag strip, frames and data.
- Copy is French first; every string goes through `web/src/i18n/{fr,en}.json`.
- Clients never write to `contributions`. Anything that changes public state is a callable in `functions/src`.
- Counters and the participant sequence live in Realtime Database, documents in Firestore.
- Build checks: `cd web && npm run build`, `cd functions && npm run build`.
