import test from 'node:test';
import assert from 'node:assert/strict';
import { IDENTITY, RotationModel, conjugate, fromPole, multiply, slerp, turn }
  from '../site/js/rotation.js';

// Copied from EarthThruTime3D tests/rotation.test.mjs at be59c3a. The check against a real
// model lives in tests/pygplates.test.mjs.
//
// The same synthetic cases tests/rotation_check.py runs, so the two implementations
// cannot drift apart without one of them failing.
const model = (sequences) => new RotationModel({ anchor: 0, sequences });

test('rotating about the pole turns longitude', () => {
  const m = model({ '1:0': [0, 90, 0, 0, 10, 90, 0, 90] });
  const [longitude, latitude] = turn(m.rotation(1, 10), 0, 0);
  assert.ok(Math.abs(longitude - 90) < 1e-9);
  assert.ok(Math.abs(latitude) < 1e-9);
});

test('a rotation and its inverse return the point', () => {
  const m = model({ '1:0': [0, 0, 0, 0, 10, 12, 34, 56] });
  const q = m.rotation(1, 10);
  const moved = turn(q, 20, -15);
  const back = turn(conjugate(q), moved[0], moved[1]);
  assert.ok(Math.abs(back[0] - 20) < 1e-9);
  assert.ok(Math.abs(back[1] + 15) < 1e-9);
});

test('slerp reaches both ends and halves the angle between', () => {
  const half = fromPole(90, 0, 90);
  assert.ok(Math.abs(slerp(IDENTITY, half, 0)[0] - 1) < 1e-12);
  assert.ok(Math.abs(slerp(IDENTITY, half, 1)[3] - half[3]) < 1e-12);
  assert.ok(Math.abs(turn(slerp(IDENTITY, half, 0.5), 0, 0)[0] - 45) < 1e-9);
});

test('a time between samples is interpolated', () => {
  const m = model({ '1:0': [0, 90, 0, 0, 10, 90, 0, 90] });
  assert.ok(Math.abs(turn(m.rotation(1, 5), 0, 0)[0] - 45) < 1e-9);
});

test('a chain composes through its fixed plate', () => {
  const m = model({ '2:0': [0, 90, 0, 0, 10, 90, 0, 30],
                    '1:2': [0, 90, 0, 0, 10, 90, 0, 60] });
  assert.ok(Math.abs(turn(m.rotation(1, 10), 0, 0)[0] - 90) < 1e-9);
  assert.ok(Math.abs(turn(m.rotation(2, 10), 0, 0)[0] - 30) < 1e-9);
});

test('the narrower sequence wins where two overlap', () => {
  const m = model({ '2:0': [0, 90, 0, 0, 100, 90, 0, 80],
                    '1:0': [0, 90, 0, 0, 100, 90, 0, 10],
                    '1:2': [40, 90, 0, 20, 60, 90, 0, 20] });
  assert.ok(Math.abs(turn(m.rotation(1, 50), 0, 0)[0] - 60) < 1e-9);
  assert.ok(Math.abs(turn(m.rotation(1, 100), 0, 0)[0] - 10) < 1e-9);
});

test('a plate outside its span has no rotation', () => {
  const m = model({ '1:0': [100, 90, 0, 10, 200, 90, 0, 20] });
  assert.ok(Math.abs(turn(m.rotation(1, 150), 0, 0)[0] - 15) < 1e-9);
  assert.equal(m.rotation(1, 300), null);
});

test('the anchor never moves', () => {
  assert.deepEqual(model({ '1:0': [10, 90, 0, 90] }).rotation(0, 10), IDENTITY);
});
