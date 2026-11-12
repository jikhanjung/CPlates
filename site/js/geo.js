// Points on the globe and the speed of a plate under one of them.
//
// The scene puts geographic (X, Y, Z) = (cos φ cos λ, cos φ sin λ, sin φ) at
// three.js (X, Z, -Y): a proper rotation, so north is up, east is to the right seen from
// outside, and handedness is kept. Everything else goes through these two functions.

import { conjugate, multiply, turn } from './rotation.js';

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

// Velocity of the plate at a point at `age`, from the stage rotation over the 1 Myr
// leading up to it (age + 1 → age), as pygplates.calculate_velocities gives it: the
// stage's angular velocity crossed with the point. Returns speed in cm/yr and the
// bearing the point is moving towards.
export function velocity(model, plate, lonLat, age, interval = 1) {
  let older = age + interval;
  let younger = age;
  if (!model.rotation(plate, older)) {
    older = age;
    younger = age - interval;
  }
  const qOld = model.rotation(plate, older);
  const qYoung = model.rotation(plate, younger);
  const present = toPresent(model, plate, lonLat, age);
  if (!qOld || !qYoung || !present) return null;
  let [w, x, y, z] = multiply(qYoung, conjugate(qOld));
  if (w < 0) { w = -w; x = -x; y = -y; z = -z; }
  const half = Math.acos(Math.min(1, w));
  const at = reconstruct(model, plate, present, younger);
  const lon = at[0] * TO_RADIANS;
  const lat = at[1] * TO_RADIANS;
  const p = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  const s = Math.sin(half);
  if (s < 1e-15) return { speed: 0, bearing: 0, at };
  const rate = (2 * half) / interval; // radians per Myr
  const axis = [x / s, y / s, z / s];
  const v = [axis[1] * p[2] - axis[2] * p[1], axis[2] * p[0] - axis[0] * p[2], axis[0] * p[1] - axis[1] * p[0]]
    .map((c) => c * rate);
  const east = [-Math.sin(lon), Math.cos(lon), 0];
  const north = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)];
  const ve = v[0] * east[0] + v[1] * east[1];
  const vn = v[0] * north[0] + v[1] * north[1] + v[2] * north[2];
  // radians per Myr × km = km per Myr = mm/yr; a tenth of that is cm/yr.
  const speed = Math.hypot(ve, vn) * EARTH_RADIUS_KM / 10;
  return { speed, bearing: (Math.atan2(ve, vn) * TO_DEGREES + 360) % 360, at };
}

// A rotation from rotation.js ([w, x, y, z] in geographic axes) as three.js wants it
// ([x, y, z, w] in scene axes). The scene maps (X, Y, Z) to (X, Z, -Y), a proper
// rotation, so the axis maps the same way and the angle is unchanged.
export function sceneQuaternion([w, x, y, z]) {
  return [x, z, -y, w];
}
