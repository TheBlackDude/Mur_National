"""« Parcours de la mémoire » — fiches Chefs d'État au format de « Lansana Conte Continuite de l'Etat.pdf ».

Reprend à l'identique la page 04 du deck « Guinea's Independence Visual Parcour 2 » (810 × 1620 pt,
Bebas Neue / Barlow / Barlow Condensed / Questrial, fond crème, bandeau tricolore, pied vert SGG + CDA)
pour d'autres chefs d'État. Les portraits viennent de « VisuEl Le Mur.pdf » (photos/mur/, 2 599 × 3 552 px) ;
comme ils sont verticaux, le cadre photo est un peu plus haut que sur la fiche Conté (700 pt au lieu de 524)
et les blocs suivants glissent d'autant — la fiche reste dans les mêmes marges.

    python3 parcours.py            # toutes les fiches
    python3 parcours.py dadis      # une seule (clé)
"""
import base64, pathlib, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent
P, F, OUT = ROOT / 'photos' / 'mur', ROOT / 'assets' / 'fonts', ROOT / 'sortie' / 'parcours'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
MIME = {'.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf'}


def uri(p):
    p = pathlib.Path(p)
    return f'data:{MIME[p.suffix]};base64,' + base64.b64encode(p.read_bytes()).decode()


FICHES = {
    'dadis': dict(
        fichier="Moussa Dadis Camara L'Etat en transition",
        numero='05', annees='2008 – 2009', titre="L'État en transition",
        sous_titre="Entre deux Républiques, l'administration tient.",
        photo='moussa-dadis-camara.png', focus='center 18%',
        legende='LE CAPITAINE MOUSSA DADIS CAMARA',
        texte="Au décès du président Lansana Conté, le 22 décembre 2008, le Conseil national pour la "
              "démocratie et le développement (CNDD) prend la direction du pays et suspend la Constitution. "
              "Le capitaine Moussa Dadis Camara, né en 1964 à Koulé (Nzérékoré), diplômé en économie de "
              "l'Université de Conakry avant d'entrer dans l'armée en 1990, nomme le 30 décembre un Premier "
              "ministre, Kabiné Komara, et engage des audits publics ainsi qu'une campagne contre le trafic "
              "de drogue et l'impunité. Blessé lors de l'attentat du 3 décembre 2009, il quitte le pouvoir ; "
              "l'appareil administratif, lui, continue d'instruire et de conserver les actes de l'État.",
        resonance="Même dans la rupture, la permanence de l'administration protège les engagements de l'État "
                  "envers ses partenaires.",
    ),
    'konate': dict(
        fichier="Sekouba Konate L'ordre constitutionnel",
        numero='06', annees='2009 – 2010', titre="L'ordre constitutionnel",
        sous_titre='Une transition qui remet le pouvoir aux urnes.',
        photo='sekouba-konate.png', focus='center 12%',
        legende='LE GÉNÉRAL SÉKOUBA KONATÉ',
        texte="Né le 6 juin 1964 à Conakry et formé à l'Académie royale militaire de Meknès, le général "
              "Sékouba Konaté, dit « El Tigre », assure l'intérim dès décembre 2009. Les accords de "
              "Ouagadougou du 15 janvier 2010 en font le président de la transition : gouvernement d'union "
              "nationale conduit par Jean-Marie Doré, Conseil national de transition, nouvelle Constitution "
              "promulguée le 7 mai 2010, puis la première élection présidentielle ouverte depuis 1958, dont le "
              "second tour se tient le 7 novembre. Le 21 décembre 2010, il remet le pouvoir au président élu "
              "Alpha Condé : la transition a tenu parole.",
        resonance="Une passation pacifique du pouvoir est le socle de confiance sur lequel se bâtissent les "
                  "projets de long terme.",
    ),
}

# Géométrie mesurée sur la fiche Conté (PyMuPDF), en pt sur une page 810 × 1620.
PHOTO_H = 700   # 524 pt sur la fiche Conté (photo horizontale) ; portraits verticaux ici
DY = PHOTO_H - 524

CSS = f'''
@font-face {{ font-family: "Bebas"; src: url({uri(F / "BebasNeue-Regular.ttf")}); }}
@font-face {{ font-family: "Barlow"; src: url({uri(F / "Barlow-Regular.ttf")}); font-weight: 400; }}
@font-face {{ font-family: "Barlow"; src: url({uri(F / "Barlow-Medium.ttf")}); font-weight: 500; }}
@font-face {{ font-family: "BarlowC"; src: url({uri(F / "BarlowCondensed-Regular.ttf")}); font-weight: 400; }}
@font-face {{ font-family: "BarlowC"; src: url({uri(F / "BarlowCondensed-Medium.ttf")}); font-weight: 500; }}
@font-face {{ font-family: "BarlowC"; src: url({uri(F / "BarlowCondensed-SemiBold.ttf")}); font-weight: 600; }}
@font-face {{ font-family: "Questrial"; src: url({uri(F / "Questrial-Regular.ttf")}); }}
@page {{ size: 810pt 1620pt; margin: 0; }}
:root {{ --cream: #F4EFE3; --ink: #0D2318; --gold: #B8892B; --gold-2: #D4A63A; --grey: #6B6A62; --text: #1F1F1B;
        --sub: #3A3A34; --foot: #0D2318; --red: #CE1126; --yellow: #FCD116; --gn: #009460; }}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: 810pt; height: 1620pt; background: var(--cream); overflow: hidden;
             -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.sheet {{ position: relative; width: 810pt; height: 1620pt; background: var(--cream); color: var(--text); }}
.tri {{ position: absolute; top: 0; left: 0; right: 0; height: 10.5pt; display: flex; }}
.tri i {{ flex: 1; }} .tri i:nth-child(1) {{ background: var(--red); }} .tri i:nth-child(2) {{ background: var(--yellow); }} .tri i:nth-child(3) {{ background: var(--gn); }}
.kicker {{ position: absolute; left: 42pt; top: 84pt; font-family: "BarlowC"; font-weight: 500; font-size: 16.5pt; letter-spacing: .36em; color: var(--gold); text-transform: uppercase; }}
.years {{ position: absolute; left: 42pt; top: 107pt; font-family: "BarlowC"; font-weight: 600; font-size: 25.5pt; color: var(--ink); }}
.num {{ position: absolute; right: 42pt; top: 22pt; font-family: "Bebas"; font-size: 112.5pt; line-height: 1.2; color: var(--gold); }}
h1 {{ position: absolute; left: 42pt; top: 146pt; font-family: "Bebas"; font-weight: 400; font-size: 81pt; line-height: 1.2; color: var(--ink); white-space: nowrap; }}
.rule {{ position: absolute; left: 42pt; top: 251.25pt; width: 90pt; height: 2.25pt; background: var(--gold); }}
.sub {{ position: absolute; left: 42pt; top: 270pt; font-family: "Barlow"; font-weight: 500; font-size: 22.5pt; color: var(--sub); }}
.mat {{ position: absolute; left: 42pt; top: 323pt; width: 726pt; height: {PHOTO_H}pt; background: #fff; padding: 11pt;
       box-shadow: 0 6pt 22pt rgba(13, 35, 24, .10); }}
.mat img {{ display: block; width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) contrast(1.04); }}
.legende {{ position: absolute; left: 42pt; top: {862 + DY}pt; font-family: "BarlowC"; font-weight: 400; font-size: 15pt; letter-spacing: .06em; color: var(--grey); }}
.texte {{ position: absolute; left: 42pt; top: {903 + DY}pt; width: 726pt; font-family: "Barlow"; font-weight: 400; font-size: 20.2pt; line-height: 28.7pt; color: var(--text); }}
.reso {{ position: absolute; left: 42pt; top: 1413pt; width: 700pt; border-left: 4.5pt solid var(--gold); padding-left: 17.5pt; }}
.reso .k {{ font-family: "BarlowC"; font-weight: 600; font-size: 15pt; letter-spacing: .36em; color: var(--gold); text-transform: uppercase; }}
.reso .t {{ margin-top: 6pt; font-family: "Barlow"; font-weight: 500; font-size: 19.5pt; line-height: 25pt; color: var(--ink); }}
.foot {{ position: absolute; left: 0; right: 0; top: 1521pt; height: 99pt; background: var(--foot); }}
.foot .arm {{ position: absolute; left: 42pt; top: 21pt; height: 57pt; }}
.foot .sgg {{ position: absolute; left: 107pt; top: 28pt; font-family: "Questrial"; font-size: 22.5pt; line-height: 1; color: #fff; }}
.foot .sgg small {{ display: block; margin-top: 6pt; font-size: 11.2pt; color: var(--gold-2); }}
.foot .week {{ position: absolute; left: 328pt; width: 282pt; top: 30pt; text-align: center; font-family: "BarlowC"; font-weight: 500; font-size: 16.5pt; line-height: 19.5pt; letter-spacing: .12em; color: var(--cream); text-transform: uppercase; }}
.foot .cda {{ position: absolute; right: 42pt; top: 18pt; height: 63pt; }}
'''


def html(f):
    return f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>{f['titre']}</title><style>{CSS}</style></head>
<body><div class="sheet">
<div class="tri"><i></i><i></i><i></i></div>
<div class="kicker">Parcours de la mémoire</div>
<div class="years">{f['annees']}</div>
<div class="num">{f['numero']}</div>
<h1>{f['titre']}</h1>
<div class="rule"></div>
<div class="sub">{f['sous_titre']}</div>
<div class="mat"><img src="{uri(P / f['photo'])}" style="object-position:{f['focus']}"></div>
<div class="legende">{f['legende']}</div>
<div class="texte">{f['texte']}</div>
<div class="reso"><div class="k">Résonance Simandou 2040</div><div class="t">{f['resonance']}</div></div>
<div class="foot">
<img class="arm" src="{uri(P / 'logo-sgg-icone.png')}">
<div class="sgg">sgg.gov.gn<small>Secrétariat Général du Gouvernement</small></div>
<div class="week">Semaine de la Fête Nationale<br>25 septembre – 2 octobre 2026</div>
<img class="cda" src="{uri(P / 'logo-cda.png')}">
</div>
</div></body></html>'''


def main(cles):
    OUT.mkdir(parents=True, exist_ok=True)
    for cle in cles:
        f = FICHES[cle]
        h = OUT / (f['fichier'] + '.html')
        h.write_text(html(f), encoding='utf-8')
        pdf = OUT / (f['fichier'] + '.pdf')
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-pdf-header-footer',
                        f'--print-to-pdf={pdf}', h.resolve().as_uri()], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(['pdftoppm', '-r', '72', '-png', '-singlefile', str(pdf), str(OUT / f['fichier'])], check=True)
        h.unlink()
        print('✓', pdf.name)


if __name__ == '__main__':
    main(sys.argv[1:] or list(FICHES))
