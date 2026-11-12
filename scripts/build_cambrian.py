#!/usr/bin/env python3
"""Build the data for the Antarctica globe pages: Cambrian (site/cambrian/, 540–485 Ma) and
Phanerozoic (site/phanerozoic/, 540–0 Ma), with `--page`.

Two reconstructions are used, and the page keeps them apart:

- **Merdith et al. 2021**, palaeomagnetic frame: where the continents and the plate
  boundaries were. Continents are triangulated once, in present-day coordinates, and the
  browser turns each piece with its plate's rotation, so they move continuously.
  Boundaries are resolved by pygplates once per Myr and shown frame by frame.
- **Scotese & Wright 2018 PaleoDEM** on the **PALEOMAP** plate model: what the surface was
  (land, shallow sea, deep sea) at 5 Myr steps. Its grids are in PALEOMAP's own
  reconstruction, so the Transantarctic Mountains are moved with PALEOMAP rotations to
  read them, never with Merdith's.

Outputs in site/data/<page>/:
  continents.json      triangulated continents, grouped by plate and lifetime
  rotations-paleomap.json   packed PALEOMAP rotations for the browser
  (Merdith rotations and boundaries: site/data/merdith2021/ from scripts/build_frames.py)
  tam.json             the Transantarctic Mountains band, its centre line, and the PaleoDEM
                       height under each centre-line point at each grid age
  observations.json    sources/observations/cambrian_antarctica.json with plate IDs
  paleodem/<age>.png   each grid coloured by height, for the PaleoDEM view
  meta.json            ages, citations, licences
"""
import json
import argparse
import math
import re
import sys
from pathlib import Path

import mapbox_earcut
import netCDF4
import numpy as np
import pygplates
import shapefile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_plate_model as plates  # noqa: E402
from build_frames import rotations  # noqa: E402

DATASETS = ROOT / "data/sources/datasets"
# The pages built from this script: the Cambrian page and the whole Phanerozoic one share
# everything but the time span (and so the PaleoDEM grids, every 5 Myr, in it).
PAGES = {"cambrian": (540, 485), "phanerozoic": (540, 0)}
PAGE = "cambrian"
OUT = ROOT / "site/data/cambrian"
OLDEST, YOUNGEST = PAGES[PAGE]


def paleodem_ages(oldest, youngest):
    """The PaleoDEM grid ages in the span, oldest first (a few are off the 5 Myr step, 385.2)."""
    document = json.loads((ROOT / "sources/datasets/paleodem.json").read_text())
    ages = [float(re.search(r"_([0-9.]+)Ma\.nc$", m["name"]).group(1)) for m in document["members"]]
    return sorted((int(a) if a.is_integer() else a for a in ages if youngest <= a <= oldest), reverse=True)


GRID_AGES = paleodem_ages(OLDEST, YOUNGEST)

# Classes read from PaleoDEM heights. The grids put most shelf cells at -160 m and the
# ocean floor near -4000 m; the cut-offs below are this project's, stated on the page.
CLASSES = [("land", 0, None), ("shallow", -250, 0), ("slope", -2000, -250), ("deep", None, -2000)]


def classify(z):
    for name, low, high in CLASSES:
        if (low is None or z >= low) and (high is None or z < high):
            return name
    return "deep"


def files(model, role):
    document = plates.manifest(model)
    return [str(plates.member_path(model, m)) for m in document["members"] if m["role"] == role]


def unit(lat, lon):
    la, lo = math.radians(lat), math.radians(lon)
    return np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])


def lat_lon(v):
    v = v / np.linalg.norm(v)
    return math.degrees(math.asin(max(-1.0, min(1.0, v[2])))), math.degrees(math.atan2(v[1], v[0]))


def douglas_peucker(points, tolerance):
    if len(points) < 4:
        return points
    keep = np.zeros(len(points), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        pa, pb = points[a], points[b]
        d = pb - pa
        length = math.hypot(*d)
        segment = points[a + 1:b]
        if length < 1e-12:
            dist = np.hypot(*(segment - pa).T)
        else:
            dist = np.abs(d[1] * (segment[:, 0] - pa[0]) - d[0] * (segment[:, 1] - pa[1])) / length
        i = int(np.argmax(dist))
        if dist[i] > tolerance:
            keep[a + 1 + i] = True
            stack += [(a, a + 1 + i), (a + 1 + i, b)]
    return points[keep]


class Mesh:
    """Triangles on the unit sphere, built from polygons in present-day coordinates."""

    def __init__(self):
        self.vertices = []
        self.index = {}
        self.triangles = []
        self.rings = []

    def vertex(self, v):
        lat, lon = lat_lon(v)
        key = (round(lon, 3), round(lat, 3))
        if key not in self.index:
            self.index[key] = len(self.vertices)
            self.vertices.append(key)
        return self.index[key]

    def add_polygon(self, polygon, tolerance=0.002, max_edge=math.radians(2.0)):
        tessellated = polygon.to_tessellated(math.radians(1.0))
        centre = np.array(polygon.get_interior_centroid().to_xyz())
        centre /= np.linalg.norm(centre)
        east = np.cross([0.0, 0.0, 1.0], centre)
        if np.linalg.norm(east) < 1e-6:
            east = np.array([0.0, 1.0, 0.0])
        east /= np.linalg.norm(east)
        north = np.cross(centre, east)

        def project(ring):
            out = []
            for lat, lon in ring:
                p = unit(lat, lon)
                angle = math.acos(max(-1.0, min(1.0, float(p @ centre))))
                direction = p - centre * float(p @ centre)
                n = np.linalg.norm(direction)
                if n < 1e-12:
                    out.append((0.0, 0.0))
                else:
                    out.append((angle * float(direction @ east) / n, angle * float(direction @ north) / n))
            return np.array(out)

        def unproject(xy):
            angle = math.hypot(*xy)
            if angle < 1e-12:
                return centre.copy()
            direction = (east * xy[0] + north * xy[1]) / angle
            return centre * math.cos(angle) + direction * math.sin(angle)

        rings = [tessellated.get_exterior_ring_points()] + [
            tessellated.get_interior_ring_points(i) for i in range(tessellated.get_number_of_interior_rings())]
        projected = []
        for ring in rings:
            xy = project([p.to_lat_lon() for p in ring])
            xy = douglas_peucker(np.vstack([xy, xy[:1]]), tolerance)[:-1]
            if len(xy) >= 3:
                projected.append(xy)
        if not projected:
            return
        flat_xy = np.vstack(projected)
        ends = np.cumsum([len(r) for r in projected]).astype(np.uint32)
        indices = mapbox_earcut.triangulate_float64(flat_xy, ends)
        corners = [unproject(xy) for xy in flat_xy]
        for ring in projected:
            self.rings.append([self.vertex(unproject(xy)) for xy in ring])

        def split(a, b, c, depth):
            edges = [math.acos(max(-1.0, min(1.0, float(x @ y)))) for x, y in ((a, b), (b, c), (c, a))]
            if max(edges) <= max_edge or depth > 6:
                self.triangles.append((self.vertex(a), self.vertex(b), self.vertex(c)))
                return
            ab = (a + b) / np.linalg.norm(a + b)
            bc = (b + c) / np.linalg.norm(b + c)
            ca = (c + a) / np.linalg.norm(c + a)
            for t in ((a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)):
                split(*t, depth + 1)

        for i in range(0, len(indices), 3):
            split(corners[indices[i]], corners[indices[i + 1]], corners[indices[i + 2]], 0)

    def export(self):
        return {"v": [value for key in self.vertices for value in key],
                "t": [i for tri in self.triangles for i in tri],
                "r": self.rings}


def build_continents(rotation_model):
    groups = {}
    for feature in pygplates.FeaturesFunctionArgument(files("merdith2021", "continents")).get_features():
        begin, end = feature.get_valid_time()
        if not (begin >= YOUNGEST and end <= OLDEST):
            continue
        plate = feature.get_reconstruction_plate_id()
        if rotation_model.get_rotation(OLDEST - 1, plate, use_identity_for_missing_plate_ids=False) is None \
                and rotation_model.get_rotation(YOUNGEST + 1, plate, use_identity_for_missing_plate_ids=False) is None:
            continue
        key = (plate, min(float(begin), 1e4), max(float(end), -1e4))
        group = groups.setdefault(key, {"mesh": Mesh(), "names": set(), "lats": []})
        for geometry in feature.get_geometries():
            if isinstance(geometry, pygplates.PolygonOnSphere) and geometry.get_area() > 2e-6:
                group["mesh"].add_polygon(geometry)
                group["lats"].append(geometry.get_interior_centroid().to_lat_lon()[0])
                group["names"].add(feature.get_name() or "")
    out = []
    for (plate, begin, end), group in sorted(groups.items()):
        if not group["mesh"].triangles:
            continue
        antarctic = bool(group["lats"]) and max(group["lats"]) < -60
        # Gondwana, roughly: the model's plate-ID families for South America (2),
        # India and Arabia (5), Africa (7), Australia and Antarctica (8).
        gondwana = str(plate)[0] in "2578"
        out.append({"plate": plate, "from": begin, "to": end, "antarctic": antarctic,
                    "gondwana": gondwana, "names": sorted(n for n in group["names"] if n)[:6],
                    **group["mesh"].export()})
    return out


def tam_outline():
    reader = shapefile.Reader(str(DATASETS / "naturalearth/ne_10m_geography_regions_polys"))
    fields = [f[0] for f in reader.fields[1:]]
    parts = []
    for record in reader.iterShapeRecords():
        if dict(zip(fields, record.record))["NAME"] == "Transantarctic Mountains":
            parts.append([(lat, lon) for lon, lat in record.shape.points])
    return parts


# A guide along the range, from Cape Adare to the Pensacola Mountains (approximate
# localities picked by this project), used only to order the outline into a centre line.
GUIDE = [(-71.3, 170.2), (-74.4, 164.7), (-77.5, 161.5), (-80.3, 159.0), (-83.5, 168.0),
         (-84.4, 175.0), (-85.5, -175.0), (-86.5, -150.0), (-85.5, -125.0), (-85.2, -91.0),
         (-84.5, -70.0), (-83.7, -55.0)]


# Where each block's name sits on the globe: a present-day point on that block, carried by
# the plate under it.
LABELS = [("eastAntarctica", 90.0, -78.0), ("westAntarctica", -85.0, -79.0), ("australia", 134.0, -25.0),
          ("india", 78.0, 20.0), ("africa", 20.0, 5.0), ("southAmerica", -55.0, -12.0),
          ("arabia", 45.0, 24.0), ("madagascar", 46.5, -19.5), ("laurentia", -100.0, 50.0),
          ("baltica", 30.0, 60.0), ("siberia", 105.0, 63.0), ("southChina", 110.0, 27.0)]


def centre_line(parts, spacing_km=60.0):
    guide = [unit(*p) for p in GUIDE]
    lengths = [math.acos(float(a @ b)) * 6371.0 for a, b in zip(guide, guide[1:])]
    starts = np.concatenate([[0.0], np.cumsum(lengths)])

    def along(v):
        best = (1e9, 0.0)
        for i, (a, b) in enumerate(zip(guide, guide[1:])):
            normal = np.cross(a, b)
            normal /= np.linalg.norm(normal)
            q = v - normal * float(v @ normal)
            q /= np.linalg.norm(q)
            arc = math.acos(max(-1.0, min(1.0, float(a @ b))))
            t = math.atan2(float(np.cross(a, q) @ normal), float(a @ q))
            t = min(max(t, 0.0), arc)
            point = a * math.cos(t) + np.cross(normal, a) * math.sin(t)
            d = math.acos(max(-1.0, min(1.0, float(point @ v))))
            if d < best[0]:
                best = (d, starts[i] + t * 6371.0)
        return best[1]

    vertices = [unit(*p) for part in parts for p in part]
    positions = np.array([along(v) for v in vertices])
    points = []
    for s in np.arange(0.0, positions.max() + spacing_km, spacing_km):
        near = [v for v, p in zip(vertices, positions) if abs(p - s) < spacing_km * 0.75]
        if near:
            mean = np.sum(near, axis=0)
            lat, lon = lat_lon(mean)
            points.append({"s_km": round(float(s)), "lon": round(lon, 3), "lat": round(lat, 3)})
    return points


def read_grid(age):
    document = json.loads((ROOT / "sources/datasets/paleodem.json").read_text())
    name = next(m["name"] for m in document["members"] if m["name"].endswith(f"_{age}Ma.nc"))
    data = netCDF4.Dataset(DATASETS / "paleodem" / name)
    return np.asarray(data["lon"][:]), np.asarray(data["lat"][:]), np.asarray(data["z"][:], dtype=float)


def sample(grid, lat, lon):
    lons, lats, z = grid
    x = (lon - lons[0]) / (lons[1] - lons[0])
    y = (lat - lats[0]) / (lats[1] - lats[0])
    x0, y0 = int(math.floor(x)) % (len(lons) - 1), int(min(max(math.floor(y), 0), len(lats) - 2))
    fx, fy = x - math.floor(x), min(max(y - y0, 0.0), 1.0)
    x1 = (x0 + 1) % (len(lons) - 1)
    return float((z[y0, x0] * (1 - fx) + z[y0, x1] * fx) * (1 - fy) + (z[y0 + 1, x0] * (1 - fx) + z[y0 + 1, x1] * fx) * fy)


# Height colours: the shallow sea gets its own light colour, since it is the question.
STOPS = [(-6000, (12, 26, 54)), (-2000, (24, 58, 104)), (-250, (40, 98, 150)), (-249, (92, 186, 206)),
         (-1, (150, 220, 226)), (0, (176, 196, 132)), (500, (196, 180, 120)), (1500, (170, 132, 92)),
         (4000, (236, 230, 222))]


def colour(z):
    for (z0, c0), (z1, c1) in zip(STOPS, STOPS[1:]):
        if z <= z1:
            f = 0.0 if z1 == z0 else min(max((z - z0) / (z1 - z0), 0.0), 1.0)
            return tuple(int(a + (b - a) * f) for a, b in zip(c0, c1))
    return STOPS[-1][1]


def grid_image(grid, width=1440):
    lons, lats, z = grid
    height = width // 2
    out = np.zeros((height, width, 3), np.uint8)
    lut_z = np.arange(-6000, 6001, 10)
    lut = np.array([colour(v) for v in lut_z], np.uint8)
    lon = -180 + (np.arange(width) + 0.5) * 360 / width
    lat = 90 - (np.arange(height) + 0.5) * 180 / height
    xs = (lon - lons[0]) / (lons[1] - lons[0])
    ys = (lat - lats[0]) / (lats[1] - lats[0])
    x0 = np.floor(xs).astype(int) % (len(lons) - 1)
    fx = xs - np.floor(xs)
    y0 = np.clip(np.floor(ys).astype(int), 0, len(lats) - 2)
    fy = np.clip(ys - y0, 0, 1)
    x1 = (x0 + 1) % (len(lons) - 1)
    za = z[np.ix_(y0, x0)] * (1 - fx) + z[np.ix_(y0, x1)] * fx
    zb = z[np.ix_(y0 + 1, x0)] * (1 - fx) + z[np.ix_(y0 + 1, x1)] * fx
    values = za * (1 - fy[:, None]) + zb * fy[:, None]
    # Keep the coast where the grid puts it: colour by the nearest cell's sign.
    nearest = z[np.ix_(np.clip(np.round(ys).astype(int), 0, len(lats) - 1),
                       np.round(xs).astype(int) % (len(lons) - 1))]
    values = np.where((values >= 0) != (nearest >= 0), np.where(nearest >= 0, 0, -1), values)
    out[:] = lut[np.clip(((values + 6000) / 10).round().astype(int), 0, len(lut_z) - 1)]
    return Image.fromarray(out)


def main():
    global PAGE, OUT, OLDEST, YOUNGEST, GRID_AGES
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--page", choices=sorted(PAGES), default="cambrian")
    PAGE = parser.parse_args().page
    OUT = ROOT / "site/data" / PAGE
    OLDEST, YOUNGEST = PAGES[PAGE]
    GRID_AGES = paleodem_ages(OLDEST, YOUNGEST)
    print(f"{PAGE}: {OLDEST}–{YOUNGEST} Ma, {len(GRID_AGES)} PaleoDEM grids")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "paleodem").mkdir(exist_ok=True)
    merdith = pygplates.RotationModel(files("merdith2021", "rotation"))
    paleomap = pygplates.RotationModel(files("paleomap2016", "rotation"))
    merdith_cut = pygplates.PlatePartitioner(
        pygplates.FeaturesFunctionArgument(files("merdith2021", "static_polygons")).get_features(), merdith)
    paleomap_cut = pygplates.PlatePartitioner(
        pygplates.FeaturesFunctionArgument(files("paleomap2016", "continents")).get_features(), paleomap)

    def plate_of(cut, lat, lon):
        found = cut.partition_point(pygplates.PointOnSphere(lat, lon))
        return found.get_feature().get_reconstruction_plate_id() if found else 0

    def write(name, value):
        (OUT / name).write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
        print(f"  {name:28} {(OUT / name).stat().st_size / 1024:8.0f} KiB")

    print("continents")
    write("continents.json", build_continents(merdith))
    # Merdith boundaries and rotations come from scripts/build_frames.py merdith2021
    # (site/data/merdith2021/), which the main page also uses.
    for model, out in (("paleomap2016", "rotations-paleomap.json"),):
        write(out, {"anchor": 0, "sequences": rotations(
            [Path(p).read_text(errors="replace") for p in files(model, "rotation")])})

    print("Transantarctic Mountains")
    parts = tam_outline()
    outline = []
    for part in parts:
        ring = [{"lon": round(lon, 3), "lat": round(lat, 3),
                 "m": plate_of(merdith_cut, lat, lon), "p": plate_of(paleomap_cut, lat, lon)} for lat, lon in part]
        outline.append(ring)
    grids = {age: read_grid(age) for age in GRID_AGES}
    centre = centre_line(parts)
    for point in centre:
        point["m"] = plate_of(merdith_cut, point["lat"], point["lon"])
        point["p"] = plate_of(paleomap_cut, point["lat"], point["lon"])
        heights = {}
        for age in GRID_AGES:
            q = paleomap.get_rotation(float(age), point["p"]) * pygplates.PointOnSphere(point["lat"], point["lon"])
            lat, lon = q.to_lat_lon()
            heights[str(age)] = round(sample(grids[age], lat, lon))
        point["z"] = heights
        point["env"] = {age: classify(z) for age, z in heights.items()}
    write("tam.json", {"outline": outline, "centre": centre,
                       "classes": [{"name": n, "low": lo, "high": hi} for n, lo, hi in CLASSES]})
    for age in GRID_AGES:
        grid_image(grids[age]).save(OUT / "paleodem" / f"{age}.png", optimize=True)
    print(f"  paleodem/*.png              {len(GRID_AGES)} grids")

    observations = json.loads((ROOT / "sources/observations/cambrian_antarctica.json").read_text())
    if PAGE == "phanerozoic":
        # The later record too (Devonian to Cenozoic), placed with GeoMAP.
        later = json.loads((ROOT / "sources/observations/phanerozoic_antarctica.json").read_text())
        observations["title"] = "Geological record along the Transantarctic Mountains"
        observations["note"] += " " + later["note"]
        observations["items"] += later["items"]
    for item in observations["items"]:
        lat, lon = item["present"][1], item["present"][0]
        item["m"] = plate_of(merdith_cut, lat, lon)
        item["p"] = plate_of(paleomap_cut, lat, lon)
    write("observations.json", observations)

    labels = []
    for key, lon, lat in LABELS:
        labels.append({"key": key, "present": [lon, lat], "m": plate_of(merdith_cut, lat, lon),
                       "p": plate_of(paleomap_cut, lat, lon)})
    write("labels.json", labels)

    sources = {}
    for model in ("merdith2021", "paleomap2016"):
        d = plates.manifest(model)
        sources[model] = {"title": d["short_title"], "citation": d["citation"], "doi": d.get("doi"),
                          "license": d["license"]["name"], "license_url": d["license"]["url"],
                          "limitations": d.get("limitations", "")}
    for dataset in ("paleodem", "naturalearth"):
        d = json.loads((ROOT / f"sources/datasets/{dataset}.json").read_text())
        sources[dataset] = {"title": d["short_title"], "citation": d["citation"], "doi": d.get("doi"),
                            "license": d["license"]["name"], "license_url": d["license"]["url"]}
    write("meta.json", {"page": PAGE, "oldest": OLDEST, "youngest": YOUNGEST, "grid_ages": GRID_AGES,
                        "boundary_ages": [OLDEST, YOUNGEST], "sources": sources,
                        "built_with": f"pygplates {pygplates.__version__}"})


if __name__ == "__main__":
    main()
