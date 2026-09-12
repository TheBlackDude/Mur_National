#!/usr/bin/env python3
"""Builds the compact SVG geometry for /carte from geoBoundaries (Guinea ADM2) and Natural Earth 110m (world).

Usage: python3 scripts/build-geo.py <gin_adm2_simplified.geojson> <ne_110m_admin_0_countries.geojson>
Writes web/src/data/geo/guinea.json and web/src/data/geo/world.json. Standard library only.
"""
import json, math, sys, unicodedata

ROOT = __file__.rsplit('/scripts/', 1)[0]
GIN, NE = sys.argv[1], sys.argv[2]

def strip(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').lower()

def dp(points, tol):
    """Douglas-Peucker on a list of (x, y)."""
    if len(points) < 3: return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy)
    best, idx = 0.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / L if L else math.hypot(px - x1, py - y1)
        if d > best: best, idx = d, i
    if best > tol:
        return dp(points[:idx + 1], tol)[:-1] + dp(points[idx:], tol)
    return [points[0], points[-1]]

def rings(geom):
    if geom['type'] == 'Polygon': return geom['coordinates']
    if geom['type'] == 'MultiPolygon': return [r for poly in geom['coordinates'] for r in poly]
    return []

def path(rs, proj, tol, min_pts=4):
    out = []
    for r in rs:
        pts = dp([proj(x, y) for x, y in r], tol)
        if len(pts) < min_pts: continue
        out.append('M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z')
    return ''.join(out)

def centroid(rs, proj):
    """Area-weighted centroid of the largest ring (projected)."""
    best, area_best = None, -1
    for r in rs:
        pts = [proj(x, y) for x, y in r]
        a = cx = cy = 0.0
        for i in range(len(pts) - 1):
            (x0, y0), (x1, y1) = pts[i], pts[i + 1]
            cross = x0 * y1 - x1 * y0
            a += cross; cx += (x0 + x1) * cross; cy += (y0 + y1) * cross
        if abs(a) > area_best and a:
            area_best = abs(a); best = (cx / (3 * a), cy / (3 * a))
    return best

# ---------- Guinea ----------
gin = json.load(open(GIN))
prefs = json.load(open(f'{ROOT}/web/src/data/prefectures.json'))
by_name = {strip(p['name']): p['code'] for p in prefs if not p['code'].startswith('CKY-')}
by_name['conakry'] = 'CKY'
name_of = {p['code']: p['name'] for p in prefs}
name_of['CKY'] = 'Conakry'

xs = [x for f in gin['features'] for r in rings(f['geometry']) for x, _ in r]
ys = [y for f in gin['features'] for r in rings(f['geometry']) for _, y in r]
minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
k = math.cos(math.radians((miny + maxy) / 2))
W = 1000.0
scale = W / ((maxx - minx) * k)
H = (maxy - miny) * scale
proj_g = lambda x, y: ((x - minx) * k * scale, (maxy - y) * scale)

shapes, unmatched = [], []
for f in gin['features']:
    n = f['properties']['shapeName']
    code = by_name.get(strip(n))
    if not code: unmatched.append(n); continue
    rs = rings(f['geometry'])
    cx, cy = centroid(rs, proj_g)
    shapes.append({'code': code, 'name': name_of[code], 'd': path(rs, proj_g, 1.2), 'cx': round(cx, 1), 'cy': round(cy, 1)})
shapes.sort(key=lambda s: s['code'])
if unmatched: print('UNMATCHED Guinea names:', unmatched)
guinea = {'viewBox': f'0 0 {W:.0f} {H:.0f}', 'shapes': shapes}
json.dump(guinea, open(f'{ROOT}/web/src/data/geo/guinea.json', 'w'), ensure_ascii=False, separators=(',', ':'))

# ---------- World ----------
ne = json.load(open(NE))
countries = json.load(open(f'{ROOT}/web/src/data/countries.json'))
want = {c['iso'] for c in countries if len(c['iso']) == 2 and c['iso'] != 'XX'}
WW, WH = 1000.0, 500.0
proj_w = lambda x, y: ((x + 180) / 360 * WW, (90 - y) / 180 * WH)

land, cents = [], {}
FIX = {'FR': 'FRA', 'NO': 'NOR'}  # ISO_A2 is -99 in NE for these; match on ADM0_A3
a3_to_a2 = {v: k for k, v in FIX.items()}
for f in ne['features']:
    p = f['properties']
    if p.get('NAME') == 'Antarctica': continue
    rs = rings(f['geometry'])
    land.append(path(rs, proj_w, 1.6, 3))
    iso = p.get('ISO_A2_EH') or p.get('ISO_A2')
    if iso in (None, '-99'): iso = a3_to_a2.get(p.get('ADM0_A3'))
    if iso in want:
        if iso == 'FR':  # mainland only: largest ring within Europe's bbox
            rs = [r for r in rs if all(-6 < x < 10 and 41 < y < 52 for x, y in r)] or rs
        if iso == 'US':
            rs = [r for r in rs if all(-130 < x < -65 and 24 < y < 50 for x, y in r)] or rs
        if iso == 'RU':
            rs = [r for r in rs if any(x < 60 for x, _ in r)] or rs
        c = centroid(rs, proj_w)
        cents[iso] = [round(c[0], 1), round(c[1], 1)]
gn = centroid(rings(next(f['geometry'] for f in ne['features'] if f['properties'].get('ISO_A2_EH') == 'GN')), proj_w)
cents['GN'] = [round(gn[0], 1), round(gn[1], 1)]
missing = sorted(want - set(cents))
if missing: print('MISSING world centroids:', missing)
world = {'viewBox': f'0 0 {WW:.0f} {WH:.0f}', 'land': ''.join(land), 'centroids': cents}
json.dump(world, open(f'{ROOT}/web/src/data/geo/world.json', 'w'), ensure_ascii=False, separators=(',', ':'))

import os
for n in ('guinea', 'world'):
    print(n, os.path.getsize(f'{ROOT}/web/src/data/geo/{n}.json') // 1024, 'KB')
print('shapes:', len(shapes), 'centroids:', len(cents))
