"""Vidéo « À ceux qui viendront après nous » rebadgée An 68 (demande du 28 sept. 2026).

Reprend ~/Downloads/À ceux qui viendront après nous.mp4 (3 min 32 s, 1920 × 1080, 25 i/s, sous-titres incrustés) et livre
une version où la SENAG n'apparaît plus :
  - carte d'ouverture 4,5 s (logo 68, « 68e Fête Nationale — 2 octobre 2026 », sceau sgg.gov.gn), fondu au noir vers le film ;
  - pancartes, pile de chevalets, enseigne murale, kakémono et étiquettes « SeNAG » : chaque objet est suivi image par image
    (corrélation de gabarit OpenCV) et recouvert d'une pastille de sa couleur portant le logo 68 (13 cibles, 8 plans) ;
  - 180,24 – 182,84 s : le portique « Semaine Nationale des Archives de Guinée » est remplacé par l'élève au pupitre (106,12 s) ;
  - 194,08 – 199,70 s : la chorégraphie « SeNAG » vue du drone est remplacée par la classe qui rit (102,3 s) puis la cour
                  d'école (113,72 s), fondu au blanc ;
    les deux plans de remplacement viennent de la séquence musicale (sans sous-titres) et reçoivent les sous-titres de la voix ;
  - 203,3 s → fin : les cartons « SeNAG — À l'année prochaine » sont remplacés par la carte de clôture (portrait du Président,
    logo 68, « 68e Fête Nationale — 2 octobre 2026 », sceau sgg.gov.gn), tenue 10 s, fondu au noir ; bande-son intacte.
Le badge rose sur la chemise de l'archiviste est illisible : laissé.

    python3 ceux68.py            # suivi (mis en cache dans sortie/ceux/suivi.json), rendu complet, copie dans ~/Downloads
    python3 ceux68.py --apercu   # cartes, pastilles, planches de suivi et images fixes seulement
"""
import json, pathlib, shutil, subprocess, sys
import cv2, numpy as np
from bienvenue import FONTS, LOGO68, SGG, CHROME, uri

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / 'sortie' / 'ceux'
SRC = pathlib.Path.home() / 'Downloads' / 'À ceux qui viendront après nous.mp4'
PORTRAIT = pathlib.Path.home() / 'Downloads' / 'President Doumbouya.JPG'
DEST = pathlib.Path.home() / 'Downloads' / 'Affiches Semaine An 68' / 'Vidéo À ceux qui viendront'
W, H, FPS = 1920, 1080, 25
NB = W * H * 3

DEBUT = 4.5                       # carte d'ouverture, fondu au noir sur la dernière demi-seconde
FIN_ORIG = 203.3                  # le carton « À ceux viendront après nous » est redevenu blanc
FIN_TENUE, FIN = 213.5, 214.0     # carte de clôture tenue puis fondu au noir (temps source) ; durée totale = DEBUT + FIN

# Cibles « SeNAG » : plan (coupes relevées avec scdet), image de référence et boîte relevée sur une grille de 100 px.
CIBLES = [
    dict(nom='pancarte-nagra-1', plan=(56.28, 60.08), ref=56.4, boite=(1400, 110, 245, 320)),
    dict(nom='pile-mur-1', plan=(68.04, 70.28), ref=68.12, boite=(1615, 690, 300, 385)),
    dict(nom='pancarte-nagra-2', plan=(126.96, 129.56), ref=127.04, boite=(1400, 110, 250, 320)),
    # La pancarte de l'armée entre par le bas, à moitié derrière l'épaule de l'archiviste : positions relevées à la main et
    # bord d'occultation (x minimal dessiné) jusqu'à ce qu'elle soit entièrement visible (131,0 s), suivi automatique ensuite.
    dict(nom='pancarte-armee', plan=(129.56, 132.76), ref=131.0, boite=(520, 890, 150, 90),
         cles=[(129.56, 525, 1005), (129.76, 525, 995), (129.96, 525, 975), (130.16, 525, 972), (130.36, 525, 952),
               (130.56, 525, 932), (130.76, 525, 902), (130.96, 525, 892), (131.0, 520, 890)],
         occulteur=[(129.56, 606), (130.16, 602), (130.36, 596), (130.56, 576), (130.76, 546), (130.96, 522), (131.08, 500)],
         # la pastille passe sous le sous-titre incrusté : on le redessine, limité à l'empreinte de la pastille
         sous_titres=[(129.56, 130.64, "qu'est ce que nous laisserons"), (130.64, 132.76, 'derrière nous ?')]),
    dict(nom='vitrine-large-a', plan=(132.76, 136.36), ref=133.0, boite=(1438, 493, 100, 110)),
    dict(nom='vitrine-large-b', plan=(132.76, 136.36), ref=133.0, boite=(1605, 572, 115, 75)),
    dict(nom='pile-mur-2', plan=(155.12, 158.44), ref=155.2, boite=(1615, 690, 300, 385)),
    dict(nom='enseigne-salle', plan=(162.2, 164.6), ref=162.28, boite=(1585, 285, 335, 170)),
    dict(nom='pancarte-salle', plan=(162.2, 164.6), ref=162.28, boite=(975, 632, 95, 60)),
    dict(nom='etiquettes-salle-a', plan=(162.2, 164.6), ref=162.28, boite=(466, 410, 60, 120), cacher_si_perdu=True),  # l'archiviste passe devant
    dict(nom='etiquettes-salle-b', plan=(162.2, 164.6), ref=162.28, boite=(566, 540, 100, 105)),
    dict(nom='kakemono-vitrine', plan=(186.92, 194.08), ref=187.0, boite=(1148, 352, 82, 65)),
    dict(nom='etiquette-vitrine', plan=(186.92, 194.08), ref=187.0, boite=(1085, 755, 75, 45)),
    # Étiquettes de la porte derrière l'archiviste : trop petites et trop souvent cachées (menton, puis chevelure qui monte)
    # pour un suivi automatique ; positions, fenêtre de visibilité et bord bas d'occultation (haut de la chevelure) relevés à la main.
    dict(nom='etiquettes-porte', plan=(186.92, 194.08), ref=187.72, boite=(658, 425, 55, 105),
         cles=[(186.92, 658, 425), (188.2, 660, 422), (188.7, 670, 402), (189.0, 673, 390), (194.08, 674, 388)],
         fenetres=[(187.56, 191.0)],
         occulteur_bas=[(188.2, 530), (188.4, 445), (188.6, 470), (188.8, 515), (189.0, 500), (189.3, 490), (189.6, 500),
                        (189.9, 495), (190.2, 482), (190.5, 465), (190.8, 432), (191.0, 400)]),
]
RAYON, SEUIL = 100, 0.55          # fenêtre de recherche autour de la position précédente, score minimal de corrélation
ECHELLES = (0.96, 1.0, 1.04)      # variation d'échelle testée à chaque image (la caméra avance : l'enseigne grandit)

# Plans remplacés : source dans la séquence musicale, sous-titres de la voix (relevés image par image).
REMPLACEMENTS = [
    dict(plan=(180.24, 182.84), src=106.12,
         sous_titres=[(180.24, 180.64, 'ou tombe'), (180.64, 182.84, 'sur les images de cette semaine.')]),
    dict(plan=(194.08, 199.7), src=[(194.08, 102.3), (197.9, 113.72)], fondu_blanc=(198.9, 199.7),   # classe qui rit, puis cour d'école
         sous_titres=[(194.08, 195.3, 'et qui a eu le courage'), (195.3, 198.9, "d'y ajouter sa propre page.")]),
]

STYLE = f'''{FONTS}
html, body {{ width: {W}px; height: {H}px; background: var(--cream); color: var(--ink); font-family: "Cormorant", serif; }}
.band {{ position: absolute; left: 0; right: 0; height: 14px; }} .band.t {{ top: 0; }} .band.b {{ bottom: 0; }}
.frame {{ position: absolute; inset: 40px; border: 3px solid var(--gold); }}
.frame::after {{ content: ""; position: absolute; inset: 8px; border: 1px solid var(--gold); opacity: .8; }}
.k {{ font-family: "Barlow", sans-serif; font-weight: 500; font-size: 30px; letter-spacing: .45em; text-transform: uppercase; color: var(--gold-3); }}
h1 {{ font-weight: 600; line-height: .95; letter-spacing: .02em; text-transform: uppercase; margin: 14px 0 22px; white-space: nowrap; }}
h1 sup {{ font-size: .42em; vertical-align: .75em; text-transform: none; }}
.d {{ font-family: "Barlow", sans-serif; font-weight: 500; letter-spacing: .28em; text-transform: uppercase; color: var(--green); }}
.tri {{ width: 360px; height: 10px; margin-top: 34px; }}
.sgg {{ display: flex; align-items: center; gap: 28px; }}
.sgg img {{ height: 150px; }}
.sgg .t1 {{ font-family: "Questrial", sans-serif; font-size: 62px; line-height: 1; color: var(--ink); }}
.sgg .t2 {{ font-family: "Questrial", sans-serif; font-size: 25px; color: var(--ink); margin-top: 10px; }}
'''
CADRE = '<div class="band t tri"><i></i><i></i><i></i></div><div class="band b tri"><i></i><i></i><i></i></div><div class="frame"></div>'

CARTE_DEBUT = f'''<!doctype html><meta charset="utf-8"><style>{STYLE}
.row {{ position: absolute; left: 0; right: 0; top: 130px; display: flex; align-items: center; justify-content: center; gap: 90px; }}
.l68 {{ height: 430px; }}
.sep {{ width: 2px; height: 480px; background: var(--gold); opacity: .7; }}
h1 {{ font-size: 118px; }} .d {{ font-size: 58px; }}
.sgg {{ position: absolute; left: 0; right: 0; bottom: 100px; justify-content: center; }}
</style><body>{CADRE}
<div class="row">
  <img class="l68" src="{uri(LOGO68)}">
  <div class="sep"></div>
  <div>
    <div class="k">République de Guinée</div>
    <h1>68<sup>e</sup> Fête Nationale</h1>
    <div class="d">2 octobre 2026</div>
    <div class="tri"><i></i><i></i><i></i></div>
  </div>
</div>
<div class="sgg"><img src="{uri(SGG)}"><div><div class="t1">sgg.gov.gn</div><div class="t2">Secrétariat Général du Gouvernement</div></div></div>
</body>'''


def carte_fin(portrait):
    return f'''<!doctype html><meta charset="utf-8"><style>{STYLE}
.row {{ position: absolute; left: 0; right: 0; top: 96px; display: flex; align-items: flex-start; justify-content: center; gap: 96px; }}
.p {{ text-align: center; }}
.p img {{ height: 740px; border: 3px solid var(--gold); padding: 8px; background: #fff; }}
.p .n {{ font-weight: 600; font-size: 40px; margin-top: 18px; color: var(--green); }}
.p .f {{ font-family: "Barlow", sans-serif; font-weight: 500; font-size: 20px; letter-spacing: .28em; text-transform: uppercase; color: var(--gold-3); margin-top: 6px; }}
.c {{ display: flex; flex-direction: column; align-items: flex-start; padding-top: 10px; }}
.l68 {{ height: 300px; margin-left: -6px; margin-bottom: 26px; }}
h1 {{ font-size: 100px; }} .d {{ font-size: 50px; }}
.sgg {{ margin-top: 54px; }}
</style><body>{CADRE}
<div class="row">
  <div class="p"><img src="{uri(portrait)}"><div class="n">Son Excellence Monsieur Mamadi Doumbouya</div><div class="f">Président de la République de Guinée</div></div>
  <div class="c">
    <img class="l68" src="{uri(LOGO68)}">
    <div class="k">République de Guinée</div>
    <h1>68<sup>e</sup> Fête Nationale</h1>
    <div class="d">2 octobre 2026</div>
    <div class="tri"><i></i><i></i><i></i></div>
    <div class="sgg"><img src="{uri(SGG)}"><div><div class="t1">sgg.gov.gn</div><div class="t2">Secrétariat Général du Gouvernement</div></div></div>
  </div>
</div>
</body>'''


# Sous-titres incrustés du film : sans bold géométrique blanc ombré, centré, ~52 px, centre de ligne à y ≈ 922.
def sous_titre(texte):
    return f'''<!doctype html><meta charset="utf-8"><style>{FONTS}
html, body {{ margin: 0; width: {W}px; height: 160px; background: transparent; overflow: hidden; }}
.s {{ position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-family: "Questrial", sans-serif;
      font-size: 54px; color: #fff; -webkit-text-stroke: 1.4px #fff; letter-spacing: .005em;
      text-shadow: 0 0 7px rgba(0,0,0,.95), 0 0 2px rgba(0,0,0,.9), 2px 3px 4px rgba(0,0,0,.75); }}
</style><body><div class="s">{texte}</div></body>'''


def shot(name, html, w, h):
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / f'{name}.html'; f.write_text(html, encoding='utf-8')
    png = OUT / f'{name}.png'
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
                    f'--window-size={w},{h}', '--force-device-scale-factor=1', '--virtual-time-budget=4000',
                    f'--screenshot={png}', f.resolve().as_uri()], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return png


def lire(t0, n, gris=False):
    """n images à partir de t0 (temps source), en BGR ou en niveaux de gris."""
    fmt, c = ('gray', 1) if gris else ('bgr24', 3)
    p = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t0:.3f}', '-i', SRC, '-frames:v', str(n), '-f', 'rawvideo', '-pix_fmt', fmt, '-'],
                       capture_output=True, check=True).stdout
    a = np.frombuffer(p, np.uint8)
    m = len(a) // (W * H * c)
    return a[:m * W * H * c].reshape(m, H, W, c) if c > 1 else a[:m * W * H].reshape(m, H, W)


def images_du_plan(plan):
    t0, t1 = plan
    return int(round(t0 * FPS)), int(round(t1 * FPS))   # indices d'image [i0, i1)


# ---------------------------------------------------------------- suivi
def interp(cles, t):
    """Interpolation linéaire de listes (t, v1, v2…) ; bornée aux extrémités."""
    if t <= cles[0][0]:
        return cles[0][1:]
    for (t0, *a), (t1, *b) in zip(cles, cles[1:]):
        if t0 <= t <= t1:
            k = (t - t0) / (t1 - t0) if t1 > t0 else 0
            return [u + (v - u) * k for u, v in zip(a, b)]
    return cles[-1][1:]


def suivre(cible, gris):
    """Pour chaque image du plan : (t, x, y, score, échelle) de la boîte, suivie avant et après l'image de référence."""
    i0, i1 = images_du_plan(cible['plan'])
    x, y, w, h = cible['boite']
    iref = int(round(cible['ref'] * FPS)) - i0
    gabarit = gris[iref, y:y + h, x:x + w]
    pos, scores, ech = {iref: (x, y)}, {iref: 1.0}, {iref: 1.0}
    for sens, fin in ((1, len(gris)), (-1, -1)):
        px, py, vx, vy, e = float(x), float(y), 0.0, 0.0, 1.0
        for i in range(iref + sens, fin, sens):
            meilleur = (-1, None, e)
            for k in ECHELLES:
                ek = min(1.6, max(0.7, e * k))
                tw, th = max(8, int(w * ek)), max(8, int(h * ek))
                g = cv2.resize(gabarit, (tw, th), interpolation=cv2.INTER_AREA)
                sx0, sy0 = int(max(0, px - RAYON)), int(max(0, py - RAYON))
                sx1, sy1 = int(min(W, px + tw + RAYON)), int(min(H, py + th + RAYON))
                zone = gris[i, sy0:sy1, sx0:sx1]
                if zone.shape[0] < th or zone.shape[1] < tw:
                    continue
                _, score, _, loc = cv2.minMaxLoc(cv2.matchTemplate(zone, g, cv2.TM_CCOEFF_NORMED))
                if score > meilleur[0]:
                    meilleur = (score, (sx0 + loc[0], sy0 + loc[1]), ek)
            score, loc, ek = meilleur
            if score >= SEUIL:
                nx, ny = loc
                vx, vy = 0.5 * vx + 0.5 * (nx - px), 0.5 * vy + 0.5 * (ny - py)
                px, py, e = float(nx), float(ny), ek
            else:                       # cible masquée ou sortie du cadre : on prolonge le mouvement
                px, py = px + vx, py + vy
            pos[i], scores[i], ech[i] = (px, py), score, e
    res = []
    for i in sorted(pos):
        t = (i0 + i) / FPS
        (px, py), sc, e = pos[i], scores[i], ech[i]
        if 'cles' in cible and cible['cles'][0][0] <= t <= cible['cles'][-1][0]:
            px, py = interp(cible['cles'], t); sc, e = 1.0, 1.0
        res.append([round(t, 3), round(px, 1), round(py, 1), round(float(sc), 2), round(e, 3)])
    return res


def deriver(cible, guide, gris):
    """Positions déduites du déplacement d'une autre cible du même plan ; score = corrélation locale (occultation)."""
    i0, _ = images_du_plan(cible['plan'])
    x, y, w, h = cible['boite']
    iref = int(round(cible['ref'] * FPS)) - i0
    gabarit = gris[iref, y:y + h, x:x + w]
    gx, gy = guide[iref][1], guide[iref][2]
    res = []
    for i, (t, ux, uy, _, e) in enumerate(guide):
        px, py = x + (ux - gx), y + (uy - gy)
        sx0, sy0 = int(max(0, px - 8)), int(max(0, py - 8))
        zone = gris[i, sy0:sy0 + h + 16, sx0:sx0 + w + 16]
        score = -1
        if zone.shape[0] >= h and zone.shape[1] >= w:
            _, score, _, _ = cv2.minMaxLoc(cv2.matchTemplate(zone, gabarit, cv2.TM_CCOEFF_NORMED))
        res.append([t, round(px, 1), round(py, 1), round(float(score), 2), e])
    return res


def suivi(force=False):
    cache = OUT / 'suivi.json'
    if cache.exists() and not force:
        return json.loads(cache.read_text())
    res, gris_cache = {}, {}
    for c in sorted(CIBLES, key=lambda c: 'suivre_comme' in c):
        if c['plan'] not in gris_cache:
            i0, i1 = images_du_plan(c['plan'])
            gris_cache[c['plan']] = lire(c['plan'][0], i1 - i0, gris=True)
        res[c['nom']] = deriver(c, res[c['suivre_comme']], gris_cache[c['plan']]) if 'suivre_comme' in c else suivre(c, gris_cache[c['plan']])
        perdu = sum(1 for r in res[c['nom']] if r[3] < c.get('seuil_visible', SEUIL))
        print(f"{c['nom']:20s} {len(res[c['nom']])} images, {perdu} extrapolées")
    OUT.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(res))
    return res


def planches_suivi(suivis):
    """Une planche par plan : la boîte de chaque cible dessinée toutes les 5 images."""
    plans = sorted({c['plan'] for c in CIBLES})
    for plan in plans:
        i0, i1 = images_du_plan(plan)
        pas = max(1, (i1 - i0) // 24)
        vignettes = []
        imgs = lire(plan[0], i1 - i0)
        for i in range(0, i1 - i0, pas):
            im = imgs[i].copy()
            for c in CIBLES:
                if c['plan'] != plan:
                    continue
                t, x, y, s, e = suivis[c['nom']][i]
                x, y, w, h = int(x), int(y), int(c['boite'][2] * e), int(c['boite'][3] * e)
                cv2.rectangle(im, (x, y), (x + w, y + h), (0, 255, 0) if s >= SEUIL else (0, 0, 255), 4)
            cv2.putText(im, f'{(i0 + i) / FPS:.2f}', (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (0, 255, 255), 3)
            vignettes.append(cv2.resize(im, (480, 270), interpolation=cv2.INTER_AREA))
        while len(vignettes) % 4:
            vignettes.append(np.zeros((270, 480, 3), np.uint8))
        lignes = [np.hstack(vignettes[k:k + 4]) for k in range(0, len(vignettes), 4)]
        cv2.imwrite(str(OUT / f'suivi-{plan[0]:.2f}.png'), np.vstack(lignes))


# ---------------------------------------------------------------- pastilles
LOGO = None


def pastille(cible, ref):
    """Plaque arrondie de la couleur dominante de l'objet, logo 68 centré (BGRA)."""
    global LOGO
    if LOGO is None:
        LOGO = cv2.imread(str(LOGO68), cv2.IMREAD_UNCHANGED)
    x, y, w, h = cible['boite']
    p = max(4, int(0.06 * min(w, h)))
    cw, ch = w + 2 * p, h + 2 * p
    fond = np.median(ref[y:y + h, x:x + w].reshape(-1, 3), axis=0)
    img = np.zeros((ch, cw, 4), np.float32)
    img[..., :3] = fond
    r = max(3, int(0.12 * min(cw, ch)))
    m = np.zeros((ch * 4, cw * 4), np.uint8)
    cv2.rectangle(m, (r * 4, 0), (cw * 4 - r * 4, ch * 4), 255, -1)
    cv2.rectangle(m, (0, r * 4), (cw * 4, ch * 4 - r * 4), 255, -1)
    for cx, cy in ((r, r), (cw - r, r), (r, ch - r), (cw - r, ch - r)):
        cv2.circle(m, (cx * 4, cy * 4), r * 4, 255, -1)
    masque = cv2.resize(m, (cw, ch), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    s = int(0.8 * min(cw, ch))
    lh, lw = LOGO.shape[:2]
    k = s / max(lh, lw)
    logo = cv2.resize(LOGO, (max(1, int(lw * k)), max(1, int(lh * k))), interpolation=cv2.INTER_AREA).astype(np.float32)
    ox, oy = (cw - logo.shape[1]) // 2, (ch - logo.shape[0]) // 2
    a = logo[..., 3:4] / 255
    zone = img[oy:oy + logo.shape[0], ox:ox + logo.shape[1], :3]
    zone[:] = zone * (1 - a) + logo[..., :3] * a
    img[..., 3] = masque
    return img


def coller(dst, src, x, y, x_min=None, y_max=None):
    """Compose src (BGRA float) sur dst (BGR uint8) en (x, y), avec rognage aux bords ; rien à gauche de x_min ni sous y_max (bords adoucis)."""
    x, y = int(round(x)), int(round(y))
    if x_min is not None or y_max is not None:
        src = src.copy()
        if x_min is not None:
            src[..., 3] *= np.clip((np.arange(src.shape[1]) + x - x_min) / 6.0, 0, 1)[None, :]
        if y_max is not None:
            src[..., 3] *= np.clip((y_max - (np.arange(src.shape[0]) + y)) / 6.0, 0, 1)[:, None]
    sh, sw = src.shape[:2]
    x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + sw, W), min(y + sh, H)
    if x1 <= x0 or y1 <= y0:
        return
    s = src[y0 - y:y1 - y, x0 - x:x1 - x]
    a = s[..., 3:4]
    d = dst[y0:y1, x0:x1].astype(np.float32)
    dst[y0:y1, x0:x1] = (d * (1 - a) + s[..., :3] * a).astype(np.uint8)


def empreinte(src, x, y, x_min=None):
    """Masque H × W (float) de la zone couverte par src collé en (x, y)."""
    m = np.zeros((H, W), np.float32)
    x, y = int(round(x)), int(round(y))
    sh, sw = src.shape[:2]
    x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + sw, W), min(y + sh, H)
    if x1 > x0 and y1 > y0:
        a = src[y0 - y:y1 - y, x0 - x:x1 - x, 3].copy()
        if x_min is not None:
            a *= np.clip((np.arange(x0, x1) - x_min) / 6.0, 0, 1)[None, :]
        m[y0:y1, x0:x1] = a
    return m


def melange(a, b, k):
    return (a.astype(np.float32) * (1 - k) + b.astype(np.float32) * k).astype(np.uint8)


# ---------------------------------------------------------------- rendu
def preparer():
    OUT.mkdir(parents=True, exist_ok=True)
    port = cv2.imread(str(PORTRAIT))
    port = port[:1135]                                   # sans le bandeau-légende du fichier
    cv2.imwrite(str(OUT / 'portrait.png'), port)
    debut = cv2.imread(str(shot('carte-debut', CARTE_DEBUT, W, H)))
    fin = cv2.imread(str(shot('carte-fin', carte_fin(OUT / 'portrait.png'), W, H)))
    st = {}
    for r in REMPLACEMENTS + [c for c in CIBLES if 'sous_titres' in c]:
        for _, _, texte in r['sous_titres']:
            if texte not in st:
                png = shot(f'st-{len(st)}', sous_titre(texte), W, 160)
                st[texte] = cv2.imread(str(png), cv2.IMREAD_UNCHANGED).astype(np.float32)
                st[texte][..., 3] /= 255
    suivis = suivi()
    refs = {}
    pastilles = {}
    for c in CIBLES:
        if c['ref'] not in refs:
            refs[c['ref']] = lire(c['ref'], 1)[0]
        pastilles[c['nom']] = pastille(c, refs[c['ref']])
        cv2.imwrite(str(OUT / f"pastille-{c['nom']}.png"), pastilles[c['nom']].astype(np.uint8))
    broll = {}
    for r in REMPLACEMENTS:
        i0, i1 = images_du_plan(r['plan'])
        segs = r['src'] if isinstance(r['src'], list) else [(r['plan'][0], r['src'])]
        parts = []
        for k, (t_plan, t_src) in enumerate(segs):
            t_fin = segs[k + 1][0] if k + 1 < len(segs) else r['plan'][1]
            parts.append(lire(t_src, int(round(t_fin * FPS)) - int(round(t_plan * FPS))))
        broll[r['plan']] = np.concatenate(parts)[:i1 - i0]
    return debut, fin, st, suivis, pastilles, broll


def composer(i, frame, st, suivis, pastilles, broll):
    """Image source i (temps t = i / FPS) → image traitée (temps source)."""
    t = i / FPS
    for r in REMPLACEMENTS:
        i0, i1 = images_du_plan(r['plan'])
        if i0 <= i < i1:
            im = broll[r['plan']][min(i - i0, len(broll[r['plan']]) - 1)].copy()
            for a, b, texte in r['sous_titres']:
                if a <= t < b:
                    coller(im, st[texte], 0, 842)
            if 'fondu_blanc' in r:
                a, b = r['fondu_blanc']
                if t >= a:
                    im = melange(im, np.full_like(im, 255), min(1.0, (t - a) / (b - a)))
            return im
    im = frame.copy()
    for c in CIBLES:
        i0, i1 = images_du_plan(c['plan'])
        if i0 <= i < i1:
            _, x, y, sc, e = suivis[c['nom']][i - i0]
            if c.get('cacher_si_perdu') and sc < c.get('seuil_visible', SEUIL):
                continue
            p = max(4, int(0.06 * min(c['boite'][2], c['boite'][3])))
            past = pastilles[c['nom']]
            if abs(e - 1) > 0.01:
                past = cv2.resize(past, (max(1, int(past.shape[1] * e)), max(1, int(past.shape[0] * e))), interpolation=cv2.INTER_LINEAR)
            if 'fenetres' in c and not any(a <= t < b for a, b in c['fenetres']):
                continue
            x_min = interp(c['occulteur'], t)[0] if 'occulteur' in c and t <= c['occulteur'][-1][0] else None
            y_max = interp(c['occulteur_bas'], t)[0] if 'occulteur_bas' in c and t >= c['occulteur_bas'][0][0] else None
            coller(im, past, x - p * e, y - p * e, x_min, y_max)
            for a, b, texte in c.get('sous_titres', ()):
                if a <= t < b:
                    m = empreinte(past, x - p * e, y - p * e, x_min)[842:842 + st[texte].shape[0]]
                    sur = st[texte].copy(); sur[..., 3] *= m
                    coller(im, sur, 0, 842)
    return im


def apercus(debut, fin, st, suivis, pastilles, broll):
    planches_suivi(suivis)
    for t in (57.5, 69.0, 128.5, 130.0, 130.6, 131.5, 134.0, 156.0, 163.5, 164.4, 181.5, 187.8, 188.0, 188.5, 189.2, 190.2, 197.0):
        i = int(round(t * FPS))
        cv2.imwrite(str(OUT / f'apercu-{t:.1f}s.png'), composer(i, lire(t, 1)[0], st, suivis, pastilles, broll))
    cv2.imwrite(str(OUT / 'apercu-carte-fin.png'), fin)


def encoder(debut, fin, st, suivis, pastilles, broll):
    mp4 = OUT / 'À ceux qui viendront après nous — An 68.mp4'
    total = DEBUT + FIN
    lecteur = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', SRC, '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'],
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=NB * 4)
    encodeur = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                                 '-i', SRC, '-filter_complex', f'[1:a]adelay={int(DEBUT * 1000)}|{int(DEBUT * 1000)},apad[a]',
                                 '-map', '0:v', '-map', '[a]', '-t', f'{total:.3f}',
                                 '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p',
                                 '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(mp4)], stdin=subprocess.PIPE)
    noir = np.zeros((H, W, 3), np.uint8)
    ecrire = lambda im: encodeur.stdin.write(np.ascontiguousarray(im).tobytes())
    for i in range(int(DEBUT * FPS)):                       # carte d'ouverture, fondu au noir sur 0,5 s
        t = i / FPS
        ecrire(debut if t < DEBUT - 0.5 else melange(debut, noir, (t - (DEBUT - 0.5)) / 0.5))
    i = 0
    while True:
        buf = lecteur.stdout.read(NB)
        if len(buf) < NB or i / FPS >= FIN_ORIG:
            break
        frame = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
        ecrire(composer(i, frame, st, suivis, pastilles, broll))
        i += 1
        if i % 500 == 0:
            print(f'  {i / FPS:.0f} s', flush=True)
    lecteur.terminate()
    blanc = np.full((H, W, 3), 255, np.uint8)
    for j in range(int(FIN_ORIG * FPS), int(FIN * FPS)):    # carte de clôture : fondu depuis le blanc, tenue, fondu au noir
        t = j / FPS
        if t < FIN_ORIG + 0.8:
            ecrire(melange(blanc, fin, (t - FIN_ORIG) / 0.8))
        elif t < FIN_TENUE:
            ecrire(fin)
        else:
            ecrire(melange(fin, noir, (t - FIN_TENUE) / (FIN - FIN_TENUE)))
    encodeur.stdin.close()
    encodeur.wait()
    if encodeur.returncode:
        sys.exit('ffmpeg a échoué')
    return mp4


if __name__ == '__main__':
    if '--suivi' in sys.argv:
        (OUT / 'suivi.json').unlink(missing_ok=True)
    elements = preparer()
    apercus(*elements)
    if '--apercu' in sys.argv or '--suivi' in sys.argv:
        sys.exit()
    mp4 = encoder(*elements)
    DEST.mkdir(parents=True, exist_ok=True)
    shutil.copy(mp4, DEST / mp4.name)
    shutil.copy(OUT / 'carte-debut.png', DEST / 'Carte d’ouverture 1920x1080.png')
    shutil.copy(OUT / 'carte-fin.png', DEST / 'Carte de clôture 1920x1080.png')
    print(DEST / mp4.name)
