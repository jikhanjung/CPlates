import test from 'node:test';
import assert from 'node:assert/strict';
import { slabUV, slabSD, outsidePieces, insidePieces, carve } from '../site/js/slabcut.js';

const DIP = 45 * Math.PI / 180;
const area = (tris) => tris.reduce((sum, [a, b, c]) =>
  sum + Math.abs((b.p[0] - a.p[0]) * (c.p[1] - a.p[1]) - (c.p[0] - a.p[0]) * (b.p[1] - a.p[1])) / 2, 0);
// A rectangle in (s, d): x = s, y = d, f from slabUV.
const rect = (s0, s1, d0, d1) => [[s0, d0], [s1, d0], [s1, d1], [s0, d1]]
  .map(([s, d]) => ({ f: slabUV(s, d, DIP), p: [s, d, 0], c: null }));
const cut = (poly, pieces) => { const out = []; carve(poly, pieces, (a, b, c) => out.push([a, b, c])); return out; };

test('slab coordinates turn and turn back', () => {
  const [u, v] = slabUV(30, 70, DIP);
  const [s, d] = slabSD(u, v, DIP);
  assert.ok(Math.abs(s - 30) < 1e-9 && Math.abs(d - 70) < 1e-9);
  // Straight down the dip from the trench: v = 0.
  assert.ok(Math.abs(slabUV(100, 100, DIP)[1]) < 1e-9);
});

test('outside and inside together cover a layer exactly once', () => {
  const poly = rect(-200, 300, 0, 250);
  const total = 500 * 250;
  const outside = area(cut(poly, outsidePieces(90)));
  const inside = area(cut(poly, insidePieces(7, 90)));
  assert.ok(Math.abs(outside + inside - total) < 1e-6, `${outside} + ${inside} ≠ ${total}`);
  // The slab inside the rectangle: a 90 km thick band cut off at the surface and the bottom.
  assert.ok(inside > 0.15 * total && inside < 0.4 * total, `slab share ${inside / total}`);
});

test('a layer away from the slab is left whole', () => {
  const poly = rect(-600, -400, 0, 50);
  const tris = cut(poly, outsidePieces(90));
  assert.equal(tris.length, 2);
  assert.ok(Math.abs(area(tris) - 200 * 50) < 1e-9);
  assert.equal(cut(poly, insidePieces(7, 90)).length, 0);
});

test('a row with no slab is not cut', () => {
  const poly = rect(-200, 300, 0, 250).map((v) => ({ ...v, f: null }));
  assert.ok(Math.abs(area(cut(poly, outsidePieces(90))) - 500 * 250) < 1e-6);
});
