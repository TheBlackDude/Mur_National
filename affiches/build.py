"""Affiches murales de la Semaine de l'Indépendance · An 68 (Présidence / SGG).

Chaque affiche est une page HTML A1 (594 × 841 mm) composée ici, puis rendue en PDF
(texte vectoriel) et en PNG d'aperçu par Google Chrome en mode headless.

    python3 build.py            # les dix affiches
    python3 build.py 01 07      # une sélection

Identité : trois actes, trois fonds — crème d'archive (Héritage), vert Présidence
(Renouveau), nuit (Avenir) — un seul système : Baskerville / Optima, or, armoiries,
tricolore, logo 68, pied « 68e Fête Nationale · 2 octobre 2026 ».
"""
import base64, json, pathlib, re, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent
ASSETS, PHOTOS, HTML, OUT = ROOT / 'assets', ROOT / 'photos', ROOT / 'html', ROOT / 'sortie'
GEO = ROOT.parent / 'web' / 'src' / 'data' / 'geo' / 'guinea.json'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

FORMATS = {
    'a1': dict(dir='', css=''),
    'rollup': dict(dir='roll-up-100x200', css='''
@page { size: 1000mm 2000mm; margin: 0; }
html, body { width: 1000mm; height: 2000mm; }
.tri { height: 12mm; }
.mount { top: 32mm; left: 32mm; right: 32mm; bottom: 32mm; border-width: 1.2mm; outline-width: .45mm; outline-offset: 2.8mm; }
.page { top: 52mm; left: 57mm; right: 57mm; bottom: 50mm; }
.scale { zoom: 1.6837; width: 526mm; height: 1127mm; display: flex; flex-direction: column; }
.scale .body { flex: 1 1 auto; display: flex; flex-direction: column; justify-content: space-between; }
.scale footer { margin-top: 12mm; }
.scale .body > .grid, .scale .body > .tl, .scale .body > .wrap, .scale .body > .rows, .scale .body > .cols, .scale .body > .mosaic { flex: 1 1 auto; align-content: space-between; }
.scale .body > .rows { justify-content: space-between; }
.scale .wrap > .tl { display: flex; flex-direction: column; justify-content: space-between; }
'''),
}
FORMAT = 'a1'

MIME = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml'}


def uri(name):
    cands = [PHOTOS / name, ASSETS / name]
    alt = {'.png': '.jpg', '.jpg': '.png'}
    stem, suf = pathlib.Path(name).stem, pathlib.Path(name).suffix
    if suf in alt:
        cands += [PHOTOS / (stem + alt[suf]), ASSETS / (stem + alt[suf])]
    p = next(c for c in cands if c.exists())
    return f'data:{MIME[p.suffix]};base64,' + base64.b64encode(p.read_bytes()).decode()


# ----------------------------------------------------------------------------- CSS commun
CSS = r'''
@page { size: 594mm 841mm; margin: 0; }
:root {
  --green: #0F3B2E; --green-2: #16503F; --gold: #B8892E; --gold-2: #DCC07A; --gold-3: #F0DFA8;
  --cream: #F4EFE3; --mat: #FBF8F1; --ink: #1B1A17; --ink-2: #4A463F; --night: #0B1A33; --night-2: #12264A;
  --red: #CE1126; --yellow: #FCD116; --gn: #009460;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 594mm; height: 841mm; overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  font-family: "Baskerville", "Hoefler Text", serif; color: var(--ink); background: var(--cream); }
body { position: relative; }
sup { font-size: .65em; vertical-align: super; line-height: 0; }
.opt { font-family: "Optima", "Gill Sans", sans-serif; }
.tri { position: absolute; left: 0; right: 0; height: 7mm; display: flex; z-index: 5; }
.tri i { flex: 1; } .tri i:nth-child(1) { background: var(--red); } .tri i:nth-child(2) { background: var(--yellow); } .tri i:nth-child(3) { background: var(--gn); }
.tri.top { top: 0; } .tri.bottom { bottom: 0; }
.mount { position: absolute; top: 19mm; left: 19mm; right: 19mm; bottom: 19mm; border: .7mm solid var(--gold); outline: .25mm solid var(--gold); outline-offset: 1.6mm; pointer-events: none; }
.page { position: absolute; top: 31mm; left: 34mm; right: 34mm; bottom: 30mm; display: flex; flex-direction: column; }

/* en-tête */
.kicker { display: flex; justify-content: space-between; align-items: center; font-family: "Optima", sans-serif; font-size: 5.2mm; letter-spacing: .28em; text-transform: uppercase; color: var(--gold); }
.kicker b { font-weight: 600; color: var(--green); }
.title { margin-top: 10mm; }
.title .over { font-family: "Optima", sans-serif; font-size: 7mm; letter-spacing: .3em; text-transform: uppercase; color: var(--gold); font-weight: 600; margin-bottom: 4mm; }
.title h1 { font-weight: normal; font-size: 34mm; line-height: 1; letter-spacing: -.005em; color: var(--green); }
.title h1 .big { font-size: 44mm; }
.title .sub { font-style: italic; font-size: 11mm; color: var(--ink-2); margin-top: 5mm; line-height: 1.25; }
.rule { height: .4mm; background: var(--gold); position: relative; margin: 8mm 0; }
.rule::after { content: ""; position: absolute; left: 50%; top: -1.8mm; width: 4mm; height: 4mm; transform: translateX(-50%) rotate(45deg); background: var(--gold); }
.rule.left::after { left: 0; transform: rotate(45deg); }

/* pied */
footer { margin-top: auto; padding-top: 6mm; border-top: .35mm solid var(--gold); display: flex; align-items: center; justify-content: space-between; gap: 8mm; }
footer .who { display: flex; align-items: center; gap: 6mm; }
footer .who img { height: 26mm; }
footer .who div { font-family: "Optima", sans-serif; font-size: 4.6mm; letter-spacing: .12em; text-transform: uppercase; color: var(--green); line-height: 1.5; }
footer .who div b { display: block; font-size: 5.4mm; letter-spacing: .26em; font-weight: 600; }
footer .fete { display: flex; align-items: center; gap: 5mm; text-align: right; font-family: "Optima", sans-serif; font-size: 4.6mm; letter-spacing: .2em; text-transform: uppercase; color: var(--gold); line-height: 1.5; }
footer .fete img { height: 26mm; }
footer .num { font-family: "Optima", sans-serif; font-size: 4.4mm; letter-spacing: .3em; color: var(--gold); }

/* cadres photo */
.frame { background: var(--mat); border: .6mm solid var(--gold); padding: 3mm; display: inline-block; }
.frame img { display: block; border: .3mm solid var(--gold-2); outline: .2mm solid var(--gold); outline-offset: .6mm; background: #fff; width: 100%; object-fit: cover; }
.cap { font-family: "Optima", sans-serif; font-size: 4.4mm; letter-spacing: .16em; text-transform: uppercase; color: var(--gold); margin-top: 3mm; }
.cap i { font-family: "Baskerville", serif; font-style: italic; text-transform: none; letter-spacing: 0; color: var(--ink-2); font-size: 5mm; }

/* portraits en arche */
.arch { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: cover; object-position: top; border-radius: 50% 50% 0 0 / 40% 40% 0 0; border: .5mm solid var(--gold); background: #e9e2d2; }
.name { font-size: 10.5mm; line-height: 1.1; margin-top: 4mm; }
.dates { font-family: "Optima", sans-serif; font-size: 5.6mm; letter-spacing: .2em; color: var(--gold); margin: 1.5mm 0 2.5mm; }
.line { font-size: 6.6mm; line-height: 1.32; color: var(--ink-2); }
.big-n { font-size: 26mm; line-height: 1; color: var(--green); }
.big-n small { font-size: 9mm; font-family: "Optima", sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--gold); display: block; margin-top: 2mm; }

/* thèmes */
body.renouveau, body.renouveau .frame { background: var(--green); }
body.renouveau { color: var(--cream); }
body.renouveau .title h1, body.renouveau .kicker b, body.renouveau footer .who div, body.renouveau .big-n, body.renouveau .name { color: var(--cream); }
body.renouveau .title .sub, body.renouveau .line, body.renouveau .cap i { color: var(--gold-3); }
body.renouveau .kicker, body.renouveau .title .over, body.renouveau .dates, body.renouveau .cap { color: var(--gold-2); }
body.renouveau .frame { border-color: var(--gold-2); }
body.avenir, body.avenir .frame { background: var(--night); }
body.avenir { color: var(--cream); }
body.avenir .title h1, body.avenir .kicker b, body.avenir footer .who div, body.avenir .big-n, body.avenir .name { color: var(--cream); }
body.avenir .title .sub, body.avenir .line, body.avenir .cap i { color: var(--gold-3); }
body.avenir .kicker, body.avenir .title .over, body.avenir .dates, body.avenir .cap { color: var(--gold-2); }
'''


def shell(theme, kicker_right, body, num, extra_css='', zoom=1.0):
    fmt = FORMATS[FORMAT]
    return f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>{CSS}{extra_css}
.body {{ zoom: {zoom}; width: calc(526mm / {zoom}); }}{fmt['css']}</style></head>
<body class="{theme}">
<div class="tri top"><i></i><i></i><i></i></div><div class="mount"></div>
<div class="page"><div class="scale">
<div class="kicker"><span><b>République de Guinée</b> · Travail – Justice – Solidarité</span><span>{kicker_right}</span></div>
<div class="body">{body}</div>
<footer>
  <div class="who"><img src="{uri('armoiries.png')}" alt=""><div><b>Secrétariat Général du Gouvernement</b></div></div>
  <div class="fete"><div>68<sup>e</sup> Fête Nationale<br>2 octobre 2026</div><img src="{uri('logo68.png')}" alt=""></div>
</footer>
</div></div>
<div class="tri bottom"><i></i><i></i><i></i></div>
</body></html>'''


def title(over, h1, sub=''):
    s = f'<div class="sub">{sub}</div>' if sub else ''
    return f'<div class="title"><div class="over">{over}</div><h1>{h1}</h1>{s}</div>'


# ----------------------------------------------------------------------------- carte
def guinea_map(width_mm, rail=True, stroke='#DCC07A', fill='rgba(220,192,122,.10)', highlight=()):
    geo = json.loads(GEO.read_text())
    paths = []
    for s in geo['shapes']:
        hl = s['code'] in highlight
        paths.append(f'<path d="{s["d"]}" fill="{"rgba(220,192,122,.42)" if hl else fill}" stroke="{stroke}" stroke-width="{1.6 if hl else .9}" stroke-linejoin="round"/>')
    extra = ''
    if rail:
        # tracé schématique du TransGuinéen : Simandou → Kérouané → Kissidougou → Faranah → Mamou → Kindia → Forécariah → Moribaya
        pts = [(855, 522), (793, 454), (679, 470), (577, 400), (452, 300), (330, 350), (272, 440), (222, 470)]
        d = 'M' + ' L'.join(f'{x},{y}' for x, y in pts)
        extra = f'''<path d="{d}" fill="none" stroke="#0B1A33" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity=".6"/>
<path d="{d}" fill="none" stroke="#F0DFA8" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="{d}" fill="none" stroke="#0B1A33" stroke-width="1.6" stroke-dasharray="9 9" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="855" cy="522" r="11" fill="#F0DFA8" stroke="#0B1A33" stroke-width="3"/>
<circle cx="222" cy="470" r="11" fill="#F0DFA8" stroke="#0B1A33" stroke-width="3"/>
<text x="870" y="500" font-family="Optima" font-size="22" letter-spacing="3" fill="#F0DFA8">SIMANDOU</text>
<text x="860" y="524" font-family="Baskerville" font-style="italic" font-size="19" fill="#F0DFA8">Blocs 1 – 4 · Beyla</text>
<text x="150" y="512" font-family="Optima" font-size="22" letter-spacing="3" fill="#F0DFA8">MORIBAYA</text>
<text x="128" y="536" font-family="Baskerville" font-style="italic" font-size="19" fill="#F0DFA8">Port en eau profonde · Forécariah</text>
<text x="500" y="345" font-family="Optima" font-size="20" letter-spacing="3" fill="#F0DFA8" transform="rotate(-30 500 345)">650 KM DE VOIE FERRÉE</text>
<text x="196" y="416" font-family="Optima" font-size="18" letter-spacing="2" fill="#F0DFA8">CONAKRY</text>
<circle cx="193" cy="425" r="6" fill="#F0DFA8"/>'''
    return f'<svg viewBox="-40 -10 1080 780" width="{width_mm}mm" style="display:block;overflow:visible">{"".join(paths)}{extra}</svg>'


# ----------------------------------------------------------------------------- affiches
def a01():
    css = '''
.non { font-size: 208mm; line-height: .86; font-weight: bold; color: var(--green); letter-spacing: -.02em; margin-top: 2mm; }
.non-sub { font-style: italic; font-size: 15mm; color: var(--ink-2); margin: 4mm 0 0 2mm; }
.row { display: flex; gap: 12mm; margin-top: 10mm; align-items: stretch; }
.actes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8mm; margin-top: 12mm; }
.actes div { border-top: .5mm solid var(--gold); padding-top: 4mm; }
.actes b { display: block; font-weight: normal; font-size: 12.5mm; line-height: 1.05; color: var(--green); }
.actes span { display: block; font-size: 6.2mm; line-height: 1.32; color: var(--ink-2); margin-top: 2mm; }
.row .frame { width: 270mm; flex: none; align-self: flex-start; }
.res { flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
.tally { display: flex; flex-direction: column; gap: 6mm; }
.t { border-left: 1.2mm solid var(--gold); padding-left: 7mm; }
.t .n { font-size: 32mm; line-height: 1; color: var(--green); }
.t .l { font-family: "Optima", sans-serif; font-size: 7mm; letter-spacing: .22em; text-transform: uppercase; color: var(--gold); margin-top: 2mm; }
.bar { height: 9mm; background: #E6DDC8; margin-top: 4mm; position: relative; }
.bar i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--green); }
.quote { font-size: 14.5mm; line-height: 1.28; font-style: italic; color: var(--green); margin-top: 10mm; }
.quote .by { display: block; font-style: normal; font-family: "Optima", sans-serif; font-size: 5.4mm; letter-spacing: .22em; text-transform: uppercase; color: var(--gold); margin-top: 5mm; }
.after { margin-top: 12mm; padding: 10mm 12mm; background: var(--green); color: var(--cream); font-size: 10.5mm; line-height: 1.3; display: flex; align-items: center; gap: 10mm; }
.after b { font-size: 24mm; font-weight: normal; color: var(--gold-2); white-space: nowrap; line-height: 1; }
'''
    body = f'''
<div class="title"><div class="over">Acte I · Héritage · 28 septembre 1958</div></div>
<div class="non">NON</div>
<div class="non-sub">Le seul « non » de l'Afrique francophone — un peuple choisit sa souveraineté.</div>
<div class="row">
  <div><div class="frame"><img src="{uri('de-gaulle-sekou-toure-1958.png')}" style="aspect-ratio:5/3"></div>
  <div class="cap">Conakry, 25 août 1958 <i>— le général de Gaulle et Sékou Touré, un mois avant le référendum</i></div></div>
  <div class="res">
    <div class="tally">
      <div class="t"><div class="n">1 136 324</div><div class="l">voix pour le « non »</div><div class="bar"><i style="width:95.2%"></i></div></div>
      <div class="t"><div class="n">56 981</div><div class="l">voix pour le « oui »</div><div class="bar"><i style="width:4.8%"></i></div></div>
    </div>
    <div class="quote">« Nous préférons la pauvreté dans la liberté à la richesse dans l'esclavage. »
      <span class="by">Ahmed Sékou Touré · Conakry, 25 août 1958</span></div>
  </div>
</div>
<div class="after"><b>2 octobre 1958</b><span>Quatre jours après le référendum, la République de Guinée est proclamée. Le 12 décembre, elle devient le 82<sup>e</sup> membre des Nations unies.</span></div>
<div class="actes">
  <div><b>2 octobre 1958</b><span>Proclamation de l’indépendance : la République de Guinée est née.</span></div>
  <div><b>Novembre 1958</b><span>La première Constitution de la République est adoptée.</span></div>
  <div><b>12 décembre 1958</b><span>La Guinée devient le 82<sup>e</sup> État membre des Nations unies.</span></div>
  <div><b>1<sup>er</sup> mars 1960</b><span>Le franc guinéen est émis : la souveraineté monétaire.</span></div>
</div>
'''
    return shell('heritage', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '01', css, zoom=1.17)


def a02():
    css = '''
.hero { display: flex; gap: 14mm; margin-top: 8mm; align-items: flex-end; }
.hero .p { width: 190mm; flex: none; }
.hero .txt { flex: 1; padding-bottom: 6mm; }
.hero .name { font-size: 19mm; } .hero .dates { font-size: 7mm; } .hero .line { font-size: 8.4mm; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10mm; margin-top: 12mm; }
.tl { margin-top: 12mm; position: relative; height: 26mm; }
.tl .bar { position: absolute; left: 0; right: 0; top: 7mm; height: .5mm; background: var(--gold); }
.tl .pt { position: absolute; top: 0; transform: translateX(-50%); text-align: center; font-family: "Optima", sans-serif; }
.tl .pt::before { content: ""; display: block; width: 4.5mm; height: 4.5mm; border-radius: 50%; background: var(--gold); margin: 5mm auto 2mm; }
.tl .pt b { display: block; font-size: 6.4mm; letter-spacing: .1em; color: var(--green); font-weight: 600; }
.tl .pt span { font-size: 4.6mm; letter-spacing: .1em; text-transform: uppercase; color: var(--gold); }
.tl .pt.end::before { background: var(--red); width: 6mm; height: 6mm; margin-top: 4.3mm; }
'''
    def card(img, name, dates, line):
        return f'<div><img class="arch" src="{uri(img)}"><div class="name">{name}</div><div class="dates">{dates}</div><div class="line">{line}</div></div>'
    body = f'''
{title('Acte I · Héritage · Les résistants', 'Ceux qui ont dit <span class="big">non</span><br>avant nous', 'Avant 1958, un demi-siècle de refus : de l’empire du Wassoulou à la Guinée forestière, la souveraineté s’est défendue les armes à la main.')}
<div class="hero">
  <div class="p"><img class="arch" src="{uri('samory-toure.png')}"></div>
  <div class="txt"><div class="name">Almamy Samory Touré</div><div class="dates">1882 – 1898</div>
  <div class="line">Fondateur de l'empire du Wassoulou, il a tenu tête aux Colonies françaises pendant dix-sept ans. Capturé à Guélémou, déporté au Gabon, jamais soumis.</div></div>
</div>
<div class="grid">
  {card('alpha-yaya-diallo.png', 'Alpha Yaya Diallo', '1905 – 1912', 'Roi de Labé, il refuse l’ordre colonial. Déporté au Dahomey puis en Mauritanie, il meurt en exil à Port-Étienne.')}
  {card('bocar-biro.png', 'Almamy Bocar Biro', '14 novembre 1896', 'Dernier almamy du Fouta-Djalon, il choisit le combat plutôt que la soumission et tombe à Porédaka.')}
  {card('dinah-salifou.png', 'Dinah Salifou', '1889 – 1897', 'Roi des Nalou, reçu à Paris pour l’Exposition universelle, puis déporté quand il refuse de céder sa souveraineté.')}
  {card('togba-pivi.png', 'Zébéla Togba Pivi', '1907 – 1911', 'Chef guerzé de N’Zébéla, il mène la résistance de la Guinée forestière pendant quatre ans avant d’être capturé.')}
</div>
<div class="tl"><div class="bar"></div>
  <div class="pt" style="left:4%"><b>1882</b><span>Samory</span></div>
  <div class="pt" style="left:24%"><b>1896</b><span>Porédaka</span></div>
  <div class="pt" style="left:40%"><b>1897</b><span>Dinah Salifou</span></div>
  <div class="pt" style="left:56%"><b>1911</b><span>Togba Pivi</span></div>
  <div class="pt" style="left:70%"><b>1912</b><span>Alpha Yaya</span></div>
  <div class="pt end" style="left:92%"><b>2 octobre 1958</b><span>Leur combat s'achève</span></div>
</div>
'''
    return shell('heritage', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '02', css, zoom=1.13)


def a03():
    css = '''
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 11mm 9mm; margin-top: 10mm; }
.c { position: relative; }
.c .badge { position: absolute; top: -5mm; left: -4mm; width: 24mm; height: 24mm; border-radius: 50%; background: var(--green); color: var(--gold-2); border: .8mm solid var(--gold); display: flex; align-items: center; justify-content: center; font-size: 10mm; line-height: 1; z-index: 2; }
.c .badge sup { font-size: 5mm; }
.c .name { font-size: 9.4mm; }
.c .role { font-family: "Optima", sans-serif; font-size: 5.2mm; letter-spacing: .06em; line-height: 1.3; color: var(--green); font-weight: 600; margin-top: 1.5mm; }
.c .line { font-size: 5.6mm; margin-top: 2mm; }
'''
    def card(img, badge, name, role, line, dates):
        return f'<div class="c"><div class="badge">{badge}</div><img class="arch" src="{uri(img)}"><div class="name">{name}</div><div class="dates">{dates}</div><div class="role">{role}</div><div class="line">{line}</div></div>'
    body = f'''
{title('Acte I · Héritage · Les premières et les premiers', 'Des Guinéennes et des Guinéens<br><span class="big">en premier</span>', 'Ils ont ouvert la voie — pour la Guinée, pour l’Afrique et pour le monde.')}
<div class="grid">
  {card('diallo-telli.png', '1<sup>er</sup>', 'Boubacar Diallo Telli', 'Premier Secrétaire général de l’Organisation de l’Unité Africaine', 'Premier ambassadeur de la Guinée à l’ONU dès 1958, il bâtit l’administration de l’OUA à Addis-Abeba.', '1925 – 1977 · OUA 1964 – 1972')}
  {card('jeanne-martin-cisse-fig.png', '1<sup>re</sup>', 'Jeanne Martin Cissé', 'Première femme à présider le Conseil de sécurité des Nations unies', 'Représentante permanente de la Guinée à l’ONU, elle préside le Conseil en 1972, puis devient ministre des Affaires sociales.', '1926 – 2017 · ONU 1972')}
  {card('loffo-camara.png', '1<sup>re</sup>', 'Loffo Camara', 'Première femme membre d’un gouvernement en Guinée', 'Sage-femme et syndicaliste de Macenta, secrétaire d’État aux Affaires sociales : elle fonde l’action médico-sociale de l’État.', '1925 – 1971 · Gouvernement 1961')}
  {card('lansana-beavogui.png', '1<sup>er</sup>', 'Dr Louis Lansana Béavogui', 'Premier Premier ministre de la République de Guinée', 'Médecin, diplomate, il crée la Primature et le Secrétariat Général du Gouvernement en 1972.', '1923 – 1984 · Primature 1972 – 1984')}
  {card('saifoulaye-diallo.png', '1<sup>er</sup>', 'Saïfoulaye Diallo', 'Premier président de l’Assemblée nationale de la République', 'Président de l’Assemblée territoriale en 1957, gardien de la loi et du budget de la jeune République.', '1923 – 1981 · Assemblée 1957 – 1963')}
  {card('mafory-bangoura-fig.png', '1<sup>re</sup>', 'Hadja Mafory Bangoura', 'Première grande figure du mouvement des femmes', 'Meneuse de la grève des 73 jours de 1953, présidente du Comité national des femmes, elle porte le Code de la famille.', 'v. 1910 – 1976 · Grève 1953')}
  {card('fodeba-keita-comp.png', '1<sup>er</sup>', 'Fodéba Keïta', 'Premier ballet africain sur les scènes du monde — et l’auteur de « Liberté »', 'Fondateur des Ballets Africains en 1952, co-auteur de l’hymne national de la Guinée.', '1921 – 1969 · Ballets 1952')}
  {card('nabi-youla.png', '1<sup>er</sup>', 'Nabi Youla', 'Premier ambassadeur de la Guinée en France', '« Le Doyen » : né à Forécariah, il renoue le dialogue avec de Gaulle après le « Non » et ouvre la voie à l’entrée de la Guinée à l’ONU.', '1918 – 2014 · Paris 1959')}
</div>
'''
    return shell('heritage', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '03', css, zoom=1.22)


def a04():
    css = '''
.mosaic { display: grid; grid-template-columns: 1.15fr 1fr 1fr; grid-template-rows: auto auto; gap: 8mm; margin-top: 9mm; }
.mosaic .frame { display: block; }
.mosaic .frame img { aspect-ratio: 4/3; }
.mosaic .tall { grid-row: span 2; } .mosaic .tall img { aspect-ratio: 3/4.55; }
.mosaic .cap { margin-top: 2.5mm; font-size: 4.2mm; }
.mosaic .cap i { font-size: 4.8mm; }
.text { margin-top: 9mm; display: flex; gap: 12mm; }
.text .lead { flex: 1.2; font-size: 8.8mm; line-height: 1.32; }
.text .lead b { color: var(--gold-2); font-weight: normal; }
.text .list { flex: 1; border-left: .5mm solid var(--gold-2); padding-left: 8mm; }
.text .list div { font-family: "Optima", sans-serif; font-size: 5.6mm; letter-spacing: .1em; line-height: 1.45; text-transform: uppercase; color: var(--gold-3); }
.text .list div b { color: var(--cream); font-weight: 600; display: inline-block; width: 26mm; }
'''
    def ph(img, cap, sub, cls='', ar=''):
        st = f' style="aspect-ratio:{ar}"' if ar else ''
        return f'<div class="{cls}"><div class="frame" style="width:100%"><img src="{uri(img)}"{st}></div><div class="cap">{cap} <i>{sub}</i></div></div>'
    body = f'''
{title('Acte I · Héritage · Le phare panafricain', 'Conakry,<br>capitale des libertés', 'Terre d’accueil des combattants de l’Afrique libre, la Guinée a mis son indépendance au service de celle des autres.')}
<div class="mosaic">
  {ph('amilcar-cabral.png', 'Amílcar Cabral', '— avec les combattants du PAIGC, depuis Conakry', 'tall')}
  {ph('nkrumah-conakry.png', 'Kwame Nkrumah', '— dans sa résidence de Conakry, 1966')}
  {ph('miriam-makeba.png', 'Miriam Makeba', '— « Mama Africa » chante pour la Guinée')}
  {ph('addis-abeba-1963.png', 'Addis-Abeba, 1963', '— la Guinée, État fondateur de l’OUA')}
  {ph('union-ghana-guinee.png', 'Union Ghana-Guinée, 1958', '— première tentative d’États-Unis d’Afrique')}
</div>
<div class="text">
  <div class="lead">Deux mois après l'indépendance, <b>Nkrumah et Sékou Touré</b> fondent l'Union Ghana-Guinée. Renversé en 1966, le père de l'indépendance ghanéenne trouve refuge à Conakry, où il est nommé co-président. <b>Miriam Makeba</b>, bannie d'Afrique du Sud, y vit et représente la Guinée à l'ONU. <b>Stokely Carmichael</b>, devenu Kwame Ture, y consacre sa vie au panafricanisme. Depuis Conakry, le <b>PAIGC</b> d'Amílcar Cabral mène la lutte pour l'indépendance de la Guinée-Bissau et du Cap-Vert.</div>
  <div class="list">
    <div><b>1958</b> Union Ghana-Guinée</div>
    <div><b>1963</b> Fondation de l'OUA</div>
    <div><b>1964</b> Diallo Telli, 1<sup>er</sup> SG de l'OUA</div>
    <div><b>1966</b> Nkrumah, co-président</div>
    <div><b>1968</b> Makeba s'installe à Conakry</div>
    <div><b>1969</b> Kwame Ture à Conakry</div>
    <div><b>1973</b> Indépendance de la Guinée-Bissau</div>
    <div style="margin-top:4mm; text-transform:none; letter-spacing:.02em; font-family:Baskerville; font-style:italic; font-size:6.4mm; color:var(--cream)">ANC, MPLA, FRELIMO, SWAPO : notre indépendance a servi la leur.</div>
  </div>
</div>
'''
    return shell('renouveau', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '04', css, zoom=1.42)


def a05():
    css = '''
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9mm 9mm; margin-top: 9mm; }
.g .frame { width: 100%; } .g .frame img { aspect-ratio: 4/3; object-position: center top; }
.g .name { font-size: 9.2mm; margin-top: 3mm; }
.g .dates { margin: 1mm 0 1.5mm; font-size: 5mm; }
.g .line { font-size: 5.5mm; line-height: 1.3; }
'''
    def g(img, name, dates, line, pos=''):
        st = f' style="object-position:{pos}"' if pos else ''
        return f'<div class="g"><div class="frame"><img src="{uri(img)}"{st}></div><div class="name">{name}</div><div class="dates">{dates}</div><div class="line">{line}</div></div>'
    body = f'''
{title('Acte I · Héritage · Les géants de la culture et du sport', 'Les géants<br><span class="big">reconnus dans le monde</span>', 'De la scène à la page et au stade, la Guinée a donné au monde des noms que le monde n’a pas oubliés.')}
<div class="grid">
  {g('fodeba-keita.png', 'Fodéba Keïta & les Ballets Africains', '1952 · Ballet national en 1958', 'Ils ont porté la danse guinéenne sur les scènes du monde entier ; leur fondateur écrit « Liberté », l’hymne national.', 'center 15%')}
  {g('bembeya-jazz.png', 'Bembeya Jazz National', 'Beyla, 1961', 'L’orchestre a donné à l’Afrique « Regard sur le passé » et le son de la Guinée moderne.')}
  {g('sory-kandia-kouyate.png', 'Sory Kandia Kouyaté', '1933 – 1977', '« La voix d’or de l’Afrique » : le griot qui a fait entendre l’épopée mandingue aux Nations unies.')}
  {g('mory-kante.png', 'Mory Kanté', '1950 – 2020', '« Yéké Yéké » : premier tube africain n° 1 des classements européens, vendu à plus d’un million d’exemplaires.', 'center 20%')}
  {g('mamady-keita.png', 'Mamady Keïta', '1950 – 2021', 'Le maître du djembé a ouvert des écoles sur quatre continents : le rythme guinéen s’enseigne à Tokyo, Bruxelles et São Paulo.', 'center 25%')}
  {g('camara-laye.png', 'Camara Laye', '1928 – 1980', '« L’Enfant noir » (1953), et avec D. T. Niane « Soundjata ou l’épopée mandingue » (1960) : deux livres guinéens étudiés dans toute l’Afrique.', 'center 10%')}
  {g('tierno-monenembo.png', 'Tierno Monénembo', 'Prix Renaudot 2008', '« Le Roi de Kahel » : la littérature guinéenne au sommet des lettres françaises.', 'center 20%')}
  {g('hafia-fc.png', 'Hafia FC', '1972 · 1975 · 1977', 'Trois Coupes d’Afrique des clubs champions en six ans : le club de Conakry, roi du continent.')}
  {g('syli-national.jpg', 'Le Syli National', '1976 → aujourd’hui', 'Finaliste de la CAN 1976. De Chérif Souleymane à Naby Keïta et Serhou Guirassy, le Syli porte nos couleurs.')}
</div>
'''
    return shell('heritage', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '05', css, zoom=1.1)


def a06():
    css = '''
.wrap { display: flex; gap: 14mm; margin-top: 8mm; flex: 1; }
.left { width: 150mm; flex: none; }
.left .frame { width: 100%; } .left .frame img { aspect-ratio: 5/7; object-position: top; }
.left .cap { text-align: center; }
.left .motto { margin-top: 8mm; padding: 6mm 7mm; border: .4mm solid var(--gold-2); font-style: italic; font-size: 6.6mm; line-height: 1.35; color: var(--gold-3); text-align: center; }
.tl { flex: 1; position: relative; padding-left: 16mm; }
.tl::before { content: ""; position: absolute; left: 4mm; top: 4mm; bottom: 4mm; width: .6mm; background: var(--gold-2); }
.ev { position: relative; margin-bottom: 8.5mm; }
.ev::before { content: ""; position: absolute; left: -14.6mm; top: 3.5mm; width: 5.4mm; height: 5.4mm; border-radius: 50%; background: var(--gold-2); border: 1mm solid var(--green); box-shadow: 0 0 0 .6mm var(--gold-2); }
.ev .d { font-family: "Optima", sans-serif; font-size: 6.6mm; letter-spacing: .12em; text-transform: uppercase; color: var(--gold-2); font-weight: 600; }
.ev .h { font-size: 10.4mm; line-height: 1.12; color: var(--cream); margin: 1mm 0 1.5mm; }
.ev .t { font-size: 6mm; line-height: 1.32; color: var(--gold-3); }
.ev.key .h { color: var(--gold-2); }
'''
    def ev(d, h, t, key=False):
        return f'<div class="ev{" key" if key else ""}"><div class="d">{d}</div><div class="h">{h}</div><div class="t">{t}</div></div>'
    body = f'''
{title('Acte II · Renouveau · La refondation', 'La Refondation', 'Du CNRD à l’ordre constitutionnel rétabli : cinq années pour refonder l’État — 2021 – 2026.')}
<div class="wrap">
  <div class="left">
    <div class="frame"><img src="{uri('mamadi-doumbouya.png')}"></div>
    <div class="cap">Général Mamadi Doumbouya<br><i>Président de la République</i></div>
    <div class="motto">« Guinéennes et Guinéens, chers compatriotes… nous allons réécrire une constitution ensemble. »<br><span class="opt" style="font-style:normal;font-size:4.4mm;letter-spacing:.2em;text-transform:uppercase;color:var(--gold-2)">Communiqué n° 1 du CNRD · 5 septembre 2021</span></div>
  </div>
  <div class="tl">
    {ev('5 septembre 2021', 'Le CNRD prend ses responsabilités', 'Le Comité National du Rassemblement pour le Développement engage une transition inclusive et apaisée ; la continuité de l’État est garantie dès le 16 septembre.')}
    {ev('27 septembre 2021', 'La Charte de la Transition', 'Le cadre de la refondation : institutions, Conseil National de la Transition, calendrier des réformes.')}
    {ev('2022', 'Simandou débloqué', 'Renégociation des conventions : le plus grand gisement de fer inexploité au monde entre enfin en chantier.')}
    {ev('2022 – 2024', 'Le procès du 28 septembre 2009', 'Ouvert le 28 septembre 2022, treize ans jour pour jour après les faits ; la justice est rendue le 31 juillet 2024.')}
    {ev('2022 – 2025', 'Le pays en chantier', 'Plus de 2 252 km de routes, la cité administrative de Koloma, le CHU Donka rénové, Nimba Mining Company, première notation souveraine.')}
    {ev('Septembre 2025', 'Une nouvelle Constitution', 'Adoptée par référendum : la Guinée se donne sa loi fondamentale.', True)}
    {ev('Décembre 2025', 'L’élection présidentielle', 'Le peuple choisit son Président ; la transition se referme.', True)}
    {ev('11 novembre 2025', 'Le premier minerai de Simandou', 'À 11 h 11, le fer quitte la montagne : le plus grand chantier d’Afrique de l’Ouest entre en production.')}
    {ev('31 mai 2026', 'Législatives et municipales', 'Assemblée et communes élues : l’ordre constitutionnel est rétabli, la République restaurée.', True)}
  </div>
</div>
'''
    return shell('renouveau', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '06', css, zoom=1.4)


def a07():
    css = '''
.date { display: flex; align-items: baseline; gap: 10mm; margin-top: 6mm; }
.date .d { font-size: 62mm; line-height: 1; color: var(--gold-2); letter-spacing: -.01em; }
.date .h { font-size: 30mm; line-height: 1; color: var(--cream); font-style: italic; }
.date .w { font-family: "Optima", sans-serif; font-size: 6.2mm; letter-spacing: .24em; text-transform: uppercase; color: var(--gold-3); line-height: 1.5; margin-left: auto; text-align: right; }
.hero { margin-top: 8mm; }
.hero .frame { width: 100%; } .hero .frame img { aspect-ratio: 16/8.4; object-position: center 60%; }
.two { display: flex; gap: 9mm; margin-top: 7mm; }
.two > div { flex: 1; } .two .frame { width: 100%; } .two .frame img { aspect-ratio: 16/8.4; }
.nums { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8mm; margin-top: 10mm; }
.nums .k { border-top: .5mm solid var(--gold-2); padding-top: 4mm; }
.nums .k b { display: block; font-weight: normal; font-size: 21mm; line-height: 1; color: var(--gold-2); }
.nums .k span { display: block; font-family: "Optima", sans-serif; font-size: 5mm; letter-spacing: .14em; text-transform: uppercase; color: var(--gold-3); margin-top: 2.5mm; line-height: 1.4; }
.lead { margin-top: 9mm; font-size: 8.6mm; line-height: 1.32; color: var(--cream); }
.lead b { font-weight: normal; color: var(--gold-2); }
'''
    body = f'''
{title('Acte II · Renouveau · Simandou débloqué', 'Le fer de Simandou<br>a quitté la montagne')}
<div class="date"><div class="d">11.11.2025</div><div class="h">11 h 11</div>
  <div class="w">Le premier minerai<br>en présence des Présidents<br>du Gabon et du Rwanda</div></div>
<div class="hero"><div class="frame"><img src="{uri('simandou-11-novembre-2025.jpg')}"></div>
  <div class="cap">Port de Moribaya, 11 novembre 2025 <i>— le Président de la République lance l'exploitation du minerai de fer de Simandou</i></div></div>
<div class="two">
  <div><div class="frame"><img src="{uri('rail-650-km.jpg')}"></div><div class="cap">Le TransGuinéen <i>— premières locomotives de la Compagnie du TransGuinéen</i></div></div>
  <div><div class="frame"><img src="{uri('simandou-mine.jpg')}"></div><div class="cap">Le gisement <i>— blocs 1 à 4, monts Simandou</i></div></div>
</div>
<div class="nums">
  <div class="k"><b>650 km</b><span>de voie ferrée, de la Forestière à l'Atlantique</span></div>
  <div class="k"><b>20 Mds $</b><span>d'investissement : le plus grand chantier d'Afrique de l'Ouest</span></div>
  <div class="k"><b>2 Mds t</b><span>de minerai de fer à haute teneur</span></div>
  <div class="k"><b>2022</b><span>renégociation des conventions : le projet débloqué</span></div>
</div>
<div class="lead">Bloqué pendant des décennies, le plus grand gisement de fer inexploité au monde a été relancé par la <b>renégociation des conventions en 2022</b>. Une voie ferrée de la Forestière à l'Atlantique, un port en eau profonde à Moribaya, et le <b>11 novembre 2025 à 11 h 11</b>, le premier minerai.</div>
'''
    return shell('renouveau', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '07', css, zoom=1.0)


def a08():
    css = '''
.rows { display: flex; flex-direction: column; gap: 9mm; margin-top: 8mm; }
.r { display: flex; gap: 10mm; align-items: center; }
.r .frame { width: 300mm; flex: none; } .r .frame img { aspect-ratio: 3/1.55; }
.r.alt { flex-direction: row-reverse; }
.r .k { flex: 1; }
.r .k b { display: block; font-weight: normal; font-size: 34mm; line-height: 1; color: var(--gold-2); letter-spacing: -.01em; }
.r .k b small { font-size: 14mm; }
.r .k .l { font-family: "Optima", sans-serif; font-size: 6.4mm; letter-spacing: .18em; text-transform: uppercase; color: var(--gold-3); margin: 3mm 0 3mm; }
.r .k .t { font-size: 6.6mm; line-height: 1.32; color: var(--cream); }
.strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; margin-top: 10mm; }
.strip div { border-top: .5mm solid var(--gold-2); padding-top: 3.5mm; }
.strip b { display: block; font-weight: normal; font-size: 12.5mm; line-height: 1.05; color: var(--gold-2); }
.strip span { display: block; font-size: 5.4mm; line-height: 1.35; color: var(--gold-3); margin-top: 2mm; }
'''
    body = f'''
{title('Acte II · Renouveau · Les chantiers', 'Le pays en chantier', 'Des réalisations sourcées, racontées par ceux qui les vivent : usagers, ouvriers, soignants.')}
<div class="rows">
  <div class="r"><div><div class="frame"><img src="{uri('routes-2252-km.jpg')}"></div><div class="cap">Routes <i>— préfectures désenclavées, marchés reliés</i></div></div>
    <div class="k"><b>2 252 <small>km</small></b><div class="l">de routes en trois ans</div><div class="t">Plus de 2 252 kilomètres de routes réalisées : les préfectures désenclavées, les marchés reliés, les distances raccourcies.</div></div></div>
  <div class="r alt"><div><div class="frame"><img src="{uri('koloma.jpg')}"></div><div class="cap">Koloma <i>— la cité administrative de Conakry</i></div></div>
    <div class="k"><b>Koloma</b><div class="l">la cité administrative</div><div class="t">La nouvelle cité administrative de Conakry rassemble l'État dans une ville moderne : ministères, services, guichets.</div></div></div>
  <div class="r"><div><div class="frame"><img src="{uri('donka-bloc.jpg')}"></div><div class="cap">CHU Donka <i>— un bloc opératoire rénové</i></div></div>
    <div class="k"><b>31 <small>services</small></b><div class="l">15 blocs opératoires · un centre d'imagerie</div><div class="t">Le CHU Donka rénové : soigner mieux, ici. Nouveaux hôpitaux, écoles réhabilitées.</div></div></div>
</div>
<div class="strip">
  <div><b>Nimba Mining Company</b><span>L'État commercialise désormais lui-même sa bauxite et vise le raffinage local de l'alumine.</span></div>
  <div><b>B+ · première notation</b><span>Pour la première fois de son histoire, la Guinée est notée par S&amp;P : une crédibilité internationale qui attire l'investissement.</span></div>
  <div><b>Simandou 2040</b><span>Les revenus du fer investis dans l'agriculture, l'éducation, la santé, les infrastructures et l'économie.</span></div>
</div>
'''
    return shell('renouveau', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '08', css, zoom=1.1)


def a09():
    css = '''
.map { width: 100%; margin-top: 2mm; }
.map svg { width: 100%; height: auto; }
.note { font-family: "Optima", sans-serif; font-size: 4mm; letter-spacing: .14em; text-transform: uppercase; color: var(--gold-3); opacity: .8; margin-top: 1mm; }
.pil { margin-top: 8mm; }
.pil .h { font-family: "Optima", sans-serif; font-size: 5.8mm; letter-spacing: .26em; text-transform: uppercase; color: var(--gold-2); margin-bottom: 5mm; }
.pil .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm 10mm; }
.p { display: flex; gap: 5mm; align-items: flex-start; }
.p .n { width: 15mm; height: 15mm; flex: none; border-radius: 50%; border: .6mm solid var(--gold-2); color: var(--gold-2); display: flex; align-items: center; justify-content: center; font-size: 7.4mm; }
.p .t b { display: block; font-weight: normal; font-size: 8.2mm; line-height: 1.1; color: var(--cream); }
.p .t span { display: block; font-size: 5.2mm; line-height: 1.3; color: var(--gold-3); margin-top: 1.2mm; }
.p.tr .n { border-style: dashed; }
.nums { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8mm; margin-top: 9mm; }
.nums .k { border-top: .5mm solid var(--gold-2); padding-top: 4mm; }
.nums .k b { display: block; font-weight: normal; font-size: 21mm; line-height: 1; color: var(--gold-2); }
.nums .k span { display: block; font-family: "Optima", sans-serif; font-size: 4.8mm; letter-spacing: .14em; text-transform: uppercase; color: var(--gold-3); margin-top: 2.5mm; line-height: 1.4; }
.lead { margin-top: 8mm; font-size: 8mm; line-height: 1.32; color: var(--cream); }
.lead b { font-weight: normal; color: var(--gold-2); }
'''
    def p(n, b, s, tr=False):
        return f'<div class="p{" tr" if tr else ""}"><div class="n">{n}</div><div class="t"><b>{b}</b><span>{s}</span></div></div>'
    body = f'''
{title('Acte III · Avenir · La feuille de route', 'Simandou <span class="big">2040</span>', 'Transformer le fer en avenir : un programme de quinze ans pour la Guinée émergente.')}
<div class="map">{guinea_map(526, highlight=('BEY', 'FOR', 'KER', 'KIS', 'FAR', 'MAM', 'KIN'))}<div class="note">Tracé schématique du corridor TransGuinéen, de Simandou au port de Moribaya · les 44 préfectures de la République</div></div>
<div class="pil"><div class="h">Cinq piliers et un socle</div><div class="grid">
    {p('I', 'Agriculture, agro-industrie et commerce', 'Sécurité alimentaire, filières modernisées, transformation locale.')}
    {p('II', 'Éducation et culture', 'Excellence académique, recherche, innovation, rayonnement culturel.')}
    {p('III', 'Infrastructures, transports et technologies', 'Corridors logistiques, parcs industriels, réseaux numériques.')}
    {p('IV', 'Économie, finances et assurances', 'Inclusion financière, investissement productif, fonds souverain.')}
    {p('V', 'Santé et bien-être', 'L’accès de tous à des soins de qualité.')}
    {p('+', 'Modernisation de l’État et gouvernance', 'Le socle transversal : gouvernance, durabilité, inclusion sociale.', True)}
</div></div>
<div class="nums">
  <div class="k"><b>2040</b><span>l’horizon de la Guinée émergente</span></div>
  <div class="k"><b>200 Mds $</b><span>à mobiliser sur quinze ans, aux deux tiers auprès du privé</span></div>
  <div class="k"><b>122</b><span>mégaprojets · 36 réformes · 14 secteurs</span></div>
  <div class="k"><b>2 Mds t</b><span>de minerai : le fer devient acier, école, hôpital, route</span></div>
</div>
<div class="lead">Lancé par le Chef de l’État, le Programme Simandou 2040 fait du plus grand gisement de fer du monde le <b>levier d’une transformation nationale</b> : exporter de l’alumine et de l’acier plutôt que de la roche, et investir les revenus du sous-sol dans les femmes et les hommes.</div>
'''
    return shell('avenir', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '09', css, zoom=1.12)


def a10():
    css = '''
.fil { display: flex; justify-content: space-between; margin-top: 8mm; position: relative; }
.fil::before { content: ""; position: absolute; left: 10%; right: 10%; top: 48.5mm; height: .5mm; background: var(--gold-2); }
.y { width: 24%; text-align: center; }
.y b { display: block; font-weight: normal; font-size: 40mm; line-height: 1; color: var(--gold-2); }
.y i { display: block; width: 6mm; height: 6mm; border-radius: 50%; background: var(--gold-2); margin: 4mm auto 3.5mm; border: 1.2mm solid var(--night); box-shadow: 0 0 0 .6mm var(--gold-2); }
.y span { display: block; font-size: 6.2mm; line-height: 1.3; color: var(--gold-3); padding: 0 4mm; }
.y.now b { color: var(--cream); }
.child { margin-top: 12mm; padding: 9mm 12mm; border: .5mm solid var(--gold-2); font-size: 12mm; line-height: 1.3; color: var(--cream); text-align: center; font-style: italic; }
.child b { color: var(--gold-2); font-weight: normal; }
.nums { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm 10mm; margin-top: 12mm; }
.nums .k { border-top: .5mm solid var(--gold-2); padding-top: 4mm; }
.nums .k b { display: block; font-weight: normal; font-size: 22mm; line-height: 1; color: var(--gold-2); }
.nums .k span { display: block; font-size: 5.6mm; line-height: 1.35; color: var(--gold-3); margin-top: 2.5mm; }
.strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; margin-top: 11mm; }
.strip .frame { width: 100%; } .strip .frame img { aspect-ratio: 16/9; }
.letter { margin-top: 10mm; display: flex; align-items: center; gap: 10mm; background: var(--night-2); padding: 7mm 10mm; border-left: 2mm solid var(--gold-2); }
.letter .q { font-size: 15mm; line-height: 1.1; color: var(--gold-2); white-space: nowrap; }
.letter .t { font-size: 6.4mm; line-height: 1.35; color: var(--cream); }
.letter .t b { font-family: "Optima", sans-serif; font-weight: 600; letter-spacing: .1em; color: var(--gold-2); }
'''
    body = f'''
{title('Acte III · Avenir · Ce que nous deviendrons', 'Guinée <span class="big">2076</span>', 'La Guinée écrite par ceux qui ont 18 ans aujourd’hui.')}
<div class="fil">
  <div class="y"><b>1958</b><i></i><span>Le NON — la souveraineté choisie</span></div>
  <div class="y now"><b>2026</b><i></i><span>L'An 68 — la jeunesse célébrée, 500 000 visages sur le Mur</span></div>
  <div class="y"><b>2040</b><i></i><span>Simandou 2040 — la Guinée émergente</span></div>
  <div class="y"><b>2076</b><i></i><span>Le 118<sup>e</sup> anniversaire — la Guinée de nos enfants</span></div>
</div>
<div class="child">L'enfant photographié cette semaine aura <b>50 ans</b> au 118<sup>e</sup> anniversaire de la République.</div>
<div class="nums">
  <div class="k"><b>19 ans</b><span>l'âge médian : la Guinée est l'un des pays les plus jeunes du monde</span></div>
  <div class="k"><b>3 fleuves</b><span>le Niger, le Sénégal et la Gambie naissent en Guinée — le château d'eau de l'Afrique de l'Ouest</span></div>
  <div class="k"><b>¼ du monde</b><span>plus d’un quart des réserves mondiales de bauxite : l'aluminium du monde commence ici ; demain, l'alumine et l'acier</span></div>
  <div class="k"><b>Millions</b><span>d'hectares arables encore non cultivés : riz, anacarde, mangue, ananas, café et cacao — le grenier de la région</span></div>
  <div class="k"><b>300 km</b><span>de côtes et l'un des plateaux continentaux les plus poissonneux d'Afrique de l'Ouest</span></div>
  <div class="k"><b>Kaléta · Souapiti</b><span>éclairent déjà la région ; le potentiel hydroélectrique reste immense</span></div>
</div>
<div class="strip">
  <div><div class="frame"><img src="{uri('chateau-d-eau.jpg')}" style="object-position:center 40%"></div><div class="cap">L'eau <i>— chutes du Fouta-Djalon</i></div></div>
  <div><div class="frame"><img src="{uri('riziere.jpg')}"></div><div class="cap">La terre <i>— rizière de Guinée</i></div></div>
  <div><div class="frame"><img src="{uri('peche.jpg')}"></div><div class="cap">La mer <i>— pêche artisanale, Conakry</i></div></div>
</div>
<div class="letter"><div class="q">« Guinée,<br>dans 50 ans… »</div><div class="t">Chaque participant de l'An 68 est invité à écrire sa lettre à la Guinée de 2076 sur le Mur national. <b>guineen68.com</b> — Ajoute ton visage, écris ton avenir.</div></div>
'''
    return shell('avenir', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '10', css, zoom=1.42)


POSTERS = {
    '01': ('01-le-non', a01), '02': ('02-les-resistants', a02), '03': ('03-les-premiers', a03),
    '04': ('04-le-phare-panafricain', a04), '05': ('05-les-geants', a05), '06': ('06-la-refondation', a06),
    '07': ('07-simandou-debloque', a07), '08': ('08-le-pays-en-chantier', a08), '09': ('09-simandou-2040', a09),
    '10': ('10-guinee-2076', a10),
}


def render(html_path, pdf_path, png_path):
    url = html_path.resolve().as_uri()
    base = [CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars']
    subprocess.run(base + ['--no-pdf-header-footer', f'--print-to-pdf={pdf_path}', url], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if FORMAT == 'a1':
        subprocess.run(base + ['--force-device-scale-factor=1', '--window-size=2245,3179', f'--screenshot={png_path}', url], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        subprocess.run(['pdftoppm', '-r', '30', '-png', '-singlefile', str(pdf_path), str(png_path)[:-4]], check=True)


def main():
    global FORMAT
    from serie2 import POSTERS2
    POSTERS.update(POSTERS2)
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    flags = [a for a in sys.argv[1:] if a.startswith('--')]
    formats = [f for f in ('a1', 'rollup') if f'--{f}' in flags] or ['a1', 'rollup']
    keys = args or list(POSTERS)
    for FORMAT in formats:
        out = OUT / FORMATS[FORMAT]['dir']; html = HTML / FORMATS[FORMAT]['dir']
        out.mkdir(parents=True, exist_ok=True); html.mkdir(parents=True, exist_ok=True)
        for k in keys:
            slug, fn = POSTERS[k]
            h = html / f'{slug}.html'
            h.write_text(fn(), encoding='utf-8')
            render(h, out / f'{slug}.pdf', out / f'{slug}.png')
            print('✓', FORMAT, slug)


if __name__ == '__main__':
    main()
