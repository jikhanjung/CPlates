// The browser composes rotations itself; pygplates resolved the frames. Hold the one to
// the other on the model the site draws (fixture from scripts/make_test_fixture.py).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { RotationModel } from '../site/js/rotation.js';
import { reconstruct, velocity } from '../site/js/geo.js';


function angleGap(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

for (const name of ['merdith2021', 'muller2022']) {
const fixture = JSON.parse(readFileSync(`tests/fixtures/${name}.json`, 'utf8'));
const rotations = `site/data/${name}/rotations.json`;

test(`${name}: rotation.js reconstructs points where pygplates does`, (t) => {
  if (!existsSync(rotations)) return t.skip('run scripts/build_frames.py first');
  const model = new RotationModel(JSON.parse(readFileSync(rotations, 'utf8')));
  for (const c of fixture.cases) {
    const [lon, lat] = reconstruct(model, c.plate, c.present, c.age);
    const label = `plate ${c.plate} at ${c.age} Ma`;
    assert.ok(Math.abs(lat - c.lat) < 1e-3, `${label}: lat ${lat} vs ${c.lat}`);
    assert.ok(angleGap(lon, c.lon) * Math.cos(lat * Math.PI / 180) < 1e-3,
              `${label}: lon ${lon} vs ${c.lon}`);
  }
});

test(`${name}: plate velocity matches pygplates over the same 1 Myr stage`, (t) => {
  if (!existsSync(rotations)) return t.skip('run scripts/build_frames.py first');
  const model = new RotationModel(JSON.parse(readFileSync(rotations, 'utf8')));
  for (const c of fixture.cases) {
    const v = velocity(model, c.plate, [c.lon, c.lat], c.age);
    const label = `plate ${c.plate} at ${c.age} Ma`;
    // Same method as pygplates: the 1 Myr stage's angular velocity at the point.
    assert.ok(Math.abs(v.speed - c.speed_cm_yr) < 0.005 + 0.002 * c.speed_cm_yr,
              `${label}: ${v.speed} vs ${c.speed_cm_yr} cm/yr`);
    if (c.speed_cm_yr > 0.2) {
      assert.ok(angleGap(v.bearing, c.bearing) < 0.2, `${label}: bearing ${v.bearing} vs ${c.bearing}`);
    }
  }
});

}

test('a Pacific point near Hawaii moves north-west at several cm/yr today (mantle frame)', (t) => {
  const rotations = 'site/data/muller2022/rotations.json';
  if (!existsSync(rotations)) return t.skip('run scripts/build_frames.py first');
  const model = new RotationModel(JSON.parse(readFileSync(rotations, 'utf8')));
  const v = velocity(model, 901, [-155, 19.5], 0);
  assert.ok(v.speed > 5 && v.speed < 12, `speed ${v.speed}`);
  assert.ok(v.bearing > 270 && v.bearing < 340, `bearing ${v.bearing}`);
});
