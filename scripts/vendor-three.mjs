// Copy the Three.js modules the site imports into site/vendor/three, so the page makes
// no CDN requests. After EarthThruTime3D scripts/vendor-three.mjs (be59c3a), with the
// fat-line modules added for plate boundaries wider than one pixel.
import { copyFile, mkdir } from 'node:fs/promises';
const target = new URL('../site/vendor/three/', import.meta.url);
await mkdir(new URL('lines/', target), { recursive: true });
for (const [source, name] of [
  ['build/three.module.js', 'three.module.js'],
  ['build/three.core.js', 'three.core.js'],
  ['examples/jsm/controls/OrbitControls.js', 'OrbitControls.js'],
  ['examples/jsm/lines/LineSegments2.js', 'lines/LineSegments2.js'],
  ['examples/jsm/lines/LineSegmentsGeometry.js', 'lines/LineSegmentsGeometry.js'],
  ['examples/jsm/lines/LineMaterial.js', 'lines/LineMaterial.js'],
  ['LICENSE', 'LICENSE'],
]) {
  await copyFile(new URL(`../node_modules/three/${source}`, import.meta.url), new URL(name, target));
}
