import test from 'node:test';
import assert from 'node:assert/strict';
import { EXTENT, flattenSegments, project, unproject, wrap } from '../site/js/projection.js';
import { toVector } from '../site/js/geo.js';

const close = (a, b, tol, message) => assert.ok(Math.abs(a - b) < tol, `${message}: ${a} vs ${b}`);

test('wrap keeps longitudes in [-180, 180)', () => {
  assert.equal(wrap(180), -180);
  assert.equal(wrap(-180), -180);
  assert.equal(wrap(190), -170);
  assert.equal(wrap(-541), 179);
});

test('Mollweide: known points and the edge of the ellipse', () => {
  const [ex, ey] = EXTENT.mollweide;
  assert.deepEqual(project('mollweide', 0, 0), [0, 0]);
  const [, top] = project('mollweide', 0, 90);
  close(top, ey, 1e-9, 'north pole at the top');
  const [right] = project('mollweide', 179.999999, 0);
  close(right, ex, 1e-6, 'equator reaches the side');
  // y = √2 sin θ with 2θ + sin 2θ = π sin φ.
  const theta = Math.asin(project('mollweide', 0, 45)[1] / Math.SQRT2);
  close(2 * theta + Math.sin(2 * theta), Math.PI * Math.sin(Math.PI / 4), 1e-9, 'auxiliary angle at 45°');
});

test('Mollweide is equal-area: a 1° cell has the same map area at any latitude on a meridian', () => {
  const area = (lat) => {
    const [x0, y0] = project('mollweide', 0, lat);
    const [x1] = project('mollweide', 1, lat);
    const [, y1] = project('mollweide', 0, lat + 0.01);
    // Width at this latitude times height of a thin band, per unit of sphere area.
    return ((x1 - x0) * (y1 - y0)) / (Math.cos((lat + 0.005) * Math.PI / 180) * (Math.PI / 180) * (0.01 * Math.PI / 180));
  };
  for (const lat of [0, 30, 60, 80]) close(area(lat), 1, 1e-3, `area scale at ${lat}°`);
});

test('project and unproject are inverse, with a central meridian', () => {
  for (const proj of ['mollweide', 'equirect']) {
    for (const lon0 of [0, 150, -60]) {
      for (const [lon, lat] of [[0, 0], [123.4, -56.7], [-170, 80], [45, -89], [179, 10]]) {
        const [x, y] = project(proj, lon, lat, lon0);
        const back = unproject(proj, x, y, lon0);
        close(wrap(back[0] - lon), 0, 1e-7, `${proj} lon0 ${lon0}: lon of ${lon},${lat}`);
        close(back[1], lat, 1e-7, `${proj} lon0 ${lon0}: lat of ${lon},${lat}`);
      }
    }
  }
  assert.equal(unproject('mollweide', 2.5, 1.3), null, 'off the ellipse');
  assert.equal(unproject('equirect', 3.2, 0), null, 'off the rectangle');
});

test('a segment across the map edge is cut in two at the edge', () => {
  const positions = [...toVector(175, 10, 1.003), ...toVector(-175, 20, 1.003)];
  const colours = [1, 0, 0, 0, 0, 1];
  const { positions: out, colours: outColours } = flattenSegments('equirect', positions, 0, colours);
  assert.equal(out.length, 12, 'two segments');
  close(out[3], Math.PI, 1e-6, 'first piece ends at the right edge');
  close(out[6], -Math.PI, 1e-6, 'second piece starts at the left edge');
  close(out[4], 15 * Math.PI / 180, 1e-9, 'cut halfway in latitude');
  close(out[2], 0.003, 1e-9, 'height kept');
  close(outColours[3], 0.5, 1e-9, 'colour at the cut is between the ends');
  // Centred on 180°, the same segment is in the middle and stays whole.
  assert.equal(flattenSegments('equirect', positions, 180).positions.length, 6);
});
