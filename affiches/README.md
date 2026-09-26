# Affiches murales — Semaine de l'Indépendance · An 68

> `photos/` (sources restaurées, ~320 Mo) et `sortie/` (rendus) ne sont pas versionnés : `nettoyer.py`
> reconstruit `photos/` depuis ~/Downloads ; les portraits de `photos/mur/` sont extraits de VisuEl Le Mur.pdf.

Vingt visuels A1 (594 × 841 mm) pour les murs du site des festivités, demandés par la
Présidence et le SGG le 24 septembre 2026, dans la continuité des affiches de `restauration/`.
Trois actes, trois fonds, une identité : crème d'archive (Héritage), vert Présidence
(Renouveau), nuit (Avenir) ; Baskerville / Optima, or, armoiries, tricolore, logo 68.

## Les vingt affiches

| N° | Fichier | Acte |
|---|---|---|
| 01 | `01-le-non` — le référendum du 28 septembre 1958 | Héritage |
| 02 | `02-les-resistants` — Samory, Alpha Yaya, Bocar Biro, Dinah Salifou, Togba Pivi | Héritage |
| 03 | `03-les-premiers` — huit « premières » et « premiers » guinéens | Héritage |
| 04 | `04-le-phare-panafricain` — Conakry, capitale des libertés | Héritage |
| 05 | `05-les-geants` — culture et sport reconnus dans le monde | Héritage |
| 06 | `06-la-refondation` — du CNRD à l'ordre constitutionnel rétabli | Renouveau |
| 07 | `07-simandou-debloque` — 11 novembre 2025, 11 h 11 | Renouveau |
| 08 | `08-le-pays-en-chantier` — routes, Koloma, Donka | Renouveau |
| 09 | `09-simandou-2040` — carte, corridor, cinq piliers | Avenir |
| 10 | `10-guinee-2076` — la Guinée écrite par ceux qui ont 18 ans | Avenir |
| 11 | `11-l-hymne-liberte` — les paroles de « Liberté », Fodéba Keïta, les couleurs du drapeau | Héritage |
| 12 | `12-les-44-prefectures` — carte nommée des 44 préfectures et 10 régions | Renouveau |
| 13 | `13-la-guinee-du-monde` — planisphère de la diaspora, 51 missions, quatre hubs | Avenir |
| 14 | `14-fiere-d-etre-guineenne` — cinq pionnières, frise 1953 → 1972, journée du 29 septembre | Renouveau |
| 15 | `15-le-syli-national` — Hafia et le Syli, palmarès, match du 1er octobre | Héritage |
| 16 | `16-le-sous-sol` — bauxite, or, fer, Nimba Mining Company | Avenir |
| 17 | `17-quatre-guinees-un-grenier` — carte des quatre régions naturelles et leurs productions | Avenir |
| 18 | `18-notre-jeunesse` — le programme officiel de la Semaine, jour par jour | Renouveau |
| 19 | `19-la-frise-de-la-republique` — 1958 → 2026 en vingt dates | Héritage |
| 20 | `20-ajoute-ton-visage` — QR guineen68.com, les quatre étapes, 500 000 visages | Renouveau |

Les affiches 11 à 20 sont dans `serie2.py` (mêmes briques : `shell`, `title`, `uri`), avec deux
cartes supplémentaires : `guinea_labelled()` (préfectures nommées, couleur par région) et
`world_map()` (planisphère de `web/src/data/geo/world.json`, arcs vers les pays de
`countries.json`). Le QR est `web/public/qr-selfie.svg`.

## Deux formats

- **A1** (594 × 841 mm) → `sortie/NN-….pdf` (texte vectoriel) + `.png` (aperçu écran).
- **Roll-up 100 × 200 cm** → `sortie/roll-up-100x200/NN-….pdf` + `.png` : même composition,
  agrandie ×1,68 à la largeur de la bâche ; les blocs se répartissent sur la hauteur, le pied
  (armoiries, logo 68) reste en bas. C'est le format demandé le 25 septembre 2026 pour les
  bâches enroulables du site.

## Produire

```sh
cd affiches
../restauration/.venv/bin/python nettoyer.py   # restaure les photos sources (~/Downloads → photos/)
python3 build.py                               # les vingt affiches, A1 + roll-up
python3 build.py 07 09 --rollup                # une sélection, un seul format (--a1 / --rollup)
```

Il faut Google Chrome (rendu headless), `pdftoppm` (poppler, pour l'aperçu du roll-up), les
polices macOS Baskerville et Optima, et **Real-ESRGAN** pour l'agrandissement des photos :
télécharger `realesrgan-ncnn-vulkan-20220424-macos.zip` sur
github.com/xinntao/Real-ESRGAN/releases et le décompresser dans `tools/realesrgan/`
(dossier ignoré par git). Sans lui, `nettoyer.py` retombe sur un agrandissement Lanczos.

## Comment c'est fait

- `nettoyer.py` — trois traitements : `nb` (archives tramées : gris neutre, niveaux,
  débruitage fort et léger flou *avant* le réseau, lissage après), `couleur` (photos
  récentes : débruitage léger, contraste local), `detoure` (portraits PNG, alpha conservé).
  L'agrandissement est fait ×4 par Real-ESRGAN (réseau neuronal) puis ramené à 3 000 –
  4 200 px de large, soit ~200 dpi sur une bâche de 1 m. Les portraits en 300 px restent
  limités : le réseau « peint » les visages ; un original HD reste préférable. Les sources sont les photos des cartes
  « 68 Fiertés » et les portraits détourés du dossier `~/Downloads/portraits/`.
- `build.py` — une fonction par affiche (`a01`…`a10`) qui écrit le HTML dans `html/`,
  puis Chrome produit le PDF et le PNG. `shell()` pose l'en-tête, le pied et le cadre
  communs ; `zoom=` agrandit le contenu d'une affiche pour remplir la feuille.
- La carte de l'affiche 09 vient de `web/src/data/geo/guinea.json` (44 préfectures) ;
  le corridor ferroviaire est un tracé schématique, indiqué comme tel.

## Faits et sources

Les textes reprennent les cartes « 68 Fiertés » validées par la DCI et le bilan officiel :
résultats du référendum (1 136 324 / 56 981), 650 km, 20 Mds USD, 2 252 km de routes,
Donka 31 services / 15 blocs, notation B+, cinq piliers de Simandou 2040 (122 mégaprojets,
36 réformes, 14 secteurs). Les dates de la refondation sont au mois (septembre 2025,
décembre 2025) sauf celles publiées au jour. À faire relire par la DCI avant impression,
comme toute affiche de la série.

## Limites

La qualité des photos reste bornée par les sources (300 à 2 400 px). Real-ESRGAN rend les
photos récentes nettes à 100 % ; sur les archives tramées le résultat est lisse plutôt que
piqué. Le portrait officiel du Président vient du carton d'invitation (677 × 984 px), la
meilleure version disponible localement. Un fichier haute définition (Archives nationales,
DCI) se remplace dans `photos/` sans toucher aux affiches : relancer `build.py`.

## Le Mur de la Mémoire Nationale — bâche 6 × 3 m

`mur.py` refait à l'identique le visuel des Chefs d'État (VisuEl Le Mur.pdf) pour une bâche
de 6 × 3 m : mêmes polices (`assets/fonts/`, Cormorant Garamond, Barlow, Questrial), mêmes
textes, portrait du Président net (carton d'invitation + Real-ESRGAN), les cinq portraits et
les logos extraits du PDF d'origine dans `photos/mur/`. Sortie dans `sortie/mur-memoire-6x3/` :
le PDF à l'**échelle 1/2** (3 000 × 1 500 mm, texte vectoriel — à imprimer à 200 %, la limite
des lecteurs PDF étant 5 080 mm) et un PNG plein format à 50 dpi (11 811 × 5 906 px).

`mur2.py` scinde le même visuel en deux bâches (demande du Ministre SGG, 26 sept. 2026), même
charte : **2,20 × 1,50 m** Sékou Touré au centre, Lansana Conté à sa droite (gauche du
spectateur), Moussa Dadis Camara à sa gauche ; **1,80 × 1,50 m** Mamadi Doumbouya au centre,
Sékouba Konaté à sa droite, Alpha Condé à sa gauche. « À sa droite » est lu du point de vue du
personnage (protocole), ce qui donne l'ordre chronologique de gauche à droite. PDF à
l'échelle 1 + PNG 100 dpi dans `sortie/mur-memoire-diptyque/`.

## Les Compagnons de l'Indépendance (bannière 20:9)

`compagnons.py` reconstruit le visuel « Guinea's Independence Visual Compagnons 1 » du
12 septembre (3000 × 1350 pt, Bebas Neue / Barlow Condensed / Barlow / Questrial) avec les
corrections du 25 septembre 2026 : Ousmane Baldé (père de la monnaie guinéenne) et Barry III
corrigés, cinq compagnons ajoutés depuis le dossier photographique du PDG reçu par WhatsApp
(`~/Downloads/More_Companon`) : Ismaël Touré, Mamady Keïta, Amara Touré, Alpha Oumar Barry,
Damantang Camara. Grille 4 × 7, les deux notices longues sur deux colonnes.

```sh
../restauration/.venv/bin/python compagnons.py photos   # portraits → photos/compagnons/ (Real-ESRGAN, ~10 min)
python3 compagnons.py                                   # sortie/compagnons/ : PDF (12 Mo) + PNG 8000 × 3600
python3 compagnons.py --nuit                            # variante B « Nuit et or »
```

Portraits : les 18 détourés du 22 septembre (`~/Downloads/portraits/compagnons`), trois
extraits du PDF d'origine (Barry Diawadou, Habib Tall, Loffo Camara), cinq cadrés dans les
pages WhatsApp (coordonnées dans `PORTRAITS`). Faits à faire valider par la DCI : années de
décès de Ismaël Touré, Damantang Camara (1985) et Ousmane Baldé (1971).
