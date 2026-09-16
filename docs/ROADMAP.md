# Fier d'être Guinéen — Mur National · Product Roadmap

Companion to `ARCHITECTURE.md`. Dates are real: today, 11 Sept 2026, is J‑14. Public launch 25 Sept. National figure revealed 2 Oct.

## 1. North star and targets

**One number the Head of State can announce on 2 October**, backed by a Wall that every Guinean at home and abroad can find themselves on.

| KPI | Target | Communication threshold | Measured by |
|---|---|---|---|
| Validated selfies | 500 000 | 50 000 | `counters/national` (approved only) |
| Territorial coverage | 44 / 44 prefectures on the Wall before 2 Oct | 33 by 29 Sept | `counters/prefectures` > 0 |
| Diaspora | contributions from the 51 mission countries | 35 countries | `counters/countries` > 0 |
| Diaspora videos | 500 usable 60–90 s videos | 250 | `selected == true` |
| Moderation latency | median < 15 min, p95 < 60 min during the week | — | `moderatedAt − createdAt` |
| Selfie completion | > 60 % of `/selfie` starts end in a submission | — | analytics events |
| Availability | Wall and counter readable 100 % of the week (degraded mode counts) | — | uptime check on `/ecran` |

## 2. Phases and releases

| Phase | Dates | Release | Scope | Exit criteria |
|---|---|---|---|---|
| **P0 · Cadrage éclair** | 11–13 Sept (J‑14 → J‑12) | — | 48 h with the DCI: frames, domain, frozen scope, moderation rules, hosting statement | Signed one-page scope. Frames delivered. Domain requested. |
| **P1 · Noyau** | 14–18 Sept (J‑11 → J‑7) | **v1.0** on staging | Selfie studio, souvenir card + share, participant number, Wall with filters, live counter, L1/L2 moderation, blocklist, deploy pipeline | A 3G phone submits in < 60 s. A moderator clears 100 items in 10 min. |
| **P2 · Nation** | 19–21 Sept (J‑6 → J‑4) | **v1.1** on staging → prod | Map (prefectures + world), `/ecran` feed for the 8‑Novembre screen and RTG, dashboard, diaspora video intake + MAEIAGE queue, mission QR posters, kiosk mode, snapshot + degraded mode, Sheets/Drive exports | Load test passed (50 submissions/s, 2 000 Wall viewers). Moderators trained. |
| **P3 · Avant-première** | 22–24 Sept (J‑3 → J‑1) | **v1.1 live**, countdown mode | Public countdown page, Wall seeded by Government, artists, Ambassadors, Syli, diaspora figures. Posters to 51 missions. Press kit. Content freeze. | ≥ 200 seeded contributions. All 51 mission links tested. War-room rota published. |
| **P4 · La Semaine** | 25 Sept – 2 Oct | hotfixes only (v1.1.x) | Operations: 24/7 supervision, daily « chiffre du jour », prefecture challenge, mission animation, screen and RTG feed | 2 Oct: certified figure delivered 2 h before the reveal. |
| **P5 · Après** | 3 Oct – 2 Dec (+60 days) | **v1.2** | Certified final export, rushes delivered to the MAEIAGE film, retrospective, sovereign migration (national DC), originals deleted at day 60, handover and training | Signed acceptance. Sovereign copy verified. Retention job run. |
| **P6 · Actifs durables** | 2027 → | **v2** | Diaspora engagement registry, reusable ritual (An 69, Syli, Simandou milestones), embed widgets, bridge to the national quiz platform audience | Decision on the permanent platform |

## 3. Milestones

| Date | Milestone | Owner |
|---|---|---|
| 13 Sept | Scope freeze signed, 3 frames validated | DCI + MuduPay |
| 14 Sept | Domain `guineen68.com` bought on Squarespace, DNS pointed at GitHub Pages | MuduPay |
| 15 Sept | Domain live on the static host (blank PWA), Firebase projects created | MuduPay |
| 16 Sept | Minister's decision: the Wall stays open as it is (≈ 180 contributions received during the tester round); `launchAt` moved to the past, the platform is considered live from this day | SGG + MuduPay |
| 17 Sept | Mission contacts and country list received from the MAEIAGE | MAEIAGE |
| 18 Sept | v1.0 on staging; moderator accounts created | MuduPay + DCI |
| 19 Sept | Screen and RTG technical spec agreed (resolution, overlay zone, network at the roundabout) | MCENI/RTG |
| 20 Sept | Moderator training (2 h, DCI, 8–12 people in two shifts) | MuduPay |
| 21 Sept | Load test passed, v1.1 promoted to prod, content freeze | MuduPay |
| 22 Sept | Countdown live, seeding by personalities begins, posters sent to 51 missions | DCI + MAEIAGE |
| 24 Sept | Press kit out; QR codes confirmed on t‑shirts, kakémonos, screen | DCI |
| **25 Sept** | **Public launch, first official selfie at Lac Gbassikolo** | Présidence |
| 27 Sept | First « chiffre du jour » press release; prefecture challenge leaderboard published | SGG + DCI |
| 29 Sept | Checkpoint: 33 prefectures and 35 countries lit, else activate contingency (kiosk push in missing prefectures, mission calls) | SGG |
| 1 Oct | Certified figure rehearsal; screen feed rehearsal at the roundabout | MuduPay + MCENI |
| **2 Oct** | **National figure revealed on the giant screen, RTG and in 51 missions** | Présidence |
| 3 Oct | `minInstances` on `submitContribution` back to 0 (set to 2 for the week after the D7 load test) | MuduPay |
| 4 Oct | Cloud Functions runtime moved from Node 20 to Node 22 (Node 20 decommissioned 30 Oct 2026) and redeployed; retention job verified in dry run | MuduPay |
| 9 Oct | Retrospective with SGG/DCI/MAEIAGE/MCENI; rushes handed to the film editors | All |
| 31 Oct | Sovereign copy verified on the national DC | MuduPay |
| 2 Dec | Originals deleted (day 60), final acceptance | MuduPay + SGG |

## 4. Scope by priority

**Must (v1.0, nothing launches without it)**
- Studio: camera/import, client-side compression, 3 official frames, watermark, souvenir card with participant number, share to WhatsApp/Facebook/TikTok
- Wall: approved contributions, filters region / prefecture / country, Personalities wall, editorial featured
- Live national counter
- Moderation: L1 pending queue, L2 review queue, reject with reason, blocklist, public reporting
- FR/EN, legal notice, consent, retention policy
- Deploy pipeline, staging and prod

**Should (v1.1, before 22 Sept)**
- Map of the Nation: 44 prefectures with gauges, world map by mission
- `/ecran` feed and RTG overlay (transparent background variant)
- Dashboard for SGG/DCI, daily Sheets export, certified export
- Diaspora video intake, MAEIAGE selection queue, Drive export
- Mission links + QR posters, kiosk mode with higher rate limit and minor-supervised flag
- Snapshot, degraded mode, Vision SafeSearch pre-filter, pHash duplicates
- Embeddable live-counter widget (one `<script>` tag) for the 50 partner sites already carrying DCI banners

**Could (during the week, only if the week is calm)**
- Prefecture challenge leaderboard page
- « 68 Voix » capsule cross-links on the Wall
- Certificate PDF « participant n° » for download

**Won't (this campaign)**
- User accounts, phone/OTP, comments or likes, server-side frame re-render, video transcoding, SMS/USSD, native apps, AI moderation beyond SafeSearch

## 5. Dependencies on partners (blocking dates)

| Need | From | By | If late |
|---|---|---|---|
| 3 official frame designs (PNG with alpha, 1080×1350 and 1080×1080) | DCI | 13 Sept | Ship with MuduPay placeholder frames, swap by config without redeploy |
| Domain and DNS delegation | SGG / DCI | 15 Sept | Launch on `mur-national.netlify.app` behind a QR redirect |
| 51 mission contacts, country list, animation guide | MAEIAGE | 17 Sept | Generic diaspora link, missions added progressively |
| Moderator list and shifts (min 8 people) | DCI | 18 Sept | MuduPay staffs L1 for the first 48 h |
| Screen/RTG spec and network on site | MCENI / RTG | 19 Sept | `/ecran` runs on a 4G laptop with the snapshot fallback |
| Personalities content for seeding | DCI | 21 Sept | Seed with Syli, artists and MuduPay's own network |
| Hosting statement (Google Cloud for the week + sovereign copy) accepted | SGG | 13 Sept | Decision blocker: no alternative deliverable in 14 days |

## 6. Operating the week

- **War room**: Slack/WhatsApp channel + Firebase console + dashboard on a screen. Rota of 2 engineers by 12 h shift, 24/7 from 24 Sept 18:00 to 3 Oct 08:00.
- **Daily cadence**: 09:00 stand-up (MuduPay + DCI), 12:00 moderation backlog check, 18:00 « chiffre du jour » exported and validated by the SGG, 22:00 handover note.
- **Release policy**: hotfixes only, deployed from `hotfix/*` after a staging smoke test; no schema changes; feature flags in `config/app` for anything risky (degraded mode, SafeSearch on/off, kiosk ceiling).
- **Incident playbook**: (0) home page slow or RTDB connection alerts → set `liveCounter = false`; (1) Wall slow → set `degraded = true`; (2) moderation backlog > 2 000 → open batch approve for kiosk submissions, call reserve moderators; (3) abuse wave → lower rate limit, block pHash cluster; (4) Firebase outage → `/ecran` keeps showing the last snapshot, static host unaffected.

## 7. After the week: the durable assets (v2, 2027)

| Asset | Product move | Institutional owner |
|---|---|---|
| Diaspora engagement registry | Optional opt-in at the end of the selfie flow (« Rester informé »), stored separately with its own consent; becomes the MAEIAGE's first voluntary diaspora base | MAEIAGE |
| Reusable ritual | « Campaign » object: frames, dates, targets, counters per edition; the counter grows year over year (An 69 on 2 Oct 2027, Syli qualifiers, Simandou milestones) | DCI |
| National audience | Participants are the launch audience of the national quiz and opportunities platform; shared anonymous identity, one link on the souvenir card | SGG |
| Embed and API | Live-counter widget and read-only API for partner sites and media | MCENI |
| Sovereign platform | Migration of the core to the national Tier III DC, keeping a CDN for the diaspora | SGG + MuduPay |


## 8. Risks watched weekly

| Risk | Signal | Response |
|---|---|---|
| Frames late | Nothing from the DCI by 13 Sept 18:00 | Placeholder frames, config swap later |
| Low adoption in regions | < 20 prefectures lit on 27 Sept | Kiosk push with volunteers in fan zones, prefectural challenge on RTG |
| Diaspora silent | < 20 countries by 28 Sept | MAEIAGE call round, mission-specific posters re-sent, ambassador selfies seeded |
| Moderation backlog | p95 latency > 2 h | Reserve moderators, batch approve for kiosks, SafeSearch auto-approve of clean kiosk items (L2 decision) |
| Abuse / inappropriate content | SafeSearch flag rate > 5 % | Tighten rate limit, blocklist clusters, L2-only publishing for flagged prefectures |
| Peak on 2 Oct | Firestore read errors on `/mur` | Degraded mode, snapshot-only Wall, counter stays live |
| Sovereignty objection | SGG refuses cloud hosting | No 14-day alternative; escalate on 13 Sept, not later |
