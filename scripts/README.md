# Operational scripts

Run everything from the repository root with Node 20 or newer.

## Prerequisites

- `gcloud auth application-default login` once on the machine (Application Default Credentials). The scripts call the Firestore REST API with that token; no service-account key is created, which the org policy forbids anyway.
- For the posters: `cd scripts && npm install` (installs `qrcode` and `pdfkit` into `scripts/node_modules`, gitignored).

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
