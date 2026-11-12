#!/usr/bin/env python3
"""Byrd Group outcrops from SCAR GeoMAP v2022-08 (Cox et al. 2023, CC BY 4.0).

Writes sources/sections/byrd_outcrops.json: the present-day outcrop outlines of the Byrd
Group's mapped units (Shackleton Limestone, Starshot Formation, Douglas Conglomerate, and
Byrd Group not split further), in longitude/latitude, for the A–A′ section block.

GeoMAP is a GeoPackage in Antarctic polar stereographic (EPSG:3031). It is read with the
standard sqlite3 module: the geometry blobs are GeoPackage WKB, unpacked here, and the
projection is inverted with Snyder's formulas (Map Projections, USGS PP 1395, eq. 7-9,
21-38), so no GIS library is needed. Rings are simplified (Douglas–Peucker, 250 m) and
rings smaller than 0.25 km² dropped: the block's grid is 27.8 km.

Present-day outcrop is what ice and erosion leave exposed, not where the units were laid
down. The ages are those of the section's record (sources/sections/tam_a.json, after
Myrow et al. 2002); GeoMAP gives the whole Byrd Group 485–541 Ma.

    make fetch   # data/sources/datasets/geomap/ (sources/datasets/geomap.json)
    .venv/bin/python scripts/outcrops_geomap.py
"""
import json
import math
import sqlite3
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "sources/datasets/geomap.json"
GPKG = ROOT / "data/sources/datasets/geomap/ATA_SCAR_GeoMAP_Geology_v2022_08.gpkg"
OUT = ROOT / "sources/sections/byrd_outcrops.json"
TABLE = "ATA_GeoMAP_geological_units_v2022_08"

TOLERANCE_M = 250.0
MIN_AREA_KM2 = 0.25

# GeoMAP formation (FMNEQUIV, within GRPEQUIV 'Byrd Group') → unit here.
FORMATIONS = {"Shackleton Limestone": "shackleton", "Starshot Formation": "starshot",
              "Douglas Conglomerate": "douglas", "": "byrd"}
UNITS = {
    "shackleton": {"name": {"ko": "섀클턴 석회암", "en": "Shackleton Limestone"}, "age": [525, 512]},
    "starshot": {"name": {"ko": "스타샷층", "en": "Starshot Formation"}, "age": [511, 485]},
    "douglas": {"name": {"ko": "더글러스 역암", "en": "Douglas Conglomerate"}, "age": [511, 492]},
    "byrd": {"name": {"ko": "버드층군 (미구분)", "en": "Byrd Group (undivided)"}, "age": [525, 485]},
}

# Measured sections of Myrow et al. (2002), eastern Holyoake Range: S1, S2 and High Ridge,
# located on their fig. 1 (by eye, about 0.5 km).
SECTIONS = [("S1", [160.2778, -82.221]), ("S2", [160.2519, -82.1985]), ("HR", [160.3444, -82.291])]

# EPSG:3031: WGS 84, polar stereographic (variant B), standard parallel 71°S, origin 0°E.
A = 6378137.0
F = 1 / 298.257223563
E = math.sqrt(F * (2 - F))
PHI_C = math.radians(71.0)


def _t(phi):
    s = math.sin(phi)
    return math.tan(math.pi / 4 - phi / 2) / ((1 - E * s) / (1 + E * s)) ** (E / 2)


M_C = math.cos(PHI_C) / math.sqrt(1 - (E * math.sin(PHI_C)) ** 2)
T_C = _t(PHI_C)


def to_lonlat(x, y):
    """EPSG:3031 metres → (lon, lat) degrees. South pole: the north-pole formulas on (−x, −y)
    with the latitude's sign turned (Snyder p. 161)."""
    rho = math.hypot(x, y)
    if rho == 0:
        return 0.0, -90.0
    t = rho * T_C / (A * M_C)
    phi = math.pi / 2 - 2 * math.atan(t)
    for _ in range(20):
        s = math.sin(phi)
        nxt = math.pi / 2 - 2 * math.atan(t * ((1 - E * s) / (1 + E * s)) ** (E / 2))
        if abs(nxt - phi) < 1e-12:
            break
        phi = nxt
    return math.degrees(math.atan2(x, y)), -math.degrees(phi)


def to_3031(lon, lat):
    phi = math.radians(-lat)
    rho = A * M_C * _t(phi) / T_C
    lam = math.radians(lon)
    return rho * math.sin(lam), rho * math.cos(lam)


def rings_of(blob):
    """GeoPackage geometry → polygon rings [[(x, y), …], …] (Polygon or MultiPolygon, any Z/M)."""
    if blob[:2] != b"GP":
        raise ValueError("not a GeoPackage geometry")
    flags = blob[3]
    envelope = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[(flags >> 1) & 7]
    rings = []

    def geometry(off):
        order = "<" if blob[off] == 1 else ">"
        kind, = struct.unpack_from(order + "I", blob, off + 1)
        off += 5
        base = kind % 1000
        dims = 2 + (kind // 1000 in (1, 2)) + 2 * (kind // 1000 == 3)
        if base == 3:
            n, = struct.unpack_from(order + "I", blob, off)
            off += 4
            for _ in range(n):
                count, = struct.unpack_from(order + "I", blob, off)
                off += 4
                values = struct.unpack_from(order + "d" * (count * dims), blob, off)
                off += 8 * count * dims
                rings.append([(values[k * dims], values[k * dims + 1]) for k in range(count)])
        elif base == 6:
            n, = struct.unpack_from(order + "I", blob, off)
            off += 4
            for _ in range(n):
                off = geometry(off)
        else:
            raise ValueError(f"unexpected WKB type {kind}")
        return off

    geometry(8 + envelope)
    return rings


def simplify(points, tolerance):
    """Douglas–Peucker on an open polyline."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        (x0, y0), (x1, y1) = points[i], points[j]
        dx, dy = x1 - x0, y1 - y0
        norm = math.hypot(dx, dy)
        worst, at = 0.0, None
        for k in range(i + 1, j):
            x, y = points[k]
            d = abs(dy * (x - x0) - dx * (y - y0)) / norm if norm else math.hypot(x - x0, y - y0)
            if d > worst:
                worst, at = d, k
        if at is not None and worst > tolerance:
            keep[at] = True
            stack += [(i, at), (at, j)]
    return [p for p, k in zip(points, keep) if k]


def area(ring):
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]))) / 2


def main():
    # The projection against EPSG Guidance Note 7-2's example for variant B (EPSG:3032, the
    # same as 3031 but with origin 70°E and false origin 6 000 000): 120°E, 75°S →
    # E 7 255 380.79, N 7 053 389.56.
    x, y = to_3031(120.0 - 70.0, -75.0)
    assert abs(x + 6e6 - 7255380.79) < 0.05 and abs(y + 6e6 - 7053389.56) < 0.05, (x, y)
    lon, lat = to_lonlat(x, y)
    assert abs(lon - 50) < 1e-9 and abs(lat + 75) < 1e-9

    manifest = json.loads(MANIFEST.read_text())
    db = sqlite3.connect(f"file:{GPKG}?mode=ro", uri=True)
    rows = db.execute(f'SELECT FMNEQUIV, geom FROM "{TABLE}" WHERE GRPEQUIV = ?', ("Byrd Group",)).fetchall()
    outlines = []
    kept = {u: [0, 0] for u in UNITS}
    for formation, blob in rows:
        unit = FORMATIONS[(formation or "").strip()]
        for ring in rings_of(blob):
            ring = ring[:-1] if ring[0] == ring[-1] else ring
            kept[unit][1] += 1
            if area(ring) < MIN_AREA_KM2 * 1e6:
                continue
            # Simplify as two halves so the closing point is kept.
            half = len(ring) // 2
            pts = simplify(ring[:half + 1], TOLERANCE_M)[:-1] + simplify(ring[half:] + ring[:1], TOLERANCE_M)[:-1]
            if len(pts) < 3:
                continue
            kept[unit][0] += 1
            outlines.append({"unit": unit, "ring": [[round(lon, 4), round(lat, 4)] for lon, lat in
                                                    (to_lonlat(x, y) for x, y in pts)]})
    document = {
        "source": manifest["citation"] + ". CC BY 4.0.",
        "method": f"GeoMAP geological units with GRPEQUIV 'Byrd Group', by formation (FMNEQUIV); rings "
                  f"simplified to {TOLERANCE_M:.0f} m and those under {MIN_AREA_KM2} km² dropped "
                  "(scripts/outcrops_geomap.py). Present-day outcrop, not depositional extent. Ages from the "
                  "section's record (Myrow et al. 2002); GeoMAP gives the whole group 485–541 Ma. Measured "
                  "sections S1, S2, HR located on Myrow et al. 2002, fig. 1.",
        "stratigraphy_note": {
            "ko": "Myrow et al. 2002의 개정 층서: 섀클턴 석회암 위를 얇은 홀리오크층이 덮고 그 위에 스타샷층이 쌓인다. "
                  "더글러스 역암은 홀리오크층 높이부터 스타샷층과 옆으로 맞물리는 안쪽(대륙 쪽) 쐐기다. GeoMAP은 "
                  "홀리오크층을 따로 그리지 않는다.",
            "en": "Myrow et al. 2002, revised stratigraphy: the thin Holyoake Formation caps the Shackleton Limestone "
                  "and the Starshot Formation lies above; the Douglas Conglomerate is an inboard wedge interfingering "
                  "with the Starshot from the Holyoake level up. GeoMAP does not map the Holyoake separately."},
        "units": UNITS,
        "outlines": outlines,
        "sections": [{"id": name, "at": at} for name, at in SECTIONS],
    }
    OUT.write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{OUT.relative_to(ROOT)}: {len(outlines)} rings, {OUT.stat().st_size / 1024:.0f} KiB")
    for unit, (n, total) in kept.items():
        print(f"  {unit:10s} {n:4d} of {total} rings")


if __name__ == "__main__":
    main()
