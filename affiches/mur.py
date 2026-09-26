"""« Le Mur de la Mémoire Nationale » — Chefs d'État — refait pour une bâche de 6 × 3 m.

Reprend à l'identique le visuel VisuEl Le Mur.pdf (DCI/SGG, septembre 2026) : mêmes polices
(Cormorant Garamond, Barlow, Questrial), mêmes couleurs, mêmes textes ; le portrait du
Président vient du carton d'invitation (677 × 984 px) agrandi ×4 par Real-ESRGAN, les cinq
portraits et les logos sont extraits du PDF d'origine (portraits 2 599 × 3 552 px).

Le PDF est produit à l'échelle 1/2 (3 000 × 1 500 mm, texte vectoriel) — la limite des
lecteurs PDF est de 5 080 mm — et un PNG plein format à 50 dpi (11 811 × 5 906 px).

    python3 mur.py
"""
import base64, pathlib, subprocess

ROOT = pathlib.Path(__file__).resolve().parent
P, F, OUT = ROOT / 'photos', ROOT / 'assets' / 'fonts', ROOT / 'sortie' / 'mur-memoire-6x3'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
MIME = {'.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf'}


def uri(p):
    p = pathlib.Path(p)
    return f'data:{MIME[p.suffix]};base64,' + base64.b64encode(p.read_bytes()).decode()


PRESIDENTS = [
    ('sekou-toure', 'Sékou Touré', '1958 – 1984'),
    ('lansana-conte', 'Lansana Conté', '1984 – 2008'),
    ('moussa-dadis-camara', 'Moussa Dadis<br>Camara', '2008 – 2009'),
    ('sekouba-konate', 'Sékouba Konaté', '2009 – 2010'),
    ('alpha-conde', 'Alpha Condé', '2010 – 2021'),
]

# Géométrie en mm sur une page 6000 × 3000 (dessinée puis réduite de moitié dans le PDF).
CSS = f'''
@font-face {{ font-family: "Cormorant"; src: url({uri(F / "CormorantGaramond[wght].ttf")}); font-weight: 300 700; }}
@font-face {{ font-family: "Cormorant"; src: url({uri(F / "CormorantGaramond-Italic[wght].ttf")}); font-weight: 300 700; font-style: italic; }}
@font-face {{ font-family: "Barlow"; src: url({uri(F / "Barlow-Medium.ttf")}); font-weight: 500; }}
@font-face {{ font-family: "Questrial"; src: url({uri(F / "Questrial-Regular.ttf")}); }}
@page {{ size: 3000mm 1500mm; margin: 0; }}
:root {{ --bg: #0D2318; --gold: #C9A24A; --gold-2: #E2CB8A; --cream: #FBF8F1; --red: #CE1126; --yellow: #FCD116; --gn: #009460; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: 3000mm; height: 1500mm; background: var(--bg); overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.sheet {{ zoom: .5; position: relative; width: 6000mm; height: 3000mm; background: var(--bg); color: var(--cream); font-family: "Cormorant", serif; }}
.frame-o {{ position: absolute; inset: 105mm; border: 2.6mm solid var(--gold); }}
.frame-i {{ position: absolute; inset: 131mm; border: 1.3mm solid var(--gold); opacity: .85; }}
.kicker {{ position: absolute; top: 212mm; left: 0; right: 0; text-align: center; font-family: "Barlow", sans-serif; font-weight: 500; font-size: 40mm; letter-spacing: .42em; text-transform: uppercase; color: var(--gold); }}
h1 {{ position: absolute; top: 290mm; left: 0; right: 0; text-align: center; font-weight: 600; font-size: 205mm; line-height: 1; letter-spacing: .03em; text-transform: uppercase; color: var(--cream); }}
.sub {{ position: absolute; top: 515mm; left: 0; right: 0; text-align: center; font-style: italic; font-weight: 500; font-size: 64mm; color: var(--gold-2); }}
.tri {{ position: absolute; top: 632mm; left: 50%; width: 660mm; height: 9mm; transform: translateX(-50%); display: flex; }}
.tri i {{ flex: 1; }} .tri i:nth-child(1) {{ background: var(--red); }} .tri i:nth-child(2) {{ background: var(--yellow); }} .tri i:nth-child(3) {{ background: var(--gn); }}
.pf {{ position: absolute; border: 2.6mm solid var(--gold); padding: 22mm; }}
.pf::after {{ content: ""; position: absolute; inset: 10mm; border: 1.3mm solid var(--gold); pointer-events: none; }}
.pf img {{ display: block; width: 100%; height: 100%; object-fit: cover; object-position: center top; }}
.pres {{ left: 330mm; top: 771mm; width: 894mm; height: 1314mm; }}
.name {{ position: absolute; text-align: center; font-weight: 700; font-size: 66mm; line-height: 1.08; letter-spacing: .07em; text-transform: uppercase; color: var(--cream); }}
.years {{ position: absolute; text-align: center; font-style: italic; font-weight: 500; font-size: 44mm; color: var(--gold-2); }}
.rule {{ position: absolute; left: 330mm; right: 330mm; top: 2440mm; height: 1.4mm; background: var(--gold); opacity: .55; }}
.sgg {{ position: absolute; left: 330mm; top: 2520mm; display: flex; align-items: center; gap: 40mm; }}
.sgg img {{ height: 235mm; }}
.sgg .t1 {{ font-family: "Questrial", sans-serif; font-size: 78mm; line-height: 1; color: var(--cream); }}
.sgg .t2 {{ font-family: "Questrial", sans-serif; font-size: 36mm; color: var(--gold-2); margin-top: 16mm; }}
.week {{ position: absolute; left: 0; right: 0; top: 2600mm; text-align: center; font-style: italic; font-weight: 500; font-size: 54mm; color: var(--gold-2); }}
.cda {{ position: absolute; right: 330mm; top: 2530mm; height: 215mm; }}
'''


def html():
    five = ''
    x, w, gap, top, h = 1474, 618, 276, 1311, 828
    for i, (slug, name, years) in enumerate(PRESIDENTS):
        left = x + i * (w + gap)
        five += f'''<div class="pf" style="left:{left}mm;top:{top}mm;width:{w}mm;height:{h}mm"><img src="{uri(P / 'mur' / (slug + '.png'))}"></div>
<div class="name" style="left:{left - 60}mm;width:{w + 120}mm;top:{top + h + 21}mm;font-size:56mm">{name}</div>
<div class="years" style="left:{left}mm;width:{w}mm;top:{top + h + 196}mm">{years}</div>'''
    return f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>{CSS}</style></head><body><div class="sheet">
<div class="frame-o"></div><div class="frame-i"></div>
<div class="kicker">République de Guinée · Travail – Justice – Solidarité</div>
<h1>Le Mur de la Mémoire Nationale</h1>
<div class="sub">Chefs d’État de la République de Guinée</div>
<div class="tri"><i></i><i></i><i></i></div>
<div class="pf pres"><img src="{uri(P / 'mamadi-doumbouya.jpg')}" style="object-position:center 12%"></div>
<div class="name" style="left:230mm;width:1094mm;top:2160mm">Mamadi<br>Doumbouya</div>
<div class="years" style="left:230mm;width:1094mm;top:2335mm">Président de la République · depuis 2021</div>
{five}
<div class="rule"></div>
<div class="sgg"><img src="{uri(P / 'mur' / 'logo-sgg-icone.png')}"><div><div class="t1">sgg.gov.gn</div><div class="t2">Secrétariat Général du Gouvernement</div></div></div>
<div class="week">Semaine de la Fête Nationale · 25 septembre – 2 octobre 2026</div>
<img class="cda" src="{uri(P / 'mur' / 'logo-cda.png')}">
</div></body></html>'''


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    h = OUT / 'le-mur-de-la-memoire-nationale.html'
    h.write_text(html(), encoding='utf-8')
    pdf = OUT / 'le-mur-de-la-memoire-nationale-6x3m-echelle-1-2.pdf'
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-pdf-header-footer',
                    f'--print-to-pdf={pdf}', h.resolve().as_uri()], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # PNG plein format 6 × 3 m à 50 dpi (= 100 dpi sur le PDF à l'échelle 1/2)
    subprocess.run(['pdftoppm', '-r', '100', '-png', '-singlefile', str(pdf), str(OUT / 'le-mur-de-la-memoire-nationale-6x3m-50dpi')], check=True)
    subprocess.run(['pdftoppm', '-r', '12', '-png', '-singlefile', str(pdf), str(OUT / 'apercu')], check=True)
    h.unlink()
    print('✓', pdf.name)


if __name__ == '__main__':
    main()
