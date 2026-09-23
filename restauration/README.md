# Restauration de portraits de presse — affiches officielles

Outil créé pour la Présidence et le SGG à l'occasion de la 68ᵉ Fête Nationale : à partir
d'une **photo d'une page de journal** (Horoya, etc.), il découpe chaque portrait, le nettoie
(papier jauni, trame, contraste), retape les noms et fonctions, et compose une **affiche A1
imprimable** dans l'identité de la Présidence (vert #0F3B2E, or, armoiries, tricolore, logo).

Les quatre affiches faites en septembre 2026 sont dans `projets/` et servent de modèles :
`gouvernement-conte-1984` (deux pages), `bureau-politique-pdg`, `comite-central-pdg`, `cmrn-1984`.

## Installation (une fois)

```sh
cd restauration
python3.12 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

Il faut Google Chrome (utilisé en mode headless pour produire le PDF). Les polices sont
celles de macOS (Baskerville, Optima) ; sur une autre machine, prévoir des équivalents.

## Faire une affiche

```sh
R=./.venv/bin/python
$R restaure.py init gouvernement-1985 ~/Downloads/page1.jpg ~/Downloads/page2.jpg
```

`init` crée `projets/gouvernement-1985/`, copie les pages (`--rotation 90` si la photo est de
côté), détecte les cadres et écrit :

- `cadres_debug.jpg` — la page avec les cadres trouvés et leur clé (`p01`, `p02`… ; `p1-01`
  si plusieurs pages) ;
- `planche_cadres.jpg` — chaque cadre agrandi, pour vérifier les bords ;
- `cadres.json` — les cadres (modifiable à la main) ;
- `affiche.toml` — le squelette de l'affiche, une entrée par cadre, à remplir.

**1. Vérifier les cadres.** Les cadres dans une ombre de pli ou sur fond très clair sont
parfois manqués ou trop étroits. Corriger avec :

```sh
$R restaure.py ajouter gouvernement-1985 p30 487 475 173 190   # x y largeur hauteur (px), --page 2 si besoin
$R restaure.py ajuster gouvernement-1985 p07 0 8 0 -8           # dx dy dlargeur dhauteur
$R restaure.py pli     gouvernement-1985 p12 p13 p14           # cadres traversés par un pli : il sera gommé
$R restaure.py cadres  gouvernement-1985                        # regénère les images de contrôle
```

Un cadre qui inclut un bout de légende se voit tout de suite sur la planche : réduire la
hauteur de quelques pixels. Les coordonnées se lisent dans `cadres_debug.jpg` (Aperçu affiche
la position du curseur avec ⌘I → « Afficher l'inspecteur »).

**2. Remplir `affiche.toml`.** Titres, date, source, puis pour chaque clé : `grade`, `nom`
(prénom puis NOM en capitales), `fonction`. Supprimer les entrées qui ne sont pas des
personnes, déplacer les dirigeants dans `[[dirigeants]]`, créer un second `[[groupes]]` pour
les gouverneurs, secrétaires généraux, etc. Un membre peut réutiliser le portrait d'un autre
projet (même photo mieux imprimée ailleurs) :

```toml
[[groupes.membres]]
cle = "p09"
nom = "Mamadi BAYO"
portrait = "../gouvernement-conte-1984/portraits/p2r3c1.png"
```

**3. Produire.**

```sh
$R restaure.py tout gouvernement-1985
```

→ `projets/gouvernement-1985/sortie/gouvernement-1985.pdf` (A1, texte vectoriel, se réduit
en A2 sans perte) et `.png` (aperçu), plus `planche_portraits.jpg` pour contrôler le nettoyage.
`nettoyer` et `affiche` existent aussi séparément.

## Réglages utiles dans `affiche.toml`

| Clé | Rôle |
|---|---|
| `[nettoyage] marge` | pixels rognés à l'intérieur du cadre (4 par défaut ; 3 si les cadres sont serrés) |
| `[nettoyage] ombres` | 0.4–0.6 pour un journal très encré où les visages sont bouchés |
| `[[dirigeants]] hauteur_mm` | hauteur du portrait mis en avant (100–130) |
| `[[groupes]] colonnes`, `ratio`, `largeur_pct` | disposition de la grille ; le `ratio` suit celui des cadres du journal |
| `[[groupes]] espace_lignes_mm` | pour aérer quand l'affiche a de la place en bas |
| `date_italique = true` | sous-titre en italique (« issu du 12ᵉ Congrès du PDG ») |
| `[pied] mention` | texte du pied de page (68ᵉ Fête Nationale…) |
| `css` | CSS additionnel pour les cas particuliers (voir les projets modèles) |

## Limites à connaître

- La qualité est bornée par la source : une photo de téléphone donne ~140 px par portrait,
  correct à distance d'affiche, doux de près. **Un scan à 600 dpi de la page originale change
  tout** — le même projet se relance tel quel sur une meilleure image.
- Les noms sont retapés à la main depuis la page : faire relire par quelqu'un qui connaît
  les personnes avant impression. Garder les grades et fonctions *tels que publiés*.
- Un pli qui traverse les yeux ne se répare pas : préférer, s'il existe, le même portrait
  imprimé intact sur une autre page (`portrait = …`).

## Organisation

```
restaure.py            ligne de commande (init, cadres, ajouter, ajuster, pli, nettoyer, affiche, tout)
restaure/detect.py     détection des cadres
restaure/clean.py      nettoyage d'un portrait (niveaux, débruitage, agrandissement ×4, pli)
restaure/affiche.py    gabarit HTML/CSS de l'affiche et rendu PDF via Chrome
assets/                armoiries.png (fond détouré), logo68.png (fond détouré)
projets/<nom>/         source-N.jpg, cadres.json, affiche.toml, portraits/, sortie/
```
