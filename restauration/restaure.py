#!/usr/bin/env python3
"""Restauration de portraits de presse et composition d'affiches officielles.

    restaure.py init NOM IMAGE [IMAGE...] [--rotation 90]   crée projets/NOM, détecte les cadres
    restaure.py cadres NOM                        régénère cadres_debug.jpg + planche_cadres.jpg
    restaure.py ajouter NOM CLE X Y L H           ajoute un cadre manqué
    restaure.py ajuster NOM CLE dx dy dl dh       décale / redimensionne un cadre
    restaure.py pli NOM CLE [CLE...]              marque des cadres traversés par un pli
    restaure.py nettoyer NOM [--ombres 0.5]       découpe et nettoie tous les portraits
    restaure.py affiche NOM                       compose l'affiche → sortie/NOM.pdf + .png
    restaure.py tout NOM                          nettoyer puis affiche

Chaque projet vit dans projets/NOM : source-N.jpg (une par page), cadres.json, affiche.toml,
portraits/, sortie/. Un membre peut réutiliser le portrait d'un autre projet :
portrait = "../autre-projet/portraits/p12.png" (chemin relatif au dossier du projet).
"""
import argparse, json, pathlib, shutil, sys, tomllib
import cv2

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from restaure import detect as D, clean as C, affiche as A

ROOT = pathlib.Path(__file__).resolve().parent
PROJETS = ROOT / 'projets'

SKELETON = '''# Affiche « {nom} » — remplir les noms puis : restaure.py tout {nom}
titre_document = "{nom}"
sur_titre = "Gouvernement de la République"
titre = "Titre de l’affiche\\nsur deux lignes"
date = "Avril 1984"
# date_italique = true          # sous-titre en italique (ex. « issu du 12e Congrès du PDG »)
source = [
  "<b>Source :</b> <i>Horoya</i> n° 00, dimanche 8 avril 1984.",
  "Portraits restaurés à partir des archives de presse — grades et fonctions tels que publiés.",
  "Présidence de la République · Secrétariat Général du Gouvernement",
]

[nettoyage]
marge = 4        # pixels rognés à l’intérieur de chaque cadre (bord imprimé)
ombres = 0.0     # 0.4–0.6 pour un journal très encré (visages bouchés)

[pied]
mention = "68<sup>e</sup> Fête Nationale\\n2 octobre 2026"
logo = "logo68.png"

# Portraits mis en avant au-dessus de la grille (un ou deux). Supprimer si aucun.
[[dirigeants]]
cle = "{first}"
grade = "Colonel"
nom = "Prénom NOM"
fonction = "Président de la République, Chef de l’État"
hauteur_mm = 110

[[groupes]]
titre = "Membres du Gouvernement"
colonnes = {cols}
ratio = "{ratio}"          # proportion largeur / hauteur des cadres
largeur_pct = 100
# espace_lignes_mm = 9     # pour aérer si l’affiche a de la place en bas
{membres}'''

MEMBRE = '''
[[groupes.membres]]
cle = "{cle}"
grade = ""
nom = ""
fonction = ""
'''


def proj(nom):
    p = PROJETS / nom
    if not p.exists():
        raise SystemExit(f'projet inconnu : {p}')
    return p


def load_frames(p):
    return json.loads((p / 'cadres.json').read_text())


def save_frames(p, frames):
    (p / 'cadres.json').write_text(json.dumps(frames, indent=1, ensure_ascii=False))


def sources(p):
    return sorted(p.glob('source-*.jpg'), key=lambda q: int(q.stem.split('-')[1]))


def write_checks(p, frames):
    for i, src in enumerate(sources(p), 1):
        img = cv2.imread(str(src))
        fs = [f for f in frames if f.get('page', 1) == i]
        suffix = f'-{i}' if len(sources(p)) > 1 else ''
        cv2.imwrite(str(p / f'cadres_debug{suffix}.jpg'), D.overlay(img, fs), [cv2.IMWRITE_JPEG_QUALITY, 90])
        cv2.imwrite(str(p / f'planche_cadres{suffix}.jpg'), D.contact_sheet(img, fs), [cv2.IMWRITE_JPEG_QUALITY, 85])
    print(f'{len(frames)} cadres → {p}/cadres_debug*.jpg et planche_cadres*.jpg')


def cmd_init(a):
    p = PROJETS / a.nom
    if p.exists() and not a.force:
        raise SystemExit(f'{p} existe déjà (--force pour recommencer)')
    p.mkdir(parents=True, exist_ok=True)
    rot = {90: cv2.ROTATE_90_COUNTERCLOCKWISE, -90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180}.get(a.rotation)
    frames = []
    for n, image in enumerate(a.images, 1):
        img = cv2.imread(image)
        if img is None:
            raise SystemExit(f'image illisible : {image}')
        if rot is not None:
            img = cv2.rotate(img, rot)
        cv2.imwrite(str(p / f'source-{n}.jpg'), img, [cv2.IMWRITE_JPEG_QUALITY, 96])
        fs = D.detect(img, a.min, a.max)
        for i, f in enumerate(fs, 1):
            f['cle'] = f'p{i:02d}' if len(a.images) == 1 else f'p{n}-{i:02d}'
            f['page'] = n
        frames += fs
    save_frames(p, frames)
    write_checks(p, frames)
    if frames:
        w = sorted(f['w'] for f in frames)[len(frames) // 2]; h = sorted(f['h'] for f in frames)[len(frames) // 2]
        ratio = f'{w} / {h}'
        cols = 8 if len(frames) > 30 else 6 if len(frames) > 18 else 4
    else:
        ratio, cols = '1 / 1', 6
    toml = SKELETON.format(nom=a.nom, first=frames[0]['cle'] if frames else 'p01', cols=cols, ratio=ratio,
                           membres=''.join(MEMBRE.format(cle=f['cle']) for f in frames[1:]))
    (p / 'affiche.toml').write_text(toml)
    print(f'projet créé : {p}\n1. vérifier cadres_debug.jpg / planche_cadres.jpg, corriger avec ajouter / ajuster / pli\n'
          f'2. remplir affiche.toml (noms, grades, fonctions)\n3. restaure.py tout {a.nom}')


def cmd_cadres(a):
    p = proj(a.nom); write_checks(p, load_frames(p))


def cmd_ajouter(a):
    p = proj(a.nom); frames = load_frames(p)
    if any(f['cle'] == a.cle for f in frames):
        raise SystemExit(f'clé déjà utilisée : {a.cle}')
    frames.append({'x': a.x, 'y': a.y, 'w': a.l, 'h': a.h, 'cle': a.cle, 'page': a.page})
    save_frames(p, frames); write_checks(p, frames)
    print(f'ajouté {a.cle} — penser à l’ajouter dans affiche.toml')


def cmd_ajuster(a):
    p = proj(a.nom); frames = load_frames(p)
    f = next((f for f in frames if f['cle'] == a.cle), None)
    if not f:
        raise SystemExit(f'clé inconnue : {a.cle}')
    f['x'] += a.dx; f['y'] += a.dy; f['w'] += a.dl; f['h'] += a.dh
    save_frames(p, frames); write_checks(p, frames)


def cmd_pli(a):
    p = proj(a.nom); frames = load_frames(p)
    for f in frames:
        if f['cle'] in a.cles:
            f['pli'] = True
    save_frames(p, frames); print('pli marqué :', ', '.join(a.cles))


def cmd_nettoyer(a):
    p = proj(a.nom); frames = load_frames(p)
    spec = tomllib.loads((p / 'affiche.toml').read_text()).get('nettoyage', {})
    inset = a.marge if a.marge is not None else spec.get('marge', 4)
    shadows = a.ombres if a.ombres is not None else spec.get('ombres', 0.0)
    imgs = {i: cv2.imread(str(src)) for i, src in enumerate(sources(p), 1)}
    out = p / 'portraits'; out.mkdir(exist_ok=True)
    done = []
    for f in frames:
        im = C.clean(imgs[f.get('page', 1)], f, inset=inset, shadows=shadows)
        cv2.imwrite(str(out / f"{f['cle']}.png"), im)
        done.append((f['cle'], im))
    cv2.imwrite(str(p / 'planche_portraits.jpg'), C.sheet(done), [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(f'{len(done)} portraits → {out} ; contrôle : {p / "planche_portraits.jpg"}')


def cmd_affiche(a):
    p = proj(a.nom)
    spec = tomllib.loads((p / 'affiche.toml').read_text())
    out = p / 'sortie'; out.mkdir(exist_ok=True)
    html_path = out / f'{a.nom}.html'
    html_path.write_text(A.build_html(spec, p / 'portraits'))
    A.render(html_path, out / f'{a.nom}.pdf', out / f'{a.nom}.png')
    print(f'affiche → {out / (a.nom + ".pdf")} (aperçu : {a.nom}.png)')


def cmd_tout(a):
    cmd_nettoyer(a); cmd_affiche(a)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('init'); s.add_argument('nom'); s.add_argument('images', nargs='+')
    s.add_argument('--rotation', type=int, default=0, choices=[0, 90, -90, 180], help='90 = tourner à gauche')
    s.add_argument('--min', type=int, default=100, help='taille minimale d’un cadre (px)')
    s.add_argument('--max', type=int, default=420, help='taille maximale d’un cadre (px)')
    s.add_argument('--force', action='store_true'); s.set_defaults(fn=cmd_init)
    s = sub.add_parser('cadres'); s.add_argument('nom'); s.set_defaults(fn=cmd_cadres)
    s = sub.add_parser('ajouter'); s.add_argument('nom'); s.add_argument('cle')
    for k in ('x', 'y', 'l', 'h'): s.add_argument(k, type=int)
    s.add_argument('--page', type=int, default=1); s.set_defaults(fn=cmd_ajouter)
    s = sub.add_parser('ajuster'); s.add_argument('nom'); s.add_argument('cle')
    for k in ('dx', 'dy', 'dl', 'dh'): s.add_argument(k, type=int)
    s.set_defaults(fn=cmd_ajuster)
    s = sub.add_parser('pli'); s.add_argument('nom'); s.add_argument('cles', nargs='+'); s.set_defaults(fn=cmd_pli)
    for name, fn in (('nettoyer', cmd_nettoyer), ('tout', cmd_tout)):
        s = sub.add_parser(name); s.add_argument('nom')
        s.add_argument('--marge', type=int); s.add_argument('--ombres', type=float); s.set_defaults(fn=fn)
    s = sub.add_parser('affiche'); s.add_argument('nom'); s.set_defaults(fn=cmd_affiche)
    a = ap.parse_args(); a.fn(a)


if __name__ == '__main__':
    main()
