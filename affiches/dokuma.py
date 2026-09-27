"""Bâche SGG × Dokuma 2,50 × 1,80 m (demande du 27 sept. 2026, d'après ~/Downloads/Dokuma.jpeg).

Mêmes textes et mêmes couleurs que le visuel d'origine (nuit #010E2E, blanc, jaune #E5C34E, tricolore,
Poppins). Le sceau rond du SGG est remplacé par le logo sgg.gov.gn (armoiries + texte) ; les logos CDA
et 68 rejoignent le bas de la bâche. Le logo Dokuma est refait net : icône du site dokuma.rw agrandie ×4
(photos/dokuma/dokuma-icon-x4.png) + « Dokuma / Digital Consultancy » en Poppins. Le fond reprend le
motif de circuit imprimé, dessiné en SVG. PDF à l'échelle 1 (texte vectoriel) + PNG 30 dpi.

    python3 dokuma.py
"""
import pathlib, random, subprocess

from mur import CHROME, F, P, uri

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / 'sortie' / 'dokuma'
W, H = 2500, 1800  # mm

SGG = P / 'mur' / 'logo-sgg-icone.png'
CDA = P / 'mur' / 'logo-cda.png'            # version blanche, pour fond sombre
LOGO68 = P / 'bienvenue' / 'logo68-x4.png'
DOKUMA = P / 'dokuma' / 'dokuma-icon-x4.png'


def circuit(seed, w, h, n=22):
    """Traces orthogonales terminées par un plot, comme le motif de circuit imprimé du visuel d'origine."""
    rnd = random.Random(seed)
    parts = []
    for _ in range(n):
        x, y = rnd.uniform(0, w), rnd.uniform(0, h)
        d = [f'M{x:.0f} {y:.0f}']
        for _ in range(rnd.randint(2, 4)):
            if rnd.random() < .5: x += rnd.choice([-1, 1]) * rnd.uniform(40, 160)
            else: y += rnd.choice([-1, 1]) * rnd.uniform(40, 160)
            d.append(f'L{x:.0f} {y:.0f}')
        parts.append(f'<path d="{" ".join(d)}"/><circle cx="{x:.0f}" cy="{y:.0f}" r="7"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" fill="none" stroke="#3B7DD8" stroke-width="2.2" stroke-linecap="round">'
            f'<g opacity=".32">{"".join(parts)}</g><g fill="#3B7DD8" stroke="none" opacity=".32">'
            + ''.join(f'<circle cx="{rnd.uniform(0, w):.0f}" cy="{rnd.uniform(0, h):.0f}" r="{rnd.uniform(3, 6):.0f}"/>' for _ in range(n)) + '</g></svg>')


def svg_uri(s):
    import base64
    return 'data:image/svg+xml;base64,' + base64.b64encode(s.encode()).decode()


def html():
    return f'''<!doctype html><meta charset="utf-8"><style>
@font-face {{ font-family: "Poppins"; src: url({uri(F / "Poppins-Regular.ttf")}); font-weight: 400; }}
@font-face {{ font-family: "Poppins"; src: url({uri(F / "Poppins-Italic.ttf")}); font-weight: 400; font-style: italic; }}
@font-face {{ font-family: "Poppins"; src: url({uri(F / "Poppins-Medium.ttf")}); font-weight: 500; }}
@font-face {{ font-family: "Poppins"; src: url({uri(F / "Poppins-MediumItalic.ttf")}); font-weight: 500; font-style: italic; }}
@font-face {{ font-family: "Poppins"; src: url({uri(F / "Poppins-SemiBold.ttf")}); font-weight: 600; }}
@font-face {{ font-family: "Poppins"; src: url({uri(F / "Poppins-Bold.ttf")}); font-weight: 700; }}
@font-face {{ font-family: "Questrial"; src: url({uri(F / "Questrial-Regular.ttf")}); }}
@page {{ size: {W}mm {H}mm; margin: 0; }}
:root {{ --navy: #010E2E; --navy-2: #0A1F4D; --yellow: #E5C34E; --sand: #CABB82; --frame: rgba(180,190,210,.75); --red: #CE1126; --yl: #FCD116; --gn: #009460; --blue: #2F6FD6; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: {W}mm; height: {H}mm; overflow: hidden; background: var(--navy); -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.sheet {{ position: relative; width: {W}mm; height: {H}mm; overflow: hidden; color: #fff; font-family: "Poppins", sans-serif; text-align: center;
  background: radial-gradient(1400mm 900mm at 50% 45%, #0B2352 0%, var(--navy) 70%); }}
.circ {{ position: absolute; width: 900mm; height: 700mm; }}
.circ.a {{ left: -80mm; top: -60mm; }} .circ.b {{ right: -80mm; top: -60mm; transform: scaleX(-1); }}
.circ.c {{ left: -80mm; bottom: -60mm; transform: scaleY(-1); }} .circ.d {{ right: -80mm; bottom: -60mm; transform: scale(-1); }}
.veil {{ position: absolute; inset: 0; background: radial-gradient(1500mm 1100mm at 50% 50%, rgba(1,14,46,.85) 0%, rgba(1,14,46,.35) 55%, rgba(1,14,46,0) 100%); }}
.tri {{ display: flex; height: 6mm; }} .tri i {{ flex: 1; }}
.tri i:nth-child(1) {{ background: var(--red); }} .tri i:nth-child(2) {{ background: var(--yl); }} .tri i:nth-child(3) {{ background: var(--gn); }}
.rep {{ position: absolute; top: 78mm; left: 0; right: 0; font-weight: 400; font-size: 34mm; letter-spacing: .04em; }}
.rep .tri {{ width: 1220mm; margin: 12mm auto 0; }}
.partners {{ position: absolute; top: 250mm; left: 0; right: 0; height: 330mm; display: flex; align-items: center; justify-content: center; gap: 60mm; }}
.card {{ width: 470mm; height: 330mm; border: 3mm solid var(--frame); border-radius: 44mm; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12mm;
  background: linear-gradient(160deg, rgba(255,255,255,.08), rgba(255,255,255,.02)); box-shadow: 0 0 40mm rgba(47,111,214,.25), inset 0 0 30mm rgba(255,255,255,.05); }}
.card .arm {{ height: 165mm; }}
.card .t1 {{ font-family: "Questrial", sans-serif; font-size: 46mm; line-height: 1; }}
.card .t2 {{ font-family: "Questrial", sans-serif; font-size: 16mm; line-height: 1; color: rgba(255,255,255,.85); }}
.card .dk {{ display: flex; align-items: center; gap: 14mm; }}
.card .dk img {{ height: 80mm; }}
.card .dk b {{ display: block; font-weight: 700; font-size: 60mm; line-height: .95; letter-spacing: -.01em; }}
.card .dk small {{ display: block; font-weight: 400; font-size: 17mm; line-height: 1; margin-top: 8mm; letter-spacing: .02em; color: rgba(255,255,255,.9); }}
.x {{ display: flex; align-items: center; gap: 56mm; }}
.x .sgg {{ font-weight: 700; font-size: 44mm; line-height: 1.15; text-transform: uppercase; text-align: right; }}
.x .cross {{ font-weight: 700; font-size: 110mm; line-height: 1; color: #fff; text-shadow: 0 0 14mm rgba(120,170,255,.95), 0 0 40mm rgba(47,111,214,.8); }}
.x .dok {{ font-weight: 700; font-size: 60mm; line-height: 1; letter-spacing: .06em; text-align: left; }}
.tag {{ position: absolute; top: 640mm; left: 0; right: 0; display: flex; justify-content: center; }}
.tag span {{ position: relative; font-weight: 500; font-size: 33mm; line-height: 1; color: var(--sand); padding: 8mm 40mm; }}
.tag span::before, .tag span::after {{ content: ""; position: absolute; top: 0; bottom: 0; width: 6mm; }}
.tag span::before {{ left: 0; background: var(--red); }} .tag span::after {{ right: 0; background: var(--yl); }}
h1 {{ position: absolute; top: 730mm; left: 0; right: 0; font-weight: 700; font-size: 128mm; line-height: 1.1; letter-spacing: -.01em; }}
.line2 {{ position: absolute; top: 1172mm; left: 50%; width: 860mm; transform: translateX(-50%); }}
.it {{ position: absolute; top: 1215mm; left: 0; right: 0; font-style: italic; font-weight: 500; font-size: 42mm; line-height: 1.35; }}
.clic {{ position: absolute; top: 1355mm; left: 0; right: 0; font-weight: 700; font-size: 150mm; line-height: 1; color: var(--yellow); }}
.foot {{ position: absolute; top: 1590mm; left: 0; right: 0; font-style: italic; font-weight: 500; font-size: 36mm; line-height: 1; }}
.cda {{ position: absolute; left: 110mm; bottom: 95mm; width: 300mm; }}
.l68 {{ position: absolute; right: 110mm; bottom: 80mm; width: 190mm; filter: drop-shadow(0 0 10mm rgba(0,0,0,.4)); }}
</style><body><div class="sheet">
<img class="circ a" src="{svg_uri(circuit(1, 900, 700))}"><img class="circ b" src="{svg_uri(circuit(2, 900, 700))}">
<img class="circ c" src="{svg_uri(circuit(3, 900, 700))}"><img class="circ d" src="{svg_uri(circuit(4, 900, 700))}">
<div class="veil"></div>
<div class="rep">RÉPUBLIQUE DE GUINÉE — Travail • Justice • Solidarité<div class="tri"><i></i><i></i><i></i></div></div>
<div class="partners">
  <div class="card"><img class="arm" src="{uri(SGG)}"><div class="t1">sgg.gov.gn</div><div class="t2">Secrétariat Général du Gouvernement</div></div>
  <div class="x"><div class="sgg">Secrétariat général<br>du Gouvernement</div><div class="cross">X</div><div class="dok">DOKUMA</div></div>
  <div class="card"><div class="dk"><img src="{uri(DOKUMA)}"><div><b>Dokuma</b><small>Digital Consultancy</small></div></div></div>
</div>
<div class="tag"><span>Plateforme Nationale de Gestion, Vérification et Certification des Documents (PNGVCD)</span></div>
<h1>L’avenir de l’intégrité,<br>de la confidentialité,<br>de la traçabilité des données</h1>
<div class="line2 tri"><i></i><i></i><i></i></div>
<p class="it">à travers une plateforme dotée d’une infrastructure de gestion de clefs,<br>d’un système d’horodatage et de la blockchain…</p>
<div class="clic">le tout en un clic.</div>
<p class="foot">Préserver le passé, sécuriser l’avenir</p>
<img class="cda" src="{uri(CDA)}">
<img class="l68" src="{uri(LOGO68)}">
</div></body>'''


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    h = OUT / 'sgg-dokuma-250x180.html'; h.write_text(html(), encoding='utf-8')
    pdf = OUT / 'sgg-dokuma-250x180.pdf'
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-pdf-header-footer',
                    f'--print-to-pdf={pdf}', h.resolve().as_uri()], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(['pdftoppm', '-r', '30', '-png', '-singlefile', str(pdf), str(OUT / 'sgg-dokuma-250x180')], check=True)
    print(pdf)
