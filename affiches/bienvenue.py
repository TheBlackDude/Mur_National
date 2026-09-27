"""Portique de bienvenue de la Semaine An 68 (demande du 27 sept. 2026, d'après « SENAG Welcome Design »).

Trois bâches, même charte que le Mur de la Mémoire (vert Présidence, or, crème, Cormorant / Barlow /
Questrial, logos 68, SGG et CDA, tricolore) :

  - linteau   6,80 × 0,60 m — logo 68, blocs tricolores, « Bienvenue à la Semaine de la
              Fête Nationale — Mémoire et transmission, le choix de 1958 », logos sgg.gov.gn et CDA ;
  - montants  3,00 × 0,40 m (gauche et droit) — logo 68, Nimba (tournée vers l'entrée), logos SGG et CDA ;
  - logos     2,80 × 1,30 m et 2,80 × 1,50 m, fond crème — logo 68 en vedette, Simandou 2040 dessous, SGG et CDA aux coins du bas.

Le linteau dépasse la taille de page maximale d'un PDF (5,08 m) : il est rendu à l'échelle 1/2
(3 400 × 300 mm, texte vectoriel, à imprimer à 200 %). Les montants sont à l'échelle 1.
La Nimba vient de ~/Downloads/Nimba logo.jpg, détourée (GrabCut) et agrandie ×4 dans
photos/bienvenue/nimba.png.

    python3 bienvenue.py
"""
import pathlib, subprocess

from mur import CHROME, F, P, uri

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / 'sortie' / 'bienvenue'
A = ROOT / 'assets'

FONTS = f'''
@font-face {{ font-family: "Cormorant"; src: url({uri(F / "CormorantGaramond[wght].ttf")}); font-weight: 300 700; }}
@font-face {{ font-family: "Cormorant"; src: url({uri(F / "CormorantGaramond-Italic[wght].ttf")}); font-weight: 300 700; font-style: italic; }}
@font-face {{ font-family: "Barlow"; src: url({uri(F / "Barlow-Medium.ttf")}); font-weight: 500; }}
@font-face {{ font-family: "Questrial"; src: url({uri(F / "Questrial-Regular.ttf")}); }}
:root {{ --green: #0F3B2E; --gold: #C9A24A; --gold-2: #E2CB8A; --gold-3: #8C6A1F; --cream: #FBF8F1; --ink: #121826; --red: #CE1126; --yellow: #FCD116; --gn: #009460; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.tri {{ display: flex; }} .tri i {{ flex: 1; }}
.tri i:nth-child(1) {{ background: var(--red); }} .tri i:nth-child(2) {{ background: var(--yellow); }} .tri i:nth-child(3) {{ background: var(--gn); }}
'''

LOGO68 = A / 'logo68.png'
SGG = P / 'mur' / 'logo-sgg-icone.png'
CDA = P / 'mur' / 'logo-cda.png'            # version blanche (fond vert)
CDA_COULEUR = P / 'bienvenue' / 'logo-cda-couleur.png'  # version marine (fond crème)
NIMBA = P / 'bienvenue' / 'nimba.png'
SIMANDOU = P / 'bienvenue' / 'logo-simandou-2040.png'  # ~/Downloads/Simandou-branding.png, blanc détouré
LOGO68_X4 = P / 'bienvenue' / 'logo68-x4.png'  # assets/logo68.png agrandi ×4 (Real-ESRGAN) pour la bâche 2,80 m


def linteau():
    # 6 800 × 600 mm dessinés à l'échelle 1/2 : toutes les cotes ci-dessous sont en mm réels / 2.
    w, h = 3400, 300
    return f'''<!doctype html><meta charset="utf-8"><style>{FONTS}
@page {{ size: {w}mm {h}mm; margin: 0; }}
html, body {{ width: {w}mm; height: {h}mm; background: var(--cream); }}
.sheet {{ position: relative; width: {w}mm; height: {h}mm; background: var(--cream); color: var(--green); font-family: "Cormorant", serif; }}
.frame {{ position: absolute; inset: 14mm; border: .8mm solid var(--gold); }}
.frame::after {{ content: ""; position: absolute; inset: 4mm; border: .4mm solid var(--gold); opacity: .8; }}
.band {{ position: absolute; left: 0; right: 0; height: 5mm; }} .band.t {{ top: 0; }} .band.b {{ bottom: 0; }}
.l68 {{ position: absolute; left: 60mm; top: 50%; height: 205mm; transform: translateY(-50%); }}
.centre {{ position: absolute; left: 300mm; right: 1080mm; top: 0; bottom: 0; display: flex; align-items: center; justify-content: center; gap: 60mm; }}
.flag {{ flex: none; width: 96mm; height: 64mm; border: 1.2mm solid var(--gold); padding: 1.5mm; background: var(--cream); }}
.flag .tri {{ height: 100%; }}
.txt {{ text-align: center; }}
.k {{ font-family: "Barlow", sans-serif; font-weight: 500; font-size: 22mm; letter-spacing: .45em; text-transform: uppercase; color: var(--gold-3); }}
h1 {{ font-weight: 600; font-size: 86mm; line-height: 1; letter-spacing: .02em; text-transform: uppercase; margin: 6mm 0 8mm; white-space: nowrap; }}
h1 sup {{ font-size: .5em; vertical-align: .55em; text-transform: none; }}
h1 .dot {{ color: var(--gold); font-weight: 400; margin: 0 .12em; }}
.s {{ font-style: italic; font-weight: 500; font-size: 38mm; line-height: 1; color: var(--gold-3); white-space: nowrap; }}
.s .em {{ color: var(--green); }}
.sgg {{ position: absolute; right: 500mm; top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 12mm; }}
.sgg img {{ height: 130mm; }}
.sgg .t1 {{ font-family: "Questrial", sans-serif; font-size: 42mm; line-height: 1; color: var(--ink); }}
.sgg .t2 {{ font-family: "Questrial", sans-serif; font-size: 16.5mm; color: var(--ink); margin-top: 6mm; }}
.sep {{ position: absolute; right: 450mm; top: 50%; height: 150mm; width: .6mm; background: var(--gold); transform: translateY(-50%); opacity: .7; }}
.cda {{ position: absolute; right: 60mm; top: 50%; height: 118mm; transform: translateY(-50%); }}
</style><body><div class="sheet">
<div class="band t tri"><i></i><i></i><i></i></div><div class="band b tri"><i></i><i></i><i></i></div>
<div class="frame"></div>
<img class="l68" src="{uri(LOGO68)}">
<div class="centre">
<div class="flag"><div class="tri"><i></i><i></i><i></i></div></div>
<div class="txt">
  <div class="k">Bienvenue à la</div>
  <h1>Semaine de la Fête Nationale</h1>
  <div class="s"><span class="em">Mémoire et transmission</span> — Le choix de 1958</div>
</div>
<div class="flag"><div class="tri"><i></i><i></i><i></i></div></div>
</div>
<div class="sgg"><img src="{uri(SGG)}"><div><div class="t1">sgg.gov.gn</div><div class="t2">Secrétariat Général du Gouvernement</div></div></div>
<div class="sep"></div>
<img class="cda" src="{uri(CDA_COULEUR)}">
</div></body>'''


def montant(cote):
    # 3 000 × 400 mm à l'échelle 1. La Nimba regarde vers l'entrée : à droite sur le montant gauche,
    # retournée sur le montant droit.
    w, h = 400, 3000
    flip = 'transform: scaleX(-1);' if cote == 'droit' else ''
    return f'''<!doctype html><meta charset="utf-8"><style>{FONTS}
@page {{ size: {w}mm {h}mm; margin: 0; }}
html, body {{ width: {w}mm; height: {h}mm; background: var(--green); }}
.sheet {{ position: relative; width: {w}mm; height: {h}mm; background: var(--green); color: var(--cream); font-family: "Cormorant", serif; }}
.frame {{ position: absolute; inset: 22mm; border: 1.3mm solid var(--gold); }}
.frame::after {{ content: ""; position: absolute; inset: 6mm; border: .65mm solid var(--gold); opacity: .85; }}
.l68 {{ position: absolute; left: 50%; top: 95mm; width: 250mm; transform: translateX(-50%); }}
.tri {{ position: absolute; left: 50%; width: 230mm; height: 6mm; transform: translateX(-50%); }}
.tri.a {{ top: 400mm; }} .tri.b {{ top: 2330mm; }}
.nimba {{ position: absolute; left: 50%; top: 470mm; width: 340mm; transform: translateX(-50%); }}
.nimba img {{ width: 100%; display: block; {flip} filter: drop-shadow(0 0 10mm rgba(0,0,0,.5)); }}
.vt {{ position: absolute; left: 50%; top: 1140mm; height: 1120mm; width: 150mm; transform: translateX(-50%); }}
.vt > div {{ position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-90deg); white-space: nowrap; text-align: center; }}
.vt .k {{ font-family: "Barlow", sans-serif; font-weight: 500; font-size: 16mm; letter-spacing: .45em; text-transform: uppercase; color: var(--gold-2); margin-bottom: 8mm; }}
.vt .a {{ font-weight: 600; font-size: 54mm; line-height: 1; letter-spacing: .04em; text-transform: uppercase; color: var(--cream); }}
.vt .a sup {{ font-size: .5em; vertical-align: .55em; text-transform: none; }}
.vt .a .dot {{ color: var(--gold); font-weight: 400; margin: 0 .15em; }}
.vt .b {{ font-style: italic; font-weight: 500; font-size: 26mm; color: var(--gold-2); margin-top: 8mm; }}
.sgg {{ position: absolute; left: 0; right: 0; top: 2400mm; text-align: center; }}
.sgg img {{ height: 190mm; }}
.sgg .t1 {{ font-family: "Questrial", sans-serif; font-size: 44mm; line-height: 1; color: var(--cream); margin-top: 10mm; }}
.sgg .t2 {{ font-family: "Questrial", sans-serif; font-size: 15mm; color: var(--gold-2); margin-top: 6mm; }}
.cda {{ position: absolute; left: 50%; top: 2770mm; width: 250mm; transform: translateX(-50%); }}
</style><body><div class="sheet">
<div class="frame"></div>
<img class="l68" src="{uri(LOGO68)}">
<div class="tri a"><i></i><i></i><i></i></div>
<div class="nimba"><img src="{uri(NIMBA)}"></div>
<div class="vt"><div><div class="k">Bienvenue à la</div><div class="a">Semaine de la Fête Nationale</div><div class="b">Mémoire et transmission — Le choix de 1958</div></div></div>
<div class="tri b"><i></i><i></i><i></i></div>
<div class="sgg"><img src="{uri(SGG)}"><div class="t1">sgg.gov.gn</div><div class="t2">Secrétariat Général du Gouvernement</div></div>
<img class="cda" src="{uri(CDA)}">
</div></body>'''


def logos(w=1300):
    # 2 800 (haut) × 1 300 ou 1 500 (large) mm à l'échelle 1, fond crème comme le linteau : le logo 68 en
    # vedette, Simandou 2040 dessous, SGG et CDA en bas. Même composition quelle que soit la largeur.
    h = 2800
    return f'''<!doctype html><meta charset="utf-8"><style>{FONTS}
@page {{ size: {w}mm {h}mm; margin: 0; }}
html, body {{ width: {w}mm; height: {h}mm; background: var(--cream); }}
.sheet {{ position: relative; width: {w}mm; height: {h}mm; background: var(--cream); color: var(--ink); font-family: "Cormorant", serif; }}
.frame {{ position: absolute; inset: 50mm; border: 1.6mm solid var(--gold); }}
.frame::after {{ content: ""; position: absolute; inset: 10mm; border: .8mm solid var(--gold); opacity: .85; }}
.l68 {{ position: absolute; left: 50%; top: 420mm; width: 1000mm; transform: translateX(-50%); }}
.tri {{ position: absolute; left: 50%; width: 520mm; height: 9mm; transform: translateX(-50%); }}
.tri.a {{ top: 300mm; }} .tri.b {{ top: 1600mm; }}
.sim {{ position: absolute; left: 50%; top: 1740mm; width: 760mm; transform: translateX(-50%); }}
.rule {{ position: absolute; left: 150mm; right: 150mm; top: 2280mm; height: .8mm; background: var(--gold); opacity: .6; }}
.sgg {{ position: absolute; left: 150mm; bottom: 150mm; display: flex; align-items: center; gap: 22mm; }}
.sgg img {{ height: 220mm; }}
.sgg .t1 {{ font-family: "Questrial", sans-serif; font-size: 66mm; line-height: 1; color: var(--ink); }}
.sgg .t2 {{ font-family: "Questrial", sans-serif; font-size: 25mm; color: var(--ink); margin-top: 12mm; }}
.cda {{ position: absolute; right: 150mm; bottom: 175mm; width: 300mm; }}
</style><body><div class="sheet">
<div class="frame"></div>
<div class="tri a"><i></i><i></i><i></i></div>
<img class="l68" src="{uri(LOGO68_X4)}">
<div class="tri b"><i></i><i></i><i></i></div>
<img class="sim" src="{uri(SIMANDOU)}">
<div class="rule"></div>
<div class="sgg"><img src="{uri(SGG)}"><div><div class="t1">sgg.gov.gn</div><div class="t2">Secrétariat Général du Gouvernement</div></div></div>
<img class="cda" src="{uri(CDA_COULEUR)}">
</div></body>'''


def render(name, html, dpi):
    OUT.mkdir(parents=True, exist_ok=True)
    h = OUT / f'{name}.html'; h.write_text(html, encoding='utf-8')
    pdf = OUT / f'{name}.pdf'
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-pdf-header-footer',
                    f'--print-to-pdf={pdf}', h.resolve().as_uri()], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(['pdftoppm', '-r', str(dpi), '-png', '-singlefile', str(pdf), str(OUT / name)], check=True)
    print(pdf)


if __name__ == '__main__':
    render('linteau-680x60-echelle-1-2', linteau(), 60)
    render('montant-gauche-300x40', montant('gauche'), 30)
    render('montant-droit-300x40', montant('droit'), 30)
    render('logos-130x280', logos(1300), 30)
    render('logos-150x280', logos(1500), 30)
