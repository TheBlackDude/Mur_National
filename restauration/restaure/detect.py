"""Détection des cadres de portraits sur une page de journal photographiée.

Les bords des cadres et le contenu des photos forment de longs traits sombres ; une
ouverture morphologique en ligne les isole, leur union donne une composante par cadre.
Les cadres manqués (ombre de pli, fond très clair) s'ajoutent à la main ensuite.
"""
import cv2, numpy as np


def _paper(g):
    # les ombres de pli sont des bandes horizontales : fenêtre courte et large pour
    # que l'estimation du papier suive l'ombre verticalement tout en atteignant une gouttière
    return cv2.blur(cv2.dilate(cv2.blur(g, (3, 3)), np.ones((31, 251), np.uint8)), (31, 101)).astype(np.float32)


def detect(img, min_size=100, max_size=420, kernel=None):
    """Retourne les cadres [{x, y, w, h}] en ordre de lecture (lignes puis colonnes)."""
    K = kernel or max(40, int(min_size * 0.75))
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    dark = (g.astype(np.float32) < 0.86 * _paper(g)).astype(np.uint8) * 255
    hor = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((1, K), np.uint8))
    ver = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((K, 1), np.uint8))
    m = cv2.bitwise_or(hor, ver)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, _, stats, _ = cv2.connectedComponentsWithStats(m)
    frames = []
    for i in range(1, n):
        x, y, w, h, _ = stats[i]
        if min_size <= w <= max_size and min_size <= h <= max_size:
            frames.append({'x': int(x), 'y': int(y), 'w': int(w), 'h': int(h)})
    return reading_order(frames)


def reading_order(frames):
    """Trie par lignes (centres proches en y) puis de gauche à droite."""
    if not frames:
        return frames
    fs = sorted(frames, key=lambda f: f['y'] + f['h'] / 2)
    rows, cur = [], [fs[0]]
    for f in fs[1:]:
        prev = cur[-1]
        if abs((f['y'] + f['h'] / 2) - (prev['y'] + prev['h'] / 2)) > min(f['h'], prev['h']) * 0.5:
            rows.append(cur); cur = []
        cur.append(f)
    rows.append(cur)
    out = []
    for r in rows:
        out.extend(sorted(r, key=lambda f: f['x']))
    return out


def overlay(img, frames):
    dbg = img.copy()
    for f in frames:
        cv2.rectangle(dbg, (f['x'], f['y']), (f['x'] + f['w'] - 1, f['y'] + f['h'] - 1), (0, 0, 255), 1)
        cv2.putText(dbg, f"{f['cle']} {f['w']}x{f['h']}", (f['x'] + 3, f['y'] + 14),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 200, 0), 1)
    return dbg


def contact_sheet(img, frames, margin=12, scale=2, per_row=5):
    """Chaque cadre agrandi avec une marge et sa boîte tracée, pour vérifier les bords."""
    cell = 200 * scale
    tiles = []
    for f in frames:
        x0, y0 = max(0, f['x'] - margin), max(0, f['y'] - margin)
        crop = img[y0:f['y'] + f['h'] + margin, x0:f['x'] + f['w'] + margin].copy()
        cv2.rectangle(crop, (f['x'] - x0, f['y'] - y0), (f['x'] - x0 + f['w'] - 1, f['y'] - y0 + f['h'] - 1), (0, 0, 255), 1)
        s = min(1.0, (cell - 4) / max(crop.shape[:2]) / scale) * scale
        crop = cv2.resize(crop, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
        tile = np.full((cell + 30, cell, 3), 255, np.uint8)
        h, w = crop.shape[:2]
        tile[:min(h, cell), :min(w, cell)] = crop[:cell, :cell]
        cv2.putText(tile, f['cle'], (4, cell + 22), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 120, 0), 2)
        tiles.append(tile)
    while len(tiles) % per_row:
        tiles.append(np.full((cell + 30, cell, 3), 255, np.uint8))
    rows = [np.hstack(tiles[i:i + per_row]) for i in range(0, len(tiles), per_row)]
    return np.vstack(rows)
