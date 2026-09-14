# Fier d'être Guinéen — Mur National · User Stories (development and UI/UX)

Companion to `ARCHITECTURE.md` and `ROADMAP.md`. Story IDs are stable; reference them in commits (`S2.4: …`).
Each story has acceptance criteria (the definition of done), UX notes (what the screen must do and say) and dev notes (where it lives in the code).

## Summary

| Priority | Stories |
|---|---|
| Must | 32 |
| Should | 16 |
| Could | 1 |

| Day | Stories |
|---|---|
| D1 | S1.1, S1.2, S1.3, S1.4, S1.5, S10.1 |
| D2 | S2.1, S2.2, S2.3, S2.4, S2.5, S2.6, S2.7, S9.2, S10.7 |
| D3 | S2.8, S3.1, S3.2, S3.3, S4.1, S6.7 |
| D4 | S3.4, S3.5, S6.1, S6.2, S6.3, S6.4, S6.5, S6.6 |
| D5 | S3.6, S4.2, S4.3, S4.4, S7.1, S10.2 |
| D6 | S4.5, S5.1, S5.2, S5.3, S5.4, S7.2, S8.1, S9.1, S10.6 |
| D7 | S7.3, S8.2, S10.3, S10.4, S10.5 |

## Personas

- **Citoyen (Conakry ou région)** (`citizen`)
- **Guinéen de la diaspora** (`diaspora`)
- **Volontaire de borne (fan zone)** (`volunteer`)
- **Personnalité amorcée par la DCI** (`personality`)
- **Modérateur L1** (`mod1`)
- **Éditeur DCI (L2)** (`editor`)
- **Sélectionneur MAEIAGE** (`maeiage`)
- **Cadre SGG / DCI (tableau de bord)** (`sgg`)
- **Opérateur écran / RTG (MCENI)** (`screen`)
- **Mission diplomatique** (`mission`)
- **Ingénieur d'astreinte MuduPay** (`ops`)

## E1 · Shell, landing and legal

*Goal: A visitor from a QR code understands the campaign in five seconds and reaches the studio in one tap, in French or English, on a 3G connection.*

### S1.1 · Land from a QR code and start in one tap

**Must · D1 · Citoyen (Conakry ou région)**

As a citizen scanning a QR code on a t‑shirt or kakémono, I want to understand in five seconds what this is and start my selfie, so that I participate without reading.

Acceptance criteria

- Landing is interactive in under 3 s on a simulated Fast 3G connection on a Moto G class phone.
- The primary call to action « Prendre mon selfie » and the live counter are visible without scrolling at 360×640.
- A QR link of the form /?src=qr-tshirt records the source and the CTA keeps it through to publication.
- French by default, English one tap away in the header.

UX

- Hero card in primary blue with the gold dot motif from the MuduPay onboarding, white CTA button, secondary outline button « Voir le Mur ».
- Counter card beside the hero on desktop, below it on mobile, gold progress bar toward the target.
- No modal, no cookie banner: the site sets no tracking cookie.

Dev

- web/src/pages/Home.tsx and components/LiveCounter.tsx.
- Analytics event landing_view with src; source stored in sessionStorage and sent with submitContribution.
- Preconnect to Firebase Storage and RTDB hosts in index.html.

### S1.2 · Switch language and keep it

**Must · D1 · Guinéen de la diaspora**

As a Guinean in the diaspora, I want the whole interface in English when I choose it, so that I can share it with my family and colleagues abroad.

Acceptance criteria

- Every visible string, including error messages, share text and the souvenir card labels, comes from the FR/EN dictionaries.
- The choice survives a reload and a PWA install (localStorage, try/catch for private mode).
- The browser language picks the initial language; French wins on any non-English locale.

UX

- Toggle in the header reads « Français | EN » exactly like the onboarding mock, pill shape, muted colour.
- Language never changes layout width; long English or French strings are tested in every button.

Dev

- lib/i18n.tsx and i18n/{fr,en}.json. A typecheck fails when a key exists in fr and not in en.

### S1.3 · Installable PWA with an offline shell

**Must · D1 · Citoyen (Conakry ou région)**

As a citizen with an unstable connection, I want the app to open even when the network drops, so that I can retry my selfie without reloading a blank page.

Acceptance criteria

- Second visit loads the shell from the service worker without network.
- Offline, the home page shows the last counter value seen and a short offline notice; the studio lets me take the photo and waits for network to publish.
- A new deployment updates silently on the next visit (autoUpdate).

UX

- Offline banner in gold tint at the top: « Hors connexion. Votre photo sera envoyée dès le retour du réseau. »
- Install prompt is never forced; a discreet « Ajouter à l'écran d'accueil » appears only after a successful publication.

Dev

- vite-plugin-pwa with navigateFallback and thumbs runtime cache (already in vite.config.ts).
- Online/offline listener in Layout; publish button waits on navigator.onLine.

### S1.4 · Legal notice and personal-data page

**Must · D1 · Citoyen (Conakry ou région)**

As a citizen, I want to know who runs the platform and what happens to my photo, so that I consent knowingly.

Acceptance criteria

- /legal and /privacy exist in FR and EN, linked from the footer and from the consent checkbox.
- The privacy page states: public display on the Wall and screens, no email or phone collected, retention 60 days for originals, contact for removal, minors only through supervised kiosks.
- Removal requests are handled through the moderation console within 24 h.

UX

- Plain reading pages, 68 characters per line, no cards.
- The consent checkbox text links the word « publiquement » to /privacy.

Dev

- Two static routes with markdown-like JSX. Text validated by the DCI and the SGG on D1 to D2.

### S1.5 · Performance budget enforced in CI

**Must · D1 · Ingénieur d'astreinte MuduPay**

As the engineer on call, I want the build to fail when the first load exceeds the budget, so that the 3G promise holds until 2 October.

Acceptance criteria

- Total gzipped JS+CSS on the home route under 350 KB; home route does not load the Selfie, Wall or Admin chunks.
- Lighthouse mobile: PWA installable, performance above 80 on a Fast 3G / Moto G profile.
- Images in the shell are SVG or under 20 KB.

UX

- Fonts: DM Sans with a system fallback; text renders before the font arrives (display=swap).

Dev

- Add a size-limit step to deploy.yml; fail on regression. Lighthouse CI on staging URL on D7.

## E2 · Selfie studio

*Goal: Under 60 seconds and 2 MB from opening the camera to holding a souvenir card with a participant number.*

### S2.1 · Take or choose a photo

**Must · D2 · Citoyen (Conakry ou région)**

As a citizen, I want to take a selfie with my phone camera or pick a photo from my gallery, so that I can participate with the picture I like.

Acceptance criteria

- « Prendre une photo » opens the front camera on Android and iOS; « Choisir une photo » opens the gallery.
- EXIF orientation is honoured; a portrait photo never appears sideways.
- HEIC files from iPhone are accepted through the browser decoder or produce a clear message to choose JPEG.
- A photo under 200 px on its short side is refused with a message.

UX

- Two stacked full-width buttons, primary and outline, as on the onboarding screens; a one-line hint « Seul, en famille ou avec le drapeau ».
- Camera permission refused: explain how to allow it and offer the gallery instead.

Dev

- <input type=file accept=image/* capture=user>; createImageBitmap with imageOrientation from-image (lib/image.ts).
- Feature-detect createImageBitmap; fall back to an <img> decode path for older WebViews.

### S2.2 · See my photo in the official frame and choose among three

**Must · D2 · Citoyen (Conakry ou région)**

As a citizen, I want to see my photo inside the official An 68 frame immediately and switch between the three frames, so that I pick the one I am proud of.

Acceptance criteria

- The composed preview appears within 1 s of choosing the photo on a mid-range phone.
- Switching frame re-renders in under 300 ms without re-decoding the photo.
- Frames A, B, C are the DCI PNGs when present; a tricolour placeholder is drawn otherwise, so the flow never breaks.

UX

- Square preview card with the card radius and shadow; three frame chips below, selected chip in primary tint.
- Pinch or drag to reposition the square crop (Should, D3).

Dev

- lib/image.ts compose(); frame images cached in memory; preview from a 0.7 quality data URL to keep memory low.

### S2.3 · Say where I am from

**Must · D2 · Citoyen (Conakry ou région)**

As a citizen, I want to pick my prefecture, or my country if I live abroad, so that my selfie lights up my place on the map.

Acceptance criteria

- Two segments « En Guinée » and « Dans la diaspora »; exactly one location is required.
- Prefectures are grouped by region and searchable by typing; countries are searchable.
- The last choice is remembered on the device for the next selfie.

UX

- Native select on mobile for reliability; a searchable list on desktop.
- Prefecture names with their accents and the region after a middle dot: « Labé · Labé ».

Dev

- data/prefectures.json (confirm the 44-entry list with the DCI), data/countries.json (complete with the MAEIAGE's 51).

### S2.4 · Consent and publish under 2 MB

**Must · D2 · Citoyen (Conakry ou région)**

As a citizen, I want to publish in one tap after consenting, so that the upload is quick even on 3G.

Acceptance criteria

- Publish is disabled until the consent box is ticked and a location is chosen.
- The upload is a JPEG under 400 KB; total data for the whole flow under 2 MB.
- A progress state shows during upload; a failed upload offers retry without losing the photo.
- Double taps do not create two contributions.

UX

- Gold publish button « Publier ma fierté » to mark the one moment that matters; button shows a spinner and « Envoi en cours… ».
- Errors as inline text under the button, never an alert dialog.

Dev

- uploadBytes to uploads/{uid}/{uuid}.jpg then submitContribution; idempotency by uuid in the path; Storage rule caps at 2 MB and image/jpeg.

### S2.5 · Get my participant number instantly

**Must · D2 · Citoyen (Conakry ou région)**

As a citizen, I want my participant number the moment I publish, so that I have proof I was part of it even before moderation.

Acceptance criteria

- The number appears within 2 s of the upload finishing on staging.
- Numbers are unique and strictly increasing across all devices and kiosks.
- The screen explains the photo appears on the Wall after validation by the DCI.

UX

- Number in 48 px primary blue, tabular digits, with the thin-space thousands separator « 48 213 ».
- Line below in muted text: « Votre photo apparaîtra sur le Mur après validation. »

Dev

- RTDB transaction on seq/participant inside submitContribution (functions/src/lib.ts).

### S2.6 · Share my souvenir card on WhatsApp

**Must · D2 · Citoyen (Conakry ou région)**

As a citizen, I want to share my framed photo with my number on WhatsApp, Facebook or TikTok in one tap, so that my friends join.

Acceptance criteria

- On Android Chrome and iOS Safari the share sheet opens with the JPEG and a text « #FierDetreGuineen · Participant n°48 213 · guineen68.com ».
- Where file sharing is unsupported the card downloads and a tip explains how to share it.
- The card carries the frame, the number band in primary blue with the number in gold, and the site URL.

UX

- Card ratio 1:1.22 so it fits WhatsApp status and Instagram feed.
- After sharing, offer « Nouveau selfie » and « Voir le Mur ».

Dev

- lib/image.ts souvenirCard() and shareOrDownload(); analytics event shared with the channel when known.

### S2.7 · Understand every error in one line

**Must · D2 · Citoyen (Conakry ou région)**

As a citizen, I want a clear message when something goes wrong, so that I know whether to retry, wait, or give up.

Acceptance criteria

- Distinct messages for: offline, upload failed, rate limit reached, device blocked, camera refused, photo too small.
- Rate limit message tells me when I can retry (« dans une heure »).
- No technical codes reach the screen.

UX

- Error text in the danger colour under the control that failed, with the retry button right there.

Dev

- Map HttpsError codes to i18n keys in Selfie.tsx: resource-exhausted, permission-denied, not-found, unavailable.

### S2.8 · Go back without losing my photo

**Should · D3 · Citoyen (Conakry ou région)**

As a citizen, I want to go back a step to change the frame or my prefecture, so that I don't have to retake the photo.

Acceptance criteria

- Back arrow on steps 2 and 3 keeps the photo and choices.
- Browser back button behaves the same and never exits the studio unexpectedly.
- « Nouveau selfie » on step 4 resets everything.

UX

- Progress bar with four segments at the top; the current step title as H1.

Dev

- Keep step state in the component; sync step to history.state so back works.

## E3 · The National Wall

*Goal: Every approved contribution is findable by place, shareable, and reportable, and the Wall never shows a blank page.*

### S3.1 · Browse the Wall newest first

**Must · D3 · Citoyen (Conakry ou région)**

As a visitor, I want to scroll through the latest validated selfies, so that I feel the Nation participating live.

Acceptance criteria

- Approved contributions only, newest first, 30 per page, « Voir plus » or infinite scroll.
- Thumbnails are the 400 px, ~50 KB renditions, lazy-loaded.
- A new approval appears on the next page load; no live listener on the public Wall.

UX

- Square grid: 2 columns at phone width, up to 5 on desktop, 8 px gaps, 12 px radius.
- Participant number as a small white pill bottom-left on each tile.

Dev

- pages/Wall.tsx: Firestore query on status + createdAt with startAfter cursor; index in firestore.indexes.json.

### S3.2 · Filter by region, prefecture or country and share the filtered view

**Must · D3 · Citoyen (Conakry ou région)**

As a citizen from Labé, I want to see only Labé's selfies and send that link to my family, so that we watch our prefecture fill up.

Acceptance criteria

- Filters for region, prefecture and diaspora country; one active at a time.
- The URL reflects the filter (/mur?prefecture=LAB) and restores it on load.
- Empty filtered result shows « Soyez le premier de Labé sur le Mur » with the studio CTA.

UX

- Filter selects aligned right of the title on desktop, stacked under it on mobile.
- Title changes to « Le Mur · Labé » when filtered.

Dev

- useSearchParams for the filter; composite indexes on status+prefecture, status+region, status+country.

### S3.3 · Open a selfie in a lightbox and share it

**Should · D3 · Citoyen (Conakry ou région)**

As a visitor, I want to open a selfie full size and share its link, so that I can show a friend's photo.

Acceptance criteria

- Tap a tile opens the 1080 px rendition with number and place; swipe or arrows to move; close with tap outside or Escape.
- Share copies /mur?c={id} which opens the same lightbox.
- Keyboard and screen-reader accessible (dialog role, focus trap).

UX

- Dark overlay, image centred, caption « Participant n°48 213 · Labé », share and report actions in the caption row.

Dev

- Lightbox component; deep link resolved by a single getDoc on load.

### S3.4 · Personalities wall and featured tiles

**Must · D4 · Personnalité amorcée par la DCI**

As the DCI, I want the Government, artists, Ambassadors and the Syli to appear in a dedicated section and highlighted on the main Wall, so that the Wall is alive on 22 September and pulls citizens in.

Acceptance criteria

- A « Personnalités » tab on the Wall lists contributions with personality=true.
- Featured tiles show a gold ring on the main grid and are pinned in the first row of the first page.
- Only editors can set personality or featured.

UX

- Tab row under the title: « Toute la Nation · Personnalités ».
- Gold ring 2 px, never a badge that hides the face.

Dev

- Query status+featured index; personality flag set through moderate action feature with a personality option.

### S3.5 · Report a selfie

**Must · D4 · Citoyen (Conakry ou région)**

As a visitor, I want to report a photo that should not be there, so that the DCI can review it.

Acceptance criteria

- One report per device per contribution; a second tap shows « Déjà signalé ».
- Three reports pull an approved item back to the L2 queue and off the Wall automatically.
- Reporting never opens a browser dialog.

UX

- Small « Signaler » text button on the tile, confirmation toast « Merci, la DCI va vérifier ».

Dev

- report callable, reports/{id}_{uid} doc, threshold 3 (functions/src/report.ts).

### S3.6 · Never a blank Wall: pre-launch and degraded states

**Must · D5 · Citoyen (Conakry ou région)**

As a visitor before the launch or during a peak, I want the Wall to show something meaningful, so that the platform never looks broken.

Acceptance criteria

- Before launchAt in config, the Wall shows the countdown and the personalities already seeded.
- With degraded=true, the Wall renders the 120 items of the snapshot and a line « Mis à jour il y a 2 min », with filters disabled.
- Firestore errors fall back to the snapshot automatically.

UX

- Countdown card in primary blue with days, hours, minutes in tabular digits.

Dev

- config/app listener; snapshot/latest.json fetch with cache no-store; try/catch around the Firestore query.

## E4 · Counter, map and giant screen

*Goal: One live number, everywhere: home page, map, the écran du 8‑Novembre and the RTG overlay.*

### S4.1 · Live counter that moves

**Must · D3 · Citoyen (Conakry ou région)**

As a visitor, I want to see the national number climb in real time, so that I feel the momentum.

Acceptance criteria

- The number updates within 2 s of an approval, without reload, on home and screen.
- Count-up animation between values; respects prefers-reduced-motion.
- The progress bar shows the share of the 500 000 target; the label shows the communication threshold at 50 000 as a tick.

UX

- 48 px on home, viewport-scaled on the screen feed; tabular digits so width never jumps.

Dev

- onValue on counters/national (LiveCounter.tsx); requestAnimationFrame tween.

### S4.2 · The Map of the Nation

**Should · D5 · Citoyen (Conakry ou région)**

As a citizen, I want to see the map of Guinea filling up prefecture by prefecture and the world map lighting up country by country, so that I see my place in the Nation.

Acceptance criteria

- Guinea map with the prefectures shaded by count against the per-prefecture target; tap or hover shows name and count.
- World map with a dot per country with at least one contribution; missions with zero stay outlined.
- Both maps read from the snapshot and refresh every 2 min; total inline SVG under 150 KB.

UX

- Sequential blue scale for prefectures, gold dots for the diaspora, legend with real counts.
- Two counters above the maps: « 31 / 44 préfectures » and « 27 / 51 pays ».

Dev

- geoBoundaries ADM2 simplified to TopoJSON; Natural Earth 110m; pages/Map.tsx replaces the lists.

### S4.3 · Screen feed for the écran du 8‑Novembre

**Must · D5 · Opérateur écran / RTG (MCENI)**

As the MCENI operator, I want a full-screen page I can leave running for eight days on the giant screen, so that the number and the faces are always on.

Acceptance criteria

- /ecran fills 1920×1080 and 3840×2160 with no chrome, no cursor, no scrollbars.
- Rotates 24 recent approved thumbnails every 20 s from the snapshot; keeps the last set if the network drops.
- Runs one hour in OBS browser source and in Chrome kiosk mode without a reload or a memory leak.

UX

- Primary blue ground, counter in white at viewport scale, tricolour strip, grid of 8 columns.
- Optional message line from config (« Merci Labé ! ») editable by the DCI.

Dev

- pages/Screen.tsx; snapshot fetch every 120 s; images preloaded before swap.

### S4.4 · RTG overlay variant

**Should · D5 · Opérateur écran / RTG (MCENI)**

As the RTG director, I want a transparent overlay with just the counter, so that I can key it over the live broadcast.

Acceptance criteria

- /ecran?overlay=1 renders a transparent background with the counter and label only, safe-area margins of 5 %.
- Size and position configurable by query (corner=tr, scale=0.8).

UX

- White digits with a subtle shadow for legibility on any footage.

Dev

- Same component, overlay flag; tested in OBS with a chroma-free browser source.

### S4.5 · Embeddable counter widget for the 50 partner sites

**Should · D6 · Cadre SGG / DCI (tableau de bord)**

As the DCI, I want partner sites carrying our banner to show the live counter, so that the whole web relays the number.

Acceptance criteria

- One script tag or iframe renders the counter with a link to the site; under 20 KB.
- Works on HTTP and HTTPS pages; no cookies set on the host.

UX

- Compact horizontal badge: flag strip, number, « Fier d'être Guinéen ».

Dev

- /widget route with a minimal bundle reading the snapshot JSON only (no Firebase SDK).

## E5 · Diaspora videos (MAEIAGE)

*Goal: Missions collect 60 to 90 second videos through a tokenised link, and the selection lands in the film editors' Drive.*

### S5.1 · Open my mission's video link

**Should · D6 · Guinéen de la diaspora**

As a Guinean invited by my embassy, I want the link to recognise my mission, so that my video counts for my country.

Acceptance criteria

- /video?mission=FR-PARIS&t=… shows the mission name and country; a wrong or expired token shows a clear message with the mission's contact.
- The page works on mobile and desktop.

UX

- Title « Je suis fier d'être Guinéen », the mission name as a chip, and the three rules: 60 to 90 s, horizontal, say your name and city.

Dev

- Public read of missions/{code} minus the token; token verified by the submitVideo callable.

### S5.2 · Upload a 60 to 90 second video

**Should · D6 · Guinéen de la diaspora**

As a Guinean abroad, I want to upload my video from my phone with a visible progress bar, so that I know it arrived.

Acceptance criteria

- Duration read from the file before upload; under 55 s or over 95 s is refused with the measured duration shown.
- Size cap 150 MB; resumable upload with pause and resume, progress in percent.
- Optional first name and city; consent to use in the institutional film is mandatory.

UX

- Big drop zone or « Choisir ma vidéo », then a progress card; on success a thank-you with the mission name.

Dev

- uploadBytesResumable to videos/{mission}/{uuid}.mp4; submitVideo creates a contributions doc with type=video.

### S5.3 · Select videos for the film

**Should · D6 · Sélectionneur MAEIAGE**

As a MAEIAGE selector, I want to watch, tag and mark the videos I keep, so that the editors get the rushes on time.

Acceptance criteria

- Queue by mission and by date; inline player; tags for language, theme, technical quality; « Retenue » toggle; notes.
- Counts per mission and overall toward the 500 target.

UX

- Two-column layout: list left, player and form right; keyboard J/K to move.

Dev

- /admin/videos; selectVideo callable requires the maeiage role.

### S5.4 · Export selected rushes to Google Drive

**Should · D6 · Sélectionneur MAEIAGE**

As a MAEIAGE selector, I want one button that copies the selected videos to the editors' shared Drive folder with an index sheet, so that no one downloads files one by one.

Acceptance criteria

- Files named {mission}_{participantNumber}_{firstName}.mp4 in the target folder; index sheet with mission, name, city, duration, tags, notes.
- Re-running exports only new selections.

UX

- Progress and a final link to the folder.

Dev

- exportSelected scheduled and callable; Drive API with a service account added to the folder.

## E6 · Moderation

*Goal: Nothing reaches the Wall without a human decision, and a moderator handles 600 items an hour without fatigue.*

### S6.1 · Sign in with my staff account and see only what my role allows

**Must · D4 · Modérateur L1**

As a moderator, I want to sign in with Google and land on my queue, so that I start working in ten seconds.

Acceptance criteria

- Google sign-in; roles come from custom claims: moderator, editor, maeiage, admin, kiosk.
- No role: a clear « Ce compte n'a pas de rôle » screen with whom to contact.
- Session persists on the laptop; sign-out available.

UX

- Admin uses the same tokens with a denser layout: 14 px text, 12 px card radius.

Dev

- pages/Admin.tsx; Firestore and Storage rules check claims; a scripts/set-role.mjs sets claims.

### S6.2 · Clear the L1 queue at 600 an hour

**Must · D4 · Modérateur L1**

As an L1 moderator, I want to approve or reject with one key and move to the next item automatically, so that the backlog stays under fifteen minutes.

Acceptance criteria

- Queue oldest first, large preview, keyboard A approve, R reject, U undo within 5 s, space to skip.
- An item opened by one moderator is soft-locked for 60 s for the others.
- Remaining count and my hourly rate are visible; new items appear without reload.
- Approve is refused with a clear message when processing is not finished (no thumbnail yet).

UX

- One item at a time in focus mode, the next three as small previews; kiosk origin and prefecture as chips.
- Undo toast with a countdown.

Dev

- onSnapshot on status=pending; moderate callable; lock field lockedBy/lockedAt on the doc (rules allow staff write of those two fields).

### S6.3 · Reject with a reason and optionally block the device

**Must · D4 · Modérateur L1**

As a moderator, I want to pick a reject reason and block a device that spams, so that abuse stops at the source.

Acceptance criteria

- Reasons: inappropriate, not a person, duplicate, minor unsupervised, other.
- « Bloquer l'appareil » adds blocklist/uid:{uid}; blocked devices get a clear message in the studio.
- Rejected originals are deleted at retention, not immediately, for audit.

UX

- Reason picker as a row of chips; block as a checkbox, off by default.

Dev

- moderate action reject with reason and block (functions/src/moderate.ts).

### S6.4 · L2 review queue with the evidence side by side

**Must · D4 · Éditeur DCI (L2)**

As a DCI editor, I want to see why an item was flagged, with the duplicate or the SafeSearch scores next to it, so that I decide in seconds.

Acceptance criteria

- Review queue shows the reason: SafeSearch category and likelihood, the duplicate side by side, the report count.
- Actions: approve, reject, feature, personality, block.
- Only editors and admins see this queue and these actions.

UX

- Two-up layout for duplicates with the older one labelled « Original ».

Dev

- status=review query; duplicateOf resolved with a getDoc; onPhotoUploaded routes flags here.

### S6.5 · Find a participant by number

**Should · D4 · Éditeur DCI (L2)**

As an editor answering a citizen at a kiosk or on the hotline, I want to find a contribution by its participant number, so that I can tell them its status.

Acceptance criteria

- Search box accepts a number and opens the item with status, place, time and moderation history.

UX

- Search field in the admin header.

Dev

- Firestore query on participantNumber (single-field index).

### S6.6 · Blocklist management and audit trail

**Should · D4 · Éditeur DCI (L2)**

As a DCI editor, I want to see and lift blocks and to see who decided what, so that decisions are accountable.

Acceptance criteria

- Blocklist page with reason, date, author, unblock action.
- Every moderation action stores moderatedBy and moderatedAt; a per-item history is visible.

UX

- Simple table, newest first.

Dev

- blocklist collection; audit fields on contributions; history subcollection (Could).

### S6.7 · Automatic routing rules

**Must · D3 · Ingénieur d'astreinte MuduPay**

As the platform, I want obvious cases routed automatically, so that humans spend their time on judgement calls.

Acceptance criteria

- SafeSearch LIKELY or VERY_LIKELY on adult or violence → review.
- Perceptual duplicate within the last 48 h → review with duplicateOf set.
- Kiosk submissions with a clean SafeSearch → L1 fast lane, sorted first.
- Nothing is auto-approved unless the editor enables the kiosk auto-approve flag in config (off by default).

UX

- Chips on each item tell the moderator why it is where it is.

Dev

- onPhotoUploaded: Vision SafeSearch call, Hamming distance on phash over a 48 h window (functions/src/onPhotoUploaded.ts).

## E7 · Dashboard and exports

*Goal: The SGG has a validated daily figure at 18:00 and a certified national figure on 2 October.*

### S7.1 · Real-time dashboard

**Must · D5 · Cadre SGG / DCI (tableau de bord)**

As a cadre at the SGG or the DCI, I want one page with the national total, the hourly curve, the progress of the 44 prefectures and the 51 countries, and the moderation backlog, so that I can brief the hierarchy at any time.

Acceptance criteria

- Totals for approved, pending, review, rejected; hourly approvals for the last 48 h; per-region progress bars against targets; per-country table; median and p95 moderation latency.
- Refreshes every minute; readable on a phone.

UX

- Stat tiles first, then charts; semantic colours for backlog (green, gold, red) separate from the brand accent.

Dev

- /admin/dashboard reads the snapshot plus aggregate docs written by the snapshot function (stats/hourly).

### S7.2 · Chiffre du jour at 18:00 in a Google Sheet

**Must · D6 · Cadre SGG / DCI (tableau de bord)**

As the SGG, I want the daily figure appended to a shared Google Sheet at 18:00 and on demand, so that the press release uses one validated number.

Acceptance criteria

- Row per day: date, national total, new today, prefectures lit, countries lit, videos selected, backlog.
- « Exporter maintenant » button in the dashboard for editors and admins.
- CSV copy saved under exports/ with the same content.

UX

- Toast with a link to the sheet after export.

Dev

- exportDaily scheduled 18:00 Africa/Conakry; Sheets API with the service account as editor of the sheet.

### S7.3 · Certified national figure for 2 October

**Must · D7 · Cadre SGG / DCI (tableau de bord)**

As the SGG, I want a certified export of the final figure with its hash, so that the number announced by the Head of State is auditable.

Acceptance criteria

- Export at a chosen timestamp: total approved, breakdown by prefecture and country, CSV of participant numbers, SHA-256 of the CSV recorded in the sheet and in a PDF summary.
- Rehearsed on 1 October.

UX

- One-page PDF with the tricolour strip, the figure, the timestamp and the hash.

Dev

- exportCertified callable (admin); PDF generated in the function.

## E8 · Kiosk mode

*Goal: A volunteer with a tablet publishes for citizens without a smartphone, minors included, at fan-zone pace.*

### S8.1 · Kiosk mode on a tablet

**Should · D6 · Volontaire de borne (fan zone)**

As a volunteer at a fan zone, I want a tablet mode that lets me publish for one citizen after another, so that people without a smartphone are on the Wall too.

Acceptance criteria

- Tablet signed in with a kiosk account; /selfie?kiosk=1 raises the rate limit to 20 an hour and shows the supervised-minor checkbox.
- After publication the number shows in 96 px for 15 s, then the studio resets automatically for the next person.
- Touch targets at least 56 px; works in landscape.

UX

- Distinct kiosk header « Borne · Fan zone Kaloum » so photos are traceable to a site.
- No share step: the citizen notes the number or takes a photo of the screen.

Dev

- kiosk custom claim; kiosk site code in the query stored on the contribution.

### S8.2 · Queue uploads when the network drops

**Could · D7 · Volontaire de borne (fan zone)**

As a volunteer in a crowded fan zone where 3G collapses, I want the tablet to keep taking photos and send them when the network is back, so that the queue of citizens keeps moving.

Acceptance criteria

- Up to 50 photos queued in IndexedDB with their metadata; uploaded in order when online; numbers assigned at upload time and displayed on a recap list.

UX

- Badge with the number of pending uploads on the kiosk header.

Dev

- Background sync where available; otherwise a loop on the online event.

## E9 · Missions and QR entry points

*Goal: Each of the 51 missions has its own link and poster, and every QR on DCI material deep-links into the studio.*

### S9.1 · Mission links, tokens and QR posters

**Should · D6 · Mission diplomatique**

As an embassy, I want my own link and a ready-to-print QR poster with my country's name, so that I can animate the Village Guinée on 2 October.

Acceptance criteria

- scripts/seed-missions.mjs creates the 51 mission docs and prints the links; scripts/qr-posters.mjs renders an A4 PDF per mission in FR and EN.
- Poster carries the tricolour, the campaign title, the QR, the short URL and the mission name.

UX

- Poster follows the DCI's An 68 visual charter; QR at least 6 cm.

Dev

- qrcode + pdf-lib in a Node script; output to exports/posters/.

### S9.2 · Every QR code deep-links with its source

**Must · D2 · Citoyen (Conakry ou région)**

As the DCI, I want each printed material to carry a distinct link, so that we learn which supports bring participants.

Acceptance criteria

- Short links /q/tshirt, /q/kakemono, /q/ecran, /q/{mission} redirect to /selfie?src=…; source stored on the contribution and shown in the dashboard.

UX

- No visible difference for the citizen.

Dev

- Client-side redirect route; src kept in sessionStorage; dashboard breakdown by src.

## E10 · Platform, abuse and operations

*Goal: The platform survives the peaks of 25 September and 2 October, resists abuse, and keeps its promises on personal data.*

### S10.1 · Rate limiting and App Check

**Must · D1 · Ingénieur d'astreinte MuduPay**

As the engineer on call, I want scripted abuse blocked before it costs money or floods moderation, so that the queue stays human.

Acceptance criteria

- App Check enforced on Storage, Firestore and callables; requests without a token are rejected.
- 5 submissions per device per hour, 20 for kiosk accounts; the limit is enforced server-side.
- Blocked uids are refused at submit.

UX

- Rate limit message tells the citizen when to retry.

Dev

- functions/src/lib.ts checkRate on RTDB rate/{uid}/{hour}; enforceAppCheck in setGlobalOptions.

### S10.2 · Snapshot and degraded mode

**Must · D5 · Ingénieur d'astreinte MuduPay**

As the engineer on call, I want one switch that makes the Wall and the screen serve a static snapshot, so that a peak on 2 October never takes the counter down.

Acceptance criteria

- snapshot/latest.json written every 2 min with counters, 120 recent items and per-place totals, Cache-Control 60 s.
- config/app.degraded=true makes the Wall and Map read only the snapshot; the counter stays live over RTDB.
- Tested during the D7 load test.

UX

- « Mis à jour il y a N min » line whenever a page renders from the snapshot.

Dev

- functions/src/snapshot.ts (done); config listener in Wall and Map.

### S10.3 · Retention and removal

**Must · D7 · Ingénieur d'astreinte MuduPay**

As the platform, I want originals deleted 60 days after the week and any citizen's photo removable on request, so that the privacy policy is true.

Acceptance criteria

- Scheduled job deletes uploads/ originals older than 60 days and rejected items' files after 7 days.
- A « Retirer » action in the admin removes public files, thumbs and counters for one contribution and logs the reason.

UX

- Removal confirmation inline, no browser dialog.

Dev

- retention scheduled function; moderate action remove.

### S10.4 · Nightly sovereign copy

**Should · D7 · Ingénieur d'astreinte MuduPay**

As the SGG, I want a complete copy of the data on a server in Guinea every night, so that the State holds its own record.

Acceptance criteria

- Firestore export and Storage sync to a bucket or server designated by the SGG, nightly at 03:00; a check script verifies counts match.
- Documented restore procedure.

UX

- Line in the dashboard: « Copie souveraine : dernière réussie le … ».

Dev

- gcloud firestore export + gsutil rsync from a scheduled job; credentials held by MuduPay ops.

### S10.5 · Load test before the freeze

**Must · D7 · Ingénieur d'astreinte MuduPay**

As the engineer on call, I want proof that the platform holds 50 submissions a second and 2 000 concurrent Wall viewers, so that I sleep on 24 September.

Acceptance criteria

- k6 script for submit (upload + callable) and Wall reads; run on staging; p95 submit under 3 s, no function errors, RTDB sequence has no gaps.
- Results recorded in docs/LOADTEST.md.

UX

- None.

Dev

- scripts/loadtest.js; App Check debug token for the test client.

### S10.6 · Alerts to the war room

**Should · D6 · Ingénieur d'astreinte MuduPay**

As the engineer on call, I want to be alerted before the DCI notices, so that incidents are handled in minutes.

Acceptance criteria

- Alerts on: function error rate above 2 %, pending backlog above 2 000, moderation p95 above 2 h, snapshot older than 10 min, budget above 500 USD.
- Alerts land in the war-room channel.

UX

- None.

Dev

- Cloud Monitoring alert policies plus a small scheduled function for backlog and latency metrics.

### S10.7 · Privacy-safe analytics

**Should · D2 · Cadre SGG / DCI (tableau de bord)**

As the DCI, I want to know how many people start and finish the studio and which support brought them, so that we adjust the communication during the week.

Acceptance criteria

- Events: landing_view, studio_start, photo_captured, published, shared, wall_view; no personal identifiers, no advertising ID.
- Funnel visible in the dashboard: starts, published, completion rate.

UX

- None.

Dev

- Firebase Analytics with anonymized IP or a simple counters/events RTDB increment to avoid a consent banner.

## UI/UX foundations

### Tokens (from the MuduPay onboarding screens)

| Token | Value | Use |
|---|---|---|
| Primary | `#3273AC` | Buttons, hero, counter digits, links |
| Primary strong | `#275E90` | Hover states |
| Primary soft | `#4E8FBD` | Illustration shapes, decorative circles |
| Primary tint | `#EAF1F8` | Selected chips, progress tracks |
| Gold | `#EBAB58` | The one accent: publish button, progress fill, number on the card, featured ring |
| Ink | `#121826` | Headings and body text |
| Muted | `#5F6B7A` | Secondary text, labels |
| Background | `#F5F7FA` | Page ground |
| Surface | `#FFFFFF` | Cards |
| Rule | `#E3E8EF` | Borders, dividers |
| Tricolour | `#CE1126 · #FCD116 · #009460` | Flag strip, frames, maps and data only |

### Type

- DM Sans for everything, weights 400, 500, 700.
- Scale: 12 labels · 14 admin body · 15 buttons · 17 body · 24 page titles · 32 hero mobile · 48 counter home · viewport-scaled on the screen feed.
- Tabular digits on every number that changes.

### Shape and touch

- Buttons 52 px tall, 12 px radius, full width on mobile, stacked primary then outline as in the onboarding.
- Cards 20 px radius with a soft shadow; inputs 48 px, 12 px radius.
- Touch targets 44 px minimum, 56 px in kiosk mode.

### Screen states

- Every screen designs five states: loading, empty, error, offline, success.
- Loading uses skeleton tiles on the Wall and a spinner inside the button in the studio; never a full-page spinner.
- Errors are one sentence under the control, with the fix; no browser dialogs anywhere in the product.

### Copy

- French first, vouvoiement, institutional but warm: « Publier ma fierté », « Vous êtes le participant n° ».
- Buttons name the action; toasts confirm it in the past tense.
- English is a translation of meaning, not of words; the DCI validates French on D2.

### Accessibility

- Contrast 4.5:1 for text on every ground (white on primary passes; gold on white is used only for large digits and decorative fills).
- Visible focus ring in primary at 30 % on every control; lightbox is a dialog with a focus trap.
- Respect prefers-reduced-motion: no count-up, no slide-ins.
- All images on the Wall have empty alt (decorative) and the participant number as text.

### Performance

- Home under 350 KB gzipped; each route its own chunk; thumbs 50 KB; frames under 150 KB each.
- Studio works with JavaScript only; no server round-trip before the upload.
- Screen feed preloads images before swapping so the giant screen never flashes.
