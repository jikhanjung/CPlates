// Corner flow: the analytic Stokes solution for viscous flow in a wedge whose walls move
// rigidly (Batchelor 1967; McKenzie 1969, for the mantle wedge above a subducting slab).
//
// In polar coordinates (r, φ) about the corner the stream function is ψ = r·f(φ) with
// f(φ) = A sin φ + B cos φ + C φ sin φ + D φ cos φ, and the velocity is
// u_r = f′(φ), u_φ = −f(φ): it does not change along a ray, only with the angle.
// The four constants come from the two walls: on each, no flow through it (f = 0) and
// the wall's own speed along it (f′ = u).
//
// The section page uses it as a sketch of how a slab drags the mantle, scaled by the
// model's convergence rate. It is not a mantle model: no buoyancy, no temperature, a
// straight slab, and a wedge reaching all the way to the trench.

function solve4(m, b) {
  // Gaussian elimination with partial pivoting on a 4×4 system.
  const a = m.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = c + 1; r < 4; r++) {
      const f = a[r][c] / a[c][c];
      for (let k = c; k < 5; k++) a[r][k] -= f * a[c][k];
    }
  }
  const x = [0, 0, 0, 0];
  for (let r = 3; r >= 0; r--) {
    let s = a[r][4];
    for (let k = r + 1; k < 4; k++) s -= a[r][k] * x[k];
    x[r] = s / a[r][r];
  }
  return x;
}

const basis = (phi) => [Math.sin(phi), Math.cos(phi), phi * Math.sin(phi), phi * Math.cos(phi)];
const basisPrime = (phi) => [Math.cos(phi), -Math.sin(phi), Math.sin(phi) + phi * Math.cos(phi),
                             Math.cos(phi) - phi * Math.sin(phi)];

// A wedge between the rays φ0 and φ1, with wall speeds u0 and u1 along the walls
// (positive: away from the corner). Returns f and f′.
export function wedge(phi0, u0, phi1, u1) {
  const [A, B, C, D] = solve4([basis(phi0), basisPrime(phi0), basis(phi1), basisPrime(phi1)],
                              [0, u0, 0, u1]);
  const f = (phi) => { const v = basis(phi); return A * v[0] + B * v[1] + C * v[2] + D * v[3]; };
  const fp = (phi) => { const v = basisPrime(phi); return A * v[0] + B * v[1] + C * v[2] + D * v[3]; };
  return { f, fp };
}

// Subduction at a trench: the overriding plate lies towards `side` (+1 or −1 along x),
// the slab dips under it at `dip` (radians below horizontal), and the subducting plate
// comes in at speed U. Angles φ are measured from the direction of the overriding plate,
// turning down through the slab (φ = dip) to the incoming plate (φ = π).
// Returns velocity(x, y) in the section's coordinates (x along, y up; the trench at the
// origin), in units of U, or null above the corner.
export function subductionFlow(side, dip) {
  const arc = wedge(0, 0, dip, 1);        // mantle wedge: plate at rest, slab going down
  const ocean = wedge(dip, 1, Math.PI, -1); // under the slab: plate coming in, slab going down
  return (x, y) => {
    if (y >= 0) return null;
    const r = Math.hypot(x, y);
    if (r < 1e-9) return [0, 0];
    // φ from the overriding direction (side, 0), turning downwards.
    const phi = Math.atan2(-y, x * side);
    const flow = phi <= dip ? arc : ocean;
    const ur = flow.fp(phi);
    const uphi = -flow.f(phi);
    const er = [side * Math.cos(phi), -Math.sin(phi)];
    const ephi = [-side * Math.sin(phi), -Math.cos(phi)];
    return [ur * er[0] + uphi * ephi[0], ur * er[1] + uphi * ephi[1]];
  };
}
