// A smooth surface over the section's grid (27.8 km between points).
//
// Heights are read between the grid points with a cubic B-spline: smooth everywhere (slope
// and curvature too), and never outside the values around it, since its weights are all
// positive; it smooths a little rather than passing exactly through each point. Masks (an
// area given per grid point, 1 in and 0 out) are read with Catmull–Rom splines, which do pass
// through the points, held within the four points around; only where they cross one half (the
// area's edge) matters. The same functions are used here, on the CPU (the box's walls, the
// section face, outlines), and in the shaders (GLSL below: the top surface, drawn finer than
// the grid), so they meet without gaps.

// Catmull–Rom weights for the points at -1, 0, 1, 2 around t in [0, 1), and their slopes.
function weights(t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [0.5 * (-t3 + 2 * t2 - t), 0.5 * (3 * t3 - 5 * t2 + 2), 0.5 * (-3 * t3 + 4 * t2 + t), 0.5 * (t3 - t2)];
}

// Cubic B-spline weights for the points at -1, 0, 1, 2 around t in [0, 1).
function bWeights(t) {
  const u = 1 - t;
  return [(u * u * u) / 6, (3 * t * t * t - 6 * t * t + 4) / 6, (-3 * t * t * t + 3 * t * t + 3 * t + 1) / 6, (t * t * t) / 6];
}

// values: one per grid point, row j = across (values[j * nx + i]); g: grid coordinates.
export function splineAt(values, nx, ny, gx, gy) {
  const ix = Math.min(nx - 2, Math.max(0, Math.floor(gx)));
  const iy = Math.min(ny - 2, Math.max(0, Math.floor(gy)));
  const wx = bWeights(gx - ix);
  const wy = bWeights(gy - iy);
  const at = (i, j) => values[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  let sum = 0;
  for (let b = 0; b < 4; b++) {
    let row = 0;
    for (let a = 0; a < 4; a++) row += wx[a] * at(ix + a - 1, iy + b - 1);
    sum += wy[b] * row;
  }
  return sum;
}

// A mask between grid points (Catmull–Rom, held within the four points around).
export function smoothAt(values, nx, ny, gx, gy) {
  const ix = Math.min(nx - 2, Math.max(0, Math.floor(gx)));
  const iy = Math.min(ny - 2, Math.max(0, Math.floor(gy)));
  const wx = weights(gx - ix);
  const wy = weights(gy - iy);
  const at = (i, j) => values[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  let sum = 0;
  for (let b = 0; b < 4; b++) {
    let row = 0;
    for (let a = 0; a < 4; a++) row += wx[a] * at(ix + a - 1, iy + b - 1);
    sum += wy[b] * row;
  }
  const corners = [at(ix, iy), at(ix + 1, iy), at(ix, iy + 1), at(ix + 1, iy + 1)];
  return Math.min(Math.max(...corners), Math.max(Math.min(...corners), sum));
}

// The same in GLSL, for a single-channel float texture with one texel per grid point.
// gridValue(t, p) reads point p (clamped to the grid).
export const SURFACE_GLSL = /* glsl */`
float gridValue(sampler2D t, ivec2 p) {
  return texelFetch(t, clamp(p, ivec2(0), textureSize(t, 0) - 1), 0).r;
}
vec4 crWeights(float t) {
  float t2 = t * t;
  float t3 = t2 * t;
  return 0.5 * vec4(-t3 + 2.0 * t2 - t, 3.0 * t3 - 5.0 * t2 + 2.0, -3.0 * t3 + 4.0 * t2 + t, t3 - t2);
}
vec4 crSlopes(float t) {
  float t2 = t * t;
  return 0.5 * vec4(-3.0 * t2 + 4.0 * t - 1.0, 9.0 * t2 - 10.0 * t, -9.0 * t2 + 8.0 * t + 1.0, 3.0 * t2 - 2.0 * t);
}
// A height and its slope along x and y (cubic B-spline).
vec3 splineValue(sampler2D t, vec2 g) {
  ivec2 size = textureSize(t, 0);
  vec2 cell = clamp(floor(g), vec2(0.0), vec2(size - 2));
  ivec2 b = ivec2(cell);
  vec2 f = g - cell;
  vec2 u = 1.0 - f;
  vec4 wx = vec4(u.x * u.x * u.x, 3.0 * f.x * f.x * f.x - 6.0 * f.x * f.x + 4.0, -3.0 * f.x * f.x * f.x + 3.0 * f.x * f.x + 3.0 * f.x + 1.0, f.x * f.x * f.x) / 6.0;
  vec4 wy = vec4(u.y * u.y * u.y, 3.0 * f.y * f.y * f.y - 6.0 * f.y * f.y + 4.0, -3.0 * f.y * f.y * f.y + 3.0 * f.y * f.y + 3.0 * f.y + 1.0, f.y * f.y * f.y) / 6.0;
  vec4 dx = vec4(-u.x * u.x, 3.0 * f.x * f.x - 4.0 * f.x, -3.0 * f.x * f.x + 2.0 * f.x + 1.0, f.x * f.x) / 2.0;
  vec4 dy = vec4(-u.y * u.y, 3.0 * f.y * f.y - 4.0 * f.y, -3.0 * f.y * f.y + 2.0 * f.y + 1.0, f.y * f.y) / 2.0;
  float v = 0.0;
  float vx = 0.0;
  float vy = 0.0;
  for (int j = 0; j < 4; j++) {
    float row = 0.0;
    float rowX = 0.0;
    for (int i = 0; i < 4; i++) {
      float s = gridValue(t, b + ivec2(i - 1, j - 1));
      row += wx[i] * s;
      rowX += dx[i] * s;
    }
    v += wy[j] * row;
    vx += wy[j] * rowX;
    vy += dy[j] * row;
  }
  return vec3(v, vx, vy);
}
// A mask (Catmull–Rom, held within the four points around), with its slope.
vec3 smoothValue(sampler2D t, vec2 g) {
  ivec2 size = textureSize(t, 0);
  vec2 cell = clamp(floor(g), vec2(0.0), vec2(size - 2));
  ivec2 b = ivec2(cell);
  vec2 f = g - cell;
  vec4 wx = crWeights(f.x);
  vec4 wy = crWeights(f.y);
  vec4 dx = crSlopes(f.x);
  vec4 dy = crSlopes(f.y);
  float v = 0.0;
  float vx = 0.0;
  float vy = 0.0;
  for (int j = 0; j < 4; j++) {
    float row = 0.0;
    float rowX = 0.0;
    for (int i = 0; i < 4; i++) {
      float s = gridValue(t, b + ivec2(i - 1, j - 1));
      row += wx[i] * s;
      rowX += dx[i] * s;
    }
    v += wy[j] * row;
    vx += wy[j] * rowX;
    vy += dy[j] * row;
  }
  float h00 = gridValue(t, b);
  float h10 = gridValue(t, b + ivec2(1, 0));
  float h01 = gridValue(t, b + ivec2(0, 1));
  float h11 = gridValue(t, b + ivec2(1, 1));
  float lo = min(min(h00, h10), min(h01, h11));
  float hi = max(max(h00, h10), max(h01, h11));
  if (v < lo || v > hi) return vec3(clamp(v, lo, hi), 0.0, 0.0);
  return vec3(v, vx, vy);
}
// A mask's value: where the four points around agree (most of the grid), that value, which is
// also what the spline gives there; otherwise the spline.
float maskValue(sampler2D t, vec2 g) {
  ivec2 b = ivec2(clamp(floor(g), vec2(0.0), vec2(textureSize(t, 0) - 2)));
  float a = gridValue(t, b);
  if (a == gridValue(t, b + ivec2(1, 0)) && a == gridValue(t, b + ivec2(0, 1)) && a == gridValue(t, b + ivec2(1, 1))) return a;
  return smoothValue(t, g).x;
}
`;

// A grid finer than the data's, over grid cells [i0, i1] × [j0, j1], `per` steps to a cell:
// grid coordinates per vertex (aGrid) and triangles. Positions are set by the shader.
export function fineGrid(i0, i1, j0, j1, per) {
  const cols = (i1 - i0) * per + 1;
  const rows = (j1 - j0) * per + 1;
  const grid = new Float32Array(cols * rows * 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      grid[(r * cols + c) * 2] = i0 + c / per;
      grid[(r * cols + c) * 2 + 1] = j0 + r / per;
    }
  }
  const index = new (cols * rows > 65535 ? Uint32Array : Uint16Array)((cols - 1) * (rows - 1) * 6);
  let k = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      index.set([a, a + 1, a + cols, a + 1, a + cols + 1, a + cols], k);
      k += 6;
    }
  }
  return { grid, index, count: cols * rows };
}

// Points along a line of grid coordinates from (ax, ay) to (bx, by), `per` to a cell, ends included.
export function fineLine(ax, ay, bx, by, per) {
  const n = Math.max(1, Math.round(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * per));
  return Array.from({ length: n + 1 }, (_, k) => [ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
}

// The line where a field crosses `level`, over grid cells [i0, i1] × [j0, j1] sampled `per`
// to a cell (marching squares): segments as [[gx, gy], [gx, gy]] in grid coordinates.
export function contour(field, i0, i1, j0, j1, per, level = 0.5) {
  const cols = Math.round((i1 - i0) * per) + 1;
  const rows = Math.round((j1 - j0) * per) + 1;
  const v = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) v[r * cols + c] = field(i0 + c / per, j0 + r / per) - level;
  const segments = [];
  const at = (c, r) => [i0 + c / per, j0 + r / per];
  const cross = (c0, r0, c1, r1) => {
    const a = v[r0 * cols + c0];
    const b = v[r1 * cols + c1];
    const f = a / (a - b);
    const [x0, y0] = at(c0, r0);
    const [x1, y1] = at(c1, r1);
    return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
  };
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const corners = [[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]];
      const inside = corners.map(([cc, rr]) => v[rr * cols + cc] > 0);
      const edges = [];
      for (let e = 0; e < 4; e++) {
        const [p, q] = [corners[e], corners[(e + 1) % 4]];
        if (inside[e] !== inside[(e + 1) % 4]) edges.push(cross(p[0], p[1], q[0], q[1]));
      }
      if (edges.length === 2) segments.push([edges[0], edges[1]]);
      else if (edges.length === 4) segments.push([edges[0], edges[1]], [edges[2], edges[3]]);
    }
  }
  return segments;
}
