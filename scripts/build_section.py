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


def trench_rows(pieces, ny, step_km, across0_km, crossings, line_row=0):
    """Per block row, the main trench's along-position (km) and the unit vector (along,
    across) towards its overriding side, or None where it does not cross the row.

    The main trench is the one the A–A′ line meets nearest the margin (as on the face);
    rows are followed outwards from the line, each taking the crossing nearest the last.
    Pieces that make up the main trench are marked "main" so the page can draw the
    interpolated line instead of them.
    """
    candidates = []  # per row: list of (a, na, nb, piece index)
    for j in range(ny):
        b = across0_km + j * step_km
        found = []
        for index, piece in enumerate(pieces):
            if piece["k"] != "subduction" or piece["p"] not in ("L", "R"):
                continue
            xy = piece["xy"]
            sign = 1 if piece["p"] == "L" else -1
            for n in range(0, len(xy) - 3, 2):
                a1, b1, a2, b2 = xy[n:n + 4]
                if (b1 - b) * (b2 - b) > 0 or b1 == b2:
                    continue
                f = (b - b1) / (b2 - b1)
                a = a1 + (a2 - a1) * f
                length = math.hypot(a2 - a1, b2 - b1) or 1.0
                na, nb = -(b2 - b1) / length * sign, (a2 - a1) / length * sign
                found.append((a, na, nb, index))
        candidates.append(found)
    main = [c for c in crossings if c["over_side"]]
    if not main:
        return [None] * ny
    start = min(main, key=lambda c: abs(c["s_km"]))["s_km"]
    rows = [None] * ny
    used = set()
    # Out from the line's row, towards A–A′'s far side and then the other way.
    for order in (range(line_row, ny), range(line_row - 1, -1, -1)):
        previous = start
        for j in order:
            options = candidates[j]
            if not options:
                continue
            a, na, nb, index = min(options, key=lambda o: abs(o[0] - previous))
            if abs(a - previous) > 600:
                continue
            rows[j] = [round(a, 1), round(na, 4), round(nb, 4)]
            used.add(index)
            previous = a
    for index in used:
        pieces[index]["main"] = True
    return rows


def main():
    section = json.loads((ROOT / "sources/sections/tam_a.json").read_text())
    OUT.mkdir(parents=True, exist_ok=True)

    # The grid, in present-day coordinates of plate 802 (East Antarctica).
    (lon1, lat1), (lon2, lat2) = section["great_circle_through"]
    anchor = unit(*section["anchor"])
    pole = np.cross(unit(lon1, lat1), unit(lon2, lat2))
    pole /= np.linalg.norm(pole)
    step = section["step_deg"]
    # The data grid: the A–A′ box (along_deg × across_deg, what the page opens with) plus
    # margin_deg on every side, so the box can be dragged out as well as in.
    margin = section.get("margin_deg", 0.0)
    along_deg = [section["along_deg"][0] - margin, section["along_deg"][1] + margin]
    across_deg = [section["across_deg"][0] - margin, section["across_deg"][1] + margin]
    along = np.arange(along_deg[0], along_deg[1] + 1e-9, step)
    across = np.arange(across_deg[0], across_deg[1] + 1e-9, step)
    nx, ny = len(along), len(across)
    # The A–A′ box in grid indices; its front row j0 is the line itself.
    m = int(round(margin / step))
    box = {"i0": m, "i1": nx - 1 - m, "j0": m, "j1": ny - 1 - m}
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

    continents = pygplates.FeaturesFunctionArgument(files("merdith2021", "continents")).get_features()

    # The Shackleton Limestone's approximate area, as a 0–255 lens weight per grid point
    # (full inside, thinning over the outer taper_km). Fixed to East Antarctica.
    area = section["shackleton_area"]
    ring = pygplates.PolygonOnSphere([(lat, lon) for lon, lat in area["polygon"]])
    edge = pygplates.PolylineOnSphere(list(ring.get_exterior_ring_points()) + [ring.get_exterior_ring_points()[0]])
    lens = np.zeros(len(flat_grid), np.uint8)
    for n, v in enumerate(flat_grid):
        p = pygplates.PointOnSphere(*v)
        if ring.is_point_in_polygon(p):
            km = pygplates.GeometryOnSphere.distance(p, edge) * EARTH_KM
            lens[n] = int(round(255 * min(1.0, km / area["taper_km"])))

    first, last = section["ages"]
    ages = list(range(first, last - 1, -1))
    grid_ages = list(range(540, 459, -5))
    grids = {a: read_grid(a) for a in grid_ages}

    surface = np.zeros((len(ages), ny, nx), np.int16)
    crust = np.zeros((len(ages), ny, nx), np.uint8)
    # Per grid point: 1 on an Antarctic block, 2 on another continent, 0 neither. The page
    # draws Antarctica only (and the shelf joined to it), leaving Australia and India out.
    antarctic_plates = set(section.get("antarctic_plates", []))
    region = np.zeros((len(ages), ny, nx), np.uint8)
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
        # Which continental block is here: Merdith's continent polygons reconstructed to t
        # (the resolved plates are too large: in the Cambrian East Antarctica sits inside
        # the Gondwana plate). Its own rotation is used to follow the rock.
        blocks = pygplates.PlatePartitioner(continents, merdith.model, reconstruction_time=float(t))
        block = np.zeros(len(flat_grid), np.int64)
        for n in range(len(flat_grid)):
            lo_, la_ = float(lon[n]), float(lat[n])
            found = blocks.partition_point(pygplates.PointOnSphere(la_, lo_))
            block[n] = found.get_feature().get_reconstruction_plate_id() if found else 0
        # 1: an Antarctic block; 2: another continent (Australia, India, ...); 0: neither.
        region[k] = np.array([1 if b in antarctic_plates else (2 if b else 0) for b in block],
                             np.uint8).reshape(ny, nx)

        # 3. heights: the two PaleoDEM grids around t, and the weight between them
        older = min(g for g in grid_ages if g >= t)
        younger = max(g for g in grid_ages if g <= t)
        weight = 0.0 if older == younger else (older - t) / (older - younger)
        heights = np.zeros(len(flat_grid))
        R802p = {g: paleomap.m(frame_plate, g) for g in (older, younger)}
        for n in range(len(flat_grid)):
            plate = int(block[n]) if block[n] and merdith.m(int(block[n]), t) is not None \
                else index_to_plate.get(int(index[n]))
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
            keep = (a > along_deg[0] - 3) & (a < along_deg[1] + 3) & \
                   (b > across_deg[0] - 3) & (b < across_deg[1] + 3)
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
                    if not along_deg[0] <= s <= along_deg[1]:
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
        # The main trench row by row: for each row of the block (constant distance across),
        # where the subduction zone nearest the Transantarctic margin crosses it, and the
        # horizontal direction towards its overriding side. The page interpolates these points
        # in time, so the whole line moves smoothly, not just where it crosses A–A′.
        rows = trench_rows(pieces, ny, step * EARTH_KM * math.pi / 180,
                           across_deg[0] * EARTH_KM * math.pi / 180, crossings, box["j0"])
        lines[str(t)] = {"pieces": pieces, "trenches": crossings, "rows": rows}
        print(f"{t} Ma: {len(pieces)} boundary pieces, trenches "
              f"{[(c['s_km'], c['over_side'], c['rate_cm_yr']) for c in crossings]}", flush=True)

    (OUT / "surface.bin").write_bytes(surface.astype("<i2").tobytes())
    (OUT / "crust.bin").write_bytes(crust.tobytes())
    (OUT / "region.bin").write_bytes(region.tobytes())
    (OUT / "shackleton.bin").write_bytes(lens.tobytes())
    (OUT / "boundaries.json").write_text(json.dumps(lines, separators=(",", ":")))
    km = EARTH_KM * math.pi / 180
    meta = {
        "ages": ages, "nx": nx, "ny": ny,
        "along_km": [round(along_deg[0] * km, 1), round(along_deg[1] * km, 1)],
        "across_km": [round(across_deg[0] * km, 1), round(across_deg[1] * km, 1)],
        "step_km": round(step * km, 2),
        # The whole grid in degrees, and the A–A′ box inside it (the page's default).
        "grid_deg": {"along": along_deg, "across": across_deg, "step": step},
        "box": box,
        "grid_ages": grid_ages,
        "section": section,
        # The A–A′ box's top outline, present-day coordinates of plate 802.
        "outline": [[round(float(v), 3) for v in lon_lat(p)] for p in
                    list(grid[box["j0"], box["i0"]:box["i1"] + 1]) + list(grid[box["j0"]:box["j1"] + 1, box["i1"]])
                    + list(grid[box["j1"], box["i1"]:box["i0"] - 1 if box["i0"] else None:-1])
                    + list(grid[box["j1"]:box["j0"] - 1 if box["j0"] else None:-1, box["i0"]])],
        "line": {"A": [round(v, 3) for v in lon_lat(grid[box["j0"], box["i0"]])],
                 "A_prime": [round(v, 3) for v in lon_lat(grid[box["j0"], box["i1"]])],
                 "anchor": section["anchor"]},
        "built_with": f"pygplates {pygplates.__version__}",
    }
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    total = sum(p.stat().st_size for p in OUT.iterdir())
    print(f"section: {len(ages)} ages, grid {nx}×{ny}, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
