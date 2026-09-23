"""Composition de l'affiche (HTML → PDF A1 via Chrome) à partir de affiche.toml.

Identité : vert Présidence #0F3B2E et or sur crème d'archive, Baskerville / Optima,
double filet or, bandes tricolores, armoiries, logo de la fête nationale en pied.
"""
import base64, html, pathlib, shutil, subprocess

ASSETS = pathlib.Path(__file__).resolve().parent.parent / 'assets'
CHROME_CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'google-chrome', 'chromium', 'chromium-browser',
]

CSS = '''
@page { size: 594mm 841mm; margin: 0; }
:root {
  --green: #0F3B2E; --gold: #B8892E; --gold-light: #DCC07A; --cream: #F4EFE3; --mat: #FBF8F1;
  --ink: #1B1A17; --ink-soft: #4A463F;
  --red: #CE1126; --yellow: #FCD116; --gn-green: #009460;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 594mm; height: 841mm; background: var(--cream); color: var(--ink);
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
  font-family: "Baskerville", "Hoefler Text", "Times New Roman", serif; }
sup { text-transform: none; font-size: 0.72em; vertical-align: super; line-height: 0; }
.tricolore { position: absolute; left: 0; right: 0; height: 6mm; display: flex; }
.tricolore i { flex: 1; } .tricolore i:nth-child(1) { background: var(--red); }
.tricolore i:nth-child(2) { background: var(--yellow); } .tricolore i:nth-child(3) { background: var(--gn-green); }
.tricolore.top { top: 0; } .tricolore.bottom { bottom: 0; }
.mount { position: absolute; top: 18mm; left: 18mm; right: 18mm; bottom: 18mm;
  border: 0.7mm solid var(--gold); outline: 0.25mm solid var(--gold); outline-offset: 1.6mm; }
.page { position: absolute; top: 30mm; left: 32mm; right: 32mm; bottom: 28mm; display: flex; flex-direction: column; }

header { text-align: center; }
header .arms { height: 44mm; display: block; margin: 0 auto 3mm; }
header .republic { font-family: "Optima", "Gill Sans", sans-serif; font-size: 7.2mm; letter-spacing: 0.32em; color: var(--green); font-weight: 600; }
header .motto { font-style: italic; font-size: 5mm; color: var(--gold); letter-spacing: 0.06em; margin-top: 1.6mm; }
header .rule { width: 120mm; height: 0.35mm; background: var(--gold); margin: 4.5mm auto 4mm; position: relative; }
header .rule::after { content: ""; position: absolute; left: 50%; top: -1.6mm; width: 3.5mm; height: 3.5mm; transform: translateX(-50%) rotate(45deg); background: var(--gold); }
header h1 { font-weight: normal; font-size: 16.5mm; line-height: 1.05; letter-spacing: 0.01em; color: var(--ink); }
header h1 small { display: block; font-size: 8mm; letter-spacing: 0.22em; text-transform: uppercase; color: var(--green); font-family: "Optima", "Gill Sans", sans-serif; font-weight: 600; margin-bottom: 2.5mm; }
header .date { font-family: "Optima", "Gill Sans", sans-serif; font-size: 6mm; letter-spacing: 0.28em; text-transform: uppercase; color: var(--gold); margin-top: 3mm; }
header .date.italic { text-transform: none; letter-spacing: 0.12em; font-style: italic; font-family: "Baskerville", serif; font-size: 7mm; }

.leaders { display: flex; justify-content: center; align-items: flex-end; gap: 30mm; margin: 10mm 0 10mm; }
.leaders:empty { margin: 0; }
.card { text-align: center; }
.frame { background: var(--mat); border: 0.6mm solid var(--gold); padding: 3mm; display: inline-block; }
.frame img { display: block; border: 0.3mm solid var(--gold-light); outline: 0.2mm solid var(--gold); outline-offset: 0.6mm; background: #fff; }
.leaders .frame { padding: 4mm; border-width: 0.9mm; box-shadow: 0 0 0 1.6mm var(--cream), 0 0 0 1.9mm var(--gold-light); }
.leaders .frame img { height: var(--h); }
figcaption { display: flex; flex-direction: column; }
.leaders figcaption { margin-top: 3.5mm; }
.leaders .rank { font-family: "Optima", "Gill Sans", sans-serif; font-size: 4mm; letter-spacing: 0.24em; text-transform: uppercase; color: var(--gold); }
.leaders .name { font-size: 8mm; color: var(--ink); margin: 1mm 0 1.2mm; }
.leaders .fn { font-style: italic; font-size: 4.8mm; color: var(--green); max-width: 260mm; margin: 0 auto; }

.section { display: flex; align-items: center; gap: 6mm; margin: 3mm 0 3.5mm; }
.grid + .section { margin-top: 9mm; }
.section::before, .section::after { content: ""; flex: 1; height: 0.3mm; background: var(--gold); }
.section span { font-family: "Optima", "Gill Sans", sans-serif; font-size: 4.4mm; letter-spacing: 0.3em; text-transform: uppercase; color: var(--green); font-weight: 600; }

/* --k grandit quand il y a moins de colonnes, pour que les légendes suivent la taille des cadres */
.grid { display: grid; grid-template-columns: repeat(var(--cols), 1fr); margin: 0 auto;
  column-gap: calc(4mm * var(--k)); row-gap: var(--rowgap, calc(6mm * var(--k))); }
.grid .frame { width: 100%; padding: calc(1.8mm * var(--k)); }
.grid .frame img { width: 100%; aspect-ratio: var(--ratio); object-fit: cover; }
.grid figcaption { margin-top: calc(2mm * var(--k)); }
.grid .rank { font-family: "Optima", "Gill Sans", sans-serif; font-size: calc(2.6mm * var(--k)); min-height: calc(3.2mm * var(--k)); letter-spacing: 0.2em; text-transform: uppercase; color: var(--gold); }
.grid .name { font-size: calc(4.5mm * var(--k)); line-height: 1.12; margin: 0.6mm 0 0.8mm; }
.grid .fn { font-style: italic; font-size: calc(3.2mm * var(--k)); line-height: 1.2; color: var(--green); padding: 0 1mm; }

footer { margin-top: auto; display: flex; align-items: flex-end; justify-content: space-between; border-top: 0.3mm solid var(--gold); padding-top: 3.5mm; }
footer .src { font-size: 3.9mm; line-height: 1.4; color: var(--ink-soft); max-width: 380mm; }
footer .src b { font-weight: normal; color: var(--ink); }
footer .an68 { display: flex; align-items: center; gap: 5mm; text-align: right; }
footer .an68 img { height: 22mm; }
footer .an68 span { font-family: "Optima", "Gill Sans", sans-serif; font-size: 3.6mm; letter-spacing: 0.14em; text-transform: uppercase; color: var(--green); line-height: 1.5; }
'''


def data_uri(path):
    p = pathlib.Path(path)
    mime = 'image/png' if p.suffix.lower() == '.png' else 'image/jpeg'
    return f"data:{mime};base64,{base64.b64encode(p.read_bytes()).decode()}"


def _br(text):
    return '<br>'.join(html.escape(line) for line in str(text).split('\n'))


def _card(pdir, m, cls='', style=''):
    path = (pdir.parent / m['portrait']) if m.get('portrait') else pdir / f"{m['cle']}.png"
    if not path.exists():
        raise SystemExit(f"portrait manquant : {path} (lancer « nettoyer » ou vérifier la clé)")
    rank = html.escape(m.get('grade', ''))
    fn = m.get('fonction', '')
    fn_html = f'<span class="fn">{html.escape(fn)}</span>' if fn else ''
    return (f'<figure class="card {cls}" style="{style}"><div class="frame"><img src="{data_uri(path)}" alt=""></div>'
            f'<figcaption><span class="rank">{rank}</span><span class="name">{html.escape(m["nom"])}</span>{fn_html}</figcaption></figure>')


def build_html(spec, pdir):
    """spec : dictionnaire issu de affiche.toml ; pdir : dossier des portraits nettoyés."""
    leaders = ''.join(_card(pdir, d, 'president', f"--h:{d.get('hauteur_mm', 110)}mm") for d in spec.get('dirigeants', []))
    groups = ''
    for g in spec.get('groupes', []):
        cols = int(g.get('colonnes', 8))
        k = min(1.5, max(1.0, 8 / cols))
        rowgap = f"{g['espace_lignes_mm']}mm" if 'espace_lignes_mm' in g else f"calc(6mm * {k})"
        if g.get('titre'):
            groups += f'<div class="section"><span>{html.escape(g["titre"])}</span></div>'
        groups += (f'<div class="grid" style="--cols:{cols}; --k:{k}; --ratio:{g.get("ratio", "1 / 1")}; '
                   f'--rowgap:{rowgap}; width:{g.get("largeur_pct", 100)}%">'
                   + ''.join(_card(pdir, m) for m in g.get('membres', [])) + '</div>')
    pied = spec.get('pied', {})
    mention = pied.get('mention', '68<sup>e</sup> Fête Nationale\n2 octobre 2026').replace('\n', '<br>')
    logo = ASSETS / pied.get('logo', 'logo68.png')
    source = '<br>'.join(spec.get('source', []))
    date_cls = 'date italic' if spec.get('date_italique') else 'date'
    return f'''<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>{html.escape(spec.get('titre_document', spec['titre']))}</title>
<style>{CSS}
{spec.get('css', '')}</style></head>
<body>
<div class="tricolore top"><i></i><i></i><i></i></div>
<div class="mount"></div>
<div class="page">
<header>
  <img class="arms" src="{data_uri(ASSETS / 'armoiries.png')}" alt="">
  <div class="republic">{html.escape(spec.get('republique', 'RÉPUBLIQUE DE GUINÉE'))}</div>
  <div class="motto">{html.escape(spec.get('devise', 'Travail · Justice · Solidarité'))}</div>
  <div class="rule"></div>
  <h1><small>{html.escape(spec.get('sur_titre', ''))}</small>{_br(spec['titre'])}</h1>
  <div class="{date_cls}">{spec.get('date', '')}</div>
</header>
<section class="leaders">{leaders}</section>
{groups}
<footer>
  <div class="src">{source}</div>
  <div class="an68"><span>{mention}</span><img src="{data_uri(logo)}" alt=""></div>
</footer>
</div>
<div class="tricolore bottom"><i></i><i></i><i></i></div>
</body></html>'''


def find_chrome():
    for c in CHROME_CANDIDATES:
        if pathlib.Path(c).exists() or shutil.which(c):
            return c
    raise SystemExit('Google Chrome introuvable : installer Chrome ou renseigner CHROME dans l’environnement')


def render(html_path, pdf_path, png_path, chrome=None):
    chrome = chrome or find_chrome()
    url = pathlib.Path(html_path).resolve().as_uri()
    base = [chrome, '--headless=new', '--disable-gpu', '--hide-scrollbars']
    subprocess.run(base + ['--no-pdf-header-footer', f'--print-to-pdf={pdf_path}', url], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    subprocess.run(base + ['--force-device-scale-factor=1', '--window-size=2245,3179', f'--screenshot={png_path}', url],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
