"""Vidéo SENAG rebadgée An 68 (demande du 28 sept. 2026).

Reprend ~/Downloads/SENAG Video 1.mp4 (3 min 48 s, 832 × 464, 59,94 i/s) et livre une version 1920 × 1080 où
la SENAG n'apparaît plus :
  - 0 – 4,5 s   : le générique SeNAG (fond flou + logo) est remplacé par une carte crème « 68e Fête Nationale —
                  2 octobre 2026 — Mémoire et transmission, le choix de 1958 », logo 68 et sceau sgg.gov.gn ;
                  la bande-son d'origine reste dessous (fondu de la carte vers les images à 4,5 s) ;
  - 15,7 – 223 s : le filigrane SeNAG en haut à droite est effacé (delogo) et remplacé par le logo 68 sur pastille
                  blanche, présente de 4,5 s à la fin de l'interview ;
  - 67,65 – 72,7 s : le plan sur la pancarte SeNAG du stand est remplacé par les documents de la vitrine (88,75 – 91,72 s,
                  ralentis ×1,7 pour tenir 5 s), la voix ne change pas ;
  - 134,3 – 136 s : le plan large sur l'écran LED « SeNAG » est remplacé par le plan des panélistes (147,6 s) ;
  - 223 – 228,5 s : le montage de fin SeNAG est remplacé par la même carte (fondu à 222,75 s), le fondu sonore
                  d'origine joue dessous.
Le texte « Semaine Nationale des Archives de Guinée » du fond de scène (143 – 150 s) est laissé : c'est le décor,
pas le logo.

    python3 video68.py            # rend la carte et la pastille, encode, copie dans ~/Downloads
    python3 video68.py --apercu   # images fixes seulement (carte, pastille, avant/après)
"""
import pathlib, shutil, subprocess, sys
from bienvenue import FONTS, LOGO68, SGG, CHROME, uri

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / 'sortie' / 'video-senag'
SRC = pathlib.Path.home() / 'Downloads' / 'SENAG Video 1.mp4'
DEST = pathlib.Path.home() / 'Downloads' / 'Affiches Semaine An 68' / 'Vidéo SENAG'
W, H = 1920, 1080

CARTE = f'''<!doctype html><meta charset="utf-8"><style>{FONTS}
html, body {{ width: {W}px; height: {H}px; background: var(--cream); color: var(--ink); font-family: "Cormorant", serif; }}
.band {{ position: absolute; left: 0; right: 0; height: 14px; }} .band.t {{ top: 0; }} .band.b {{ bottom: 0; }}
.frame {{ position: absolute; inset: 40px; border: 3px solid var(--gold); }}
.frame::after {{ content: ""; position: absolute; inset: 8px; border: 1px solid var(--gold); opacity: .8; }}
.row {{ position: absolute; left: 0; right: 0; top: 130px; display: flex; align-items: center; justify-content: center; gap: 90px; }}
.l68 {{ height: 430px; }}
.sep {{ width: 2px; height: 480px; background: var(--gold); opacity: .7; }}
.k {{ font-family: "Barlow", sans-serif; font-weight: 500; font-size: 30px; letter-spacing: .45em; text-transform: uppercase; color: var(--gold-3); }}
h1 {{ font-weight: 600; font-size: 118px; line-height: .95; letter-spacing: .02em; text-transform: uppercase; margin: 14px 0 22px; white-space: nowrap; }}
h1 sup {{ font-size: .42em; vertical-align: .75em; text-transform: none; }}
.d {{ font-family: "Barlow", sans-serif; font-weight: 500; font-size: 58px; letter-spacing: .28em; text-transform: uppercase; color: var(--green); }}
.s {{ font-style: italic; font-weight: 500; font-size: 50px; line-height: 1; color: var(--gold-3); margin-top: 30px; white-space: nowrap; }}
.s .em {{ color: var(--green); }}
.tri {{ width: 360px; height: 10px; margin-top: 34px; }}
.sgg {{ position: absolute; left: 0; right: 0; bottom: 100px; display: flex; align-items: center; justify-content: center; gap: 28px; }}
.sgg img {{ height: 150px; }}
.sgg .t1 {{ font-family: "Questrial", sans-serif; font-size: 62px; line-height: 1; color: var(--ink); }}
.sgg .t2 {{ font-family: "Questrial", sans-serif; font-size: 25px; color: var(--ink); margin-top: 10px; }}
</style><body>
<div class="band t tri"><i></i><i></i><i></i></div><div class="band b tri"><i></i><i></i><i></i></div>
<div class="frame"></div>
<div class="row">
  <img class="l68" src="{uri(LOGO68)}">
  <div class="sep"></div>
  <div>
    <div class="k">République de Guinée</div>
    <h1>68<sup>e</sup> Fête Nationale</h1>
    <div class="d">2 octobre 2026</div>
    <div class="s"><span class="em">Mémoire et transmission</span> — Le choix de 1958</div>
    <div class="tri"><i></i><i></i><i></i></div>
  </div>
</div>
<div class="sgg"><img src="{uri(SGG)}"><div><div class="t1">sgg.gov.gn</div><div class="t2">Secrétariat Général du Gouvernement</div></div></div>
</body>'''

# Pastille remplaçant le filigrane : logo 68 sur fond blanc arrondi, 170 px (rendue dans une fenêtre plus grande
# puis recadrée — Chrome ne dessine pas les images data: dans une fenêtre de 170 px).
PASTILLE = f'''<!doctype html><meta charset="utf-8"><style>
html, body {{ margin: 0; width: 600px; height: 600px; background: transparent; }}
.chip {{ position: absolute; left: 4px; top: 4px; width: 162px; height: 162px; border-radius: 28px; background: rgba(255,255,255,.94);
        box-shadow: 0 2px 10px rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; }}
img {{ height: 138px; }}
</style><body><div class="chip"><img src="{uri(LOGO68)}"></div></body>'''


def shot(name, html, w, h):
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / f'{name}.html'; f.write_text(html, encoding='utf-8')
    png = OUT / f'{name}.png'
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
                    f'--window-size={w},{h}', '--force-device-scale-factor=1', '--virtual-time-budget=4000',
                    f'--screenshot={png}', f.resolve().as_uri()], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return png


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *map(str, args)], check=True)


# Géométrie en sortie : 832 × 464 → 1920 × 1070, bandes de 5 px haut et bas. Filigrane SeNAG ≈ x 1650–1912, y 8–120.
UP = 'scale=1920:-2:flags=lanczos,pad=1920:1080:0:(oh-ih)/2'
DELOGO = "delogo=x=1650:y=8:w=262:h=112:enable='between(t,15.6,223.2)'"
STAND, STAND_FIN, STAND_SRC, STAND_SRC_FIN = 67.65, 72.7, 88.75, 91.72   # coupes relevées image par image
LED, LED_FIN, LED_SRC = 134.3, 136.0, 147.6
FIN_INTERVIEW, DUREE = 223.0, 228.52
MARGE = 0.2   # les plans de remplacement dépassent un peu : enable= coupe net, sans image orpheline à la fin

GRAPH = f'''
[0:v]{UP},{DELOGO}[up];
[2:v]format=rgba[bd];
[up][bd]overlay=W-w-26:22:enable='between(t,4.5,{FIN_INTERVIEW + 0.25})',split=3[main][s1][s2];
[s1]trim={STAND_SRC}:{STAND_SRC_FIN},setpts=(PTS-STARTPTS)*{(STAND_FIN - STAND + MARGE) / (STAND_SRC_FIN - STAND_SRC):.4f}+{STAND}/TB[b1];
[s2]trim={LED_SRC}:{LED_SRC + LED_FIN - LED + MARGE},setpts=PTS-STARTPTS+{LED}/TB[b2];
[main][b1]overlay=0:0:eof_action=pass:enable='between(t,{STAND},{STAND_FIN})'[m1];
[m1][b2]overlay=0:0:eof_action=pass:enable='between(t,{LED},{LED_FIN})'[m2];
[1:v]format=rgba,split[c1][c2];
[c1]fade=out:st=4.5:d=0.5:alpha=1[co];
[c2]fade=in:st={FIN_INTERVIEW - 0.25}:d=0.5:alpha=1[cc];
[m2][co]overlay=0:0:eof_action=pass:enable='lte(t,5.0)'[m3];
[m3][cc]overlay=0:0:eof_action=pass:enable='gte(t,{FIN_INTERVIEW - 0.25})',format=yuv420p[v]
'''.replace('\n', '')


def apercus(carte, pastille):
    for t in (40, 70, 100, 135, 200):
        ffmpeg('-ss', t, '-i', SRC, '-i', pastille, '-filter_complex',
               f"[0]{UP},delogo=x=1650:y=8:w=262:h=112[a];[a][1]overlay=W-w-26:22", '-frames:v', 1, OUT / f'apercu-{t}s.png')


def encoder(carte, pastille):
    mp4 = OUT / 'SENAG Video 1 — An 68.mp4'
    ffmpeg('-i', SRC, '-loop', 1, '-framerate', 60, '-i', carte, '-loop', 1, '-framerate', 60, '-i', pastille,
           '-filter_complex', GRAPH, '-map', '[v]', '-map', '0:a', '-t', DUREE,
           '-c:v', 'libx264', '-preset', 'medium', '-crf', 20, '-profile:v', 'high', '-level', '4.2',
           '-c:a', 'copy', '-movflags', '+faststart', mp4)
    return mp4


if __name__ == '__main__':
    carte = shot('carte-1920x1080', CARTE, W, H)
    grande = shot('pastille-68-600', PASTILLE, 600, 600)
    pastille = OUT / 'pastille-68.png'
    ffmpeg('-i', grande, '-vf', 'crop=170:170:0:0', pastille)
    apercus(carte, pastille)
    if '--apercu' in sys.argv:
        sys.exit()
    mp4 = encoder(carte, pastille)
    DEST.mkdir(parents=True, exist_ok=True)
    shutil.copy(mp4, DEST / mp4.name)
    shutil.copy(carte, DEST / 'Carte 68e Fête Nationale 1920x1080.png')
    print(DEST / mp4.name)
