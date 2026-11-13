// Flat maps beside the globe: Mollweide (equal-area) and equirectangular (plate carrée),
// both on a sphere of radius 1 and centred on a meridian lon0.
//
// The pages draw everything on the globe, as points on or just above the unit sphere. For a
// map the same scene is kept and flattened in three ways:
// - the background (plates, crust, PaleoDEM) is a plane whose fragment shader inverts the
//   projection for each pixel, so it is exact;
// - meshes and thin lines get mapPatch(): their vertex shader projects each vertex, and a
//   fragment whose own direction does not match its place on the map (a triangle that
//   crosses the map's edge and is stretched over the whole map) is discarded;
// - wide lines (LineSegments2, whose shader is not patched) are projected here, on the
//   CPU, and cut in two where they cross the map's edge (mapSegments()).
// Height above the sphere becomes height above the map plane, so the layers keep their order.

export const PROJECTIONS = ['globe', 'mollweide', 'equirect'];
const MODE = { globe: 0, mollweide: 1, equirect: 2 };
const SQRT2 = Math.SQRT2;
const R = Math.PI / 180;

// Half width and half height of each map, sphere radius 1.
export const EXTENT = { mollweide: [2 * SQRT2, SQRT2], equirect: [Math.PI, Math.PI / 2] };

// The projection in use on the page, shared by the shaders through these uniforms.
export const mapView = { proj: 'globe', lon0: 0 };
export const mapUniforms = { uMapMode: { value: 0 }, uLon0: { value: 0 } };

export function setMapView(proj, lon0 = mapView.lon0) {
  mapView.proj = MODE[proj] === undefined ? 'globe' : proj;
  mapView.lon0 = wrap(lon0);
  mapUniforms.uMapMode.value = MODE[mapView.proj];
  mapUniforms.uLon0.value = mapView.lon0 * R;
}

export function projectionFrom(params) {
  const asked = params.get('proj');
  return PROJECTIONS.includes(asked) ? asked : 'globe';
}

// Degrees into [-180, 180).
export function wrap(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

// Mollweide's auxiliary angle: 2θ + sin 2θ = π sin φ (Newton, from θ = φ).
function mollweideTheta(phi) {
  if (Math.abs(phi) >= Math.PI / 2 - 1e-12) return Math.sign(phi) * Math.PI / 2;
  const k = Math.PI * Math.sin(phi);
  let t = phi;
  for (let i = 0; i < 50; i++) {
    const step = (2 * t + Math.sin(2 * t) - k) / (2 + 2 * Math.cos(2 * t));
    t -= step;
    if (Math.abs(step) < 1e-12) break;
  }
  return t;
}

// Longitude and latitude in degrees → map x, y (radius 1), centred on lon0.
export function project(proj, lon, lat, lon0 = 0) {
  const lambda = wrap(lon - lon0) * R;
  const phi = lat * R;
  if (proj === 'mollweide') {
    const t = mollweideTheta(phi);
    return [(2 * SQRT2 / Math.PI) * lambda * Math.cos(t), SQRT2 * Math.sin(t)];
  }
  return [lambda, phi];
}

// Map x, y → [lon, lat] in degrees, or null off the map.
export function unproject(proj, x, y, lon0 = 0) {
  let lambda;
  let phi;
  if (proj === 'mollweide') {
    const s = y / SQRT2;
    if (Math.abs(s) > 1) return null;
    const t = Math.asin(s);
    const c = Math.cos(t);
    lambda = c > 1e-12 ? (Math.PI * x) / (2 * SQRT2 * c) : 0;
    phi = Math.asin(Math.max(-1, Math.min(1, (2 * t + Math.sin(2 * t)) / Math.PI)));
  } else {
    lambda = x;
    phi = y;
  }
  if (Math.abs(lambda) > Math.PI + 1e-9 || Math.abs(phi) > Math.PI / 2 + 1e-9) return null;
  return [wrap(lambda / R + lon0), phi / R];
}

export function toMap(lon, lat) {
  return project(mapView.proj, lon, lat, mapView.lon0);
}

// Scene point (three.js axes, see geo.js) → [lon, lat, height above the sphere].
function lonLatOf(positions, i) {
  const x = positions[i];
  const y = positions[i + 1];
  const z = positions[i + 2];
  const r = Math.hypot(x, y, z) || 1;
  return [Math.atan2(-z, x) / R, Math.asin(Math.max(-1, Math.min(1, y / r))) / R, r - 1];
}

// Segment pairs on the globe (x, y, z, x, y, z, …) → the same on the map, each segment that
// crosses the map's edge cut in two there. Colours (r, g, b per point), if given, follow.
export function flattenSegments(proj, positions, lon0 = 0, colours = null) {
  const out = [];
  const outColours = colours ? [] : null;
  const push = (lon, lat, h, colour) => {
    out.push(...project(proj, lon, lat, lon0), h);
    if (outColours) outColours.push(...colour);
  };
  for (let i = 0; i + 5 < positions.length; i += 6) {
    const [la, pa, ha] = lonLatOf(positions, i);
    const [lb, pb, hb] = lonLatOf(positions, i + 3);
    const ca = colours ? colours.slice(i, i + 3) : null;
    const cb = colours ? colours.slice(i + 3, i + 6) : null;
    const a = wrap(la - lon0);
    const b = wrap(lb - lon0);
    if (Math.abs(b - a) <= 180) {
      push(la, pa, ha, ca);
      push(lb, pb, hb, cb);
      continue;
    }
    // Crossing the edge: unwrap b next to a, and cut where the line reaches ±180.
    const edge = a >= 0 ? 180 : -180;
    const bUnwrapped = b + (a >= 0 ? 360 : -360);
    const f = (edge - a) / (bUnwrapped - a);
    const lat = pa + f * (pb - pa);
    const h = ha + f * (hb - ha);
    const c = colours ? ca.map((v, k) => v + f * (cb[k] - v)) : null;
    // Just inside each edge, so wrap() keeps the side.
    const inside = 1e-7;
    push(la, pa, ha, ca);
    push(lon0 + edge - Math.sign(edge) * inside, lat, h, c);
    push(lon0 - edge + Math.sign(edge) * inside, lat, h, c);
    push(lb, pb, hb, cb);
  }
  return { positions: out, colours: outColours };
}

// For LineSegments2: the globe's segments as they are, or flattened for the map.
export function mapSegments(positions, colours = null) {
  if (mapView.proj === 'globe') return { positions, colours };
  return flattenSegments(mapView.proj, positions, mapView.lon0, colours);
}

// GLSL: the same projection, for the shaders.
export const MAP_GLSL = /* glsl */`
uniform float uMapMode;
uniform float uLon0;
const float MAP_PI = 3.141592653589793;
const float MAP_SQRT2 = 1.4142135623730951;
vec2 mapLonLat(vec3 d) {
  float lat = asin(clamp(d.y, -1.0, 1.0));
  float lon = mod(atan(-d.z, d.x) - uLon0 + MAP_PI, 2.0 * MAP_PI) - MAP_PI;
  return vec2(lon, lat);
}
vec2 mapForward(vec2 ll) {
  if (uMapMode > 1.5) return ll;
  float k = MAP_PI * sin(ll.y);
  float t = ll.y;
  for (int i = 0; i < 20; i++) {
    float d = 2.0 + 2.0 * cos(2.0 * t);
    if (d < 1e-5) break;
    t -= (2.0 * t + sin(2.0 * t) - k) / d;
  }
  t = clamp(t, -0.5 * MAP_PI, 0.5 * MAP_PI);
  return vec2(2.0 * MAP_SQRT2 / MAP_PI * ll.x * cos(t), MAP_SQRT2 * sin(t));
}
// (lon relative to uLon0, lat, 1), or z < 0 off the map.
vec3 mapInverse(vec2 xy) {
  if (uMapMode > 1.5) {
    if (abs(xy.x) > MAP_PI || abs(xy.y) > 0.5 * MAP_PI) return vec3(0.0, 0.0, -1.0);
    return vec3(xy, 1.0);
  }
  float s = xy.y / MAP_SQRT2;
  if (abs(s) > 1.0) return vec3(0.0, 0.0, -1.0);
  float t = asin(s);
  float c = cos(t);
  float lon = c > 1e-6 ? MAP_PI * xy.x / (2.0 * MAP_SQRT2 * c) : 0.0;
  if (abs(lon) > MAP_PI) return vec3(0.0, 0.0, -1.0);
  return vec3(lon, asin(clamp((2.0 * t + sin(2.0 * t)) / MAP_PI, -1.0, 1.0)), 1.0);
}
// True where a fragment's own direction is not where it is drawn: a stretched triangle.
bool mapCut(vec3 dir, vec2 xy) {
  vec3 inv = mapInverse(xy);
  if (inv.z < 0.0) return true;
  float d = abs(inv.x - mapLonLat(normalize(dir)).x);
  return min(d, 2.0 * MAP_PI - d) > 0.6;
}
`;

const MAP_VARYINGS = 'varying vec3 vMapDir;\nvarying vec2 vMapXY;\n';

// Make a built-in material (MeshBasic, MeshLambert, LineBasic) draw on the map when the
// page is in a map projection. Lambert surfaces face the viewer there, so they are lit evenly.
export function mapPatch(material) {
  const lambert = Boolean(material.isMeshLambertMaterial);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mapUniforms);
    let vertex = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vMapDir = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vMapXY = vec2(0.0);
      if (uMapMode > 0.5) {
        vMapXY = mapForward(mapLonLat(normalize(vMapDir)));
        mvPosition = viewMatrix * vec4(vMapXY, length(vMapDir) - 1.0, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }`);
    if (lambert) {
      vertex = vertex.replace('#include <normal_vertex>',
        'if (uMapMode > 0.5) transformedNormal = vec3(0.0, 0.0, 1.0);\n#include <normal_vertex>');
    }
    shader.vertexShader = MAP_GLSL + MAP_VARYINGS + vertex;
    shader.fragmentShader = MAP_GLSL + MAP_VARYINGS + shader.fragmentShader.replace('void main() {',
      'void main() {\n  if (uMapMode > 0.5 && mapCut(vMapDir, vMapXY)) discard;');
  };
  material.customProgramCacheKey = () => `map-${lambert}`;
  material.needsUpdate = true;
  return material;
}

// The map's outline: the ellipse or rectangle, as segment pairs on the plane at height h.
export function outlineSegments(proj, h = 0) {
  const out = [];
  const [ex, ey] = EXTENT[proj];
  const steps = 180;
  let previous = null;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    let point;
    if (proj === 'mollweide') point = [ex * Math.cos(a), ey * Math.sin(a), h];
    else {
      const corners = [[ex, ey], [-ex, ey], [-ex, -ey], [ex, -ey], [ex, ey]];
      const s = (i / steps) * 4;
      const k = Math.min(3, Math.floor(s));
      const f = s - k;
      point = [corners[k][0] + f * (corners[k + 1][0] - corners[k][0]),
               corners[k][1] + f * (corners[k + 1][1] - corners[k][1]), h];
    }
    if (previous) out.push(...previous, ...point);
    previous = point;
  }
  return out;
}
