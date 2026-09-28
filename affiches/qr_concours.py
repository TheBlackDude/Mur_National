"""Visuel QR du concours — https://quiz.guineen68.com/concours (demande du 28 sept. 2026).

Même charte que la carte vidéo et le portique (crème, or, encre, logo 68, sceau sgg.gov.gn). Le QR (correction H)
vient du paquet npm `qrcode` déjà installé dans scripts/ ; le logo 68 occupe le centre du code (~4 % de la surface).
Sorties dans sortie/qr-concours/ puis copie dans ~/Downloads/Affiches Semaine An 68/QR concours/ :
  - carré 2160 × 2160 px (écrans, WhatsApp, réseaux) ;
  - A4 portrait PDF (impression, QR de 12,8 cm) + aperçu PNG.

    python3 qr_concours.py [URL]
"""
import pathlib, shutil, subprocess, sys
from bienvenue import FONTS, LOGO68, SGG, CHROME, uri

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / 'sortie' / 'qr-concours'
DEST = pathlib.Path.home() / 'Downloads' / 'Affiches Semaine An 68' / 'QR concours'
URL = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].startswith('http') else 'https://quiz.guineen68.com/concours'
URL_COURTE = URL.replace('https://', '').replace('http://', '')


def qr_svg(url):
    js = f"require('qrcode').toString({url!r},{{type:'svg',errorCorrectionLevel:'H',margin:0,color:{{dark:'#121826',light:'#ffffff'}}}}).then(s=>process.stdout.write(s))"
    return subprocess.run(['node', '-e', js], cwd=ROOT.parent / 'scripts', check=True, capture_output=True, text=True).stdout


def page(w, h, unit, k, qr_px=430, logo_px=150):
    # k = facteur d'échelle (1 pour le carré 1080 px, ~0.194 mm/px pour l'A4 : 210 mm ≈ 1080 px).
    qr = 'data:image/svg+xml;base64,' + __import__('base64').b64encode(qr_svg(URL).encode()).decode()
    s = lambda px: f'{px * k:.2f}{unit}'
    return f'''<!doctype html><meta charset="utf-8"><style>{FONTS}
@page {{ size: {w}{unit} {h}{unit}; margin: 0; }}
html, body {{ width: {w}{unit}; height: {h}{unit}; background: var(--cream); color: var(--ink); font-family: "Cormorant", serif; }}
.band {{ position: absolute; left: 0; right: 0; height: {s(12)}; }} .band.t {{ top: 0; }} .band.b {{ bottom: 0; }}
.frame {{ position: absolute; inset: {s(34)}; border: {s(3)} solid var(--gold); }}
.frame::after {{ content: ""; position: absolute; inset: {s(7)}; border: {s(1)} solid var(--gold); opacity: .8; }}
.col {{ position: absolute; left: 0; right: 0; top: {s(76)}; bottom: {s(76)}; display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; }}
.l68 {{ height: {s(logo_px)}; }}
.k {{ font-family: "Barlow", sans-serif; font-weight: 500; font-size: {s(19)}; letter-spacing: .42em; text-transform: uppercase; color: var(--gold-3); margin-top: {s(18)}; }}
h1 {{ font-weight: 600; font-size: {s(74)}; line-height: 1; letter-spacing: .02em; text-transform: uppercase; margin-top: {s(8)}; }}
.sub {{ font-style: italic; font-weight: 500; font-size: {s(34)}; color: var(--green); margin-top: {s(8)}; }}
.qr {{ position: relative; width: {s(qr_px)}; height: {s(qr_px)}; padding: {s(22)}; background: #fff; border: {s(3)} solid var(--gold); border-radius: {s(20)}; margin: {s(22)} 0; }}
.qr img.code {{ width: 100%; height: 100%; display: block; image-rendering: pixelated; }}
.qr .centre {{ position: absolute; left: 50%; top: 50%; width: {s(qr_px * 0.205)}; height: {s(qr_px * 0.205)}; transform: translate(-50%,-50%); background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; }}
.qr .centre img {{ height: {s(qr_px * 0.153)}; }}
.url {{ font-family: "Questrial", sans-serif; font-size: {s(40)}; color: var(--ink); }}
.url b {{ font-weight: 400; color: var(--green); }}
.tri {{ width: {s(260)}; height: {s(7)}; margin: {s(16)} 0 {s(10)}; }}
.sgg {{ display: flex; align-items: center; gap: {s(14)}; }}
.sgg img {{ height: {s(64)}; }}
.sgg .t1 {{ font-family: "Questrial", sans-serif; font-size: {s(26)}; line-height: 1; color: var(--ink); text-align: left; }}
.sgg .t2 {{ font-family: "Questrial", sans-serif; font-size: {s(11)}; color: var(--ink); margin-top: {s(4)}; text-align: left; }}
</style><body>
<div class="band t tri"><i></i><i></i><i></i></div><div class="band b tri"><i></i><i></i><i></i></div>
<div class="frame"></div>
<div class="col">
  <div>
    <img class="l68" src="{uri(LOGO68)}">
    <div class="k">Semaine de la Fête Nationale · An 68</div>
    <h1>Participez au concours</h1>
    <div class="sub">Scannez le code avec votre téléphone</div>
  </div>
  <div class="qr"><img class="code" src="{qr}"><div class="centre"><img src="{uri(LOGO68)}"></div></div>
  <div>
    <div class="url"><b>{URL_COURTE.split('/')[0]}</b>/{'/'.join(URL_COURTE.split('/')[1:])}</div>
    <div class="tri" style="margin-left:auto;margin-right:auto"><i></i><i></i><i></i></div>
    <div class="sgg" style="justify-content:center"><img src="{uri(SGG)}"><div><div class="t1">sgg.gov.gn</div><div class="t2">Secrétariat Général du Gouvernement</div></div></div>
  </div>
</div>
</body>'''


def carre():
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / 'qr-concours-carre.html'; f.write_text(page(1080, 1080, 'px', 1), encoding='utf-8')
    png = OUT / 'qr-concours-2160.png'
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1080,1080',
                    '--force-device-scale-factor=2', '--virtual-time-budget=4000', f'--screenshot={png}', f.resolve().as_uri()],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return png


def a4():
    OUT.mkdir(parents=True, exist_ok=True)
    # A4 portrait 210 × 297 mm ; la colonne est dessinée pour 1080 px de large → 0.1944 mm/px, hauteur utile 297 mm.
    f = OUT / 'qr-concours-a4.html'; f.write_text(page(210, 297, 'mm', 210 / 1080, qr_px=660, logo_px=190), encoding='utf-8')
    pdf = OUT / 'qr-concours-a4.pdf'
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-pdf-header-footer',
                    f'--print-to-pdf={pdf}', f.resolve().as_uri()], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(['pdftoppm', '-r', '150', '-png', '-singlefile', str(pdf), str(OUT / 'qr-concours-a4')], check=True)
    return pdf


if __name__ == '__main__':
    png, pdf = carre(), a4()
    DEST.mkdir(parents=True, exist_ok=True)
    shutil.copy(png, DEST / 'QR concours — carré 2160.png')
    shutil.copy(pdf, DEST / 'QR concours — A4.pdf')
    shutil.copy(OUT / 'qr-concours-a4.png', DEST / 'QR concours — A4 (aperçu).png')
    print(DEST)
