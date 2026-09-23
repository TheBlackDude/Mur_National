"""Nettoyage d'un portrait découpé dans une page de journal.

Enlève la teinte du papier jauni, recale les niveaux, débruite la trame, agrandit et
redonne du piqué. Options : levée des ombres (journaux très encrés) et gommage d'un pli.
"""
import cv2, numpy as np


def _inpaint_crease(crop):
    """Un pli est une bande claire et déchiquetée : on la trouve, on masque ce qui est plus
    clair qu'une ouverture verticale autour d'elle, et on remplit depuis les voisins."""
    h, w = crop.shape[:2]
    g = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    rows = g[int(h * 0.2):int(h * 0.8)].mean(axis=1)
    yc = int(h * 0.2) + int(np.argmax(rows))
    opened = cv2.morphologyEx(g, cv2.MORPH_OPEN, np.ones((21, 1), np.uint8))
    bright = (g.astype(int) - opened.astype(int)) > 18
    band = np.zeros((h, w), bool); band[max(0, yc - 16):yc + 17] = True
    mask = (bright & band).astype(np.uint8) * 255
    mask[max(0, yc - 2):yc + 3] = 255
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8))
    return cv2.inpaint(crop, mask, 5, cv2.INPAINT_TELEA)


def clean(img, frame, inset=4, scale=4, shadows=0.0):
    """Retourne le portrait nettoyé (niveaux de gris, agrandi `scale` fois)."""
    x, y, w, h = frame['x'] + inset, frame['y'] + inset, frame['w'] - 2 * inset, frame['h'] - 2 * inset
    crop = img[y:y + h, x:x + w]
    if frame.get('pli'):
        crop = _inpaint_crease(crop)
    # le papier jauni et l'encre brune : le rouge porte le plus de nuances, le bleu la tache
    b, g, r = cv2.split(crop.astype(np.float32))
    gray = 0.55 * r + 0.35 * g + 0.10 * b
    lo, hi = np.percentile(gray, 0.5), np.percentile(gray, 99.5)
    gray = np.clip((gray - lo) / max(hi - lo, 1) * 255, 0, 255).astype(np.uint8)
    if shadows:
        lut = np.array([255 * (i / 255) ** (1 - shadows * 0.5) for i in range(256)], np.uint8)
        gray = cv2.LUT(gray, lut)
    gray = cv2.fastNlMeansDenoising(gray, None, h=9, templateWindowSize=7, searchWindowSize=21)
    big = cv2.resize(gray, (w * scale, h * scale), interpolation=cv2.INTER_LANCZOS4)
    big = cv2.bilateralFilter(big, 9, 30, 9)
    blur = cv2.GaussianBlur(big, (0, 0), 3)
    big = cv2.addWeighted(big, 1.35, blur, -0.35, 0)
    lut = np.array([255 * (i / 255) ** 0.92 for i in range(256)], np.uint8)
    return cv2.LUT(big, lut)


def sheet(portraits, per_row=7):
    """Planche de contrôle des portraits nettoyés : [(cle, image), ...]."""
    tiles = []
    for cle, im in portraits:
        s = 200 / max(im.shape); small = cv2.resize(im, None, fx=s, fy=s)
        t = np.full((230, 210), 255, np.uint8)
        t[:small.shape[0], :small.shape[1]] = small
        cv2.putText(t, cle, (4, 222), cv2.FONT_HERSHEY_SIMPLEX, 0.5, 0, 1)
        tiles.append(t)
    while len(tiles) % per_row:
        tiles.append(np.full((230, 210), 255, np.uint8))
    return np.vstack([np.hstack(tiles[i:i + per_row]) for i in range(0, len(tiles), per_row)])
