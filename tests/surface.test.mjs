import test from 'node:test';
import assert from 'node:assert/strict';
import { contour, fineGrid, fineLine, smoothAt, splineAt } from '../site/js/surface.js';

const nx = 6;
const ny = 5;
const grid = (f) => Float32Array.from({ length: nx * ny }, (_, n) => f(n % nx, Math.floor(n / nx)));

test('heights: the B-spline keeps a plane, stays within the values around, and is continuous across cells', () => {
  const plane = grid((i, j) => 100 + 10 * i - 5 * j);
  for (const [x, y] of [[1.3, 2.7], [2.5, 1.5], [3, 2]]) assert.ok(Math.abs(splineAt(plane, nx, ny, x, y) - (100 + 10 * x - 5 * y)) < 1e-9);
  const step = grid((i) => (i < 3 ? 0 : 240));
  for (let x = 0; x <= 5; x += 0.05) {
    const v = splineAt(step, nx, ny, x, 2);
    assert.ok(v >= 0 && v <= 240, `within the data at ${x}: ${v}`);
  }
  assert.ok(Math.abs(splineAt(step, nx, ny, 2.999999, 2) - splineAt(step, nx, ny, 3, 2)) < 1e-3, 'no jump at a cell edge');
});

test('masks: Catmull–Rom passes through the grid points and stays in [0, 1]', () => {
  const mask = grid((i, j) => (i === 2 && j === 2 ? 1 : 0));
  assert.equal(smoothAt(mask, nx, ny, 2, 2), 1);
  assert.equal(smoothAt(mask, nx, ny, 4, 1), 0);
  for (let x = 1; x <= 3; x += 0.1) {
    const v = smoothAt(mask, nx, ny, x, 2.3);
    assert.ok(v >= 0 && v <= 1, `${x}: ${v}`);
  }
});

test('the edge of a one-cell area is a closed, rounded loop around its point', () => {
  const mask = grid((i, j) => (i === 2 && j === 2 ? 1 : 0));
  const segments = contour((x, y) => smoothAt(mask, nx, ny, x, y) - 0.5, 0, nx - 1, 0, ny - 1, 8, 0);
  assert.ok(segments.length > 8, `${segments.length} segments`);
  const radii = segments.flat().map(([x, y]) => Math.hypot(x - 2, y - 2));
  assert.ok(Math.min(...radii) > 0.3 && Math.max(...radii) < 0.75, `radius ${Math.min(...radii)}–${Math.max(...radii)}`);
  // Closed: every end point is shared by two segments.
  const key = ([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`;
  const count = new Map();
  for (const p of segments.flat()) count.set(key(p), (count.get(key(p)) ?? 0) + 1);
  assert.ok([...count.values()].every((c) => c === 2));
});

test('the finer grid and lines cover the cells, ends included', () => {
  const g = fineGrid(2, 4, 1, 2, 4);
  assert.equal(g.count, 9 * 5);
  assert.deepEqual([g.grid[0], g.grid[1]], [2, 1]);
  assert.deepEqual([g.grid[g.grid.length - 2], g.grid[g.grid.length - 1]], [4, 2]);
  assert.equal(g.index.length, 8 * 4 * 6);
  const line = fineLine(1, 3, 3, 3, 4);
  assert.equal(line.length, 9);
  assert.deepEqual(line[8], [3, 3]);
});
