#!/usr/bin/env python3
"""Resolve a plate model's topologies age by age and write the frames the globe draws.

Plate boundaries in a full-plate model are not stored as polygons. Each plate is a
topology: a list of boundary sections (ridges, subduction zones, transforms) that are
reconstructed to an age and cut against each other to close the polygon. That cutting is
GPlates' job, so it is done here, offline, with pygplates, and the browser only draws.

For each age the script writes:

- ``frames/<age>.json``: the plates (index, plate ID, name) and the boundary pieces, each
  a polyline with its kind and, for subduction zones, the side the overriding plate is on.
- ``frames/<age>.png``: an equirectangular image, 2:1. Red is the 1-based index of the
  plate under each pixel (0 where no plate resolves); green is continental crust from
  the model's continent polygons, reconstructed to the same age.

It also writes ``rotations.json`` in the packed form EarthThruTime3D uses, so the browser
can compose the same rotations to measure plate velocity, and ``model.json`` with the
attribution the CC BY licence asks for.

pygplates is GPL-2.0-only. It runs here and is not shipped; what it outputs is geometry
computed from CC BY data, not a work based on pygplates (GPLv2 section 0).
"""
import argparse
import json
import math
import sys
import time
from pathlib import Path

import pygplates
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_plate_model import manifest, member_path  # noqa: E402

OUT = ROOT / "site/data"

# Feature types grouped into what the map legend can say. Anything not named here is
# drawn as "other boundary" rather than guessed into a kind.
KINDS = {
    "MidOceanRidge": "ridge",
    "ContinentalRift": "ridge",
    "SubductionZone": "subduction",
    "Transform": "transform",
    "FractureZone": "transform",
}

# Pieces are tessellated so that a long great-circle arc does not become a straight
# chord cutting under the globe, then rounded: 0.01 degrees is about a kilometre.
TESSELLATE_DEGREES = 1.0
DECIMALS = 2


def rotations(texts):
    """Sequences keyed by "moving:fixed", each a flat list of time, lat, lon, angle.

    Copied from EarthThruTime3D scripts/pack_plates.py at be59c3a (MIT, same author).
    A model may split its rotations across files by era, so they merge here. Samples
    that repeat at a join are kept once: the files agree there, and a duplicate time
    would make the interpolation step over a zero-length span.
    """
    sequences = {}
    for line in "\n".join(texts).splitlines():
        body = line.split("!", 1)[0].split()
        if len(body) < 6:
            continue
        try:
            moving, fixed = int(body[0]), int(body[5])
            values = [float(value) for value in body[1:5]]
        except ValueError:
            continue
        if any(math.isnan(value) for value in values):
            continue
        sequences.setdefault(f"{moving}:{fixed}", []).append(values)
    packed = {}
    for key, samples in sequences.items():
        samples.sort(key=lambda sample: sample[0])
        unique = []
        for sample in samples:
            if unique and abs(unique[-1][0] - sample[0]) < 1e-9:
                continue
            unique.append(sample)
        packed[key] = [round(value, 6) for sample in unique for value in sample]
    return packed


def flat(geometry):
    """Lon, lat pairs in one flat list, after tessellating the arcs."""
    tessellated = geometry.to_tessellated(math.radians(TESSELLATE_DEGREES))
    values = []
    for lat, lon in tessellated.to_lat_lon_list():
        values.append(round(lon, DECIMALS))
        values.append(round(lat, DECIMALS))
    return values


class Raster:
    """Draw lon/lat polygons into an equirectangular image.

    Polygons are split at the antimeridian first. DateLineWrapper also closes a polygon
    that contains a pole along the map's top or bottom edge, which a naive split cannot.
    """

    def __init__(self, width):
        self.width = width
        self.height = width // 2
        self.wrapper = pygplates.DateLineWrapper()

    def pixels(self, points):
        return [((lon + 180.0) / 360.0 * self.width, (90.0 - lat) / 180.0 * self.height)
                for lat, lon in points]

    def draw(self, draw, polygon, value, scale=1):
        for wrapped in self.wrapper.wrap(polygon, tessellate_degrees=TESSELLATE_DEGREES):
            exterior = [(x * scale, y * scale) for x, y in
                        self.pixels((p.get_latitude(), p.get_longitude())
                                    for p in wrapped.get_exterior_points())]
            if len(exterior) >= 3:
                draw.polygon(exterior, fill=value)
            for ring in range(wrapped.get_number_of_interior_rings()):
                interior = [(x * scale, y * scale) for x, y in
                            self.pixels((p.get_latitude(), p.get_longitude())
                                        for p in wrapped.get_interior_points(ring))]
                if len(interior) >= 3:
                    draw.polygon(interior, fill=0)


def build(model, first, last, step, width):
    document = manifest(model)
    by_role = {}
    for member in document["members"]:
        by_role.setdefault(member["role"], []).append(member_path(model, member))
    rotation_files = by_role["rotation"]
    rotation_model = pygplates.RotationModel([str(path) for path in rotation_files])
    topologies = pygplates.FeaturesFunctionArgument(
        [str(path) for path in by_role["topologies"]]).get_features()
    continents = pygplates.FeaturesFunctionArgument(
        [str(path) for path in by_role["continents"]]).get_features()

    directory = OUT / model
    frames = directory / "frames"
    frames.mkdir(parents=True, exist_ok=True)
    raster = Raster(width)
    # Continents are drawn at twice the size and averaged down, so coasts are smooth;
    # plate indices are not, because an index cannot be averaged.
    supersample = 2

    ages = [round(first + index * step, 6) for index in range(int((last - first) / step) + 1)]
    started = time.time()
    total_bytes = 0
    for age in ages:
        resolved, sections = [], []
        pygplates.resolve_topologies(topologies, rotation_model, resolved, age, sections,
                                     resolve_topology_types=pygplates.ResolveTopologyType.boundary)
        # Largest first so that, where two topologies overlap by a sliver, the smaller
        # one ends up on top and stays visible and clickable.
        resolved.sort(key=lambda topology: -topology.get_resolved_boundary().get_area())
        plates = []
        index_of = {}
        plate_image = Image.new("L", (raster.width, raster.height), 0)
        plate_draw = ImageDraw.Draw(plate_image)
        for index, topology in enumerate(resolved, start=1):
            if index > 255:
                raise ValueError(f"More than 255 plates at {age} Ma; the image holds one byte")
            feature = topology.get_feature()
            plate_id = feature.get_reconstruction_plate_id()
            plates.append([index, plate_id, feature.get_name() or ""])
            index_of[topology] = index
            raster.draw(plate_draw, topology.get_resolved_boundary(), index)

        boundaries = []
        for section in sections:
            feature = section.get_feature()
            feature_type = feature.get_feature_type().get_name()
            kind = KINDS.get(feature_type, "other")
            polarity = ""
            if kind == "subduction":
                # The shared sub-segments keep the orientation of the section's own
                # geometry, so the feature's polarity applies to them as stored.
                value = feature.get_enumeration(pygplates.PropertyName.gpml_subduction_polarity,
                                                "Unknown")
                polarity = {"Left": "L", "Right": "R"}.get(value, "")
            for piece in section.get_shared_sub_segments():
                sharing = [topology.get_feature().get_reconstruction_plate_id()
                           for topology in piece.get_sharing_resolved_topologies()]
                coordinates = flat(piece.get_resolved_geometry())
                if len(coordinates) < 4:
                    continue
                boundaries.append({"k": kind, "t": feature_type, "p": polarity,
                                   "n": feature.get_name() or "", "s": sharing,
                                   "c": coordinates})

        reconstructed = []
        pygplates.reconstruct(continents, rotation_model, reconstructed, age)
        land = Image.new("L", (raster.width * supersample, raster.height * supersample), 0)
        land_draw = ImageDraw.Draw(land)
        for item in reconstructed:
            geometry = item.get_reconstructed_geometry()
            if isinstance(geometry, pygplates.PolygonOnSphere):
                raster.draw(land_draw, geometry, 255, scale=supersample)
        land = land.resize((raster.width, raster.height), Image.Resampling.BOX)

        name = f"{age:g}"
        image = Image.merge("RGB", (plate_image, land, Image.new("L", plate_image.size, 0)))
        image.save(frames / f"{name}.png", optimize=True)
        (frames / f"{name}.json").write_text(json.dumps(
            {"age": age, "plates": plates, "boundaries": boundaries},
            ensure_ascii=False, separators=(",", ":")))
        total_bytes += (frames / f"{name}.png").stat().st_size
        total_bytes += (frames / f"{name}.json").stat().st_size
        print(f"{name:>6} Ma  {len(plates):3d} plates  {len(boundaries):4d} pieces", flush=True)

    sequences = rotations([path.read_text(errors="replace") for path in rotation_files])
    (directory / "rotations.json").write_text(json.dumps(
        {"anchor": 0, "sequences": sequences}, separators=(",", ":")))
    (directory / "model.json").write_text(json.dumps({
        "id": model,
        "title": document["short_title"],
        "citation": document["citation"],
        "doi": document.get("doi"),
        "license": document["license"]["name"],
        "license_url": document["license"]["url"],
        "source": document["license"]["source"],
        "reference_frame": document["reference_frame"],
        "limitations": document["limitations"],
        "ages": ages,
        "image_width": raster.width,
        "built_with": f"pygplates {pygplates.__version__}",
    }, ensure_ascii=False, indent=1))
    print(f"{model}: {len(ages)} frames, {total_bytes / 1e6:.1f} MB, "
          f"{time.time() - started:.0f} s")


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("model", nargs="?", default="muller2022")
    parser.add_argument("--from", dest="first", type=float, default=0.0, help="youngest age, Ma")
    parser.add_argument("--to", dest="last", type=float, default=250.0, help="oldest age, Ma")
    parser.add_argument("--step", type=float, default=1.0, help="Myr between frames")
    parser.add_argument("--width", type=int, default=2048, help="image width in pixels")
    args = parser.parse_args()
    build(args.model, args.first, args.last, args.step, args.width)


if __name__ == "__main__":
    main()
