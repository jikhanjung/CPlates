#!/usr/bin/env python3
"""Byrd Group outcrops traced from Myrow et al. (2002), GSA Bulletin 114, fig. 1.

Writes sources/sections/byrd_outcrops.json: simplified present-day outcrop outlines of the
lower Byrd Group (Shackleton Limestone) and the upper Byrd Group clastics (Holyoake,
Starshot and Douglas formations, not separated at the map's scale), in longitude/latitude.

The figure itself is not in this repository (it is not openly licensed). The outlines were
traced by eye from it, in its pixel coordinates (the figure as 1255×1096 px), and placed with
its own graticule:
- the regional map (left, 100 km scale bar): seven graticule crosses, fitted with an affine
  map of south polar stereographic coordinates (residuals ≤ 3.4 px, about 1.5 km);
- the Holyoake Range map (right, 10 km scale bar): the crosses at 160°E and 161°E on 82°15′S,
  north up, 18 px per km.
The outlines are simplified (a few km): the section block's grid is 27.8 km. Granite Harbour
intrusions inside the upper Byrd Group area are not cut out. Present-day outcrop is what ice
and erosion leave exposed, not where the units were deposited.

    .venv/bin/python scripts/outcrops_myrow2002.py [--check figure.png]
"""
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "sources/sections/byrd_outcrops.json"


def polar(lon, lat):
    r = np.tan(np.radians(90 + np.asarray(lat, float)) / 2)
    lon = np.radians(np.asarray(lon, float))
    return np.stack([r * np.sin(lon), -r * np.cos(lon)], axis=-1)


# Regional map: graticule crosses (lon, lat) → pixel.
CONTROL = [((155, -82), (252, 165)), ((165, -82), (576, 303)), ((155, -83), (170, 407)),
           ((170, -83), (587, 612)), ((160, -82), (420, 231)), ((165, -83), (455, 530)),
           ((160, -83), (312, 465))]
P = polar([c[0][0] for c in CONTROL], [c[0][1] for c in CONTROL])
Q = np.array([c[1] for c in CONTROL], float)
A = np.hstack([P, np.ones((len(P), 1))])
AFFINE, *_ = np.linalg.lstsq(A, Q, rcond=None)  # pixel = [x y 1] · AFFINE


def regional_to_lonlat(px):
    """Invert the affine fit, then the stereographic projection."""
    M = AFFINE[:2].T
    t = AFFINE[2]
    xy = np.linalg.solve(M, (np.asarray(px, float) - t).T).T
    lon = np.degrees(np.arctan2(xy[:, 0], -xy[:, 1]))
    r = np.hypot(xy[:, 0], xy[:, 1])
    lat = np.degrees(2 * np.arctan(r)) - 90
    return np.stack([lon, lat], axis=-1)


def holyoake_to_lonlat(px):
    px = np.asarray(px, float)
    lon = 160 + (px[:, 0] - 792) / 270  # 270 px per degree of longitude at 82°15′S
    lat = -(82.25 + (px[:, 1] - 245) / 2000)  # 18 px/km, 1′ = 1.853 km
    return np.stack([lon, lat], axis=-1)


# Outlines in figure pixels: (unit, map, points).
OUTLINES = [
    # Lower Byrd Group carbonate, Churchill Mountains strip (north of the Holyoake inset).
    ("lower", "regional", [(432, 15), (462, 15), (450, 50), (440, 100), (430, 150), (418, 190), (410, 228),
                           (380, 232), (382, 200), (398, 160), (410, 120), (420, 70), (425, 40)]),
    # Lower Byrd Group carbonate, west Queen Elizabeth Range (Cotton Plateau – Panorama Point).
    ("lower", "regional", [(325, 398), (345, 383), (368, 385), (375, 415), (372, 450), (355, 480),
                           (340, 505), (302, 505), (306, 470), (322, 440)]),
    # Lower Byrd Group carbonate, Holyoake Range (detailed map).
    ("lower", "holyoake", [(660, 45), (720, 30), (790, 40), (820, 80), (830, 150), (850, 260), (870, 330),
                           (900, 380), (940, 430), (960, 480), (965, 560), (940, 600), (905, 600), (880, 575),
                           (850, 510), (820, 450), (790, 375), (760, 300), (740, 250), (730, 210), (712, 140),
                           (680, 105), (662, 70)]),
    # Upper Byrd Group clastics, Starshot Glacier – Mount Ubique, east of the Churchill Mountains.
    ("upper", "regional", [(462, 15), (497, 15), (505, 40), (520, 60), (530, 90), (540, 120), (545, 150),
                           (530, 200), (545, 240), (540, 280), (530, 330), (500, 338), (470, 320), (440, 300),
                           (430, 270), (425, 235), (418, 200), (425, 160), (440, 110), (452, 60)]),
    # Upper Byrd Group clastics, Queen Elizabeth and Holland ranges.
    ("upper", "regional", [(380, 372), (420, 366), (460, 368), (500, 375), (530, 385), (545, 420), (545, 480),
                           (540, 520), (548, 560), (548, 630), (440, 630), (440, 600), (445, 570), (420, 575),
                           (400, 582), (377, 570), (357, 550), (333, 533), (342, 505), (360, 480), (375, 450),
                           (380, 410)]),
    # Upper Byrd Group clastics, east of the Holyoake Range (detailed map).
    ("upper", "holyoake", [(905, 150), (940, 100), (960, 15), (1175, 15), (1175, 300), (1100, 330), (1050, 380),
                           (1000, 480), (985, 470), (960, 400), (930, 330), (910, 250)]),
]

# Measured sections (Myrow et al. 2002): S1, S2 and High Ridge, eastern Holyoake Range.
SECTIONS = [("S1", (867, 187)), ("S2", (860, 142)), ("HR", (885, 327))]

UNITS = {
    "lower": {"name": {"ko": "하부 버드층군 (섀클턴 석회암)", "en": "Lower Byrd Group (Shackleton Limestone)"},
              "age": [525, 512]},
    "upper": {"name": {"ko": "상부 버드층군 (홀리오크·스타샷·더글러스층)",
                       "en": "Upper Byrd Group (Holyoake, Starshot and Douglas formations)"},
              "age": [512, 485]},
}


def lonlat(map_, pts):
    return regional_to_lonlat(pts) if map_ == "regional" else holyoake_to_lonlat(pts)


def main():
    if "--check" in sys.argv:
        from PIL import Image, ImageDraw
        image = Image.open(sys.argv[sys.argv.index("--check") + 1]).convert("RGB")
        draw = ImageDraw.Draw(image)
        for unit, _, pts in OUTLINES:
            draw.line(pts + [pts[0]], fill=(0, 140, 255) if unit == "lower" else (255, 90, 0), width=3)
        for _, p in SECTIONS:
            draw.ellipse([p[0] - 5, p[1] - 5, p[0] + 5, p[1] + 5], outline=(220, 0, 0), width=3)
        image.save(sys.argv[sys.argv.index("--check") + 2])
        return
    outlines = [{"unit": unit, "map": map_,
                 "ring": [[round(float(a), 3), round(float(b), 4)] for a, b in lonlat(map_, pts)]}
                for unit, map_, pts in OUTLINES]
    sections = [{"id": name, "at": [round(float(v), 4) for v in holyoake_to_lonlat([p])[0]]} for name, p in SECTIONS]
    document = {
        "source": "Myrow, P. M., Pope, M. C., Goodge, J. W., Fischer, W., and Palmer, A. R., 2002. "
                  "Depositional history of pre-Devonian strata and timing of Ross orogenic tectonism in the central "
                  "Transantarctic Mountains, Antarctica. GSA Bulletin 114, 1070–1088, fig. 1.",
        "method": "Traced by eye from the figure and placed with its graticule (scripts/outcrops_myrow2002.py); "
                  "simplified to a few km. Present-day outcrop, not depositional extent. Granite intrusions inside "
                  "the upper Byrd Group areas are not cut out.",
        "stratigraphy_note": {
            "ko": "Myrow et al. 2002의 개정 층서: 섀클턴 석회암 위를 얇은 홀리오크층이 덮고 그 위에 스타샷층이 쌓인다. "
                  "더글러스층(역암)은 홀리오크층 높이부터 스타샷층과 옆으로 맞물리는 안쪽(대륙 쪽) 쐐기다. 지질도는 셋을 "
                  "상부 버드층군으로 묶는다.",
            "en": "Myrow et al. 2002, revised stratigraphy: the thin Holyoake Formation caps the Shackleton Limestone "
                  "and the Starshot Formation lies above; the Douglas Formation (conglomerate) is an inboard wedge "
                  "interfingering with the Starshot from the Holyoake level up. The map groups the three as the "
                  "upper Byrd Group."},
        "units": UNITS,
        "outlines": outlines,
        "sections": sections,
    }
    OUT.write_text(json.dumps(document, ensure_ascii=False, indent=1) + "\n")
    print(f"{OUT.relative_to(ROOT)}: {len(outlines)} outlines, {len(sections)} sections")
    for o in outlines:
        ring = np.array(o["ring"])
        print(f"  {o['unit']:5s} {o['map']:8s} lon {ring[:, 0].min():.2f}–{ring[:, 0].max():.2f}  "
              f"lat {ring[:, 1].min():.2f}–{ring[:, 1].max():.2f}")


if __name__ == "__main__":
    main()
