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

// The same globe through the whole Phanerozoic.
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (error) => failures.push(`phanerozoic pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') failures.push(`phanerozoic console: ${message.text()}`); });
  await page.goto(`${base}phanerozoic/?age=180`);
  await page.waitForFunction(() => window.cplates?.state.data, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const span = await page.evaluate(() => [window.cplates.state.oldest, window.cplates.state.youngest]);
  check(span[0] === 540 && span[1] === 0, `the Phanerozoic page should span 540–0 Ma: ${span}`);
  check((await page.locator('#period').innerText()).includes('쥐라기'), 'at 180 Ma the period should be the Jurassic');
  check(await page.locator('#to-section').isHidden(), 'outside 540–460 Ma there should be no link to the section');
  check((await page.locator('#periods b').allInnerTexts()).includes('백악기'), 'the timeline should name the periods');
  const bands = await page.locator('#periods b').allInnerTexts();
  check(bands.indexOf('캄브리아기') < bands.indexOf('백악기'), `the timeline runs old to young, left to right: ${bands}`);
  await page.screenshot({ path: 'test-results/phanerozoic-plates-180.png' });
  check((await page.locator('#observations li').count()) === 10, 'the Phanerozoic page lists the Cambrian and the later record');
  await page.evaluate(() => window.cplates.goTo(245));
  await page.waitForTimeout(300);
  const active = await page.locator('#observations li.active strong').allInnerTexts();
  check(active.some((x) => x.includes('프리모우층')), `at 245 Ma the Fremouw Formation should be active: ${active}`);
  await page.screenshot({ path: 'test-results/phanerozoic-plates-245.png' });
  await page.click('[data-mode="paleodem"]');
  await page.waitForFunction(() => window.cplates.state.data.grids.get(245), null, { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/phanerozoic-paleodem-245.png' });
  await page.click('[data-mode="plates"]');
  await page.evaluate(() => window.cplates.goTo(10));
  await page.click('#play');
  await page.waitForTimeout(1200);
  const age = await page.evaluate(() => window.cplates.state.age);
  check(age < 10, `Phanerozoic playback should move the age, at ${age}`);
  await page.close();
}

// The flat maps (Mollweide, equirectangular): they fit the free part, a click picks the
// place under it, and the projection is kept in the address and in the links between pages.
async function mapFits(page, label) {
  const { m, r } = await page.evaluate(() => ({ m: window.cplates.mapOnScreen(), r: window.cplates.visibleRect() }));
  const [left, top, right, bottom] = m;
  const w = r.right - r.left;
  const h = r.bottom - r.top;
  check(left >= r.left - 1 && right <= r.right + 1 && top >= r.top - 1 && bottom <= r.bottom + 1,
        `${label}: map ${m.map(Math.round)} should be inside the free area ${[r.left, r.top, r.right, r.bottom].map(Math.round)}`);
  check(Math.abs((left + right) / 2 - (r.left + r.right) / 2) < 0.03 * w && Math.abs((top + bottom) / 2 - (r.top + r.bottom) / 2) < 0.03 * h,
        `${label}: map should be centred in the free area`);
  check(right - left > 0.9 * w || bottom - top > 0.9 * h, `${label}: map should fill the free area one way`);
}
for (const [viewport, tag] of [[{ width: 1400, height: 900 }, 'desktop'], [{ width: 390, height: 844 }, 'phone']]) {
  const page = await open(viewport, '?age=200&proj=mollweide');
  check((await page.locator('[data-proj="mollweide"]').getAttribute('aria-checked')) === 'true', `${tag}: ?proj=mollweide should select Mollweide`);
  await mapFits(page, `main mollweide ${tag}`);
  await page.screenshot({ path: `test-results/map-mollweide-${tag}.png` });
  await page.close();
}
{
  const page = await open({ width: 1400, height: 900 }, '?age=200&proj=mollweide');
  const [x, y] = await page.evaluate(() => window.cplates.screenOfLonLat(20, -20));
  await page.mouse.click(x, y);
  await page.waitForTimeout(400);
  const pin = await page.evaluate(() => window.cplates.state.pin);
  check(pin?.where && Math.abs(pin.where[0] - 20) < 1 && Math.abs(pin.where[1] + 20) < 1,
        `a click on the Mollweide map at 20°E 20°S should pin that place, got ${JSON.stringify(pin?.where)}`);
  check((await page.locator('#info').innerText()).includes('판 ID'), 'the map pick should name a plate');
  await page.click('[data-proj="equirect"]');
  await page.waitForTimeout(500);
  await mapFits(page, 'main equirect');
  const url = await page.evaluate(() => location.search);
  check(url.includes('proj=equirect'), `URL should name the projection, got ${url}`);
  check((await page.locator('#to-cambrian').getAttribute('href')).includes('proj=equirect'), 'the Cambrian link should carry the projection');
  const moved = await page.evaluate(() => window.cplates.state.pin?.where);
  check(moved && Math.abs(moved[0] - pin.where[0]) < 1e-9, 'switching the projection should keep the pin');
  await page.screenshot({ path: 'test-results/map-equirect-200.png' });
  // Dragging moves the map, it does not turn anything.
  const before = await page.evaluate(() => window.cplates.mapCamera.position.toArray());
  await page.mouse.move(800, 400);
  await page.mouse.down();
  await page.mouse.move(900, 450, { steps: 6 });
  await page.mouse.up();
  const after = await page.evaluate(() => window.cplates.mapCamera.position.toArray());
  check(Math.abs(after[0] - before[0]) > 1e-3 && Math.abs(after[2] - before[2]) < 1e-9, 'dragging should move the map');
  await page.click('[data-proj="globe"]');
  await page.waitForTimeout(500);
  check(!(await page.evaluate(() => location.search)).includes('proj='), 'back on the globe, the URL should drop proj');
  await globeFits(page, 'main back to the globe');
  await page.close();
}
for (const [path, proj] of [['cambrian/?age=520', 'mollweide'], ['phanerozoic/?age=245', 'equirect']]) {
  const page = await openCambrian({ width: 1400, height: 900 }, `../${path}&proj=${proj}`);
  const tag = `${path.split('/')[0]} ${proj}`;
  const { x, r, lon0, focus } = await page.evaluate(() => {
    const c = window.cplates;
    return { x: c.screenOf(c.focusPoint())[0], r: c.visibleRect(), lon0: c.mapView.lon0, focus: c.focusPoint() };
  });
  check(Math.abs(lon0 - Math.round(focus[0])) < 1e-9, `${tag}: following should put Antarctica on the central meridian (${lon0} vs ${focus[0]})`);
  check(Math.abs(x - (r.left + r.right) / 2) < 0.03 * (r.right - r.left), `${tag}: Antarctica should be in the middle across`);
  const labels = await page.locator('#labels span:visible').count();
  check(labels >= 4, `${tag}: labels should show on the map, got ${labels}`);
  await page.screenshot({ path: `test-results/map-${path.split('/')[0]}-${proj}.png` });
  if (proj === 'mollweide') {
    await page.click('#play');
    await page.waitForTimeout(2000);
    const playing = await page.evaluate(() => {
      const c = window.cplates;
      return { age: c.state.age, lon0: c.mapView.lon0, focus: c.focusPoint() };
    });
    check(playing.age < 520, `${tag}: playback should move the age, at ${playing.age}`);
    check(Math.abs(((playing.lon0 - playing.focus[0] + 540) % 360) - 180) <= 1.5, `${tag}: the meridian should follow while playing`);
    await page.click('#play');
  }
  await page.click('[data-proj="globe"]');
  await page.waitForTimeout(1200);
  await followCentred(page, `${tag} back to the globe`);
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
  // In the software renderer (SwiftShader) a screenshot of the section page waits on frames that
  // each take about a second (the mantle-flow particles keep it drawing): 15–25 s, more on a
  // loaded machine. The default 30 s was too tight.
  page.setDefaultTimeout(90000);
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
  check(await page.waitForFunction(() => {
    const texts = [...document.querySelectorAll('#labels span.continent')].map((s) => s.textContent);
    return texts.includes('인도') && texts.includes('오스트레일리아');
  }, null, { timeout: 15000 }).then(() => true, () => false), 'India and Australia should be named on the block at 520 Ma');
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
    // The face moved in: the line is outside the box, and so are its marks.
    check(!(await page.evaluate(() => window.cplates.lineAA())), 'with the box moved off the line, A–A′ should not be drawn');
    await page.screenshot({ path: 'test-results/section-box-moved.png' });
    await page.click('#reset-box');
    await page.waitForTimeout(300);
    check(await page.evaluate(() => window.cplates.state.crop.j0 === window.cplates.state.data.meta.box.j0), 'reset should bring the face back to A–A′');
    // Out as well as in: drag the left face beyond A and the front face off the line outwards.
    // (From this view the right face is behind the box, so its handle is hidden.)
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
    check(await page.evaluate(() => !window.cplates.handles.right.visible && window.cplates.handles.front.visible),
          'from the front, the side handles should be hidden behind the box and the front one shown');
    // Turn to look from the A end: its handle comes out from behind the box.
    await page.evaluate(() => { const c = window.cplates; c.camera.position.set(-7.5, 2.5, 3.5); c.controls.target.set(-1, -0.3, -0.9); c.controls.update(); });
    // Which handles show is worked out each frame: wait for one (frames are slow in SwiftShader).
    check(await page.waitForFunction(() => window.cplates.handles.left.visible, null, { timeout: 15000 }).then(() => true, () => false),
          'from the A end, the left handle should show');
    await drag('left', -60, 0);
    await drag('front', 0, 80);
    const out = await page.evaluate(() => ({ ...window.cplates.state.crop }));
    check(out.i0 < home.i0, `dragging the left handle out should widen the box past A: i0 ${home.i0} → ${out.i0}`);
    check(out.j0 < home.j0, `dragging the front handle out should move the face off the line outwards: j0 ${home.j0} → ${out.j0}`);
    const asked = (new URL(page.url()).searchParams.get('box') || '').split(',').map(Number);
    check(asked[2] < 0 && asked[0] < 0, `the address should count from the A–A′ box: ${asked}`);
    check((await page.locator('#now').innerText()).includes('바깥쪽'), 'the panel should say the face is outside the line');
    // The box reaches beyond the line: the line, its ends and the locality show on its top.
    const shown = await page.waitForFunction(() => {
      const texts = [...document.querySelectorAll('#labels span')].filter((s) => s.style.display !== 'none').map((s) => s.textContent);
      return texts.includes('A') && texts.some((x) => x.includes('섀클턴')) ? texts : null;
    }, null, { timeout: 15000 }).then((h) => h.jsonValue(), () => null);
    check(shown && (await page.evaluate(() => window.cplates.lineAA())), 'with the face out beyond the line, A–A′, A and the locality should show on the top');
    await page.screenshot({ path: 'test-results/section-box-widened.png' });
    await page.click('#reset-box');
    await page.waitForTimeout(300);
  }
  // A scale bar beside the box: 10 km at 25×.
  check(await page.evaluate(() => window.cplates.state.ve !== 25 || window.cplates.state.scale?.km === 10), 'the scale bar should be 10 km at 25×');
  // Handles on faces turned away from the camera are hidden by the box.
  {
    const shown = await page.evaluate(() => Object.fromEntries(Object.entries(window.cplates.handles).map(([k, m]) => [k, m.visible])));
    check(shown.front && !shown.back, `from the front, the back handle should be hidden: ${JSON.stringify(shown)}`);
  }
  // The lower and upper Byrd Group from SCAR GeoMAP outcrops, cell by cell, laid down in turn.
  {
    await page.evaluate(() => window.cplates.goTo(530));
    await page.click('#show-outcrops');
    await page.waitForTimeout(400);
    check(new URL(page.url()).searchParams.get('outcrops') === '1', 'the address should remember the Byrd Group layer');
    check(!(await page.locator('#outcrop-note').isHidden()), 'the Byrd Group note should say what the cells are');
    const legend = await page.locator('#legend').innerText();
    check(legend.includes('하부 버드층군') && legend.includes('상부 버드층군'), `the legend should name lower and upper: ${legend}`);
    const byrd = await page.evaluate(() => window.cplates.byrd());
    check(byrd.visible && byrd.cells > 20, `the Byrd Group cells should be drawn: ${JSON.stringify(byrd)}`);
    const label = () => page.evaluate(() => [...document.querySelectorAll('#labels span.outcrop')].map((s) => s.textContent).join(' | '));
    // Labels follow on the next frames: wait for them rather than a fixed time.
    const labelHas = (text) => page.waitForFunction((x) => [...document.querySelectorAll('#labels span.outcrop')].some((s) => s.textContent.includes(x)), text, { timeout: 15000 }).catch(() => null);
    await labelHas('아직 쌓이기 전');
    check(byrd.state === 'none' && (await label()).includes('아직 쌓이기 전'), `530 Ma: nothing laid down yet: ${byrd.state}, ${await label()}`);
    await page.evaluate(() => window.cplates.goTo(518));
    await labelHas('하부 1.1 km');
    check((await page.evaluate(() => window.cplates.byrd().state)) === 'lower' && /하부 [\d.]+ km/.test(await label()) && !(await label()).includes('상부'),
          `518 Ma: the lower Byrd Group only: ${await label()}`);
    await page.evaluate(() => window.cplates.goTo(500));
    await labelHas('상부');
    check((await page.evaluate(() => window.cplates.byrd().state)) === 'upper' && (await label()).includes('하부 2.0 km + 상부'),
          `500 Ma: the upper on top of the whole lower: ${await label()}`);
    // The lower is the Shackleton Limestone: one thickness for both menus.
    await page.selectOption('#byrd-lower-km', '5.4');
    await page.selectOption('#byrd-upper-km', '3');
    await labelHas('하부 5.4 km');
    const params = new URL(page.url()).searchParams;
    check(params.get('limestone') === '5.4' && params.get('upper') === '3' && (await page.inputValue('#limestone-km')) === '5.4',
          `the thickness menus should be kept in the address and in step: ${params}`);
    check((await label()).includes('하부 5.4 km'), `the label should follow the thickness: ${await label()}`);
    await page.screenshot({ path: 'test-results/section-byrd-500.png' });
    await page.selectOption('#byrd-lower-km', '2');
    await page.selectOption('#byrd-upper-km', '2');
    await page.click('#show-outcrops');
    await page.waitForTimeout(200);
    check(!(await page.evaluate(() => window.cplates.byrd().visible)), 'unticked, the Byrd Group cells should go');
  }
  // Rock by age from SCAR GeoMAP, cell by cell: formed filled, forming hatched, still to come outlined.
  {
    await page.evaluate(() => window.cplates.goTo(520));
    await page.click('#show-geology');
    await page.waitForFunction(() => window.cplates.geology().visible, null, { timeout: 20000 });
    await page.waitForTimeout(400);
    check(new URL(page.url()).searchParams.get('geology') === '1', 'the address should remember the rock layer');
    check(!(await page.locator('#geology-note').isHidden()), 'the rock layer note should say what it shows');
    // Its legend is a panel on the right, with a checkbox per class.
    check(await page.locator('#rock-legend').isVisible(), 'the rock legend should show on the right');
    const box = await page.locator('#rock-legend').boundingBox();
    check(box && box.x > 900, `the rock legend should be on the right: ${JSON.stringify(box)}`);
    const legend = await page.locator('#rock-classes').innerText();
    check(legend.includes('비컨 누층군') && legend.includes('로스 조산대 화강암류'), `the legend should list the rock classes: ${legend}`);
    const at520 = await page.evaluate(() => window.cplates.geology());
    check(at520.counts.formed > 0 && at520.counts.forming > 0 && at520.counts.later > 0 && at520.outlined > 0,
          `at 520 Ma some rock formed (filled), some forming (hatched), some still to come (outlined): ${JSON.stringify(at520)}`);
    // Per cell, from GeoMAP's unit ages: the Cambrian units (541–485 Ma) have formed by 480 Ma.
    await page.evaluate(() => window.cplates.goTo(480));
    await page.waitForTimeout(300);
    const at480 = await page.evaluate(() => window.cplates.geology());
    check(at480.counts.formed > at520.counts.formed + 50, `more rock formed at 480 than at 520 Ma: ${at520.counts.formed} → ${at480.counts.formed}`);
    await page.evaluate(() => window.cplates.goTo(520));
    // Only the ticked classes are shown.
    await page.click('#rock-classes input[data-rock="granite"]');
    await page.waitForTimeout(300);
    check(new URL(page.url()).searchParams.get('rocks')?.split(',').includes('granite') === false,
          `unticking a class should leave it out of the address: ${new URL(page.url()).searchParams.get('rocks')}`);
    const without = await page.evaluate(() => window.cplates.geology());
    check(without.counts.formed + without.counts.forming + without.counts.later < at520.counts.formed + at520.counts.forming + at520.counts.later,
          'unticking the granites should hide their cells');
    await page.click('#rock-none');
    await page.waitForTimeout(300);
    const none = await page.evaluate(() => window.cplates.geology());
    check(none.counts.formed + none.counts.forming + none.counts.later === 0 && none.outlined === 0, 'None should hide every class');
    await page.click('#rock-all');
    await page.waitForTimeout(300);
    check(new URL(page.url()).searchParams.get('rocks') === null, 'All should clear the address');
    await page.screenshot({ path: 'test-results/section-geology-520.png' });
    await page.evaluate(() => window.cplates.closeUp());
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test-results/section-geology-closeup.png' });
    await page.click('#whole');
    await page.waitForTimeout(800);
    await page.click('#show-geology');
    await page.waitForTimeout(200);
    check(!(await page.evaluate(() => window.cplates.geology().visible)), 'unticked, the rock layer should go');
    check(await page.locator('#rock-legend').isHidden(), 'unticked, the rock legend should go too');
  }
  // Merdith's trench and PaleoDEM disagree: marked; and, on request, the trench fitted to PaleoDEM.
  {
    await page.evaluate(() => window.cplates.goTo(520));
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => ({ share: window.cplates.state.sites.share, s: window.cplates.state.trench.s_km }));
    check(before.share > 0.2 && before.share < 0.6, `520 Ma: part of Merdith's trench lies on PaleoDEM shelf, share ${before.share}`);
    check((await page.locator('#legend').innerText()).includes('어긋남'), 'the legend should name the disagreement');
    check(!(await page.locator('#fit-note').isHidden()), 'a note should explain the disagreement');
    await page.click('#fit-trench');
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ fitted: Boolean(window.cplates.state.trench.fitted), s: window.cplates.state.trench.s_km }));
    check(after.fitted && Math.abs(after.s - before.s) > 20, `fitting should move the trench: ${before.s} → ${after.s}`);
    check(new URL(page.url()).searchParams.get('trench') === 'paleodem', 'the address should remember the fitted trench');
    check((await page.locator('#now').innerText()).includes('해석'), 'the fitted position should be marked as interpretation');
    await page.screenshot({ path: 'test-results/section-trench-fitted.png' });
    await page.click('#fit-trench');
    await page.waitForTimeout(300);
    check(new URL(page.url()).searchParams.get('trench') === null, 'turning it off should clear the address');
  }
  await page.click('#show-limestone');
  await page.waitForTimeout(400);
  check(new URL(page.url()).searchParams.get('shackleton') === '1', 'the address should remember the limestone toggle');
  check(await page.evaluate(() => { const n = document.querySelector('#limestone-note'); const box = document.querySelector('#show-limestone').closest('.tools');
    return !n.hidden && n.previousElementSibling === box; }), 'the limestone note should show right under its checkbox');
  check(await page.waitForFunction(() => [...document.querySelectorAll('#labels span')].some((s) => s.textContent.includes('지금 두께')), null, { timeout: 15000 }).then(() => true, () => false),
        'the limestone should be named over its area with its thickness so far');
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
