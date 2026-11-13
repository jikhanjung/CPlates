#!/usr/bin/env python3
"""Rock at the surface by age, from SCAR GeoMAP v2022-08 (Cox et al. 2023, CC BY 4.0), for
the A–A′ section block.

Writes sources/sections/geology_map.png and geology_map.json: a map of the section's grid
(scripts/build_section.py; the A–A′ box and its margin, in the block's along/across km).
Each pixel holds a rock class (0 where GeoMAP has no bedrock: ice, water, moraine,
unknown) and, as alpha, the share of the pixel that is that rock. The classes are GeoMAP's own simplified legend (SIMPCODE), grouped by
age; each has the span of ages in which its rocks formed (or were metamorphosed), so the
page can tell rock that already existed at the age on screen from rock still to come.

The map is today's outcrop: what ice and erosion leave exposed, carried with East
Antarctica (plate 802) like the rest of the block.

    make fetch   # data/sources/datasets/geomap/ (sources/datasets/geomap.json)
    .venv/bin/python scripts/geology_geomap.py
"""
import json
import math
import sqlite3
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from outcrops_geomap import A, E, GPKG, M_C, MANIFEST, T_C, TABLE, polygons_of, to_3031

ROOT = Path(__file__).resolve().parents[1]
SECTION = ROOT / "sources/sections/tam_a.json"
OUT_PNG = ROOT / "sources/sections/geology_map.png"
OUT_JSON = ROOT / "sources/sections/geology_map.json"
EARTH_KM = 6371.0
PIXEL_KM = 2.0
# Drawn this many times finer, then each pixel keeps its most common class and the share of
# it that is rock (alpha), so small outcrops are not blown up to whole pixels.
FINE = 4

# GeoMAP simplified codes → classes here, oldest first. Ages [oldest, youngest] in Ma: when
# the rocks of the class formed, from GeoMAP's own age fields inside the grid (medians of
# ABSMAX/ABSMIN, rounded) and the legend's descriptions.
CLASSES = [
    {"id": "shield", "codes": [70], "age": [4000, 2500], "colour": "#e0608a",
     "name": {"ko": "선캄브리아 순상지 기반암 (주로 시생누대 편마암·그래뉼라이트)",
              "en": "Precambrian shield basement (mainly Archean gneiss, granulite)"}},
    {"id": "metamorphic", "codes": [62, 63], "age": [1000, 485], "colour": "#b07ab8",
     "name": {"ko": "원생누대–캄브리아기 변성암 (편마암·편암, 로스 조산운동 때 변성된 것 포함)",
              "en": "Proterozoic–Cambrian metamorphic rock (gneiss, schist; some metamorphosed in the Ross orogeny)"}},
    {"id": "lowgrade", "codes": [61], "age": [541, 444], "colour": "#7fae5a",
     "name": {"ko": "캄브리아기–오르도비스기 저변성 퇴적암 (버드층군, 로버트슨 베이층군 등)",
              "en": "Cambrian–Ordovician low-grade metasedimentary rock (Byrd Group, Robertson Bay Group, …)"}},
    {"id": "granite", "codes": [60], "age": [541, 470], "colour": "#e8504a",
     "name": {"ko": "로스 조산대 화강암류 (그래닛 하버 관입암 등)",
              "en": "Ross orogen granitoids (Granite Harbour Intrusives, …)"}},
    {"id": "beacon", "codes": [50], "age": [419, 201], "colour": "#d8a35a",
     "name": {"ko": "비컨 누층군 (데본기–트라이아스기 사암)", "en": "Beacon Supergroup (Devonian–Triassic sandstone)"}},
    {"id": "ferrar", "codes": [42, 43], "age": [183, 174], "colour": "#3fb6d0",
     "name": {"ko": "페라 대화성암구 (쥐라기 조립현무암·현무암)", "en": "Ferrar large igneous province (Jurassic dolerite, basalt)"}},
    {"id": "cretaceous", "codes": [41, 44, 45], "age": [145, 95], "colour": "#8fd16a",
     "name": {"ko": "백악기 화강암·미그마타이트", "en": "Cretaceous granite, migmatite"}},
    {"id": "volcanic", "codes": [30, 31, 32], "age": [66, 0], "colour": "#f6d04d",
     "name": {"ko": "신생대 화산암 (맥머도 화산암군 등)", "en": "Cenozoic volcanic rock (McMurdo Volcanic Group, …)"}},
]


def unit(lon, lat):
    lo, la = np.radians(lon), np.radians(lat)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1)


def to_lonlat(x, y):
    """EPSG:3031 metres → lon, lat in degrees, for arrays (outcrops_geomap.to_lonlat, vectorised)."""
    rho = np.hypot(x, y)
    t = rho * T_C / (A * M_C)
    phi = np.pi / 2 - 2 * np.arctan(t)
    for _ in range(20):
        s = np.sin(phi)
        phi = np.pi / 2 - 2 * np.arctan(t * ((1 - E * s) / (1 + E * s)) ** (E / 2))
    return np.degrees(np.arctan2(x, y)), -np.degrees(phi)


def main():
    section = json.loads(SECTION.read_text())
    manifest = json.loads(MANIFEST.read_text())
    (lon1, lat1), (lon2, lat2) = section["great_circle_through"]
    anchor = unit(*section["anchor"])
    pole = np.cross(unit(lon1, lat1), unit(lon2, lat2))
    pole /= np.linalg.norm(pole)
    km = EARTH_KM * math.pi / 180
    margin = section.get("margin_deg", 0.0)
    along_km = [(section["along_deg"][0] - margin) * km, (section["along_deg"][1] + margin) * km]
    across_km = [(section["across_deg"][0] - margin) * km, (section["across_deg"][1] + margin) * km]
    width = math.ceil((along_km[1] - along_km[0]) / PIXEL_KM)
    height = math.ceil((across_km[1] - across_km[0]) / PIXEL_KM)

    def block_km(lon, lat):
        v = unit(lon, lat)
        a = np.degrees(np.arctan2(np.cross(anchor, v) @ pole, v @ anchor))
        b = np.degrees(np.arcsin(np.clip(v @ pole, -1, 1)))
        return a * km, b * km

    # The grid's outline in EPSG:3031, for the GeoPackage's spatial index.
    a_deg = np.linspace(along_km[0], along_km[1], 200) / km
    b_deg = np.linspace(across_km[0], across_km[1], 100) / km
    edge = [(a, b) for a in a_deg for b in (b_deg[0], b_deg[-1])] + [(a, b) for b in b_deg for a in (a_deg[0], a_deg[-1])]
    xs, ys = [], []
    for a, b in edge:
        # The point at along a, across b: turn the anchor about the pole by a, then towards the pole by b.
        ar, br = math.radians(a), math.radians(b)
        side = np.cross(pole, anchor)
        v = math.cos(br) * (math.cos(ar) * anchor + math.sin(ar) * side) + math.sin(br) * pole
        lon, lat = math.degrees(math.atan2(v[1], v[0])), math.degrees(math.asin(v[2]))
        x, y = to_3031(lon, lat)
        xs.append(x)
        ys.append(y)
    # Check the frame: the anchor itself is at (0, 0).
    a0, b0 = block_km(*section["anchor"])
    assert abs(a0) < 1e-6 and abs(b0) < 1e-6

    by_code = {code: k + 1 for k, c in enumerate(CLASSES) for code in c["codes"]}
    db = sqlite3.connect(f"file:{GPKG}?mode=ro", uri=True)
    rows = db.execute(
        f'SELECT t.SIMPCODE, t.geom FROM "{TABLE}" t JOIN "rtree_{TABLE}_geom" r ON t.fid = r.id '
        "WHERE r.maxx >= ? AND r.minx <= ? AND r.maxy >= ? AND r.miny <= ?",
        (min(xs), max(xs), min(ys), max(ys))).fetchall()
    fine_km = PIXEL_KM / FINE
    image = Image.new("L", (width * FINE, height * FINE), 0)
    draw = ImageDraw.Draw(image)
    counts = [0] * (len(CLASSES) + 1)
    for code, blob in rows:
        k = by_code.get(code)
        if not k:
            continue
        for polygon in polygons_of(blob):
            for r, ring in enumerate(polygon):
                xy = np.array(ring)
                a, b = block_km(*to_lonlat(xy[:, 0], xy[:, 1]))
                px = (a - along_km[0]) / fine_km
                py = (across_km[1] - b) / fine_km
                if px.max() < 0 or px.min() > width * FINE or py.max() < 0 or py.min() > height * FINE:
                    continue
                # Holes (inner rings) are cleared; whatever fills them is its own polygon.
                draw.polygon(list(zip(px.tolist(), py.tolist())), fill=0 if r else k)
                counts[k] += 0 if r else 1
    fine = np.asarray(image).reshape(height, FINE, width, FINE).transpose(0, 2, 1, 3).reshape(height, width, FINE * FINE)
    votes = np.stack([(fine == k).sum(axis=2) for k in range(len(CLASSES) + 1)], axis=-1)
    votes[..., 0] = 0
    pixels = np.where(votes.max(axis=2) > 0, votes.argmax(axis=2), 0).astype(np.uint8)
    share = (fine > 0).sum(axis=2) / (FINE * FINE)
    alpha = np.round(share * 255).astype(np.uint8)
    Image.fromarray(np.stack([pixels, alpha], axis=-1), "LA").save(OUT_PNG, optimize=True)
    document = {
        "source": manifest["citation"] + ". CC BY 4.0.",
        "method": f"GeoMAP geological units by simplified class (SIMPCODE), grouped by age; drawn at "
                  f"{PIXEL_KM / FINE:g} km and kept at {PIXEL_KM:g} km (each pixel: its most common class, and the "
                  "share of it that is rock as alpha) over the section grid in the block's along/across km "
                  "(scripts/geology_geomap.py). Moraine, other unconsolidated deposits, ice and unclassified rock "
                  "are left out. Present-day outcrop, carried with plate 802.",
        "pixel_km": PIXEL_KM,
        "along_km": [round(along_km[0], 3), round(along_km[0] + width * PIXEL_KM, 3)],
        "across_km": [round(across_km[1] - height * PIXEL_KM, 3), round(across_km[1], 3)],
        "size": [width, height],
        "classes": [{"index": k + 1, **{key: c[key] for key in ("id", "age", "colour", "name")},
                     "simpcodes": c["codes"],
                     "area_km2": round(float((fine == k + 1).sum()) * fine_km ** 2)} for k, c in enumerate(CLASSES)],
    }
    OUT_JSON.write_text(json.dumps(document, ensure_ascii=False, indent=1) + "\n")
    print(f"{OUT_PNG.relative_to(ROOT)}: {width}×{height}, {OUT_PNG.stat().st_size / 1024:.0f} KiB")
    for c, n in zip(document["classes"], counts[1:]):
        print(f"  {c['id']:12s} {n:6d} polygons, {c['area_km2']:9.0f} km² drawn")


if __name__ == "__main__":
    main()
