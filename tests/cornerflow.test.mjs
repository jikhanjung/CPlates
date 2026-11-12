import test from 'node:test';
import assert from 'node:assert/strict';
import { wedge, subductionFlow } from '../site/js/cornerflow.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('a wedge meets its wall conditions', () => {
  const dip = 40 * Math.PI / 180;
  const { f, fp } = wedge(0, 0, dip, 1);
  assert.ok(close(f(0), 0) && close(fp(0), 0), 'overriding plate: no flow through, at rest');
  assert.ok(close(f(dip), 0) && close(fp(dip), 1), 'slab: no flow through, moving at U');
});

test('in the mantle wedge the flow is dragged down along the slab and returns under the plate', () => {
  const dip = 45 * Math.PI / 180;
  const v = subductionFlow(+1, dip);
  // Just above the slab, half-way out: moving down-dip (towards +x, downwards).
  const r = 100;
  const nearSlab = v(r * Math.cos(dip - 0.01), -r * Math.sin(dip - 0.01));
  assert.ok(nearSlab[0] > 0 && nearSlab[1] < 0, `down-dip near the slab: ${nearSlab}`);
  // Just under the overriding plate: corner flow returns towards the trench (−x).
  const nearPlate = v(r * Math.cos(0.15), -r * Math.sin(0.15));
  assert.ok(nearPlate[0] < 0, `towards the corner under the plate: ${nearPlate}`);
  // On the slab itself the speed is U.
  const onSlab = v(r * Math.cos(dip), -r * Math.sin(dip));
  assert.ok(close(Math.hypot(...onSlab), 1, 1e-6), `slab speed: ${Math.hypot(...onSlab)}`);
});

test('under the slab the incoming plate moves towards the trench', () => {
  const dip = 30 * Math.PI / 180;
  const v = subductionFlow(-1, dip);
  // side −1: overriding plate towards −x, so the incoming plate is towards +x, moving −x.
  const nearPlate = v(200 * Math.cos(Math.PI - 0.001) * -1, -200 * Math.sin(Math.PI - 0.001));
  assert.ok(nearPlate[0] < 0 && close(Math.hypot(...nearPlate), 1, 1e-2), `incoming plate: ${nearPlate}`);
});
