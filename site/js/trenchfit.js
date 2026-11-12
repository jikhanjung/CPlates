// The trench comes from Merdith 2021, the relief from PaleoDEM (Scotese & Wright 2018, on
// the PALEOMAP plate model). The two reconstructions put the Transantarctic margin in
// different places, so in some rows Merdith's trench lies on PaleoDEM's shelf or land.
// These helpers measure that, and, when the viewer asks, place the trench on PaleoDEM's
// relief instead: at its slope foot. That placement is an interpretation, not either model.

// Shallower than this where the trench is: PaleoDEM has shelf or land there.
export const MISMATCH_M = -500;
// The slope foot: where a fitted trench goes.
export const SLOPE_FOOT_M = -2000;

// Height at a fractional column of one row (heights by column), linear between columns.
export function heightAt(heights, col) {
  const c0 = Math.max(0, Math.min(heights.length - 1, Math.floor(col)));
  const c1 = Math.min(heights.length - 1, c0 + 1);
  const f = Math.max(0, Math.min(1, col - c0));
  return heights[c0] * (1 - f) + heights[c1] * f;
}

// The crossing of `depth` nearest `col` (within `window` columns) whose shallow side is
// towards the overriding plate (`land`: +1 towards higher columns, −1 lower), as a
// fractional column; null if there is none.
export function slopeFoot(heights, col, land, { depth = SLOPE_FOOT_M, window = 40 } = {}) {
  let best = null;
  const lo = Math.max(0, Math.floor(col - window));
  const hi = Math.min(heights.length - 2, Math.ceil(col + window));
  for (let c = lo; c <= hi; c++) {
    const [shallow, deep] = land > 0 ? [heights[c + 1], heights[c]] : [heights[c], heights[c + 1]];
    if (!(shallow > depth && deep <= depth)) continue;
    const x = c + (depth - heights[c]) / (heights[c + 1] - heights[c]);
    if (best === null || Math.abs(x - col) < Math.abs(best - col)) best = x;
  }
  return best;
}

// Average each row's value with its neighbours within `radius` rows, skipping rows with
// none (null); a row with none of its own takes its neighbours' average, if any.
export function smoothRows(values, radius = 3) {
  return values.map((_, j) => {
    let sum = 0;
    let count = 0;
    for (let k = Math.max(0, j - radius); k <= Math.min(values.length - 1, j + radius); k++) {
      if (values[k] === null || values[k] === undefined) continue;
      sum += values[k];
      count++;
    }
    return count ? sum / count : null;
  });
}
