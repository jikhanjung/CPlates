// Cutting the slab out of the layers it passes through.
//
// The slab is described in its own coordinates: u down the dip from the trench (on the sea
// floor), v at right angles to it, downwards from the slab's top surface. The slab is the
// region u ≥ 0, 0 ≤ v ≤ thickness. A point's (u, v) comes from its horizontal distance s
// from the trench towards the overriding plate and its depth d below the trench's sea floor.
//
// Every layer polygon (a face band, a wall quad, a triangle of a solid's base) is clipped
// to the outside of that region, and the slab is drawn exactly inside it, so the two never
// overlap and never fight in the depth buffer.

export function slabUV(s, d, dip) {
  const c = Math.cos(dip);
  const n = Math.sin(dip);
  return [s * c + d * n, -s * n + d * c];
}

// The inverse: horizontal distance s and depth d of a point (u, v) of the slab.
export function slabSD(u, v, dip) {
  const c = Math.cos(dip);
  const n = Math.sin(dip);
  return [u * c - v * n, u * n + v * c];
}

// Half-planes A·u + B·v + C ≥ 0. Outside the slab, as three convex pieces that do not
// overlap: above its top, below its base, and seaward of where it starts.
export function outsidePieces(thick) {
  return [
    [[0, -1, 0]],
    [[0, 1, -thick]],
    [[-1, 0, 0], [0, 1, 0], [0, -1, thick]],
  ];
}

// Inside the slab: its oceanic crust (the top `crust` km) and its mantle part.
export function insidePieces(crust, thick) {
  return [
    [[1, 0, 0], [0, 1, 0], [0, -1, crust]],
    [[1, 0, 0], [0, 1, -crust], [0, -1, thick]],
  ];
}

// A vertex is { f: [u, v], p: [x, y, z], c: [r, g, b] | null }; values are interpolated
// linearly along edges, which is exact for the straight slab within one plane.
const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
function lerpVertex(a, b, t) {
  return { f: mix(a.f, b.f, t), p: mix(a.p, b.p, t), c: a.c && b.c ? mix(a.c, b.c, t) : a.c };
}

export function clipPolygon(poly, planes) {
  let out = poly;
  for (const [A, B, C] of planes) {
    if (out.length < 3) return [];
    const g = (v) => A * v.f[0] + B * v.f[1] + C;
    const next = [];
    for (let k = 0; k < out.length; k++) {
      const a = out[k];
      const b = out[(k + 1) % out.length];
      const ga = g(a);
      const gb = g(b);
      if (ga >= 0) next.push(a);
      if ((ga >= 0) !== (gb >= 0)) next.push(lerpVertex(a, b, ga / (ga - gb)));
    }
    out = next;
  }
  return out.length >= 3 ? out : [];
}

const inside = (poly, planes) => poly.every((v) => planes.every(([A, B, C]) => A * v.f[0] + B * v.f[1] + C >= 0));

// Clip `poly` to each piece and hand every resulting triangle to emit(a, b, c). Vertices
// with f === null (no slab on their row) leave the polygon whole.
export function carve(poly, pieces, emit) {
  const fan = (q) => { for (let k = 1; k + 1 < q.length; k++) emit(q[0], q[k], q[k + 1]); };
  if (poly.some((v) => !v.f)) { fan(poly); return; }
  for (const planes of pieces) {
    if (inside(poly, planes)) { fan(poly); return; }
  }
  for (const planes of pieces) fan(clipPolygon(poly, planes));
}
