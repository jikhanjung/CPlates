import test from 'node:test';
import assert from 'node:assert/strict';
import { heightAt, slopeFoot, smoothRows, SLOPE_FOOT_M } from '../site/js/trenchfit.js';

// A margin: land/shelf at low columns, deep ocean at high columns.
const margin = [200, 100, -160, -160, -160, -900, -1800, -2600, -3400, -3500, -3500, -3500];

test('heights between columns are interpolated', () => {
  assert.equal(heightAt(margin, 2), -160);
  assert.equal(heightAt(margin, 6.5), -2200);
  assert.equal(heightAt(margin, -3), 200);
});

test('a trench on the shelf moves seaward to the slope foot', () => {
  // The overriding plate is towards lower columns (land = −1); trench at column 3 (shelf).
  const x = slopeFoot(margin, 3, -1);
  assert.ok(x > 6 && x < 7, `slope foot at ${x}`);
  assert.ok(Math.abs(heightAt(margin, x) - SLOPE_FOOT_M) < 1e-9);
});

test('a trench out in the deep ocean moves landward to the slope foot', () => {
  const x = slopeFoot(margin, 10, -1);
  assert.ok(x > 6 && x < 7, `slope foot at ${x}`);
});

test('the shallow side must face the overriding plate', () => {
  // Overriding plate towards higher columns: the deep side is there, so no foot.
  assert.equal(slopeFoot(margin, 3, +1), null);
  // Out of the window: none.
  assert.equal(slopeFoot(margin, 0, -1, { window: 2 }), null);
});

test('rows are smoothed, and gaps take their neighbours', () => {
  const s = smoothRows([0, null, 30, null, null, null, null, null, null], 1);
  assert.equal(s[0], 0);
  assert.equal(s[1], 15);
  assert.equal(s[2], 30);
  assert.equal(s[3], 30);
  assert.equal(s[5], null);
});
