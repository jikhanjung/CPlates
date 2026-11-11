#!/usr/bin/env python3
"""Write tests/fixtures/<model>.json: what pygplates says, for the browser code to match.

The site composes rotations itself (site/js/rotation.js) to measure plate velocity, while
the frames are resolved by pygplates. If the two read the rotation file differently, a
plate would be drawn in one place and measured in another. This fixture pins a handful
of reconstructed points and velocities from pygplates so tests/pygplates.test.mjs can
hold the JavaScript to them.
"""
import json
import sys
from pathlib import Path

import pygplates

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_plate_model import manifest, member_path  # noqa: E402

# Plate, present-day lon, lat: Africa, North America, India, Australia, Pacific,
# Antarctica, South America, Nazca.
POINTS = [(701, 20.0, 5.0), (101, -100.0, 45.0), (501, 78.0, 22.0), (801, 134.0, -25.0),
          (901, -155.0, 19.5), (802, 0.0, -80.0), (201, -60.0, -15.0), (911, -90.0, -20.0)]
AGES = [0, 10, 50, 100, 150, 200, 250]


def main(model="muller2022"):
    document = manifest(model)
    files = [str(member_path(model, member)) for member in document["members"]
             if member["role"] == "rotation"]
    rotation_model = pygplates.RotationModel(files)
    cases = []
    for plate, lon, lat in POINTS:
        present = pygplates.PointOnSphere(lat, lon)
        for age in AGES:
            # pygplates falls back to the identity for a plate with no rotation at an age
            # (Nazca did not exist at 250 Ma); such cases say nothing, so skip them.
            if any(rotation_model.get_rotation(when, plate, use_identity_for_missing_plate_ids=False)
                   is None for when in (age, age + 1)):
                continue
            rotation = rotation_model.get_rotation(age, plate)
            point = rotation * present
            point_lat, point_lon = point.to_lat_lon()
            # Stage rotation from age + 1 to age, as the site measures it.
            stage = rotation_model.get_rotation(age, plate, age + 1)
            vector = pygplates.calculate_velocities(
                [point], stage, 1.0, pygplates.VelocityUnits.cms_per_yr)[0]
            magnitude, azimuth, _ = pygplates.LocalCartesian.convert_from_geocentric_to_magnitude_azimuth_inclination(
                [point], [vector])[0]
            cases.append({"plate": plate, "present": [lon, lat], "age": age,
                          "lon": round(point_lon, 6), "lat": round(point_lat, 6),
                          "speed_cm_yr": round(magnitude, 5),
                          "bearing": round(azimuth * 180 / 3.141592653589793 % 360, 4)})
    out = ROOT / "tests/fixtures" / f"{model}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"model": model, "pygplates": pygplates.__version__,
                               "cases": cases}, indent=1) + "\n")
    print(f"{out.relative_to(ROOT)}: {len(cases)} cases")


if __name__ == "__main__":
    main(*sys.argv[1:])
