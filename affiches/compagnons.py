"""« Les Compagnons de l'Indépendance » — bannière 3000 × 1350 pt (20:9), reconstruite.

Reprend à l'identique le visuel « Guinea's Independence Visual Compagnons 1 » du 12 septembre
2026 (mêmes polices Bebas Neue / Barlow Condensed / Barlow / Questrial, mêmes couleurs, même
grille de fiches) avec les corrections demandées le 25 septembre 2026 :
  - Ousmane Baldé (père de la monnaie guinéenne) : nom et notice corrigés ;
  - Barry III : notice corrigée ;
  - cinq compagnons ajoutés depuis le dossier photographique du PDG (~/Downloads/More_Companon) :
    Ismaël Touré, Mamady Keïta, Amara Touré, Alpha Oumar Barry, Damantang Camara.

Vingt-six fiches sur une grille de 4 × 7 ; les deux notices longues (Barry III, Ousmane Baldé)
occupent deux colonnes.

    ../restauration/.venv/bin/python compagnons.py photos   # portraits → photos/compagnons/
    python3 compagnons.py                                   # HTML → PDF + PNG dans sortie/compagnons/
    python3 compagnons.py --nuit                            # variante B « Nuit et or »
"""
import base64, pathlib, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parent
F, P, OUT = ROOT / 'assets' / 'fonts', ROOT / 'photos' / 'compagnons', ROOT / 'sortie' / 'compagnons'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
D = pathlib.Path.home() / 'Downloads'
PDF1 = D / "Guinea's Independence Visual Compagnons 1.pdf"
MIME = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ttf': 'font/ttf'}


def uri(p):
    p = pathlib.Path(p)
    return f'data:{MIME[p.suffix]};base64,' + base64.b64encode(p.read_bytes()).decode()


def portrait_uri(slug, max_w=1600):
    """Portrait incrusté en JPEG à 1 600 px de large (≈ 140 dpi sur une bâche de 6 m) : le PDF reste léger."""
    import io
    from PIL import Image
    im = Image.open(P / f'{slug}.png').convert('L')
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=90, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


# ----------------------------------------------------------------------------- les fiches
# (slug, nom, dates, fonction, notice, largeur en colonnes)
CARDS = [
    ('sekou-toure', 'Ahmed Sékou Touré', '1922 – 1984', 'Premier Président de la République · 1958 – 1984',
     "Architecte de l'État souverain : Constitution de novembre 1958, Pouvoirs Révolutionnaires Locaux, Banque centrale et franc guinéen en 1960.", 1),
    ('saifoulaye-diallo', 'Saïfoulaye Diallo', '1923 – 1981', "Président de l'Assemblée territoriale (1957), puis nationale",
     "Né à Labé, grand orateur et stratège du PDG-RDA, « gardien du temple législatif et budgétaire » de la jeune République.", 1),
    ('barry-diawadou', 'Barry Diawadou', '1916 – 1969', "Chef du BAG · Ministre de l'Éducation nationale, puis des Finances",
     "Député à Paris, il saborde son parti pour l'unité nationale en 1958 et réorganise l'école et les régies financières de l'État.", 1),
    ('ibrahima-barry-iii', 'Ibrahima Barry, dit Barry III', '1923 – 1971', 'Fondateur de la DSG · Ministre du Plan',
     "Né vers 1923 à Bantignel (Pita), mort le 25 janvier 1971 à Conakry. Homme politique et homme d'État. Membre de la Section française "
     "de l'Internationale ouvrière (SFIO), cofondateur de la Démocratie socialiste de Guinée (DSG), du Mouvement socialiste africain (MSA) "
     "et de l'Union des populations de Guinée, section guinéenne du Parti du regroupement africain (PRA). Secrétaire d'État aux Finances "
     "(octobre 1958 – avril 1959) ; directeur des Affaires économiques (avril 1959 – mars 1960) ; ministre de la Justice (mars 1960 – "
     "janvier 1961) ; ministre du Plan (janvier 1961 – février 1964) ; ministre du Commerce (février – novembre 1964) ; "
     "secrétaire général du Gouvernement (1969).", 2),
    ('habib-tall', 'Habib Tall', 'Dinguiraye', 'Représentant des indépendants · Élu territorial, 1957',
     "Pont entre l'administration moderne et les territoires : il ancre les réformes de 1957-1958 dans les régions de l'intérieur.", 1),
    ('telly-diallo', 'Boubacar Diallo Telly', '1925 – 1977', "Premier ambassadeur à l'ONU · 1er Secrétaire général de l'OUA",
     "Docteur en droit né à Porédaka, il fait admettre la Guinée à l'ONU en 1958 et bâtit toute l'administration de l'OUA (1964–1972).", 1),
    ('lansana-beavogui', 'Dr Louis Lansana Béavogui', '1923 – 1984', 'Premier Premier ministre · 1972 – 1984',
     "Médecin de Macenta, maire de Kissidougou, chef de la diplomatie puis chef d'orchestre du gouvernement : il crée la Primature et le SGG.", 1),
    ('jeanne-martin-cisse', 'Jeanne Martin Cissé', '1926 – 2017', "1re femme présidente du Conseil de sécurité de l'ONU · 1972",
     "Institutrice de Kankan, cofondatrice de l'Organisation panafricaine des femmes, ministre des Affaires sociales (1976–1984).", 1),
    ('loffo-camara', 'Loffo Camara', 'c. 1925 – 1971', "1re femme au gouvernement · Secrétaire d'État, 1961 – 1968",
     "Sage-femme et syndicaliste de Macenta, elle fonde les services d'assistance sociale et la protection maternelle et infantile.", 1),
    ('mafory-bangoura', 'Hadja Mafory Bangoura', 'c. 1910 – 1976', '« Présidente des femmes de Guinée » · Ministre des Affaires sociales',
     "Couturière de Wonkifon, meneuse de la grève de 1953, emprisonnée en 1955 ; son effigie orne le billet de 1 syli en 1981.", 1),
    ('mbalia-camara', "M'Balia Camara", '† 1955', 'Martyre de la lutte anticoloniale',
     "Militante du PDG tuée, enceinte, lors d'un affrontement en 1955 : son sacrifice galvanise la marche vers le « Non » de 1958.", 1),
    ('ngamet-toure', "N'Gamet Touré", 'Années 1950', 'Militante du mouvement des femmes du PDG-RDA',
     "Figure des structures féminines du parti, elle mobilise villes et campagnes pour le « Non » de 1958 puis pour l'alphabétisation.", 1),
    ('abdoulaye-ghana-diallo', 'El Hadj Abdoulaye « Ghana » Diallo', '1916 – 1998', 'Syndicaliste · Ministre du Travail · Ambassadeur',
     "Né à Dabola, fondateur de l'Union Guinée-Ghana et du Groupe de Casablanca, ambassadeur itinérant, Compagnon de l'Indépendance.", 1),
    ('madeira-keita', 'Madéira Kéita', '1924 – 1971', 'Ministre de la Santé, puis du Travail et des Affaires sociales',
     "Instituteur formé à William Ponty, il bâtit le système national de santé publique et la première législation du travail.", 1),
    ('fodeba-keita', 'Fodéba Keïta', '1921 – 1969', 'Fondateur des Ballets Africains · Ministre de la Défense',
     "Poète de Siguiri, créateur des Ballets Africains (1949) et coauteur de l'hymne « Liberté », ministre du jeune État.", 1),
    ('nfamara-keita', "N'Fa Amara Keïta", 'Années 1950 – 1960', 'Militant et syndicaliste du PDG-RDA',
     "Organisateur des militants et défenseur du « Non » de 1958, il sert ensuite la consolidation des institutions nationales.", 1),
    ('moussa-diakite', 'Moussa Diakité', '1927 – 1985', "Ministre de l'Intérieur · Gouverneur de la Banque de la République",
     "Né à Kankan, membre du Bureau politique national, il négocie en 1962 avec les États-Unis la garantie des investissements.", 1),
    ('kaman-diaby', 'Colonel Kaman Diaby', 'c. 1930 – 1969', "Premier aviateur d'Afrique francophone · Chef d'état-major adjoint",
     "Bâtisseur de l'armée nationale (1959–1969), réhabilité en 2021 : une stèle marque sa sépulture au pied du mont Kakoulima.", 1),
    ('nabi-youla', 'Naby Youla', '1918 – 2014', 'Premier ambassadeur de Guinée en France',
     "Né à Forécariah, « le Doyen » renoue le dialogue avec de Gaulle après le « Non » et ouvre la voie à l'entrée de la Guinée à l'ONU.", 1),
    ('ousmane-balde', 'Ousmane Baldé', '1924 – 1971', 'Père de la monnaie guinéenne · Premier gouverneur de la Banque centrale',
     "Né en 1924 à Koïn, dans la préfecture de Tougué (région de Labé, Fouta-Djalon). Formé à l'École normale William Ponty, il se "
     "distingue par sa rigueur intellectuelle, sa maîtrise des finances et son sens de l'État. Après l'indépendance de la Guinée en 1958, "
     "il est nommé directeur du Trésor, puis devient le premier secrétaire général – l'équivalent du gouverneur – de la Banque centrale "
     "de la République de Guinée. Le 1er mars 1960, il signe les premiers billets guinéens, marquant la naissance de la monnaie nationale "
     "et la rupture avec le franc CFA colonial. Grâce à sa gestion rigoureuse, le syli connaît une grande stabilité : 100 sylis valaient "
     "alors environ 100 dollars. Il est unanimement reconnu comme l'architecte du système monétaire guinéen.", 2),
    ('bangaly-camara', 'Bangaly Camara', 'Compagnon', "Compagnon de l'Indépendance",
     "Portrait issu du dossier photographique — notice biographique à compléter.", 1),
    # ---- ajoutés le 25 septembre 2026 (fiches du dossier du PDG)
    ('ismael-toure', 'Ismaël Touré', '1925 – 1985', 'Ministre du Domaine économique et des Finances · Membre du Bureau politique',
     "Ingénieur météorologiste né à Faranah, élu au Bureau politique national en 1957, député de la première Assemblée. Ministre des "
     "Travaux publics, du Développement puis des Finances, il préside le Comité révolutionnaire après l'agression du 22 novembre 1970.", 1),
    ('mamady-keita', 'Mamady Keïta', 'Né en 1936 · Sanankoro (Kouroussa)', "Ministre du Domaine de l'Éducation et de la Culture · Membre du Bureau politique",
     "Professeur de philosophie, secrétaire général des étudiants de la JRDA en France puis en Suisse, il dirige l'Institut polytechnique "
     "de Kankan et l'École nationale des cadres du parti avant de conduire l'éducation nationale.", 1),
    ('amara-toure', 'Amara Touré', 'Né en 1914 · Faranah', "Membre fondateur du PDG · Compagnon de l'Indépendance",
     "Cultivateur de Faranah, militant de la première heure : du comité de base au Bureau fédéral, il porte le parti dans les campagnes. "
     "Compagnon de l'Indépendance, médaille d'honneur du Travail.", 1),
    ('alpha-oumar-barry', 'Alpha Oumar Barry', 'Né en 1921 · Hamdallaye (Mamou)', 'Médecin · Gouverneur de région · Ministre du Domaine des Échanges',
     "Docteur en médecine, médecin-chef de la région de Kindia (1958–1968), gouverneur de région puis ministre délégué de la Guinée "
     "forestière ; député, premier secrétaire et vice-président de l'Assemblée nationale.", 1),
    ('damantang-camara', 'Damantang Camara', '1917 – 1985', "Magistrat · Ministre de la Justice, de l'Intérieur, des Affaires étrangères · Président de l'Assemblée législative",
     "Né à Mali, fondateur du comité RDA de Beyla en 1947, il tient successivement la Fonction publique, la Justice, l'Intérieur, "
     "l'Éducation nationale et les Affaires étrangères. Compagnon de l'Indépendance, médaille hors classe de la Culture.", 1),
]

# ----------------------------------------------------------------------------- les portraits
# Trois provenances : les portraits détourés du 22 septembre (~/Downloads/portraits/compagnons),
# les images incrustées dans le PDF du 12 septembre (trois fiches sans portrait détouré), et les
# pages du dossier photographique reçues par WhatsApp le 25 septembre (cadrage à la main).
PORTRAITS = {s: ('detoure', D / 'portraits' / 'compagnons' / f'comp-{s}.png') for s in
             ['abdoulaye-ghana-diallo', 'bangaly-camara', 'fodeba-keita', 'ibrahima-barry-iii', 'jeanne-martin-cisse', 'kaman-diaby',
              'lansana-beavogui', 'madeira-keita', 'mafory-bangoura', 'mbalia-camara', 'moussa-diakite', 'nabi-youla', 'nfamara-keita',
              'ngamet-toure', 'ousmane-balde', 'saifoulaye-diallo', 'sekou-toure', 'telly-diallo']}
PORTRAITS.update({'barry-diawadou': ('pdf', 2), 'habib-tall': ('pdf', 4), 'loffo-camara': ('pdf', 8)})   # rang dans le PDF
MORE = D / 'More_Companon'
PORTRAITS.update({   # (fichier WhatsApp, x0, y0, x1, y1) sur l'image 810 × 1080
    'ismael-toure': ('page', MORE / 'WhatsApp Image 2026-09-25 at 15.16.02 (2).jpeg', 40, 78, 250, 420),
    'mamady-keita': ('page', MORE / 'WhatsApp Image 2026-09-25 at 15.16.02 (3).jpeg', 97, 111, 305, 420),
    'amara-toure': ('page', MORE / 'WhatsApp Image 2026-09-25 at 15.16.02.jpeg', 89, 129, 320, 462),
    'alpha-oumar-barry': ('page', MORE / 'WhatsApp Image 2026-09-25 at 15.16.03 (2).jpeg', 83, 97, 325, 426),
    'damantang-camara': ('page', MORE / 'WhatsApp Image 2026-09-25 at 15.16.03 (4).jpeg', 96, 123, 290, 392),
})


def trim_paper(img, thr=175):
    """Enlève les bords de papier (clairs) autour d'une photo cadrée à la main."""
    import cv2, numpy as np
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    rows, cols = g.mean(axis=1), g.mean(axis=0)
    y0, y1, x0, x1 = 0, len(rows), 0, len(cols)
    while y0 < y1 - 10 and rows[y0] > thr: y0 += 1
    while y1 > y0 + 10 and rows[y1 - 1] > thr: y1 -= 1
    while x0 < x1 - 10 and cols[x0] > thr: x0 += 1
    while x1 > x0 + 10 and cols[x1 - 1] > thr: x1 -= 1
    return img[y0 + 3:y1 - 3, x0 + 3:x1 - 3]


def photos(only=()):
    import cv2, numpy as np
    sys.path.insert(0, str(ROOT)); import nettoyer
    P.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['pdfimages', '-png', str(PDF1), f'{tmp}/i'], check=True)
        for slug, spec in PORTRAITS.items():
            if only and slug not in only:
                continue
            dst = P / f'{slug}.png'
            if spec[0] == 'detoure':
                img = cv2.imread(str(spec[1]), cv2.IMREAD_UNCHANGED)
                if img.shape[2] == 4:   # fond opaque : on aplatit sur blanc
                    a = img[:, :, 3:4].astype(np.float32) / 255
                    img = (img[:, :, :3] * a + 255 * (1 - a)).astype(np.uint8)
                out = nettoyer.upscale(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), 3000)
            elif spec[0] == 'pdf':
                img = cv2.imread(f'{tmp}/i-{4 + 2 * spec[1]:03d}.png')
                out = nettoyer.nb(img[240:954, 270:831], 3000)   # à l'intérieur du passe-partout blanc
            else:
                _, src, x0, y0, x1, y1 = spec
                img = trim_paper(cv2.imread(str(src))[y0:y1, x0:x1])
                out = nettoyer.nb(img, 3000)
            cv2.imwrite(str(dst), out)
            print('✓', dst.name, out.shape[1], '×', out.shape[0])


# ----------------------------------------------------------------------------- la page
THEMES = {
    'ivoire': dict(bg='#F4EFE3', ink='#0D2318', ink2='#1F1F1B', grey='#6B6A62', gold='#B8892B', foot='#0D2318', mat='#FFFFFF',
                   shadow='rgba(20,30,20,.28)', name='A-Ivoire-et-vert'),
    'nuit': dict(bg='#0B1A33', ink='#F4EFE3', ink2='#E8E2D2', grey='#B9B2A0', gold='#DCC07A', foot='#071224', mat='#F4EFE3',
                 shadow='rgba(0,0,0,.55)', name='B-Nuit-et-or'),
}

# Géométrie mesurée sur le PDF d'origine (points) : marge 60, fiches de 147 × 183 (passe-partout 6),
# texte à 162 du bord de la fiche, colonnes au pas de 414,7 ; pied de 93.
W, H, M, COL, ROWS = 3000, 1350, 60, 414.7, 4
TOP, FOOT = 187.5, 93
ROW = (H - FOOT - TOP - 10) / ROWS


def css(t):
    return f'''
@font-face {{ font-family: "Bebas"; src: url({uri(F / "BebasNeue-Regular.ttf")}); }}
@font-face {{ font-family: "BarlowC"; src: url({uri(F / "BarlowCondensed-Regular.ttf")}); font-weight: 400; }}
@font-face {{ font-family: "BarlowC"; src: url({uri(F / "BarlowCondensed-Medium.ttf")}); font-weight: 500; }}
@font-face {{ font-family: "BarlowC"; src: url({uri(F / "BarlowCondensed-SemiBold.ttf")}); font-weight: 600; }}
@font-face {{ font-family: "Barlow"; src: url({uri(F / "Barlow-Regular.ttf")}); font-weight: 400; }}
@font-face {{ font-family: "Questrial"; src: url({uri(F / "Questrial-Regular.ttf")}); }}
@page {{ size: {W}pt {H}pt; margin: 0; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: {W}pt; height: {H}pt; overflow: hidden; background: {t['bg']}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.sheet {{ position: relative; width: {W}pt; height: {H}pt; background: {t['bg']}; color: {t['ink2']}; font-family: "Barlow", sans-serif; }}
.strip {{ position: absolute; top: 0; left: 0; right: 0; height: 15pt; display: flex; }}
.strip i {{ flex: 1; }} .strip i:nth-child(1) {{ background: #CE1126; }} .strip i:nth-child(2) {{ background: #FCD116; }} .strip i:nth-child(3) {{ background: #009460; }}
.kicker {{ position: absolute; left: {M}pt; top: 49pt; font-family: "BarlowC"; font-weight: 500; font-size: 16.5pt; letter-spacing: .3em; text-transform: uppercase; color: {t['gold']}; }}
.kicker sup {{ font-size: 10pt; vertical-align: top; position: relative; top: 1pt; }}
h1 {{ position: absolute; left: {M}pt; top: 68pt; font-family: "Bebas"; font-weight: 400; font-size: 88.5pt; line-height: 1; letter-spacing: .01em; color: {t['ink']}; }}
.right {{ position: absolute; right: {M}pt; top: 91pt; text-align: right; }}
.right .a {{ font-family: "BarlowC"; font-weight: 500; font-size: 22.5pt; letter-spacing: .06em; text-transform: uppercase; color: {t['ink']}; line-height: 1.2; }}
.right .b {{ font-family: "BarlowC"; font-weight: 400; font-size: 18pt; letter-spacing: .08em; color: {t['grey']}; margin-top: 2pt; }}
.grid {{ position: absolute; left: {M}pt; top: {TOP}pt; width: {COL * 7}pt; display: grid; grid-template-columns: repeat(7, {COL}pt); grid-auto-rows: {ROW}pt; grid-auto-flow: dense; }}
.card {{ position: relative; padding-left: 162pt; padding-right: 22pt; min-height: 190pt; }}
.card.w2 {{ grid-column: span 2; }}
.pf {{ position: absolute; left: 0; top: 1.5pt; width: 147pt; height: 183pt; background: {t['mat']}; padding: 6pt; box-shadow: 0 6pt 16pt {t['shadow']}, 0 1pt 3pt rgba(0,0,0,.18); }}
.pf img {{ display: block; width: 100%; height: 100%; object-fit: cover; object-position: center 15%; }}
.name {{ font-family: "BarlowC"; font-weight: 600; font-size: 20.2pt; line-height: 1.2; letter-spacing: .01em; text-transform: uppercase; color: {t['ink']}; }}
.dates {{ font-family: "BarlowC"; font-weight: 500; font-size: 13.5pt; line-height: 1.2; letter-spacing: .04em; color: {t['gold']}; margin-top: 3.5pt; }}
.role {{ font-family: "BarlowC"; font-weight: 500; font-size: 11.2pt; line-height: 15pt; letter-spacing: .06em; text-transform: uppercase; color: {t['grey']}; margin-top: 5pt; }}
.bio {{ font-family: "Barlow"; font-size: 13.5pt; line-height: 18.5pt; color: {t['ink2']}; margin-top: 8pt; }}
.foot {{ position: absolute; left: 0; right: 0; bottom: 0; height: {FOOT}pt; background: {t['foot']}; }}
.sgg {{ position: absolute; left: {M}pt; top: 21pt; display: flex; align-items: center; gap: 12pt; }}
.sgg img {{ height: 54pt; }}
.sgg .t1 {{ font-family: "Questrial"; font-size: 21pt; line-height: 1; color: #fff; }}
.sgg .t2 {{ font-family: "Questrial"; font-size: 10.5pt; color: #D4A63A; margin-top: 4pt; }}
.week {{ position: absolute; left: 0; right: 0; top: 38pt; text-align: center; font-family: "BarlowC"; font-weight: 500; font-size: 16.5pt; letter-spacing: .22em; text-transform: uppercase; color: #F4EFE3; }}
.cda {{ position: absolute; right: {M}pt; top: 19pt; height: 58pt; }}
'''


def html(theme):
    t = THEMES[theme]
    cards = ''
    for slug, name, dates, role, bio, w in CARDS:
        cards += f'''<div class="card{' w2' if w == 2 else ''}"><div class="pf"><img src="{portrait_uri(slug)}"></div>
<div class="name">{name}</div><div class="dates">{dates}</div><div class="role">{role}</div><div class="bio">{bio}</div></div>\n'''
    mur = ROOT / 'photos' / 'mur'
    return f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Les Compagnons de l'Indépendance</title><style>{css(t)}</style></head>
<body><div class="sheet">
<div class="strip"><i></i><i></i><i></i></div>
<div class="kicker">République de Guinée · 68<sup>e</sup> anniversaire de l'Indépendance</div>
<h1>Les Compagnons de l'Indépendance</h1>
<div class="right"><div class="a">Celles et ceux qui ont bâti l'État guinéen</div><div class="b">1953 – 1984</div></div>
<div class="grid">
{cards}</div>
<div class="foot">
<div class="sgg"><img src="{uri(mur / 'logo-sgg-icone.png')}"><div><div class="t1">sgg.gov.gn</div><div class="t2">Secrétariat Général du Gouvernement</div></div></div>
<div class="week">Semaine de la Fête Nationale · 25 septembre – 2 octobre 2026</div>
<img class="cda" src="{uri(mur / 'logo-cda.png')}">
</div>
</div></body></html>'''


def build(theme):
    OUT.mkdir(parents=True, exist_ok=True)
    missing = [s for s, *_ in CARDS if not (P / f'{s}.png').exists()]
    if missing:
        sys.exit(f'portraits manquants ({", ".join(missing)}) : lancer d\'abord  ../restauration/.venv/bin/python compagnons.py photos')
    stem = f'Compagnons-{THEMES[theme]["name"]}'
    h = OUT / f'{stem}.html'
    h.write_text(html(theme), encoding='utf-8')
    pdf, png = OUT / f'{stem}.pdf', OUT / f'{stem}.png'
    base = [CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars']
    subprocess.run(base + ['--no-pdf-header-footer', f'--print-to-pdf={pdf}', h.resolve().as_uri()], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # PNG plein format : 8000 × 3600 px (≈ 34 dpi sur 6 m, comme l'export du 24 septembre)
    subprocess.run(base + ['--force-device-scale-factor=2', f'--window-size={W * 4 // 3},{H * 4 // 3}', f'--screenshot={png}', h.resolve().as_uri()], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    h.unlink()
    print('✓', pdf.name, png.name)


if __name__ == '__main__':
    args = sys.argv[1:]
    if args and args[0] == 'photos':
        photos(args[1:])
    else:
        build('nuit' if '--nuit' in args else 'ivoire')
