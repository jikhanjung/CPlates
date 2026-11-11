// Open the site in a headless browser, check it draws without errors, and save
// screenshots to test-results/. Needs the site served (make serve) and frames built.
//
//   node tests/browser.mjs [base-url]
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = process.argv[2] ?? 'http://127.0.0.1:8350/';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
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
  check(playing < 250 && playing > 0, `playback should have started from 250 Ma and moved, at ${playing}`);
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

// Phone width.
{
  const page = await open({ width: 390, height: 844 }, '?age=100');
  await page.screenshot({ path: 'test-results/phone-100ma.png' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, 'no horizontal scroll at phone width');
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('browser checks passed; screenshots in test-results/');
