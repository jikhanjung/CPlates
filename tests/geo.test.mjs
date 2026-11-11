import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from '../site/vendor/three/three.module.js';
import { fromPole, multiply, turn } from '../site/js/rotation.js';
import { sceneQuaternion, toLonLat, toVector } from '../site/js/geo.js';

test('toVector and toLonLat are inverse', () => {
  for (const [lon, lat] of [[0, 0], [123.4, -56.7], [-170, 80], [45, -89]]) {
    const [l, p] = toLonLat(toVector(lon, lat));
    assert.ok(Math.abs(l - lon) < 1e-9 && Math.abs(p - lat) < 1e-9, `${lon},${lat} → ${l},${p}`);
  }
});

test('north is up and east is to the right seen from outside', () => {
  assert.deepEqual(toVector(0, 90).map((v) => Math.round(v) + 0), [0, 1, 0]);
  // Looking at (0, 0) from outside (+X), a point a little east must be on screen right;
  // with Y up and the eye on +X looking at the origin, screen right is -Z.
  assert.ok(toVector(1, 0)[2] < 0);
});

test('a mesh turned by sceneQuaternion lands where turn() puts its points', () => {
  // The Cambrian page turns whole continent meshes this way; the boundaries and the
  // band are placed point by point with turn(). They must agree.
  const rotations = [fromPole(30, 40, 25), fromPole(-70, 160, 80),
                     multiply(fromPole(10, -20, 33), fromPole(-45, 100, 120))];
  for (const q of rotations) {
    const scene = new Quaternion(...sceneQuaternion(q));
    for (const [lon, lat] of [[0, 0], [90, -80], [-120, 35], [170, -12]]) {
      const moved = new Vector3(...toVector(lon, lat)).applyQuaternion(scene).toArray();
      const expected = toVector(...turn(q, lon, lat));
      moved.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-9, `${lon},${lat}: ${moved} vs ${expected}`));
    }
  }
});
