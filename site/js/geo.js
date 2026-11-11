// Points on the globe and the speed of a plate under one of them.
//
// The scene puts geographic (X, Y, Z) = (cos φ cos λ, cos φ sin λ, sin φ) at
// three.js (X, Z, -Y): a proper rotation, so north is up, east is to the right seen from
// outside, and handedness is kept. Everything else goes through these two functions.

import { conjugate, turn } from './rotation.js';

const TO_RADIANS = Math.PI / 180;
const TO_DEGREES = 180 / Math.PI;
export const EARTH_RADIUS_KM = 6371.0;

export function toVector(longitude, latitude, radius = 1) {
  const lon = longitude * TO_RADIANS;
  const lat = latitude * TO_RADIANS;
  const c = Math.cos(lat);
  return [radius * c * Math.cos(lon), radius * Math.sin(lat), -radius * c * Math.sin(lon)];
}

export function toLonLat([x, y, z]) {
  const r = Math.hypot(x, y, z) || 1;
  return [Math.atan2(-z, x) * TO_DEGREES, Math.asin(Math.max(-1, Math.min(1, y / r))) * TO_DEGREES];
}

// Great-circle distance in radians and the initial bearing from a to b, degrees from north.
export function distance([lon1, lat1], [lon2, lat2]) {
  const p1 = lat1 * TO_RADIANS;
  const p2 = lat2 * TO_RADIANS;
  const dl = (lon2 - lon1) * TO_RADIANS;
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing([lon1, lat1], [lon2, lat2]) {
  const p1 = lat1 * TO_RADIANS;
  const p2 = lat2 * TO_RADIANS;
  const dl = (lon2 - lon1) * TO_RADIANS;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * TO_DEGREES + 360) % 360;
}

// Where a point on a plate sits at `age`, given where it is today.
export function reconstruct(model, plate, presentLonLat, age) {
  const q = model.rotation(plate, age);
  return q ? turn(q, presentLonLat[0], presentLonLat[1]) : null;
}

// Where a point now at `lonLat` (at `age`) was on the same plate today.
export function toPresent(model, plate, lonLat, age) {
  const q = model.rotation(plate, age);
  return q ? turn(conjugate(q), lonLat[0], lonLat[1]) : null;
}

// Velocity of the plate at a point, averaged over the 1 Myr leading up to `age`
// (from age + 1 to age), which is what pygplates' stage rotation gives for the same
// interval. Returns speed in cm/yr and the bearing the point is moving towards.
export function velocity(model, plate, lonLat, age, interval = 1) {
  let older = age + interval;
  let younger = age;
  if (!model.rotation(plate, older)) {
    older = age;
    younger = age - interval;
  }
  const present = toPresent(model, plate, lonLat, age);
  if (!present) return null;
  const from = reconstruct(model, plate, present, older);
  const to = reconstruct(model, plate, present, younger);
  if (!from || !to) return null;
  const radians = distance(from, to);
  // km per Myr equals mm per year; one more factor of ten gives cm/yr.
  const speed = radians * EARTH_RADIUS_KM / interval / 10;
  return { speed, bearing: bearing(from, to), from, to };
}
