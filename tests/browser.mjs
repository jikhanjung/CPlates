// Open the site in a headless browser, check it draws without errors, and save
// screenshots to test-results/. Needs the site served (make serve) and frames built.
//
//   node tests/browser.mjs [base-url]
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:8350/';
await mkdir('test-results', { recursive: true });
// CPLATES_RESOLVE="cplates.nopeoplestime.info 34.64.158.160" tests a server before its DNS exists.
const resolve = process.env.CPLATES_RESOLVE ? [`--host-resolver-rules=MAP ${process.env.CPLATES_RESOLVE}`] : [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...resolve] });
const failures = [];

async function open(viewport, query) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') failures.push(`console: ${message.text()}`); });
  await page.goto(`${base}${query}`);
  await page.waitForFunction(() => window.cplates?.state.shown !== null && window.cplates?.state.shown !== undefined,
                             null, { timeout: 30000 });
  await page.waitForTimeout(800);
  return page;
}

function check(condition, message) { if (!condition) failures.push(message); }

// Present day, Korean, a click on the Pacific near Hawaii.
{
  const page = await open({ width: 1400, height: 900 }, '?age=0');
  await page.evaluate(() => {
    const { camera, controls } = window.cplates;
    camera.position.set(-2.5, 1.3, 2.8);
    controls.update();
    window.cplates.pick([-155, 19.5]);
  });
  await page.waitForTimeout(500);
  const info = await page.locator('#info').innerText();
  check(info.includes('태평양판'), `present-day pick should name the Pacific plate, got: ${info}`);
  check(/\d+\.\d cm\/년/.test(info), `pick should give a speed, got: ${info}`);
  await page.screenshot({ path: 'test-results/present-ko.png' });
  await page.close();
}

// 200 Ma in English: Pangaea breaking up.
{
  const page = await open({ width: 1400, height: 900 }, '?age=200&lang=en');
  await page.evaluate(() => {
    const { camera, controls } = window.cplates;
    camera.position.set(1.9, 1.5, 3.0);
    controls.update();
  });
  await page.waitForTimeout(500);
  const age = await page.locator('#age').innerText();
  check(age.includes('200 Ma'), `age readout should say 200 Ma, got: ${age}`);
  check((await page.locator('#period').innerText()).includes('Jurassic'), 'period should be Jurassic at 200 Ma');
  await page.screenshot({ path: 'test-results/200ma-en.png' });
  await page.close();
}

// Playback moves the age, and the globe can still be turned while it plays.
{
  const page = await open({ width: 1400, height: 900 }, '?age=0');
  await page.click('#play');
  await page.waitForTimeout(1500);
  const playing = await page.evaluate(() => window.cplates.state.age);
  check(playing < 540 && playing > 0, `playback should have started from 540 Ma and moved, at ${playing}`);
  const before = await page.evaluate(() => window.cplates.camera.position.toArray());
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await page.mouse.move(850, 500, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.cplates.camera.position.toArray());
  check(before.some((value, index) => Math.abs(value - after[index]) > 1e-3), 'dragging during playback should turn the view');
  await page.click('#play');
  await page.close();
}

// The globe sits in the middle of the part of the screen the panels leave free, and fits
// inside it, on a wide screen and on a phone, at load and after the panel's text changes.
async function globeFits(page, label) {
  const { g, r } = await page.evaluate(() => ({ g: window.cplates.globeOnScreen(), r: window.cplates.visibleRect() }));
  const cx = (r.left + r.right) / 2;
  const cy = (r.top + r.bottom) / 2;
  const w = r.right - r.left;
  const h = r.bottom - r.top;
  check(Math.abs(g.centre[0] - cx) < 0.03 * w && Math.abs(g.centre[1] - cy) < 0.03 * h,
        `${label}: globe centre (${g.centre.map((v) => v.toFixed(0))}) vs free-area centre (${cx.toFixed(0)}, ${cy.toFixed(0)})`);
  check(g.radius <= Math.min(w, h) / 2 + 1 && g.radius > 0.35 * Math.min(w, h),
        `${label}: globe radius ${g.radius.toFixed(0)} px should fit the free area ${w.toFixed(0)}×${h.toFixed(0)}`);
}
for (const [viewport, tag] of [[{ width: 1400, height: 900 }, 'desktop'], [{ width: 390, height: 844 }, 'phone'],
                               [{ width: 1024, height: 700 }, 'laptop']]) {
  const page = await open(viewport, '?age=300');
  await globeFits(page, `main ${tag}`);
  await page.evaluate(() => window.cplates.pick([20, -20]));
  await page.waitForTimeout(400);
  await globeFits(page, `main ${tag} after a pick`);
  await page.screenshot({ path: `test-results/main-fit-${tag}.png` });
  await page.close();
}

// The Phanerozoic, and the switch between reference frames.
{
  const page = await open({ width: 1400, height: 900 }, '?age=500');
  check((await page.locator('#period').innerText()).includes('캄브리아기'), '500 Ma should be Cambrian');
  const link = page.locator('#to-cambrian');
  check((await link.getAttribute('href')) === 'cambrian/?age=500', 'Cambrian link should carry the age');
  check((await page.locator('[data-frame="merdith2021"]').getAttribute('aria-checked')) === 'true', 'Merdith 2021 is the default');
  await page.evaluate(() => { window.cplates.camera.position.set(1.5, -2.0, 2.8); window.cplates.controls.update(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.cplates.pick([20, -20]));
  const before = await page.evaluate(() => ({ cam: window.cplates.camera.position.toArray(), pin: window.cplates.state.pin }));
  await page.screenshot({ path: 'test-results/frame-merdith-500.png' });
  await page.click('[data-frame="muller2022"]');
  await page.waitForFunction(() => window.cplates.state.shownModel === 'muller2022', null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ cam: window.cplates.camera.position.toArray(), pin: window.cplates.state.pin,
                                             age: window.cplates.state.age, url: location.search }));
  check(after.age === 500, `switching frames should keep the age, got ${after.age}`);
  check(before.cam.every((v, i) => Math.abs(v - after.cam[i]) < 1e-6), 'switching frames should keep the camera');
  check(after.url.includes('frame=muller2022'), `URL should name the frame, got ${after.url}`);
  check((await page.locator('#frame-note').innerText()).includes('맨틀'), 'the frame note should say mantle frame');
  check(after.pin?.plate === before.pin?.plate && after.pin?.where && before.pin?.where &&
        (Math.abs(after.pin.where[0] - before.pin.where[0]) + Math.abs(after.pin.where[1] - before.pin.where[1]) > 0.5),
        'the picked point should stay on its plate and move with the frame');
  await page.screenshot({ path: 'test-results/frame-muller-500.png' });
  await page.close();
}
{
  const page = await open({ width: 1400, height: 900 }, '?frame=muller2022&age=100');
  check((await page.locator('[data-frame="muller2022"]').getAttribute('aria-checked')) === 'true', '?frame=muller2022 should select Müller 2022');
  check((await page.evaluate(() => window.cplates.state.shownModel)) === 'muller2022', '?frame=muller2022 should draw Müller frames');
  await page.close();
}
// What a first visit downloads.
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  let bytes = 0;
  let firstFrameBytes = null;
  const files = new Set();
  page.on('response', async (response) => {
    try { const body = await response.body(); bytes += body.length; files.add(response.url()); } catch { /* redirects */ }
  });
  const started = Date.now();
  await page.goto(base);
  await page.waitForFunction(() => window.cplates?.state.shown === 0, null, { timeout: 30000 });
  const firstMs = Date.now() - started;
  firstFrameBytes = bytes;
  await page.waitForTimeout(4000);
  console.log(`first visit: first frame after ${firstMs} ms and ${(firstFrameBytes / 1e6).toFixed(2)} MB (uncompressed); ` +
              `${(bytes / 1e6).toFixed(2)} MB in ${files.size} files after 4 s idle`);
  check(bytes < 8e6, `a first visit should stay under 8 MB, got ${(bytes / 1e6).toFixed(1)} MB`);
  await page.close();
}

// Phone width.
{
  const page = await open({ width: 390, height: 844 }, '?age=100');
  await page.screenshot({ path: 'test-results/phone-100ma.png' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, 'no horizontal scroll at phone width');
  await page.close();
}

// The Cambrian Antarctica page.
async function openCambrian(viewport, query) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (error) => failures.push(`cambrian pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') failures.push(`cambrian console: ${message.text()}`); });
  await page.goto(`${base}cambrian/${query}`);
  await page.waitForFunction(() => window.cplates?.state.data, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  return page;
}
{
  const page = await openCambrian({ width: 1400, height: 900 }, '?age=520');
  check((await page.locator('#period').innerText()).includes('캄브리아기'), 'Cambrian page should name the period');
  check((await page.locator('#observations li').count()) === 3, 'three observations listed');
  await page.screenshot({ path: 'test-results/cambrian-plates-520.png' });
  await page.click('[data-mode="paleodem"]');
  await page.waitForTimeout(800);
  check((await page.locator('#mode-note').innerText()).includes('PALEOMAP'), 'PaleoDEM view should say its positions follow PALEOMAP');
  await page.screenshot({ path: 'test-results/cambrian-paleodem-520.png' });
  await page.click('[data-mode="plates"]');
  // Play, then turn the view while it plays.
  await page.evaluate(() => window.cplates.goTo(540));
  await page.click('#play');
  await page.waitForTimeout(1500);
  const age = await page.evaluate(() => window.cplates.state.age);
  check(age < 540 && age > 485, `Cambrian playback should move the age, at ${age}`);
  const before = await page.evaluate(() => window.cplates.camera.position.toArray());
  await page.mouse.move(900, 450);
  await page.mouse.down();
  await page.mouse.move(1050, 380, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.cplates.camera.position.toArray());
  const still = await page.evaluate(() => window.cplates.state.playing);
  check(still, 'dragging should not stop playback');
  check(before.some((v, i) => Math.abs(v - after[i]) > 1e-3), 'dragging during Cambrian playback should turn the view');
  check(!(await page.evaluate(() => window.cplates.state.follow)), 'dragging should switch off following');
  await page.close();
}
{
  const page = await openCambrian({ width: 390, height: 844 }, '?age=510&lang=en');
  await page.screenshot({ path: 'test-results/cambrian-phone.png' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, 'Cambrian page: no horizontal scroll at phone width');
  await page.close();
}

// "Follow Antarctica" keeps Antarctica and the Transantarctic Mountains band in the
// middle of the part of the screen the panels leave free, in both views, at any age,
// on a wide screen and on a phone.
async function followCentred(page, label) {
  const result = await page.evaluate(() => {
    const c = window.cplates;
    const [x, y] = c.screenOf(c.focusPoint());
    const r = c.visibleRect();
    return { x, y, r };
  });
  const { x, y, r } = result;
  const cx = (r.left + r.right) / 2;
  const cy = (r.top + r.bottom) / 2;
  const w = r.right - r.left;
  const h = r.bottom - r.top;
  check(Math.abs(x - cx) < 0.12 * w && Math.abs(y - cy) < 0.12 * h,
        `${label}: follow point at (${x.toFixed(0)}, ${y.toFixed(0)}), free area centre (${cx.toFixed(0)}, ${cy.toFixed(0)}) of ${w.toFixed(0)}×${h.toFixed(0)}`);
}
for (const [viewport, tag] of [[{ width: 1400, height: 900 }, 'desktop'], [{ width: 390, height: 844 }, 'phone']]) {
  const page = await openCambrian(viewport, '?age=540');
  for (const mode of ['plates', 'paleodem']) {
    await page.click(`[data-mode="${mode}"]`);
    for (const age of [540, 515, 485]) {
      await page.evaluate((a) => window.cplates.goTo(a), age);
      await page.waitForTimeout(1200);
      await followCentred(page, `${tag} ${mode} ${age} Ma`);
      await page.screenshot({ path: `test-results/follow-${tag}-${mode}-${age}.png` });
    }
  }
  // While playing, the camera keeps up.
  await page.click('[data-mode="plates"]');
  await page.evaluate(() => window.cplates.goTo(540));
  await page.waitForTimeout(800);
  await page.click('#play');
  await page.waitForTimeout(2500);
  await followCentred(page, `${tag} playing`);
  await page.click('#play');
  await page.close();
}

// The A–A′ section page.
async function openSection(viewport, query) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (error) => failures.push(`section pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') failures.push(`section console: ${message.text()}`); });
  await page.goto(`${base}section/${query}`);
  await page.waitForFunction(() => window.cplates?.state.data, null, { timeout: 60000 });
  await page.waitForTimeout(2000);
  return page;
}
{
  const page = await openSection({ width: 1400, height: 900 }, '?age=520&ve=5');
  const s = await page.evaluate(() => ({ trench: window.cplates.state.trench, flow: window.cplates.flowCount() }));
  check(s.trench && s.trench.over_side === -1, `520 Ma: a trench on the line with the slab under East Antarctica, got ${JSON.stringify(s.trench)}`);
  check(s.flow > 100, `520 Ma at 5×: mantle-flow particles should be moving, got ${s.flow}`);
  check((await page.locator('#now').innerText()).includes('섀클턴 석회암'), '520 Ma: the Shackleton Limestone is being laid down');
  check(await page.evaluate(() => window.cplates.globeShown() === 520), 'the small globe should show the 520 Ma frame');
  // The small globe: drag inside turns it, the top-left corner resizes it.
  {
    const box = await page.locator('#inset').boundingBox();
    const before = await page.evaluate(() => window.cplates.globeCamera.position.toArray());
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20, { steps: 6 });
    await page.mouse.up();
    const after = await page.evaluate(() => window.cplates.globeCamera.position.toArray());
    check(before.some((v, i) => Math.abs(v - after[i]) > 0.05), 'dragging in the small globe should turn it');
    // Dragging down should pull the near surface down, so the camera rises; right, so the
    // camera swings left (the surface follows the pointer).
    const y0 = after[1];
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 6 });
    await page.mouse.up();
    const down = await page.evaluate(() => window.cplates.globeCamera.position.toArray());
    check(down[1] > y0 + 0.05, `dragging down should raise the globe camera: ${y0} → ${down[1]}`);
    await page.mouse.move(box.x + 4, box.y + 4);
    await page.mouse.down();
    await page.mouse.move(box.x - 60, box.y - 60, { steps: 6 });
    await page.mouse.up();
    const grown = await page.locator('#inset').boundingBox();
    check(grown.width > box.width + 30, `dragging the corner should grow the globe: ${box.width} → ${grown.width}`);
    await page.locator('#inset').dblclick();
  }
  // The limestone: off by default, then on, with its thickness growing over 525–512 Ma.
  // The box: drag the front handle inwards, and the section face moves with it.
  {
    const at = await page.evaluate(() => {
      const c = window.cplates; const v = c.handles.front.position.clone().project(c.camera);
      return [((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight];
    });
    const cam = await page.evaluate(() => window.cplates.camera.position.toArray());
    await page.mouse.move(at[0], at[1]);
    await page.mouse.down();
    await page.mouse.move(at[0], at[1] - 100, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ crop: { ...window.cplates.state.crop }, cam: window.cplates.camera.position.toArray() }));
    const home = await page.evaluate(() => ({ ...window.cplates.state.data.meta.box }));
    check(home && home.j0 > 0 && home.i0 > 0, `the data grid should reach beyond the A–A′ box: ${JSON.stringify(home)}`);
    check(after.crop.j0 > home.j0, `dragging the front handle should move the face in, j0 = ${after.crop.j0}`);
    check(cam.every((v, i) => Math.abs(v - after.cam[i]) < 1e-6), 'dragging a handle should not turn the view');
    check((new URL(page.url()).searchParams.get('box') || '').split(',').length === 4, 'the address should remember the box');
    check((await page.locator('#now').innerText()).includes('A–A′에서'), 'the panel should say where the face is');
    await page.screenshot({ path: 'test-results/section-box-moved.png' });
    await page.click('#reset-box');
    await page.waitForTimeout(300);
    check(await page.evaluate(() => window.cplates.state.crop.j0 === window.cplates.state.data.meta.box.j0), 'reset should bring the face back to A–A′');
    // Out as well as in: drag the right face beyond A′ and the front face off the line outwards.
    const drag = async (side, dx, dy) => {
      const p = await page.evaluate((s) => {
        const c = window.cplates; const v = c.handles[s].position.clone().project(c.camera);
        return [((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight];
      }, side);
      await page.mouse.move(p[0], p[1]);
      await page.mouse.down();
      await page.mouse.move(p[0] + dx, p[1] + dy, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(400);
    };
    await drag('right', 120, 0);
    await drag('front', 0, 80);
    const out = await page.evaluate(() => ({ ...window.cplates.state.crop }));
    check(out.i1 > home.i1, `dragging the right handle out should widen the box past A′: i1 ${home.i1} → ${out.i1}`);
    check(out.j0 < home.j0, `dragging the front handle out should move the face off the line outwards: j0 ${home.j0} → ${out.j0}`);
    const asked = (new URL(page.url()).searchParams.get('box') || '').split(',').map(Number);
    check(asked[2] < 0 && asked[1] > home.i1 - home.i0, `the address should count from the A–A′ box: ${asked}`);
    check((await page.locator('#now').innerText()).includes('바깥쪽'), 'the panel should say the face is outside the line');
    await page.screenshot({ path: 'test-results/section-box-widened.png' });
    await page.click('#reset-box');
    await page.waitForTimeout(300);
  }
  await page.click('#show-limestone');
  await page.waitForTimeout(400);
  check(new URL(page.url()).searchParams.get('shackleton') === '1', 'the address should remember the limestone toggle');
  const grown520 = await page.evaluate(() => window.cplates.state.limestone.grown);
  check(grown520 > 0.3 && grown520 < 0.5, `520 Ma: about 5/13 of the limestone laid down, got ${grown520}`);
  await page.selectOption('#limestone-km', '5.4');
  await page.evaluate(() => window.cplates.closeUp());
  await page.waitForTimeout(1600);
  await page.screenshot({ path: 'test-results/section-limestone-closeup.png' });
  await page.click('#whole');
  await page.waitForTimeout(1500);
  await page.click('#show-limestone');
  await page.screenshot({ path: 'test-results/section-520-5x.png' });
  await page.click('[data-ve="25"]');
  await page.waitForTimeout(500);
  check((await page.locator('#ve-note').innerText()).includes('56 km'), '25× should show 56 km of depth');
  check(new URL(page.url()).searchParams.get('ve') === '25', 'the address should carry the exaggeration');
  await page.evaluate(() => window.cplates.goTo(500));
  await page.waitForTimeout(500);
  check((await page.locator('#now').innerText()).includes('더글러스'), '500 Ma: the Douglas Conglomerate');
  await page.screenshot({ path: 'test-results/section-500-25x.png' });
  // Play, and turn the block while it plays.
  await page.click('[data-ve="2"]');
  await page.click('#play');
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => window.cplates.camera.position.toArray());
  await page.mouse.move(900, 450);
  await page.mouse.down();
  await page.mouse.move(1000, 400, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ cam: window.cplates.camera.position.toArray(), age: window.cplates.state.age,
                                             playing: window.cplates.state.playing }));
  check(after.playing && after.age < 500, `section playback should run, at ${after.age}`);
  check(before.some((v, i) => Math.abs(v - after.cam[i]) > 1e-3), 'dragging during section playback should turn the block');
  await page.click('#play');
  await page.close();
}
{
  const page = await openSection({ width: 390, height: 844 }, '?age=505&ve=25&lang=en');
  await page.screenshot({ path: 'test-results/section-phone.png' });
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'section page: no horizontal scroll on a phone');
  await page.close();
}
{
  const page = await openCambrian({ width: 1400, height: 900 }, '?age=520');
  check((await page.locator('#to-section').getAttribute('href')) === '../section/?age=520', 'the Cambrian page should link to the section at its age');
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('browser checks passed; screenshots in test-results/');
