"""« Le Mur de la Mémoire Nationale » en deux bâches (demande du Ministre SGG, 26 sept. 2026).

Le visuel Visuel Le Mur Pres.pdf (identique à VisuEl Le Mur.pdf, refait dans mur.py) est
scindé en deux, même charte (fond vert, cadres or, Cormorant / Barlow / Questrial, logos SGG
et CDA, tricolore) :

  1. 2,20 × 1,50 m — Sékou Touré au centre, plus grand ; Lansana Conté à sa droite
     (gauche du spectateur), Moussa Dadis Camara à sa gauche.
  2. 1,80 × 1,50 m — Mamadi Doumbouya au centre, plus grand ; Sékouba Konaté à sa droite,
     Alpha Condé à sa gauche.

« À sa droite » est lu du point de vue du personnage (convention protocolaire), ce qui donne
aussi l'ordre chronologique de gauche à droite. Les PDF sont à l'échelle 1 (texte vectoriel),
plus un PNG à 100 dpi et un aperçu.

    python3 mur2.py
"""
import pathlib, subprocess

from mur import CHROME, F, P, uri

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / 'sortie' / 'mur-memoire-diptyque'

DOUMBOUYA = ('mamadi-doumbouya', 'Mamadi Doumbouya', 'Président de la République · depuis 2021')
TOURE = ('sekou-toure', 'Sékou Touré', 'Président de la République · 1958 – 1984')
CONTE = ('lansana-conte', 'Lansana Conté', '1984 – 2008')
DADIS = ('moussa-dadis-camara', 'Moussa Dadis Camara', '2008 – 2009')
KONATE = ('sekouba-konate', 'Sékouba Konaté', '2009 – 2010')
CONDE = ('alpha-conde', 'Alpha Condé', '2010 – 2021')

BANNERS = [
    # (nom de fichier, largeur mm, centre, gauche du spectateur, droite du spectateur)
    ('sekou-toure-220x150', 2200, TOURE, CONTE, DADIS),
    ('mamadi-doumbouya-180x150', 1800, DOUMBOUYA, KONATE, CONDE),
]
H = 1500  # hauteur commune, mm


def photo(slug):
    p = P / 'mur' / f'{slug}.png'
    return p if p.exists() else P / f'{slug}.jpg'


def css(w):
    # Géométrie = celle de mur.py (6000 × 3000) divisée par deux ; le titre se resserre sur la bâche étroite.
    h1 = min(96, round((w - 520) / 18.1))
    return f'''
@font-face {{ font-family: "Cormorant"; src: url({uri(F / "CormorantGaramond[wght].ttf")}); font-weight: 300 700; }}
@font-face {{ font-family: "Cormorant"; src: url({uri(F / "CormorantGaramond-Italic[wght].ttf")}); font-weight: 300 700; font-style: italic; }}
@font-face {{ font-family: "Barlow"; src: url({uri(F / "Barlow-Medium.ttf")}); font-weight: 500; }}
@font-face {{ font-family: "Questrial"; src: url({uri(F / "Questrial-Regular.ttf")}); }}
@page {{ size: {w}mm {H}mm; margin: 0; }}
:root {{ --bg: #0D2318; --gold: #C9A24A; --gold-2: #E2CB8A; --cream: #FBF8F1; --red: #CE1126; --yellow: #FCD116; --gn: #009460; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: {w}mm; height: {H}mm; background: var(--bg); overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.sheet {{ position: relative; width: {w}mm; height: {H}mm; background: var(--bg); color: var(--cream); font-family: "Cormorant", serif; }}
.frame-o {{ position: absolute; inset: 52mm; border: 1.3mm solid var(--gold); }}
.frame-i {{ position: absolute; inset: 65mm; border: .65mm solid var(--gold); opacity: .85; }}
.kicker {{ position: absolute; top: 106mm; left: 0; right: 0; text-align: center; font-family: "Barlow", sans-serif; font-weight: 500; font-size: 20mm; letter-spacing: .42em; text-transform: uppercase; color: var(--gold); }}
h1 {{ position: absolute; top: {145 + (96 - h1) // 2}mm; left: 0; right: 0; text-align: center; font-weight: 600; font-size: {h1}mm; line-height: 1; letter-spacing: .03em; text-transform: uppercase; color: var(--cream); }}
.sub {{ position: absolute; top: 257mm; left: 0; right: 0; text-align: center; font-style: italic; font-weight: 500; font-size: 32mm; color: var(--gold-2); }}
.tri {{ position: absolute; top: 316mm; left: 50%; width: 330mm; height: 4.5mm; transform: translateX(-50%); display: flex; }}
.tri i {{ flex: 1; }} .tri i:nth-child(1) {{ background: var(--red); }} .tri i:nth-child(2) {{ background: var(--yellow); }} .tri i:nth-child(3) {{ background: var(--gn); }}
.pf {{ position: absolute; border: 1.3mm solid var(--gold); padding: 11mm; }}
.pf::after {{ content: ""; position: absolute; inset: 5mm; border: .65mm solid var(--gold); pointer-events: none; }}
.pf img {{ display: block; width: 100%; height: 100%; object-fit: cover; object-position: center top; }}
.name {{ position: absolute; text-align: center; font-weight: 700; font-size: 30mm; line-height: 1.08; letter-spacing: .07em; text-transform: uppercase; color: var(--cream); }}
.years {{ position: absolute; text-align: center; font-style: italic; font-weight: 500; font-size: 22mm; color: var(--gold-2); }}
.rule {{ position: absolute; left: 165mm; right: 165mm; top: 1218mm; height: .7mm; background: var(--gold); opacity: .55; }}
.week {{ position: absolute; left: 0; right: 0; top: 1240mm; text-align: center; font-style: italic; font-weight: 500; font-size: 27mm; color: var(--gold-2); }}
.sgg {{ position: absolute; left: 165mm; top: 1300mm; display: flex; align-items: center; gap: 20mm; }}
.sgg img {{ height: 110mm; }}
.sgg .t1 {{ font-family: "Questrial", sans-serif; font-size: 39mm; line-height: 1; color: var(--cream); }}
.sgg .t2 {{ font-family: "Questrial", sans-serif; font-size: 18mm; color: var(--gold-2); margin-top: 8mm; }}
.cda {{ position: absolute; right: 165mm; top: 1305mm; height: 100mm; }}
'''


def portrait(slug, name, years, left, top, w, h, name_size, pos='center top'):
    return f'''<div class="pf" style="left:{left}mm;top:{top}mm;width:{w}mm;height:{h}mm"><img src="{uri(photo(slug))}" style="object-position:{pos}"></div>
<div class="name" style="left:{left - 80}mm;width:{w + 160}mm;top:{top + h + 14}mm;font-size:{name_size}mm">{name}</div>
<div class="years" style="left:{left - 80}mm;width:{w + 160}mm;top:{top + h + 14 + round(name_size * 1.55)}mm">{years}</div>'''


def html(w, centre, gauche, droite):
    cw, ch, sw, sh, gap = 500, 720, 372, 520, 130          # cadres : centre et côtés, mm
    bottom = 1090                                            # bas des cadres, aligné
    cx = w / 2
    body = portrait(*centre, cx - cw / 2, bottom - ch, cw, ch, 36, pos='center 12%' if centre is DOUMBOUYA else 'center top')
    body += portrait(*gauche, cx - cw / 2 - gap - sw, bottom - sh, sw, sh, 30)
    body += portrait(*droite, cx + cw / 2 + gap, bottom - sh, sw, sh, 30)
    return f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>{css(w)}</style></head><body><div class="sheet">
<div class="frame-o"></div><div class="frame-i"></div>
<div class="kicker">République de Guinée · Travail – Justice – Solidarité</div>
<h1>Le Mur de la Mémoire Nationale</h1>
<div class="sub">Chefs d’État de la République de Guinée</div>
<div class="tri"><i></i><i></i><i></i></div>
{body}
<div class="rule"></div>
<div class="week">Semaine de la Fête Nationale · 25 septembre – 2 octobre 2026</div>
<div class="sgg"><img src="{uri(P / 'mur' / 'logo-sgg-icone.png')}"><div><div class="t1">sgg.gov.gn</div><div class="t2">Secrétariat Général du Gouvernement</div></div></div>
<img class="cda" src="{uri(P / 'mur' / 'logo-cda.png')}">
</div></body></html>'''


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, w, centre, gauche, droite in BANNERS:
        h = OUT / f'{name}.html'
        h.write_text(html(w, centre, gauche, droite), encoding='utf-8')
        pdf = OUT / f'le-mur-de-la-memoire-nationale-{name}.pdf'
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-pdf-header-footer',
                        f'--print-to-pdf={pdf}', h.resolve().as_uri()], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(['pdftoppm', '-r', '100', '-png', '-singlefile', str(pdf), str(OUT / f'le-mur-de-la-memoire-nationale-{name}-100dpi')], check=True)
        subprocess.run(['pdftoppm', '-r', '16', '-png', '-singlefile', str(pdf), str(OUT / f'apercu-{name}')], check=True)
        h.unlink()
        print('✓', pdf.name)


if __name__ == '__main__':
    main()
