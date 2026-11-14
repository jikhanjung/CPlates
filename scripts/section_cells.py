#!/usr/bin/env python3
"""SCAR GeoMAP on the A–A′ section's own grid cells, for the section page.

The page draws the Shackleton Limestone's area cell by cell (27.8 km cells centred on the
grid points). The GeoMAP layers are drawn the same way, so an outcrop of a few km² shows as
the whole cell it lies in instead of a speck:

- Byrd Group outcrops (meta.outcrops.outlines, block km): per cell, which units crop out in
  it, as bits: 1 lower Byrd Group (Shackleton Limestone), 2 upper Byrd Group (Starshot
  Formation, Douglas Conglomerate), 4 Byrd Group not divided.
- Rock by age (sources/sections/geology_map.png, 2 km pixels: class, share of rock): per
  cell, the class with the most rock, the rock's area, and when that rock formed: the
  medians, weighted by area, of its GeoMAP units' oldest and youngest ages
  (geology_ages.png).

Called by build_section.py; run alone, it updates site/data/section/meta.json in place.

    .venv/bin/python scripts/section_cells.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "site/data/section"
GEOLOGY_PNG = ROOT / "sources/sections/geology_map.png"
GEOLOGY_AGES = ROOT / "sources/sections/geology_ages.png"
BYRD_BITS = {"shackleton": 1, "starshot": 2, "douglas": 2, "byrd": 4}


def cell_of(meta, a_km, b_km):
    """Block km → the grid cell (i, j) whose point is nearest, as arrays."""
    i = np.rint((np.asarray(a_km) - meta["along_km"][0]) / meta["step_km"]).astype(int)
    j = np.rint((np.asarray(b_km) - meta["across_km"][0]) / meta["step_km"]).astype(int)
    return i, j


def byrd_cells(meta, fine=8):
    """[[i, j, bits], …] for every cell any Byrd Group outcrop reaches."""
    nx, ny, step = meta["nx"], meta["ny"], meta["step_km"]
    # Drawn fine × finer than the cells; cell (i, j) covers its point ± half a step.
    a0 = meta["along_km"][0] - step / 2
    b0 = meta["across_km"][0] - step / 2
    px = step / fine
    bits = np.zeros((ny, nx), np.uint8)
    for unit, bit in BYRD_BITS.items():
        image = Image.new("1", (nx * fine, ny * fine), 0)
        draw = ImageDraw.Draw(image)
        for ring in meta["outcrops"]["outlines"]:
            if ring["unit"] != unit:
                continue
            # Every ring is filled (holes too): at this scale a hole is still the unit's ground.
            draw.polygon([((a - a0) / px, (b - b0) / px) for a, b in ring["ab"]], fill=1, outline=1)
        hit = np.asarray(image, bool).reshape(ny, fine, nx, fine).any(axis=(1, 3))
        bits[hit] |= bit
    return [[int(i), int(j), int(bits[j, i])] for j, i in zip(*np.nonzero(bits))]


def weighted_median(values, weights):
    order = np.argsort(values)
    cumulative = np.cumsum(weights[order])
    return float(values[order][np.searchsorted(cumulative, cumulative[-1] / 2)])


def geology_cells(meta, png=GEOLOGY_PNG, ages_png=GEOLOGY_AGES):
    """[[i, j, class, rock km², oldest Ma, youngest Ma], …] for every cell with any rock in
    GeoMAP's classes."""
    g = meta["geology"]
    nx, ny = meta["nx"], meta["ny"]
    pixels = np.asarray(Image.open(png))
    cls = pixels[..., 0].astype(int)
    share = pixels[..., 1] / 255.0
    h, w = cls.shape
    p = g["pixel_km"]
    # Pixel centres: along from the left, across from the top (the picture's first row is the far side).
    a = g["along_km"][0] + (np.arange(w) + 0.5) * p
    b = g["across_km"][1] - (np.arange(h) + 0.5) * p
    i, j = cell_of(meta, a[None, :].repeat(h, 0), b[:, None].repeat(w, 1))
    keep = (cls > 0) & (share > 0) & (i >= 0) & (i < nx) & (j >= 0) & (j < ny)
    n_classes = len(g["classes"]) + 1
    area = np.zeros((ny, nx, n_classes))
    np.add.at(area, (j[keep], i[keep], cls[keep]), share[keep] * p * p)
    total = area.sum(axis=2)
    top = area.argmax(axis=2)
    ages = np.asarray(Image.open(ages_png)).astype(float)
    oldest, youngest = ages[:, :w], ages[:, w:]
    cells = []
    for jj, ii in zip(*np.nonzero(total > 0)):
        k = top[jj, ii]
        here = keep & (j == jj) & (i == ii) & (cls == k) & (oldest > 0)
        if here.any():
            old = weighted_median(oldest[here], share[here])
            young = weighted_median(youngest[here], share[here])
        else:
            old, young = g["classes"][k - 1]["age"]
        cells.append([int(ii), int(jj), int(k), round(float(total[jj, ii]), 1), round(old), round(young)])
    return cells


def add_cells(meta):
    if "outcrops" in meta:
        meta["outcrops"]["cells"] = byrd_cells(meta)
        meta["outcrops"]["cell_bits"] = {"lower": 1, "upper": 2, "undivided": 4}
    if "geology" in meta and GEOLOGY_PNG.exists():
        meta["geology"]["cells"] = geology_cells(meta)
        meta["geology"].pop("image", None)


def main():
    path = OUT / "meta.json"
    meta = json.loads(path.read_text())
    add_cells(meta)
    path.write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    o = meta.get("outcrops", {}).get("cells", [])
    g = meta.get("geology", {}).get("cells", [])
    print(f"Byrd Group: {len(o)} cells; rock by age: {len(g)} cells; meta {path.stat().st_size / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
