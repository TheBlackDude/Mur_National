"""Restauration des photos sources pour les affiches murales de la Semaine de l'Indépendance.

Trois traitements :
  nb       photo d'archive (journal, tirage jauni) → gris neutre, niveaux, débruitage, agrandie
  couleur  photo récente → débruitage léger, agrandie, léger piqué
  detoure  portrait PNG détouré (canal alpha conservé) → gris neutre ou couleur, agrandi

Usage : ../restauration/.venv/bin/python nettoyer.py   (écrit dans photos/)
"""
import pathlib, subprocess, sys, tempfile
import cv2, numpy as np

ESRGAN = pathlib.Path(__file__).resolve().parent / 'tools' / 'realesrgan' / 'realesrgan-ncnn-vulkan'
MAX_W = 4800          # largeur maximale utile : ~120 dpi sur une bâche de 1 m, ~200 dpi en A1


def esrgan4(img):
    """Agrandit ×4 par Real-ESRGAN (réseau neuronal) ; garde le canal alpha s'il existe."""
    if not ESRGAN.exists():
        return None
    with tempfile.TemporaryDirectory() as d:
        src, dst = pathlib.Path(d) / 'in.png', pathlib.Path(d) / 'out.png'
        cv2.imwrite(str(src), img)
        # le binaire cherche « models » dans le répertoire courant : on lui donne le chemin
        r = subprocess.run([str(ESRGAN), '-i', str(src), '-o', str(dst), '-n', 'realesrgan-x4plus', '-s', '4',
                            '-m', str(ESRGAN.parent / 'models')], capture_output=True)
        if r.returncode != 0 or not dst.exists():
            return None
        return cv2.imread(str(dst), cv2.IMREAD_UNCHANGED)

D = pathlib.Path.home() / 'Downloads'
OUT = pathlib.Path(__file__).resolve().parent / 'photos'
OUT.mkdir(exist_ok=True)

# (fichier source, nom de sortie, mode, largeur minimale visée)
SOURCES = [
    # ---- Acte I · archives noir & blanc
    (D / 'le NON.jpg', 'de-gaulle-sekou-toure-1958', 'nb', 3000),
    (D / '25 août 1958.png', 'discours-25-aout-1958', 'nb', 3000),
    (D / '2-octobre-1958.jpg', 'proclamation-2-octobre-1958', 'nb', 3000),
    (D / '1963, Addis-Abeba.webp', 'addis-abeba-1963', 'nb', 3000),
    (D / "L'Union Ghana-Guinée.jpeg", 'union-ghana-guinee', 'nb', 3000),
    (D / 'Nkrumah à Conakry.jpeg', 'nkrumah-conakry', 'nb', 3000),
    (D / 'Miriam Makeba.jpeg', 'miriam-makeba', 'nb', 3000),
    (D / 'Stokely Carmichael.jpeg', 'stokely-carmichael', 'nb', 3000),
    (D / 'Amílcar Cabral et le PAIGC.jpg', 'amilcar-cabral', 'nb', 3000),
    (D / 'bembeya jazz.jpg', 'bembeya-jazz', 'nb', 3000),
    (D / 'Camara Laye.jpeg', 'camara-laye', 'nb', 3000),
    (D / 'Sory_kandia_Kouyaté.jpg', 'sory-kandia-kouyate', 'nb', 3000),
    (D / 'tierno monenembo.jpg', 'tierno-monenembo', 'nb', 3000),
    (D / 'Almamy Bocar Biro.jpeg', 'bocar-biro', 'nb', 3000),
    (D / 'Hafia FC.jpeg', 'hafia-fc', 'nb', 3000),
    (D / 'Mory Kante.jpeg', 'mory-kante', 'nb', 3000),
    (D / 'Mamady_Keita.jpeg', 'mamady-keita', 'nb', 3000),
    # ---- Acte II / III · couleur
    (D / '11 novembre 2025.jpg', 'simandou-11-novembre-2025', 'couleur', 3000),
    (D / 'Simandou débloqué.jpg', 'simandou-mine', 'couleur', 3000),
    (D / 'Le fer de Simandou.jpg', 'simandou-gisement', 'couleur', 3000),
    (D / '650 km de rail.jpeg', 'rail-650-km', 'couleur', 3000),
    (D / '2 252 km de routes.jpg', 'routes-2252-km', 'couleur', 3000),
    (D / 'En chantier.jpeg', 'koloma', 'couleur', 3000),
    (D / 'Août 2022.jpg', 'donka-bloc', 'couleur', 3000),
    (D / 'Nimba Mining Company.jpeg', 'nimba-mining', 'couleur', 3000),
    (D / "Le château d'eau.jpeg", 'chateau-d-eau', 'couleur', 3000),
    (D / 'La terre.jpeg', 'riziere', 'couleur', 3000),
    (D / 'La mer.jpg', 'peche', 'couleur', 3000),
    (D / 'Le Syli National.jpg', 'syli-national', 'couleur', 3000),
    (D / "L'or de Haute-Guinée.jpg", 'or-haute-guinee', 'couleur', 3000),
    (D / 'Conakry, capitale des libertés.jpeg', 'conakry-aerien', 'couleur', 3000),
    (D / '12 décembre 1958.jpeg', 'onu-12-decembre-1958', 'couleur', 3000),
    # ---- Portraits détourés (alpha conservé)
    (D / 'portraits/figures/fig-samory-toure.png', 'samory-toure', 'detoure', 3000),
    (D / 'portraits/figures/fig-alpha-yaya-diallo.png', 'alpha-yaya-diallo', 'detoure', 3000),
    (D / 'portraits/figures/fig-dinah-salifou.png', 'dinah-salifou', 'detoure', 3000),
    (D / 'portraits/figures/fig-togba-pivi.png', 'togba-pivi', 'detoure', 3000),
    (D / 'portraits/figures/fig-loffo-camara.png', 'loffo-camara', 'detoure', 3000),
    (D / 'portraits/figures/fig-fodeba-keita.png', 'fodeba-keita', 'detoure', 3000),
    (D / 'portraits/figures/fig-boubacar-telli-diallo.png', 'diallo-telli-fig', 'detoure', 3000),
    (D / 'portraits/compagnons/comp-telly-diallo.png', 'diallo-telli', 'detoure', 3000),
    (D / 'portraits/compagnons/comp-jeanne-martin-cisse.png', 'jeanne-martin-cisse', 'detoure', 3000),
    (D / 'portraits/figures/fig-jeanne-martin-cisse.png', 'jeanne-martin-cisse-fig', 'detoure', 3000),
    (D / 'portraits/compagnons/comp-lansana-beavogui.png', 'lansana-beavogui', 'detoure', 3000),
    (D / 'portraits/compagnons/comp-mafory-bangoura.png', 'mafory-bangoura', 'detoure', 3000),
    (D / 'portraits/figures/fig-mafory-bangoura.png', 'mafory-bangoura-fig', 'detoure', 3000),
    (D / 'portraits/compagnons/comp-saifoulaye-diallo.png', 'saifoulaye-diallo', 'detoure', 3000),
    (D / 'portraits/compagnons/comp-fodeba-keita.png', 'fodeba-keita-comp', 'detoure', 3000),
    (D / 'portraits/compagnons/comp-nabi-youla.png', 'nabi-youla', 'detoure', 3000),
    (D / 'portraits/compagnons/comp-sekou-toure.png', 'sekou-toure', 'detoure', 3000),
    (OUT / '_src_president.png', 'mamadi-doumbouya', 'couleur', 3600),
    (D / 'portraits/presidents/pres-toure.png', 'sekou-toure-pres', 'detoure', 3000),
]


def to_gray(bgr):
    """Gris neutre : le rouge porte les nuances d'un tirage jauni, le bleu la tache."""
    b, g, r = cv2.split(bgr.astype(np.float32))
    return 0.55 * r + 0.35 * g + 0.10 * b


def levels(gray, lo_p=0.4, hi_p=99.6):
    lo, hi = np.percentile(gray, lo_p), np.percentile(gray, hi_p)
    return np.clip((gray - lo) / max(hi - lo, 1) * 255, 0, 255).astype(np.uint8)


def upscale(img, min_w, max_scale=4):
    """×4 par Real-ESRGAN puis ajustement à la largeur cible ; Lanczos si le modèle manque."""
    h, w = img.shape[:2]
    target = min(MAX_W, max(w * 4, min_w))   # on garde tout le ×4 du réseau jusqu'à MAX_W
    if w >= MAX_W:
        return img
    big = esrgan4(img if img.ndim == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR))
    if big is None:
        scale = min(max_scale, max(1.0, min_w / w))
        return img if scale <= 1.01 else cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_LANCZOS4)
    if img.ndim == 2:
        big = cv2.cvtColor(big[:, :, :3], cv2.COLOR_BGR2GRAY)
    if big.shape[1] > target:
        big = cv2.resize(big, (target, round(big.shape[0] * target / big.shape[1])), interpolation=cv2.INTER_AREA)
    return big


def unsharp(img, amount=0.6, radius=2.0):
    blur = cv2.GaussianBlur(img, (0, 0), radius)
    return cv2.addWeighted(img, 1 + amount, blur, -amount, 0)


def nb(img, min_w):
    """Archive tramée : on efface la trame avant le réseau (sinon il la « sculpte »), on lisse après."""
    gray = levels(to_gray(img))
    gray = cv2.fastNlMeansDenoising(gray, None, h=12, templateWindowSize=7, searchWindowSize=21)
    gray = cv2.GaussianBlur(gray, (0, 0), 0.7)
    big = upscale(gray, min_w)
    big = cv2.bilateralFilter(big, 9, 20, 9)
    return unsharp(big, 0.2, 2.0)


def couleur(img, min_w):
    img = cv2.fastNlMeansDenoisingColored(img, None, h=3, hColor=3, templateWindowSize=7, searchWindowSize=21)
    # contraste local doux sur la luminance
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=1.4, tileGridSize=(8, 8)).apply(l)
    img = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)
    big = upscale(img, min_w)
    return unsharp(big, 0.2, 1.5)


def detoure(img, min_w, color=False):
    if img.shape[2] == 4:
        bgr, alpha = img[:, :, :3], img[:, :, 3]
    else:
        bgr, alpha = img, np.full(img.shape[:2], 255, np.uint8)
    if color:
        body = couleur(bgr, min_w)
    else:
        body = nb(bgr, min_w)
        body = cv2.cvtColor(body, cv2.COLOR_GRAY2BGR)
    h, w = body.shape[:2]
    alpha = cv2.resize(alpha, (w, h), interpolation=cv2.INTER_LANCZOS4)
    return np.dstack([body, alpha])


def main():
    only = set(sys.argv[1:])
    for src, name, mode, min_w in SOURCES:
        if only and name not in only:
            continue
        if not src.exists():
            print('ABSENT ', src); continue
        img = cv2.imread(str(src), cv2.IMREAD_UNCHANGED)
        if img is None:
            print('ILLISIBLE', src); continue
        if img.ndim == 2:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        if mode == 'nb':
            out = nb(img[:, :, :3], min_w); ext = '.jpg'
        elif mode == 'couleur':
            out = couleur(img[:, :, :3], min_w); ext = '.jpg'
        else:
            out = detoure(img, min_w, color=(mode == 'detoure-couleur')); ext = '.png'
        dst = OUT / (name + ext)
        if ext == '.jpg':
            cv2.imwrite(str(dst), out, [cv2.IMWRITE_JPEG_QUALITY, 92])
        else:
            cv2.imwrite(str(dst), out)
        print(f'{name:32s} {img.shape[1]}x{img.shape[0]} → {out.shape[1]}x{out.shape[0]}')


if __name__ == '__main__':
    main()
