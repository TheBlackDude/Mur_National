"""Deuxième série (11 – 20) — s'appuie sur build.py (shell, title, uri, guinea_map)."""
import json, re
from build import shell, title, uri, GEO, ROOT

WORLD = ROOT.parent / 'web' / 'src' / 'data' / 'geo' / 'world.json'
PREF = ROOT.parent / 'web' / 'src' / 'data' / 'prefectures.json'
COUNTRIES = ROOT.parent / 'web' / 'src' / 'data' / 'countries.json'
QR = ROOT.parent / 'web' / 'public' / 'qr-selfie.svg'

REGION_OF = {p['name']: p['region'] for p in json.loads(PREF.read_text())}
NATURELLE = {
    'Basse-Guinée': 'BOK BOF FRI GAO KND KAM CKY COY DUB FOR KIN TEL'.split(),
    'Moyenne-Guinée': 'KOB LAB LEL MAL TOU DAL MAM PIT TIM'.split(),
    'Haute-Guinée': 'DAB DIN FAR KAN KOU KER MAN SIG DIA TOK SAB DOK SGN KTN'.split(),
    'Guinée forestière': 'GUE KIS LOL MAC NZE YOM BEY KAR KKN SNK'.split(),
}


def _centre(d):
    nums = [float(x) for x in re.findall(r'-?\d+\.?\d*', d)]
    xs, ys = nums[0::2], nums[1::2]
    return (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, max(xs) - min(xs)


def guinea_labelled(fill_of, label_color='#F4EFE3', stroke='#DCC07A'):
    """Carte des 44 préfectures avec leur nom ; fill_of(code, name) → couleur."""
    geo = json.loads(GEO.read_text())
    paths, labels = [], []
    nudge = {'KAM': (-30, 8), 'TIM': (0, 22), 'DIA': (0, -18), 'TOK': (0, 24), 'SAB': (26, 0), 'DOK': (0, -20),
             'SGN': (0, -20), 'KTN': (0, 22), 'SNK': (0, -20), 'KKN': (0, 30), 'KAR': (0, -20), 'CKY': (-20, -14), 'COY': (10, -6)}
    for s in geo['shapes']:
        cx, cy, w = _centre(s['d'])
        paths.append(f'<path d="{s["d"]}" fill="{fill_of(s["code"], s["name"])}" stroke="{stroke}" stroke-width=".9" stroke-linejoin="round"/>')
        small = w < 70
        dx, dy = nudge.get(s['code'], (0, 0))
        fs = 11 if small else 15
        labels.append(f'<text x="{cx + dx:.0f}" y="{cy + dy + 5:.0f}" text-anchor="middle" font-family="Optima" font-weight="600" font-size="{fs}" letter-spacing="1" fill="{label_color}">{s["name"].upper()}</text>')
    return f'<svg viewBox="-20 -10 1040 780" width="100%" style="display:block;overflow:visible">{"".join(paths)}{"".join(labels)}</svg>'


def world_map():
    w = json.loads(WORLD.read_text())
    cent = w['centroids']; gx, gy = cent['GN']
    countries = [c for c in json.loads(COUNTRIES.read_text()) if c['iso'] in cent and c['iso'] != 'GN']
    arcs, dots = [], []
    for c in countries:
        x, y = cent[c['iso']]
        mx, my = (gx + x) / 2, min(gy, y) - abs(x - gx) * 0.18
        arcs.append(f'<path d="M{gx},{gy} Q{mx:.1f},{my:.1f} {x},{y}" fill="none" stroke="#DCC07A" stroke-width=".7" opacity=".45"/>')
        dots.append(f'<circle cx="{x}" cy="{y}" r="3.2" fill="#F0DFA8"/>')
    return f'''<svg viewBox="0 40 1000 380" width="100%" style="display:block;overflow:visible">
<path d="{w['land']}" fill="rgba(220,192,122,.13)" stroke="#DCC07A" stroke-width=".5" stroke-linejoin="round"/>
{''.join(arcs)}{''.join(dots)}
<circle cx="{gx}" cy="{gy}" r="16" fill="#F0DFA8" opacity=".25"/><circle cx="{gx}" cy="{gy}" r="7" fill="#F0DFA8" stroke="#0B1A33" stroke-width="2"/>
<text x="{gx + 12}" y="{gy + 18}" font-family="Optima" font-weight="600" font-size="15" letter-spacing="2" fill="#F0DFA8">CONAKRY</text>
</svg>'''


# ----------------------------------------------------------------------------- 11
def a11():
    css = '''
.wrap { display: flex; gap: 16mm; margin-top: 6mm; }
.lyr { flex: 1.6; }
.lyr p { font-size: 9.8mm; line-height: 1.42; color: var(--green); }
.lyr p + p { margin-top: 7mm; }
.lyr p b { font-weight: normal; color: var(--gold); }
.side { flex: .7; }
.side .arch { aspect-ratio: 4/5; }
.side .cap { text-align: center; }
.side .note { margin-top: 8mm; padding: 6mm 7mm; border: .4mm solid var(--gold); font-size: 6.2mm; line-height: 1.38; color: var(--ink-2); }
.side .note b { font-family: "Optima", sans-serif; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--green); display: block; margin-bottom: 2mm; font-size: 5mm; }
.colors { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; margin-top: 12mm; }
.colors div { border-top: 3mm solid; padding-top: 4mm; }
.colors b { display: block; font-family: "Optima", sans-serif; font-weight: 600; font-size: 7mm; letter-spacing: .22em; text-transform: uppercase; }
.colors span { display: block; font-size: 6.2mm; line-height: 1.35; color: var(--ink-2); margin-top: 2mm; font-style: italic; }
'''
    body = f'''
{title('Acte I · Héritage · L’hymne national', 'Liberté', 'L’hymne national de la République de Guinée — paroles de Fodéba Keïta, 1958.')}
<div class="wrap">
  <div class="lyr">
    <p>Peuple d’Afrique !<br>Le passé historique !<br>Que chante l’hymne de la Guinée fière et jeune,<br>Illustre épopée de nos frères<br>Morts au champ d’honneur en libérant l’Afrique !<br>Le peuple de Guinée prêchant l’unité<br>Appelle l’Afrique.</p>
    <p><b>Liberté !</b> C’est la voix d’un peuple<br>Qui appelle tous ses frères à se retrouver.<br><b>Liberté !</b> C’est la voix d’un peuple<br>Qui appelle tous ses frères de la grande Afrique.</p>
    <p>Bâtissons l’unité africaine<br>dans l’indépendance retrouvée.</p>
  </div>
  <div class="side">
    <img class="arch" src="{uri('fodeba-keita.png')}" style="object-position:center 12%">
    <div class="cap">Fodéba Keïta <i>— 1921 – 1969, poète, fondateur des Ballets Africains, auteur de « Liberté »</i></div>
    <div class="note"><b>Chanté chaque 2 octobre</b>Adopté à l’indépendance en 1958, « Liberté » ouvre chaque cérémonie de la République. La Semaine de l’Indépendance An 68 l’apprend aux 68 jeunes venus de toutes les préfectures et de la diaspora.</div>
  </div>
</div>
<div class="colors">
  <div style="border-color:var(--red)"><b style="color:var(--red)">Rouge · Travail</b><span>Le sang des martyrs et la sueur du travail.</span></div>
  <div style="border-color:var(--yellow)"><b style="color:#B8890A">Jaune · Justice</b><span>Le soleil, l’or du sous-sol et la justice.</span></div>
  <div style="border-color:var(--gn)"><b style="color:var(--gn)">Vert · Solidarité</b><span>La terre, la forêt et la solidarité du peuple.</span></div>
</div>
'''
    return shell('heritage', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '11', css, zoom=1.68)


# ----------------------------------------------------------------------------- 12
def a12():
    regions = ['Boké', 'Kindia', 'Mamou', 'Labé', 'Faranah', 'Kankan', 'Siguiri', 'Nzérékoré', 'Beyla', 'Conakry']
    tint = {r: .06 + .05 * i for i, r in enumerate(regions)}
    def fill(code, name):
        r = REGION_OF.get(name, 'Conakry' if code == 'CKY' else 'Boké')
        return f'rgba(220,192,122,{tint.get(r, .1):.2f})'
    prefs = {}
    for p in json.loads(PREF.read_text()):
        prefs.setdefault(p['region'], []).append(p['name'])
    css = '''
.map { margin-top: 2mm; }
.leg { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5mm 7mm; margin-top: 6mm; }
.leg div { border-top: .45mm solid var(--gold-2); padding-top: 3mm; }
.leg b { display: block; font-family: "Optima", sans-serif; font-weight: 600; font-size: 5.8mm; letter-spacing: .14em; text-transform: uppercase; color: var(--gold-2); }
.leg span { display: block; font-size: 5mm; line-height: 1.35; color: var(--cream); margin-top: 1.5mm; }
.nums { display: flex; gap: 10mm; margin-top: 8mm; align-items: center; }
.nums .k b { display: block; font-weight: normal; font-size: 22mm; line-height: 1; color: var(--gold-2); }
.nums .k span { display: block; font-family: "Optima", sans-serif; font-size: 4.8mm; letter-spacing: .14em; text-transform: uppercase; color: var(--gold-3); margin-top: 2mm; }
.nums .t { flex: 1; font-size: 6.6mm; line-height: 1.35; color: var(--cream); border-left: .5mm solid var(--gold-2); padding-left: 8mm; }
'''
    body = f'''
{title('Acte II · Renouveau · Le territoire', '44 préfectures,<br>une seule Nation', 'Dix régions administratives et quarante-quatre préfectures depuis le décret du 20 août 2026 — chacune a sa place sur le Mur.')}
<div class="map">{guinea_labelled(fill)}</div>
<div class="leg">
  {''.join(f'<div><b>{r}</b><span>{", ".join(prefs[r])}</span></div>' for r in regions if r != 'Conakry')}
  <div><b>Conakry</b><span>{", ".join(prefs['Conakry'])} — les cinq communes de la capitale</span></div>
</div>
<div class="nums">
  <div class="k"><b>44</b><span>préfectures</span></div>
  <div class="k"><b>10</b><span>régions</span></div>
  <div class="t">Pendant la Semaine de l’Indépendance, la Course des Préfectures classe en direct les 44 préfectures selon leurs participations au Mur national ; la préfecture gagnante est distinguée le 2 octobre. Labé se mesure à Kankan, Boké à Nzérékoré.</div>
</div>
'''
    return shell('renouveau', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '12', css, zoom=1.2)


# ----------------------------------------------------------------------------- 13
def a13():
    css = '''
.map { margin-top: 4mm; }
.nums { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8mm; margin-top: 8mm; }
.nums .k { border-top: .5mm solid var(--gold-2); padding-top: 4mm; }
.nums .k b { display: block; font-weight: normal; font-size: 21mm; line-height: 1; color: var(--gold-2); }
.nums .k span { display: block; font-family: "Optima", sans-serif; font-size: 4.8mm; letter-spacing: .14em; text-transform: uppercase; color: var(--gold-3); margin-top: 2.5mm; line-height: 1.4; }
.hubs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8mm; margin-top: 9mm; }
.hubs div { background: var(--night-2); padding: 5mm 6mm; border-left: 1.2mm solid var(--gold-2); }
.hubs b { display: block; font-size: 8mm; color: var(--cream); line-height: 1.1; }
.hubs span { display: block; font-size: 5mm; color: var(--gold-3); margin-top: 1.5mm; line-height: 1.3; }
.lead { margin-top: 9mm; font-size: 8.2mm; line-height: 1.32; color: var(--cream); }
.lead b { font-weight: normal; color: var(--gold-2); }
'''
    body = f'''
{title('Acte III · Avenir · La diaspora', 'La Guinée du monde', 'Cinquante et une missions diplomatiques, une diaspora sur cinq continents : le 2 octobre, la carte de la Nation s’illumine pays par pays.')}
<div class="map">{world_map()}</div>
<div class="nums">
  <div class="k"><b>51</b><span>missions diplomatiques de la République</span></div>
  <div class="k"><b>1,5 – 2 M</b><span>Guinéennes et Guinéens de l’étranger</span></div>
  <div class="k"><b>5</b><span>continents, une même fierté</span></div>
  <div class="k"><b>10 h</b><span>locales : la vague des fuseaux horaires, de Pékin à Washington</span></div>
</div>
<div class="hubs">
  <div><b>Dakar · Abidjan · Freetown</b><span>La diaspora la plus nombreuse, aux portes du pays</span></div>
  <div><b>Paris · Bruxelles</b><span>Les Guinéens d’Europe, relais des familles</span></div>
  <div><b>New York · Philadelphie</b><span>Depuis 1958, la Guinée siège aux Nations unies</span></div>
  <div><b>Riyad · Dubaï</b><span>Le Golfe, nouvelles routes du commerce et du travail</span></div>
</div>
<div class="lead">Chaque mission ouvre un <b>Village Guinée</b> le 2 octobre et publie à 10 h locales : le Mur national est alimenté pendant vingt heures continues, jusqu’au dévoilement du chiffre national à Conakry. Un pays s’allume à 100 participants, brille à 1 000, entre au classement à 10 000.</div>
'''
    return shell('avenir', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '13', css, zoom=1.55)


# ----------------------------------------------------------------------------- 14
def a14():
    css = '''
.grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8mm; margin-top: 8mm; }
.grid .name { font-size: 8.4mm; } .grid .dates { font-size: 4.8mm; } .grid .line { font-size: 5.3mm; }
.tl { margin-top: 12mm; display: grid; grid-template-columns: repeat(5, 1fr); gap: 6mm; }
.tl div { border-top: .5mm solid var(--gold); padding-top: 3.5mm; }
.tl b { display: block; font-weight: normal; font-size: 14mm; line-height: 1; color: var(--green); }
.tl span { display: block; font-size: 5.6mm; line-height: 1.32; color: var(--ink-2); margin-top: 2mm; }
.today { margin-top: 12mm; display: flex; gap: 10mm; align-items: stretch; }
.today .q { flex: 1.1; background: var(--green); color: var(--cream); padding: 9mm 11mm; font-size: 9.4mm; line-height: 1.3; }
.today .q b { color: var(--gold-2); font-weight: normal; }
.today .list { flex: 1; border: .5mm solid var(--gold); padding: 7mm 9mm; }
.today .list b { display: block; font-family: "Optima", sans-serif; font-weight: 600; letter-spacing: .2em; text-transform: uppercase; font-size: 5mm; color: var(--gold); margin-bottom: 3mm; }
.today .list div { font-size: 6mm; line-height: 1.5; color: var(--ink); }
'''
    def card(img, name, dates, line, pos='center top'):
        return f'<div><img class="arch" src="{uri(img)}" style="object-position:{pos}"><div class="name">{name}</div><div class="dates">{dates}</div><div class="line">{line}</div></div>'
    body = f'''
{title('Acte II · Renouveau · La Guinéenne, excellence et relève · 29 septembre', 'Fière d’être<br>Guinéenne', 'De la grève de 1953 au Conseil de sécurité des Nations unies : les femmes ont porté la Guinée avant, pendant et après le NON.')}
<div class="grid">
  {card('mbalia-camara.png', 'M’Balia Camara', '† 1955', 'Militante du PDG tuée, enceinte, lors d’un affrontement en 1955 : son sacrifice galvanise la marche vers le « Non ».')}
  {card('mafory-bangoura-fig.png', 'Hadja Mafory Bangoura', 'v. 1910 – 1976', 'Meneuse de la grève des 73 jours de 1953, présidente du Comité national des femmes, ministre des Affaires sociales.')}
  {card('ngamet-toure.png', 'N’Gamet Touré', 'Années 1950', 'Figure des structures féminines du parti, elle mobilise villes et campagnes pour le « Non » et pour l’alphabétisation.')}
  {card('loffo-camara.png', 'Loffo Camara', '1925 – 1971', 'Sage-femme de Macenta, première femme membre d’un gouvernement en Guinée, en 1961.')}
  {card('jeanne-martin-cisse-fig.png', 'Jeanne Martin Cissé', '1926 – 2017', 'Première femme à présider le Conseil de sécurité des Nations unies, en 1972 ; ministre des Affaires sociales.')}
</div>
<div class="tl">
  <div><b>1953</b><span>La grève des 73 jours : les femmes de Conakry tiennent le mouvement.</span></div>
  <div><b>1955</b><span>M’Balia Camara, martyre de la lutte anticoloniale.</span></div>
  <div><b>1958</b><span>Les comités féminins portent le « Non » jusqu’au dernier village.</span></div>
  <div><b>1961</b><span>Loffo Camara entre au gouvernement, une première.</span></div>
  <div><b>1972</b><span>Une Guinéenne préside le Conseil de sécurité de l’ONU.</span></div>
</div>
<div class="today">
  <div class="q">Le 29 septembre, la Semaine met à l’honneur <b>l’excellence et la relève</b> : entrepreneuses, scientifiques, artistes, sportives, boursières — les pionnières rencontrent la nouvelle génération.</div>
  <div class="list"><b>Aujourd’hui et demain</b>
    <div>Entrepreneuriat, sciences, culture, sport</div>
    <div>Parcours académiques et boursières d’excellence</div>
    <div>Le renouveau raconté par celles qui le bâtissent</div>
    <div>Simandou 2040 : l’inclusion des femmes, condition d’un développement durable</div>
  </div>
</div>
'''
    return shell('heritage', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '14', css, zoom=1.55)


# ----------------------------------------------------------------------------- 15
def a15():
    css = '''
.two { display: flex; gap: 10mm; margin-top: 8mm; }
.two > div { flex: 1; } .two .frame { width: 100%; } .two .frame img { aspect-ratio: 4/2.9; }
.pal { display: grid; grid-template-columns: 1.1fr 1fr 1fr; gap: 9mm; margin-top: 10mm; }
.pal .k { border-top: .5mm solid var(--gold-2); padding-top: 4mm; }
.pal .k b { display: block; font-weight: normal; font-size: 30mm; line-height: 1; color: var(--gold-2); }
.pal .k b small { font-size: 12mm; }
.pal .k span { display: block; font-family: "Optima", sans-serif; font-size: 5.2mm; letter-spacing: .14em; text-transform: uppercase; color: var(--gold-3); margin-top: 2.5mm; line-height: 1.4; }
.names { margin-top: 10mm; display: flex; gap: 8mm; flex-wrap: wrap; }
.names span { font-size: 8.4mm; color: var(--cream); padding: 2.5mm 6mm; border: .4mm solid var(--gold-2); border-radius: 12mm; }
.match { margin-top: 10mm; display: flex; align-items: center; gap: 10mm; background: var(--red); color: #fff; padding: 8mm 12mm; }
.match b { font-size: 24mm; line-height: 1; font-weight: normal; white-space: nowrap; color: var(--yellow); }
.match span { font-size: 8.4mm; line-height: 1.3; }
'''
    body = f'''
{title('Acte I · Héritage · Les géants du sport · 1<sup>er</sup> octobre', 'Le Syli National', 'De la finale de 1976 jusqu’à Guirassy, le Syli porte nos couleurs. Ce soir, montre les tiennes.')}
<div class="two">
  <div><div class="frame"><img src="{uri('hafia-fc.png')}"></div><div class="cap">Hafia FC <i>— le club de Conakry, roi du continent dans les années 1970</i></div></div>
  <div><div class="frame"><img src="{uri('syli-national.jpg')}"></div><div class="cap">Le Syli National <i>— la sélection nationale de Guinée</i></div></div>
</div>
<div class="pal">
  <div class="k"><b>3</b><span>Coupes d’Afrique des clubs champions — Hafia FC, 1972 · 1975 · 1977</span></div>
  <div class="k"><b>1976</b><span>le Syli finaliste de la Coupe d’Afrique des Nations</span></div>
  <div class="k"><b>1972</b><span>Chérif Souleymane, Ballon d’or africain</span></div>
</div>
<div class="names"><span>Chérif Souleymane</span><span>Petit Sory</span><span>Papa Camara</span><span>Pascal Feindouno</span><span>Naby Keïta</span><span>Serhou Guirassy</span></div>
<div class="match"><b>1<sup>er</sup> octobre</b><span>Match de qualification du Syli National : fan zones, camions d’animation dans la capitale, diffusion de l’épopée du football guinéen. Un pays derrière onze joueurs.</span></div>
'''
    return shell('renouveau', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '15', css, zoom=1.6)


# ----------------------------------------------------------------------------- 16
def a16():
    css = '''
.cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9mm; margin-top: 8mm; }
.c .frame { width: 100%; } .c .frame img { aspect-ratio: 4/3; }
.c .k b { display: block; font-weight: normal; font-size: 26mm; line-height: 1; color: var(--gold-2); margin-top: 5mm; }
.c .k .l { font-family: "Optima", sans-serif; font-size: 6mm; letter-spacing: .2em; text-transform: uppercase; color: var(--gold-3); margin: 2mm 0 3mm; }
.c .k .t { font-size: 6mm; line-height: 1.34; color: var(--cream); }
.nimba { margin-top: 10mm; display: flex; gap: 10mm; align-items: center; }
.nimba .frame { width: 190mm; flex: none; } .nimba .frame img { aspect-ratio: 16/10; }
.nimba .t { flex: 1; font-size: 7.6mm; line-height: 1.34; color: var(--cream); }
.nimba .t b { font-weight: normal; color: var(--gold-2); }
.motto { margin-top: 9mm; padding: 7mm 10mm; border: .5mm solid var(--gold-2); text-align: center; font-size: 11.5mm; line-height: 1.25; color: var(--gold-2); font-style: italic; }
'''
    def c(img, n, l, t):
        return f'<div class="c"><div class="frame"><img src="{uri(img)}"></div><div class="k"><b>{n}</b><div class="l">{l}</div><div class="t">{t}</div></div></div>'
    body = f'''
{title('Acte III · Avenir · Le sous-sol', 'Bauxite, or, fer', 'L’aluminium, l’or et l’acier du monde commencent ici — et demain, ils se transforment ici.')}
<div class="cols">
  {c('bauxite-boke.jpg', 'N° 1', 'la bauxite · Boké', 'Premier exportateur mondial de bauxite et plus du quart des réserves de la planète : l’aluminium du monde commence en Guinée.')}
  {c('or-haute-guinee.jpg', 'Siguiri', 'l’or · Haute-Guinée', 'Siguiri, Kouroussa, Mandiana : l’or guinéen se creuse depuis les empires mandingues, aujourd’hui à l’échelle industrielle.')}
  {c('simandou-gisement.jpg', '2 Mds t', 'le fer · Simandou', 'La plus grande réserve de minerai de fer à haute teneur encore inexploitée au monde. Premier minerai le 11 novembre 2025. Demain, l’acier.')}
</div>
<div class="nimba">
  <div><div class="frame"><img src="{uri('nimba-mining.jpg')}"></div><div class="cap">Nimba Mining Company <i>— mining &amp; refinery</i></div></div>
  <div class="t">Avec <b>Nimba Mining Company</b>, l’État commercialise désormais lui-même sa bauxite et vise le raffinage local de l’alumine. La souveraineté sur les ressources est le premier chantier de Simandou 2040 : garder chez nous la valeur ajoutée, les emplois et les compétences.</div>
</div>
<div class="motto">« Exporter de l’alumine et de l’acier plutôt que de la roche. »</div>
'''
    return shell('avenir', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '16', css, zoom=1.5)


# ----------------------------------------------------------------------------- 17
def a17():
    colors = {'Basse-Guinée': '#C9A24A', 'Moyenne-Guinée': '#9CC7A6', 'Haute-Guinée': '#E0B07A', 'Guinée forestière': '#2E8B57'}
    of = {code: reg for reg, codes in NATURELLE.items() for code in codes}
    def fill(code, name):
        return colors.get(of.get(code, 'Basse-Guinée')) + 'CC'
    css = '''
.wrap { display: flex; gap: 10mm; margin-top: 4mm; align-items: flex-start; }
.map { width: 235mm; flex: none; margin-left: -4mm; }
.leg { flex: 1; padding-top: 4mm; }
.leg div { border-left: 3mm solid; padding: 1mm 0 1mm 6mm; margin-bottom: 7mm; }
.leg b { display: block; font-size: 8.6mm; line-height: 1.1; color: var(--cream); }
.leg span { display: block; font-size: 5.4mm; line-height: 1.35; color: var(--gold-3); margin-top: 1.5mm; }
.strip { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8mm; margin-top: 6mm; }
.strip .frame { width: 100%; } .strip .frame img { aspect-ratio: 16/7; }
.nums { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; margin-top: 8mm; }
.nums .k { border-top: .5mm solid var(--gold-2); padding-top: 4mm; }
.nums .k b { display: block; font-weight: normal; font-size: 19mm; line-height: 1; color: var(--gold-2); }
.nums .k span { display: block; font-size: 5.4mm; line-height: 1.35; color: var(--gold-3); margin-top: 2.5mm; }
'''
    body = f'''
{title('Acte III · Avenir · Le grenier', 'Quatre Guinées,<br>un grenier', 'Des millions d’hectares arables encore non cultivés : la jeunesse rurale, première force de production du pilier I de Simandou 2040.')}
<div class="wrap">
  <div class="map">{guinea_labelled(fill, label_color='#0B1A33', stroke='#0B1A33')}</div>
  <div class="leg">
    <div style="border-color:{colors['Basse-Guinée']}"><b>Basse-Guinée</b><span>Riz de mangrove, ananas, banane, sel, pêche — et Conakry, la porte de l’Atlantique.</span></div>
    <div style="border-color:{colors['Moyenne-Guinée']}"><b>Moyenne-Guinée · Fouta-Djalon</b><span>Pomme de terre, oignon, agrumes, élevage ; le château d’eau d’où naissent le Niger, le Sénégal et la Gambie.</span></div>
    <div style="border-color:{colors['Haute-Guinée']}"><b>Haute-Guinée</b><span>Coton, anacarde, mangue, riz de plaine ; l’or de Siguiri.</span></div>
    <div style="border-color:{colors['Guinée forestière']}"><b>Guinée forestière</b><span>Café, cacao, palmier à huile, hévéa, cola ; le fer de Simandou.</span></div>
  </div>
</div>
<div class="strip">
  <div><div class="frame"><img src="{uri('riziere.jpg')}"></div><div class="cap">La terre <i>— rizière de Guinée</i></div></div>
  <div><div class="frame"><img src="{uri('peche.jpg')}"></div><div class="cap">La mer <i>— pêche artisanale, Conakry</i></div></div>
</div>
<div class="nums">
  <div class="k"><b>Millions</b><span>d’hectares arables encore non cultivés</span></div>
  <div class="k"><b>Pilier I</b><span>Simandou 2040 : agriculture, agro-industrie et commerce — sécurité alimentaire et transformation locale</span></div>
  <div class="k"><b>300 km</b><span>de côtes et l’un des plateaux continentaux les plus poissonneux d’Afrique de l’Ouest</span></div>
</div>
'''
    return shell('avenir', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '17', css, zoom=1.35)


# ----------------------------------------------------------------------------- 18
def a18():
    days = [
        ('Ven. 25', 'Lancement national — Notre jeunesse', 'Cérémonie au lac Gbassikolo et dans les chefs-lieux ; démonstration des jeunes pilotes de l’Armée de l’Air ; 68 jeunes représentant les préfectures, Conakry et la diaspora.'),
        ('Sam. 26', 'Notre jeunesse, notre République — Agir', 'Grande mobilisation citoyenne : assainissement, embellissement, plantations ; inauguration d’un terrain de proximité à Conakry.'),
        ('Dim. 27', 'Jeunesse en mouvement et citoyenneté', 'Journée populaire du sport, du civisme et du volontariat ; sport féminin ; associations de jeunesse dans les communes et les régions.'),
        ('Lun. 28', 'Mémoire et transmission — Le choix de 1958', 'Échanges entre jeunes, historiens et témoins ; visites de lieux de mémoire ; slam ; journée du drapeau au prytanée militaire ; « Et vint la liberté ».'),
        ('Mar. 29', 'La Guinéenne, excellence et relève', 'Jeunes filles et femmes à l’honneur : entrepreneuriat, sciences, culture, sport, boursières ; rencontres entre pionnières et nouvelle génération.'),
        ('Mer. 30', 'Jeunesse, emploi et opportunités', 'Grand Forum Jeunesse &amp; Avenir au Palais du Peuple : Simandou 2040 présenté à 650 jeunes ; job dating, masterclasses, village de l’innovation, Simandou Academy.'),
        ('Jeu. 1<sup>er</sup>', 'Création et Guinée en fête', 'Match de qualification du Syli National ; fan zones ; scènes ouvertes et jeunes talents ; arts urbains ; distinction de jeunes Guinéens méritants.'),
        ('Ven. 2', 'Fête nationale', 'Défilé et parade des Forces de défense et de sécurité, parade civile, culturelle et sportive ; prières ; animation par drones ; concert et feux d’artifice.'),
    ]
    css = '''
.days { margin-top: 6mm; }
.d { display: flex; gap: 8mm; align-items: flex-start; padding: 5.5mm 0; border-top: .35mm solid rgba(220,192,122,.45); }
.d .n { width: 64mm; flex: none; font-size: 15mm; line-height: 1; color: var(--gold-2); }
.d .n small { display: block; font-family: "Optima", sans-serif; font-size: 4.2mm; letter-spacing: .2em; text-transform: uppercase; color: var(--gold-3); margin-top: 1.5mm; }
.d .t b { display: block; font-weight: normal; font-size: 10mm; line-height: 1.1; color: var(--cream); }
.d .t span { display: block; font-size: 6.6mm; line-height: 1.32; color: var(--gold-3); margin-top: 1.2mm; }
.nums { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8mm; margin-top: 8mm; }
.nums .k { border-top: .5mm solid var(--gold-2); padding-top: 3.5mm; }
.nums .k b { display: block; font-weight: normal; font-size: 19mm; line-height: 1; color: var(--gold-2); }
.nums .k span { display: block; font-family: "Optima", sans-serif; font-size: 4.6mm; letter-spacing: .12em; text-transform: uppercase; color: var(--gold-3); margin-top: 2mm; line-height: 1.4; }
'''
    rows = ''.join(f'<div class="d"><div class="n">{n}<small>septembre</small></div><div class="t"><b>{b}</b><span>{t}</span></div></div>' for n, b, t in days[:6])
    rows += ''.join(f'<div class="d"><div class="n">{n}<small>octobre</small></div><div class="t"><b>{b}</b><span>{t}</span></div></div>' for n, b, t in days[6:])
    body = f'''
{title('Semaine de l’Indépendance · 25 septembre – 2 octobre 2026', 'Notre jeunesse', '« S’inspirer du passé pour construire ensemble l’avenir : notre jeunesse. » — huit jours, un fil conducteur par jour.')}
<div class="days">{rows}</div>
<div class="nums">
  <div class="k"><b>68</b><span>jeunes représentant les préfectures, Conakry et la diaspora</span></div>
  <div class="k"><b>650</b><span>jeunes au Forum Jeunesse &amp; Avenir, Palais du Peuple, 30 septembre</span></div>
  <div class="k"><b>19 ans</b><span>l’âge médian de la Guinée</span></div>
  <div class="k"><b>44 + 51</b><span>préfectures et missions mobilisées</span></div>
</div>
'''
    return shell('renouveau', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '18', css, zoom=1.32)


# ----------------------------------------------------------------------------- 19
def a19():
    ev = [
        ('1958', '28 septembre — Le NON', '1 136 324 voix : la Guinée refuse la Communauté et choisit la souveraineté.'),
        ('1958', '2 octobre — La République est proclamée', 'Ahmed Sékou Touré, premier Président ; le 12 décembre, 82<sup>e</sup> membre des Nations unies.'),
        ('1958', 'Novembre — Première Constitution', 'Et l’Union Ghana-Guinée avec Kwame Nkrumah, première tentative d’États-Unis d’Afrique.'),
        ('1960', '1<sup>er</sup> mars — Le franc guinéen', 'La Banque centrale émet la monnaie nationale : la souveraineté monétaire.'),
        ('1961', 'Loffo Camara, Bembeya Jazz', 'Première femme au gouvernement ; à Beyla, naissance de l’orchestre national.'),
        ('1963', 'Addis-Abeba — L’OUA', 'La Guinée, État fondateur de l’Organisation de l’Unité Africaine ; Diallo Telli en sera le premier Secrétaire général en 1964.'),
        ('1966', 'Nkrumah à Conakry', 'Renversé, le père de l’indépendance ghanéenne est accueilli et nommé co-président.'),
        ('1972', 'L’année des premières', 'Jeanne Martin Cissé préside le Conseil de sécurité ; Béavogui, premier Premier ministre ; Hafia, champion d’Afrique.'),
        ('1976', 'Le Syli en finale de la CAN', 'Et Hafia FC remporte sa troisième Coupe d’Afrique des clubs champions en 1977.'),
        ('1984', '3 avril — Le CMRN', 'Le colonel Lansana Conté, Président de la République ; la Deuxième République.'),
        ('1987', '« Yéké Yéké »', 'Mory Kanté, premier tube africain n° 1 des classements européens.'),
        ('2008', 'Prix Renaudot', 'Tierno Monénembo, « Le Roi de Kahel » ; en décembre, le CNDD.'),
        ('2010', 'Élection présidentielle', 'Alpha Condé élu Président de la République.'),
        ('2015', 'Kaléta', 'Le barrage de Kaléta éclaire la région ; Souapiti suivra en 2021.'),
        ('2021', '5 septembre — Le CNRD', 'Le colonel Mamadi Doumbouya ; Charte de la Transition le 27 septembre.'),
        ('2022', 'Simandou débloqué', 'Renégociation des conventions ; ouverture du procès du 28 septembre, treize ans après les faits.'),
        ('2024', '31 juillet — Le verdict', 'La justice est rendue pour les victimes du 28 septembre 2009.'),
        ('2025', 'Constitution, Simandou, élection', 'Référendum constitutionnel en septembre ; premier minerai de Simandou le 11 novembre à 11 h 11 ; présidentielle en décembre.'),
        ('2026', '31 mai — Législatives et municipales', 'L’ordre constitutionnel rétabli, la République restaurée.'),
        ('2026', '2 octobre — An 68', '500 000 visages sur le Mur national : « Fier d’être Guinéen ».'),
    ]
    css = '''
.tl { position: relative; margin-top: 6mm; display: grid; grid-template-columns: 1fr 1fr; column-gap: 26mm; row-gap: 0; }
.tl::before { content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: .6mm; background: var(--gold); transform: translateX(-50%); }
.e { position: relative; padding: 1.6mm 0 1.6mm; }
.e::after { content: ""; position: absolute; top: 6.5mm; width: 4.6mm; height: 4.6mm; border-radius: 50%; background: var(--gold); border: .8mm solid var(--cream); box-shadow: 0 0 0 .5mm var(--gold); }
.e.l { grid-column: 1; text-align: right; padding-right: 4mm; } .e.l::after { right: -16.6mm; }
.e.r { grid-column: 2; padding-left: 4mm; } .e.r::after { left: -16.6mm; }
.e .y { font-size: 12mm; line-height: 1; color: var(--green); }
.e .h { font-family: "Optima", sans-serif; font-weight: 600; font-size: 5.6mm; letter-spacing: .1em; text-transform: uppercase; color: var(--gold); margin: 1.2mm 0 1mm; }
.e .t { font-size: 5mm; line-height: 1.28; color: var(--ink-2); }
'''
    items = ''.join(f'<div class="e {"l" if i % 2 == 0 else "r"}" style="grid-row:{i + 1}"><div class="y">{y}</div><div class="h">{h}</div><div class="t">{t}</div></div>' for i, (y, h, t) in enumerate(ev))
    body = f'''
{title('Acte I → III · 1958 – 2026', 'La frise de la République', 'Soixante-huit ans en vingt dates, du NON au Mur national.')}
<div class="tl">{items}</div>
'''
    return shell('heritage', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '19', css, zoom=0.97)


# ----------------------------------------------------------------------------- 20
def a20():
    qr = QR.read_text().replace('<svg ', '<svg width="100%" ', 1)
    css = '''
.hero { display: flex; gap: 14mm; margin-top: 6mm; align-items: center; }
.hero .qr { width: 150mm; flex: none; background: #fff; padding: 8mm; border: 1mm solid var(--gold-2); }
.hero .qr svg { display: block; }
.hero .txt { flex: 1; }
.hero .url { font-family: "Optima", sans-serif; font-weight: 600; font-size: 19mm; letter-spacing: .02em; color: var(--gold-2); line-height: 1; }
.hero .p { font-size: 9mm; line-height: 1.32; color: var(--cream); margin-top: 6mm; }
.hero .p b { color: var(--gold-2); font-weight: normal; }
.steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8mm; margin-top: 12mm; }
.s { border-top: .5mm solid var(--gold-2); padding-top: 4mm; }
.s b { display: block; font-weight: normal; font-size: 21mm; line-height: 1; color: var(--gold-2); }
.s .h { font-size: 8.4mm; color: var(--cream); margin-top: 2.5mm; line-height: 1.1; }
.s span { display: block; font-size: 5.4mm; line-height: 1.32; color: var(--gold-3); margin-top: 1.5mm; }
.nums { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; margin-top: 12mm; }
.nums div { background: rgba(0,0,0,.18); padding: 6mm 8mm; border-left: 1.2mm solid var(--gold-2); }
.nums b { display: block; font-weight: normal; font-size: 22mm; line-height: 1; color: var(--gold-2); }
.nums span { display: block; font-size: 5.6mm; line-height: 1.32; color: var(--cream); margin-top: 2mm; }
.tags { margin-top: 10mm; font-family: "Optima", sans-serif; font-weight: 600; font-size: 8mm; letter-spacing: .06em; color: var(--gold-2); text-align: center; }
'''
    body = f'''
{title('Le Mur national · 68<sup>e</sup> Fête Nationale · 2 octobre 2026', 'Fier d’être Guinéen', 'Ajoute ton visage au Mur national : 500 000 visages, un seul pays, un chiffre historique dévoilé le 2 octobre.')}
<div class="hero">
  <div class="qr">{qr}</div>
  <div class="txt"><div class="url">guineen68.com</div>
    <div class="p">Scanne le code avec ton téléphone, prends ton selfie — seul, en famille, avec le drapeau — et rejoins le Mur en <b>moins d’une minute</b>. Tu reçois ta carte-souvenir avec ton numéro de participant : <b>« Je suis le Guinéen n° … »</b>.</div></div>
</div>
<div class="steps">
  <div class="s"><b>1</b><div class="h">Ta photo</div><span>Prends-la ou choisis-la dans ton téléphone.</span></div>
  <div class="s"><b>2</b><div class="h">Le cadre officiel</div><span>Drapeau, or ou fête : les trois cadres de l’An 68.</span></div>
  <div class="s"><b>3</b><div class="h">D’où es-tu ?</div><span>Ta préfecture, ou ton pays si tu vis à l’étranger.</span></div>
  <div class="s"><b>4</b><div class="h">Ta carte-souvenir</div><span>Partage-la sur WhatsApp et défie trois personnes.</span></div>
</div>
<div class="nums">
  <div><b>500 000</b><span>visages : l’objectif national, dévoilé par le Chef de l’État le 2 octobre</span></div>
  <div><b>44</b><span>préfectures dans la Course des Préfectures, classée chaque soir</span></div>
  <div><b>51</b><span>missions : la Carte de la Nation s’illumine pays par pays</span></div>
</div>
<div class="tags">#FierDêtreGuinéen · #Guinée68 · #68Fiertés</div>
'''
    return shell('renouveau', '68<sup>e</sup> Fête Nationale · 2 octobre 2026', body, '20', css, zoom=1.55)


POSTERS2 = {
    '11': ('11-l-hymne-liberte', a11), '12': ('12-les-44-prefectures', a12), '13': ('13-la-guinee-du-monde', a13),
    '14': ('14-fiere-d-etre-guineenne', a14), '15': ('15-le-syli-national', a15), '16': ('16-le-sous-sol', a16),
    '17': ('17-quatre-guinees-un-grenier', a17), '18': ('18-notre-jeunesse', a18), '19': ('19-la-frise-de-la-republique', a19),
    '20': ('20-ajoute-ton-visage', a20),
}
