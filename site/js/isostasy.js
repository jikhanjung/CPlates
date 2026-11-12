// Crustal thickness from surface height by Airy isostasy: a model value, used on the A–A′
// section page. Reference column: 35 km of crust with its top at sea level. A column
// standing higher has a deeper root; one under water has a shallower base.
//
//   above sea level:  T = 35 km + h · ρc / (ρm − ρc)
//   below sea level:  T = 35 km + h · (ρc − ρw) / (ρm − ρc)      (h negative)
//
// Continental crust is clamped to 20–70 km. Below −2000 m the column is read as 7 km
// oceanic crust, and between −1000 and −2000 m the two are blended, since Airy isostasy
// says nothing about where continental crust ends.

export const DENSITY = { crust: 2.8, mantle: 3.3, water: 1.03 };
export const REFERENCE_CRUST_KM = 35;
export const OCEANIC_CRUST_KM = 7;

export function airyCrustKm(heightM) {
  const z = heightM / 1000;
  const k = z >= 0 ? DENSITY.crust / (DENSITY.mantle - DENSITY.crust)
                   : (DENSITY.crust - DENSITY.water) / (DENSITY.mantle - DENSITY.crust);
  return Math.min(70, Math.max(20, REFERENCE_CRUST_KM + k * z));
}

export function continentalShare(heightM) {
  return Math.min(1, Math.max(0, (heightM + 2000) / 1000));
}

export function crustKm(heightM) {
  const f = continentalShare(heightM);
  return f * airyCrustKm(heightM) + (1 - f) * OCEANIC_CRUST_KM;
}
