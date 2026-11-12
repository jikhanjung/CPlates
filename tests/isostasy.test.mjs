import test from 'node:test';
import assert from 'node:assert/strict';
import { airyCrustKm, continentalShare, crustKm } from '../site/js/isostasy.js';

test('Airy: 35 km at sea level, a 5.6 km root per km of height, a shallower base under water', () => {
  assert.equal(airyCrustKm(0), 35);
  assert.ok(Math.abs(airyCrustKm(1000) - 40.6) < 1e-9);
  assert.ok(Math.abs(airyCrustKm(-1000) - (35 - 1.77 / 0.5)) < 1e-9);
  assert.equal(airyCrustKm(10000), 70);
});

test('continental above −1000 m, oceanic below −2000 m, blended between', () => {
  assert.equal(continentalShare(-500), 1);
  assert.equal(continentalShare(-2500), 0);
  assert.equal(crustKm(-4000), 7);
  assert.ok(crustKm(-1500) > 7 && crustKm(-1500) < airyCrustKm(-1500));
});
