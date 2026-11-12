#!/usr/bin/env python3
"""Build the A–A′ section block (site/section/) from the plate model and PaleoDEM.

The block is a grid fixed to East Antarctica (Merdith 2021 plate 802): along the great
circle A–A′ and some way to one side of it. For every age from 540 to 460 Ma (1 Myr) and
every grid point the script asks:

1. Where is the point in the Merdith reconstruction?  R_802(t) · g.
2. Whose rock is there?  The plate index and the continental-crust mask of the main
   page's Merdith frame for that age (site/data/merdith2021/frames/<t>.png).
3. How high was the surface?  PaleoDEM (Scotese & Wright 2018) sits in the PALEOMAP
   reconstruction, so the point is carried there:
   - continental crust: follow the rock itself. Back to the present with its Merdith
     plate, then forward with the PALEOMAP plate under it (cookie-cut), and read the
     grids on either side of t (5 Myr apart), interpolated in time;
   - elsewhere: there is no continental rock to follow, so the point is placed relative
     to East Antarctica in PALEOMAP (plate 802 there too) and read the same way.

Merdith's continental-crust mask is stored beside the heights. It is not the same line
as PaleoDEM's coast: Merdith's "Ross Orogen" polygon only exists from 410 Ma, so in the
Cambrian the model leaves the Transantarctic margin outside East Antarctica's crust, while
PaleoDEM puts a shallow shelf there. The page shows both.

Crustal thickness is not stored: the page derives it from these heights by Airy
isostasy, and says so.

Along the section line itself it also records where Merdith's subduction zones cross,
which side the slab dips under, and the convergence rate there (relative stage rotation
over 1 Myr), for the schematic slab and mantle flow.

Output: site/data/section/{meta.json, surface.bin, crust.bin, boundaries.json}.
"""
import json
import math
import sys
from pathlib import Path

import netCDF4
import numpy as np
import pygplates
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_plate_model as plates  # noqa: E402

OUT = ROOT / "site/data/section"
FRAMES = ROOT / "site/data/merdith2021/frames"
DATASETS = ROOT / "data/sources/datasets"
EARTH_KM = 6371.0


def files(model, role):
    document = plates.manifest(model)
    return [str(plates.member_path(model, m)) for m in document["members"] if m["role"] == role]


def unit(lon, lat):
    lo, la = np.radians(lon), np.radians(lat)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1)


def lon_lat(v):
    v = v / np.linalg.norm(v, axis=-1, keepdims=True)
    return np.degrees(np.arctan2(v[..., 1], v[..., 0])), np.degrees(np.arcsin(np.clip(v[..., 2], -1, 1)))


def matrix(rotation):
    """3×3 matrix of a pygplates FiniteRotation (identity if None)."""
    if rotation is None:
        return None
    lat, lon, angle = rotation.get_lat_lon_euler_pole_and_angle_degrees()
    if abs(angle) < 1e-12:
        return np.eye(3)
    k = unit(lon, lat)
    a = math.radians(angle)
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + math.sin(a) * K + (1 - math.cos(a)) * K @ K


def axis_rotation(axis, angle):
    K = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]])
    return np.eye(3) + math.sin(angle) * K + (1 - math.cos(angle)) * K @ K


class Rotations:
    def __init__(self, model):
        self.model = pygplates.RotationModel(files(model, "rotation"))
        self.cache = {}

    def m(self, plate, t, anchor=0):
        key = (plate, float(t), anchor)
        if key not in self.cache:
            r = self.model.get_rotation(float(t), int(plate), 0.0, int(anchor),
                                        use_identity_for_missing_plate_ids=False)
            self.cache[key] = matrix(r)
        return self.cache[key]


def read_grid(age):
    document = json.loads((ROOT / "sources/datasets/paleodem.json").read_text())
    name = next(m["name"] for m in document["members"] if m["name"].endswith(f"_{age}Ma.nc"))
    data = netCDF4.Dataset(DATASETS / "paleodem" / name)
    return np.asarray(data["lon"][:]), np.asarray(data["lat"][:]), np.asarray(data["z"][:], dtype=float)


def sample_grid(grid, lon, lat):
    lons, lats, z = grid
    x = (lon - lons[0]) / (lons[1] - lons[0])
    y = (lat - lats[0]) / (lats[1] - lats[0])
    n = len(lons) - 1
    x0 = np.floor(x).astype(int)
    fx = x - x0
    x0 %= n
    x1 = (x0 + 1) % n
    y0 = np.clip(np.floor(y).astype(int), 0, len(lats) - 2)
    fy = np.clip(y - y0, 0, 1)
    top = z[y0, x0] * (1 - fx) + z[y0, x1] * fx
    bottom = z[y0 + 1, x0] * (1 - fx) + z[y0 + 1, x1] * fx
    return top * (1 - fy) + bottom * fy


def main():
    section = json.loads((ROOT / "sources/sections/tam_a.json").read_text())
    OUT.mkdir(parents=True, exist_ok=True)

    # The grid, in present-day coordinates of plate 802 (East Antarctica).
    (lon1, lat1), (lon2, lat2) = section["great_circle_through"]
    anchor = unit(*section["anchor"])
    pole = np.cross(unit(lon1, lat1), unit(lon2, lat2))
    pole /= np.linalg.norm(pole)
    step = section["step_deg"]
    along = np.arange(section["along_deg"][0], section["along_deg"][1] + 1e-9, step)
    across = np.arange(section["across_deg"][0], section["across_deg"][1] + 1e-9, step)
    nx, ny = len(along), len(across)
    grid = np.zeros((ny, nx, 3))
    for i, s in enumerate(along):
        on_line = axis_rotation(pole, math.radians(s)) @ anchor
        # Across: rotate about the line's local direction of travel.
        tangent = np.cross(pole, on_line)
        tangent /= np.linalg.norm(tangent)
        for j, c in enumerate(across):
            grid[j, i] = axis_rotation(tangent, math.radians(-c)) @ on_line
    flat_grid = grid.reshape(-1, 3)

    merdith = Rotations("merdith2021")
    paleomap = Rotations("paleomap2016")
    frame_plate = section["frame_plate"]
    paleomap_cut = pygplates.PlatePartitioner(
        pygplates.FeaturesFunctionArgument(files("paleomap2016", "continents")).get_features(),
        paleomap.model)
    cut_cache = {}

    def paleomap_plate(lon, lat):
        key = (round(float(lon), 2), round(float(lat), 2))
        if key not in cut_cache:
            found = paleomap_cut.partition_point(pygplates.PointOnSphere(key[1], key[0]))
            cut_cache[key] = found.get_feature().get_reconstruction_plate_id() if found else 0
        return cut_cache[key]

    first, last = section["ages"]
    ages = list(range(first, last - 1, -1))
    grid_ages = list(range(540, 459, -5))
    grids = {a: read_grid(a) for a in grid_ages}

    surface = np.zeros((len(ages), ny, nx), np.int16)
    crust = np.zeros((len(ages), ny, nx), np.uint8)
    lines = {}
    for k, t in enumerate(ages):
        # 1. into the Merdith reconstruction
        R802 = merdith.m(frame_plate, t)
        where = flat_grid @ R802.T
        lon, lat = lon_lat(where)
        # 2. whose rock: the main page's frame for this age
        image = np.asarray(Image.open(FRAMES / f"{t}.png"))
        frame = json.loads((FRAMES / f"{t}.json").read_text())
        index_to_plate = {i: p for i, p, _ in frame["plates"]}
        h, w = image.shape[:2]
        px = np.clip(((lon + 180) / 360 * w).astype(int), 0, w - 1)
        py = np.clip(((90 - lat) / 180 * h).astype(int), 0, h - 1)
        index = image[py, px, 0]
        continental = image[py, px, 1].astype(float) / 255.0
        crust[k] = (continental * 255).astype(np.uint8).reshape(ny, nx)

        # 3. heights: the two PaleoDEM grids around t, and the weight between them
        older = min(g for g in grid_ages if g >= t)
        younger = max(g for g in grid_ages if g <= t)
        weight = 0.0 if older == younger else (older - t) / (older - younger)
        heights = np.zeros(len(flat_grid))
        R802p = {g: paleomap.m(frame_plate, g) for g in (older, younger)}
        for n in range(len(flat_grid)):
            plate = index_to_plate.get(int(index[n]))
            value = {}
            if continental[n] >= 0.5 and plate is not None and merdith.m(plate, t) is not None:
                present = merdith.m(plate, t).T @ where[n]
                plon, plat = lon_lat(present)
                pplate = paleomap_plate(plon, plat)
                for g in (older, younger):
                    M = paleomap.m(pplate, g) if pplate else None
                    if M is None:
                        M = R802p[g]
                    glon, glat = lon_lat(M @ present)
                    value[g] = sample_grid(grids[g], glon, glat)
            else:
                for g in (older, younger):
                    glon, glat = lon_lat(R802p[g] @ flat_grid[n])
                    z = sample_grid(grids[g], glon, glat)
                    value[g] = z
            heights[n] = value[older] * (1 - weight) + value[younger] * weight
        surface[k] = np.round(heights).astype(np.int16).reshape(ny, nx)

        # 4. boundaries in the block (local along/across km) and crossings of the line
        Rinv = R802.T
        pieces = []
        crossings = []
        for piece in frame["boundaries"]:
            c = np.array(piece["c"]).reshape(-1, 2)
            local = unit(c[:, 0], c[:, 1]) @ Rinv.T
            # along: angle about the pole from the anchor; across: angle from the plane
            a = np.degrees(np.arctan2(np.cross(anchor, local) @ pole, local @ anchor))
            b = np.degrees(np.arcsin(np.clip(local @ pole, -1, 1)))
            keep = (a > section["along_deg"][0] - 3) & (a < section["along_deg"][1] + 3) & \
                   (b > section["across_deg"][0] - 3) & (b < section["across_deg"][1] + 3)
            if keep.sum() >= 2:
                pieces.append({"k": piece["k"], "p": piece["p"],
                               "xy": [round(v, 1) for pair in zip(a * EARTH_KM * math.pi / 180,
                                                                  b * EARTH_KM * math.pi / 180) for v in pair]})
            if piece["k"] != "subduction":
                continue
            d = local @ pole
            for i in range(len(local) - 1):
                if d[i] * d[i + 1] <= 0 and d[i] != d[i + 1]:
                    f = d[i] / (d[i] - d[i + 1])
                    x = local[i] + (local[i + 1] - local[i]) * f
                    x /= np.linalg.norm(x)
                    s = math.degrees(math.atan2(np.cross(anchor, x) @ pole, x @ anchor))
                    if not section["along_deg"][0] <= s <= section["along_deg"][1]:
                        continue
                    # Which way along the line is the overriding plate? Left of the piece's
                    # direction for polarity L, right for R; "left" is up × forward.
                    forward = local[i + 1] - local[i]
                    left = np.cross(x, forward)
                    along_dir = np.cross(pole, x)
                    side = np.sign(left @ along_dir) * (1 if piece["p"] == "L" else -1)
                    if piece["p"] not in ("L", "R"):
                        side = 0
                    # Plates either side, from the frame image, 60 km off the trench.
                    def plate_at(offset_deg):
                        q = axis_rotation(pole, math.radians(offset_deg)) @ x
                        qlon, qlat = lon_lat(q @ R802.T)
                        qx = int(np.clip((qlon + 180) / 360 * w, 0, w - 1))
                        qy = int(np.clip((90 - qlat) / 180 * h, 0, h - 1))
                        return index_to_plate.get(int(image[qy, qx, 0]))
                    over = plate_at(0.55 * side) if side else None
                    under = plate_at(-0.55 * side) if side else None
                    rate = None
                    if over and under:
                        Ro, Ro1 = merdith.m(over, t), merdith.m(over, t + 1)
                        Ru, Ru1 = merdith.m(under, t), merdith.m(under, t + 1)
                        if all(m is not None for m in (Ro, Ro1, Ru, Ru1)):
                            # The subducting rock now at the trench, a Myr earlier, seen from
                            # the overriding plate: its displacement is the convergence.
                            now = R802 @ x
                            earlier = Ro @ Ro1.T @ Ru1 @ Ru.T @ now
                            v = (now - earlier) * EARTH_KM  # km/Myr = mm/yr
                            rate = round(float(v @ (R802 @ along_dir)) / 10, 2)  # cm/yr, +: towards A′
                    crossings.append({"s_km": round(s * EARTH_KM * math.pi / 180, 1),
                                      "over_side": int(side), "over": over, "under": under,
                                      "rate_cm_yr": rate})
        lines[str(t)] = {"pieces": pieces, "trenches": crossings}
        print(f"{t} Ma: {len(pieces)} boundary pieces, trenches "
              f"{[(c['s_km'], c['over_side'], c['rate_cm_yr']) for c in crossings]}", flush=True)

    (OUT / "surface.bin").write_bytes(surface.astype("<i2").tobytes())
    (OUT / "crust.bin").write_bytes(crust.tobytes())
    (OUT / "boundaries.json").write_text(json.dumps(lines, separators=(",", ":")))
    km = EARTH_KM * math.pi / 180
    meta = {
        "ages": ages, "nx": nx, "ny": ny,
        "along_km": [round(section["along_deg"][0] * km, 1), round(section["along_deg"][1] * km, 1)],
        "across_km": [round(section["across_deg"][0] * km, 1), round(section["across_deg"][1] * km, 1)],
        "step_km": round(step * km, 2),
        "grid_ages": grid_ages,
        "section": section,
        "line": {"A": [round(v, 3) for v in lon_lat(grid[0, 0])],
                 "A_prime": [round(v, 3) for v in lon_lat(grid[0, -1])],
                 "anchor": section["anchor"]},
        "built_with": f"pygplates {pygplates.__version__}",
    }
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    total = sum(p.stat().st_size for p in OUT.iterdir())
    print(f"section: {len(ages)} ages, grid {nx}×{ny}, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
