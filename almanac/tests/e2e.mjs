// End-to-end workflow test: boots a fresh server on a throwaway data directory
// and drives the real UI in Chromium. Run with: npm run build && node tests/e2e.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const PORT = 4455;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'almanac-e2e-'));
const SHOTS = process.env.SHOTS;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let server;

function startServer() {
  server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: root,
    env: { ...process.env, ALMANAC_DATA_DIR: DATA, ALMANAC_PORT: String(PORT), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(d));
  return waitFor(async () => (await fetch(`${BASE}/api/auth`)).ok);
}
function stopServer() {
  return new Promise((res) => {
    server.once('exit', res);
    server.kill('SIGTERM');
  });
}
async function waitFor(fn, ms = 15000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try {
      if (await fn()) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('timeout');
}

const results = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`  ✗ ${name}\n      ${e.message.split('\n').slice(0, 6).join('\n      ')}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fail-${name.replace(/\W+/g, '_')}.png`, fullPage: true }).catch(() => {});
  }
}

const api = (p) => fetch(BASE + '/api' + p, { headers: { 'x-local-date': today() } }).then((r) => r.json());
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const TODAY = today();
const MONTH = TODAY.slice(0, 7);
const prevMonth = (() => {
  const [y, m] = MONTH.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
})();

console.log(`Almanac e2e — data in ${DATA}`);
await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

// A real image to use as progress photos.
const photoPage = await ctx.newPage();
await photoPage.setContent('<div style="width:300px;height:400px;background:linear-gradient(#ccc,#888)"></div>');
const PHOTO = path.join(DATA, 'test-photo.png');
fs.writeFileSync(PHOTO, await photoPage.screenshot({ clip: { x: 0, y: 0, width: 300, height: 400 } }));
await photoPage.close();

const toast = (text) => page.locator('.toast', { hasText: text }).first().waitFor({ timeout: 5000 });

await step('Onboarding: start fresh with real data', async () => {
  await page.goto(BASE);
  await page.getByLabel('What should Almanac call you?').fill('Ryan');
  await page.getByRole('button', { name: /Start fresh/ }).click();
  await page.locator('.greeting h1').waitFor();
  assert.match(await page.locator('.greeting h1').innerText(), /Ryan/);
  const b = await api('/bootstrap');
  assert.equal(b.mode, 'real');
});

await step('Create work session (quick add) and calculate earnings', async () => {
  await page.keyboard.press('n');
  await page.getByRole('button', { name: /Work session/ }).click();
  await page.getByLabel('What did you work on?').fill('Homepage for the HVAC website');
  await page.locator('#ws-proj').fill('HVAC website');
  await page.locator('#ws-cat').fill('Design');
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: 'Duration' }).click();
  await page.locator('#ws-h').fill('4');
  await page.locator('#ws-m').fill('0');
  await page.getByLabel('Hourly rate').fill('30');
  const strip = await page.locator('.summary-strip').innerText();
  assert.match(strip, /4h 00m/);
  assert.match(strip, /\$120/);
  await page.getByRole('button', { name: 'Log session' }).click();
  await toast('Logged 4h 00m');
  const d = await api('/dashboard');
  assert.equal(d.today.minutes, 240);
  assert.equal(d.today.earnedCents, 12000);
  assert.equal(d.week.totals.earnedCents >= 12000, true);
  assert.equal(d.month.totals.earnedCents >= 12000, true);
  const cal = await api(`/calendar/${MONTH}`);
  assert.equal(cal.days.find((x) => x.date === TODAY).earnedCents, 12000);
});

await step('Start and stop the live timer', async () => {
  await page.goto(BASE + '/');
  await page.locator('.sidebar .start-work').click();
  await page.locator('.sidebar .timer-card').waitFor();
  await page.waitForTimeout(1500);
  assert.match(await page.locator('.sidebar .timer-time').innerText(), /0:00:0[1-9]/);
  await page.locator('.sidebar .timer-card').getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('textbox', { name: 'What did you work on?' }).fill('Timer session');
  await page.getByRole('button', { name: /^Log / }).click();
  await toast('Logged');
  const t = await api('/timer');
  assert.equal(t, null);
  const s = await api(`/work/sessions?from=${TODAY}&to=${TODAY}`);
  assert.ok(s.sessions.some((x) => x.description === 'Timer session'));
});

await step('Edit a work session', async () => {
  await page.goto(BASE + '/work');
  await page.locator('.session-row', { hasText: 'Homepage for the HVAC website' }).click();
  await page.locator('#ws-h').fill('5');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await toast('Session updated');
  const s = await api(`/work/sessions?from=${TODAY}&to=${TODAY}`);
  const x = s.sessions.find((y) => y.description === 'Homepage for the HVAC website');
  assert.equal(x.minutes, 300);
  assert.equal(x.earnedCents, 15000);
});

await step('Delete and undo a work session', async () => {
  await page.locator('.session-row', { hasText: 'Timer session' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await toast('Work session deleted');
  let s = await api(`/work/sessions?from=${TODAY}&to=${TODAY}`);
  assert.ok(!s.sessions.some((x) => x.description === 'Timer session'));
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
  await toast('restored');
  s = await api(`/work/sessions?from=${TODAY}&to=${TODAY}`);
  assert.ok(s.sessions.some((x) => x.description === 'Timer session'));
});

await step('Create a project', async () => {
  await page.goto(BASE + '/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.locator('#p-name').fill('Magnolia Bakery site');
  await page.locator('#p-client').fill('Magnolia Bakery');
  await page.locator('#p-rate').fill('40');
  await page.getByRole('button', { name: 'Create project' }).click();
  await toast('Project created');
  const ps = await api('/projects');
  assert.ok(ps.some((p) => p.name === 'Magnolia Bakery site' && p.hourlyRateCents === 4000));
  await page.locator('.project-card', { hasText: 'HVAC website' }).click();
  await page.locator('h1', { hasText: 'HVAC website' }).waitFor();
});

async function logWorkout(name, sets) {
  await page.goto(BASE + '/gym/new');
  await page.getByPlaceholder('Workout name — e.g. Push Day').fill(name);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForURL(/\/gym\/workouts\/\d+/);
  await page.getByRole('button', { name: 'Add exercise' }).click();
  await page.getByPlaceholder('Exercise — e.g. Bench Press').fill('Bench Press');
  await page.keyboard.press('Enter');
  for (let i = 0; i < sets.length; i++) {
    if (i > 0) await page.getByRole('button', { name: 'Add set' }).click();
    await page.getByLabel(`Set ${i + 1} weight`).fill(String(sets[i][0]));
    await page.getByLabel(`Set ${i + 1} reps`).fill(String(sets[i][1]));
  }
  await page.locator('.save-status', { hasText: 'Saved' }).waitFor({ timeout: 8000 });
}

await step('Log a workout with exercise sets', async () => {
  await logWorkout('Push Day', [[135, 10], [155, 8]]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.waitForURL(/\/gym$/);
  const w = await api(`/workouts?from=${TODAY}&to=${TODAY}`);
  assert.equal(w.length, 1);
  assert.equal(w[0].setCount, 2);
});

await step('Detect a PR automatically, with last-time hints', async () => {
  await logWorkout('Push Day', [[165, 8]]);
  assert.match(await page.locator('.last-time').first().innerText(), /155 × 8/);
  await page.locator('.ex-block .badge-pr').first().waitFor({ timeout: 6000 });
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await toast('PR');
  const prs = await api('/prs');
  assert.ok(prs.some((p) => p.type === 'weight' && Math.round(p.weightKg * 2.2046226218) === 165));
});

await step('Log weight', async () => {
  await page.goto(BASE + '/body');
  await page.getByRole('button', { name: 'Log weight' }).first().click();
  await page.locator('#b-w').fill('180.4');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await toast('Logged');
  const b = await api('/body');
  assert.equal(Math.round(b[0].weightKg * 2.2046226218 * 10) / 10, 180.4);
});

await step('Log body measurements', async () => {
  await page.getByRole('button', { name: 'Measurements' }).click();
  await page.locator('#b-waistCm').fill('34.5');
  await page.locator('#b-armsCm').fill('14.25');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await toast('Logged');
  const s = await api('/body/summary');
  assert.equal(Math.round((s.latest.waistCm.value / 2.54) * 100) / 100, 34.5);
});

async function addPhotos(month) {
  await page.goto(`${BASE}/photos/${month}?add=1`);
  for (const angle of ['front', 'side', 'back']) {
    const slot = page.locator('.angle-slot', { has: page.locator('.eyebrow', { hasText: new RegExp(`^${angle}$`, 'i') }) });
    await slot.locator('input[type=file]').setInputFiles(PHOTO);
    await slot.locator('.angle-img img').waitFor({ timeout: 8000 });
  }
}

await step('Add monthly photos and determine completion', async () => {
  await addPhotos(MONTH);
  await page.locator('.badge-good', { hasText: 'Complete' }).waitFor();
  const st = await api('/photos');
  assert.equal(st.current.complete, true);
  const dash = await api('/dashboard');
  assert.equal(dash.month.photo.complete, true);
  // The original bytes are served untouched.
  const set = await api(`/photos/${MONTH}`);
  const bytes = Buffer.from(await (await fetch(BASE + set.photos[0].url)).arrayBuffer());
  assert.ok(bytes.equals(fs.readFileSync(PHOTO)));
});

await step('Compare progress photos (side by side and slider)', async () => {
  await addPhotos(prevMonth);
  await page.goto(`${BASE}/photos/compare?from=${prevMonth}&to=${MONTH}`);
  await page.locator('.compare-side img').first().waitFor();
  assert.equal(await page.locator('.compare-side img').count(), 2);
  await page.getByRole('button', { name: 'Slider' }).click();
  await page.locator('.slider-cmp').waitFor();
  const handle = page.getByRole('slider', { name: 'Comparison divider' });
  await handle.focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await handle.getAttribute('aria-valuenow'), '46');
});

await step('Rate the day green, yellow, red, and change it', async () => {
  await page.goto(BASE + '/today');
  const picker = page.locator('.rate-day').first();
  await picker.getByRole('radio', { name: 'Good' }).click();
  await page.getByText('Want to add anything about today?').waitFor();
  await page.locator('.rate-note textarea').fill('Finished the homepage for the HVAC website, good workout.');
  await page.getByRole('button', { name: 'Save note' }).click();
  await toast('Saved to your journal');
  let d = await api(`/days/${TODAY}`);
  assert.equal(d.rating, 3);
  assert.match(d.journal, /HVAC/);
  await picker.getByRole('radio', { name: 'Okay' }).click();
  await toast('Changed to okay day');
  d = await api(`/days/${TODAY}`);
  assert.equal(d.rating, 2);
  await picker.getByRole('radio', { name: 'Bad' }).click();
  await toast('Changed to bad day');
  assert.equal((await api(`/days/${TODAY}`)).rating, 1);
  await picker.getByRole('radio', { name: 'Good' }).click();
  await toast('Changed to good day');
  assert.equal((await api(`/days/${TODAY}`)).rating, 3);
});

await step('Render the full year grid and open a day from it', async () => {
  await page.goto(BASE + '/year');
  const year = Number(TODAY.slice(0, 4));
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  await page.locator('.year-grid').waitFor();
  assert.equal(await page.locator('.year-grid .yg-cell:not(.none)').count(), leap ? 366 : 365);
  assert.equal(await page.locator('.year-grid .yg-cell.today').count(), 1);
  assert.equal(await page.locator('.year-grid .yg-cell.today.r3').count(), 1);
  await page.locator('.year-grid .yg-cell.today').scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.locator('.year-grid .yg-cell.today').hover();
  await page.locator('.tip', { hasText: 'Good day' }).waitFor();
  await page.locator('.year-grid .yg-cell.today').click();
  await page.waitForURL(new RegExp(`/day/${TODAY}`));
});

await step('Handle a leap year (2028 has 366 days)', async () => {
  await page.goto(BASE + '/year/2028');
  await page.locator('.year-grid').waitFor();
  assert.equal(await page.locator('.year-grid .yg-cell:not(.none)').count(), 366);
  assert.equal(await page.locator('.year-grid button.yg-cell').count(), 0); // all future: not clickable
  const g = await api('/year/2028');
  assert.equal(g.days.length, 366);
  assert.equal(g.stats.unrated, 0); // future days never count as unrated
});

await step('Create a goal and watch it update automatically', async () => {
  await page.goto(BASE + '/goals');
  await page.getByRole('button', { name: 'New goal' }).click();
  await page.getByRole('button', { name: 'Earn', exact: true }).click();
  await page.locator('#g-target').fill('300');
  await page.locator('#g-period').selectOption('month');
  await page.getByRole('button', { name: 'Create goal' }).click();
  await toast('Goal created');
  await page.locator('.dialog').waitFor({ state: 'detached' });
  let g = (await api('/goals')).find((x) => x.metric === 'earnings');
  const monthSoFar = (await api('/money/summary')).month;
  assert.equal(g.current, monthSoFar);
  assert.equal(g.done, false);
  // Add income: the goal completes by itself.
  await page.keyboard.press('n');
  await page.getByRole('button', { name: /Income/ }).click();
  await page.locator('#inc-amt').fill('200');
  await page.locator('#inc-src').fill('Deposit');
  await page.getByRole('button', { name: 'Add income' }).click();
  await toast('$200 added');
  g = (await api('/goals')).find((x) => x.metric === 'earnings');
  assert.equal(g.current, monthSoFar + 20000);
  assert.equal(g.done, true);
  await page.locator('.goal-card.done').first().waitFor();
});

await step('Generate the weekly review', async () => {
  await page.goto(`${BASE}/reviews/week/${TODAY}`);
  await page.locator('.report-stats').waitFor();
  const week = await api(`/reviews/week/${TODAY}`);
  assert.equal(week.totals.workouts, 2);
  assert.match(await page.locator('.report-stats').innerText(), new RegExp('\\$' + Math.round(week.totals.earnedCents / 100).toLocaleString('en-US')));
  await page.locator('#r-well').fill('Shipped the homepage');
  await page.locator('#r-improve').click();
  await page.waitForTimeout(600);
  const r = await api(`/reviews/week/${TODAY}`);
  assert.equal(r.answers.well, 'Shipped the homepage');
});

await step('Generate the monthly review', async () => {
  await page.goto(`${BASE}/reviews/month/${MONTH}`);
  await page.locator('.report-stats').waitFor();
  const r = await api(`/reviews/month/${MONTH}`);
  assert.equal(r.totals.workouts, 2);
  assert.equal(r.photos.complete, true);
  assert.ok(r.prs.length > 0);
});

await step('Generate the Year in Review', async () => {
  await page.goto(`${BASE}/wrapped/${TODAY.slice(0, 4)}`);
  await page.locator('.wrapped-year').waitFor();
  await page.locator('.chapter').first().waitFor();
  const r = await api(`/reviews/year/${TODAY.slice(0, 4)}`);
  assert.equal(r.totals.workouts, 2);
  assert.equal(r.totals.good, 1);
});

await step('Log screen time and see it on the day, dashboard and chart', async () => {
  await page.goto(BASE + '/');
  await page.locator('.greeting h1').waitFor();
  await page.keyboard.press('n');
  await page.locator('.qa-tile', { hasText: 'Screen time' }).click();
  await page.locator('#st-h').fill('2');
  await page.locator('#st-m').fill('30');
  await page.locator('#st-p').fill('55');
  await page.getByRole('button', { name: /Break it down/ }).click();
  await page.locator('.st-cat', { hasText: 'Social' }).locator('input').fill('1h 10m');
  await page.getByRole('button', { name: /^Save/ }).click();
  await toast('Screen time saved');
  const day = await api(`/days/${TODAY}`);
  assert.equal(day.screen.minutes, 150);
  assert.equal(day.screen.categories.Social, 70);
  const dash = await api('/dashboard');
  assert.equal(dash.week.screen.avg, 150);
  await page.goto(BASE + '/screen-time');
  await page.locator('.stat', { hasText: 'Today' }).getByText('2h 30m').waitFor();
  assert.ok((await page.locator('.st-history .session-row').count()) >= 1);
  // A screen-time limit goal passes while the average stays under it.
  await page.getByRole('button', { name: 'New goal' }).click();
  await page.getByRole('button', { name: 'Screen time', exact: true }).click();
  await page.locator('#g-target').fill('3');
  await page.getByRole('button', { name: 'Create goal' }).click();
  await toast('Goal created');
  const g = (await api('/goals')).find((x) => x.metric === 'screen_time');
  assert.equal(g.target, 180);
  assert.equal(g.done, true);
  await page.locator('.st-goal', { hasText: 'On track' }).waitFor();
});

await step('Add trips and a bucket-list place with offline city search', async () => {
  await page.goto(BASE + '/travel');
  await page.getByRole('button', { name: 'Add trip' }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByPlaceholder('Search a city…').fill('Hattiesb');
  await page.locator('.combo-opt', { hasText: 'Hattiesburg, Mississippi' }).first().click();
  await page.getByRole('button', { name: 'Set as home' }).click();
  await toast('Hattiesburg set as home');
  await page.getByRole('button', { name: 'Add trip' }).click();
  await page.getByPlaceholder('Search a city…').fill('New Orl');
  await page.locator('.combo-opt', { hasText: 'New Orleans, Louisiana' }).first().click();
  await page.locator('#t-from').fill(TODAY);
  await page.locator('#t-to').fill(TODAY);
  await page.locator('#t-title').fill('Jazz weekend');
  await page.getByRole('button', { name: 'Save trip' }).click();
  await toast('Trip to New Orleans saved');
  await page.getByRole('button', { name: 'Bucket list', exact: true }).click();
  await page.getByPlaceholder('Search a city…').fill('Tokyo');
  await page.locator('.combo-opt', { hasText: 'Tokyo' }).first().click();
  await page.getByRole('button', { name: 'Add to bucket list' }).click();
  await toast('Tokyo added to your bucket list');
  await page.locator('.tm-pin.want').waitFor();
  await page.locator('.tm-pin.home').waitFor();
  assert.equal(await page.locator('.tm-land.been').count() >= 1, true);
  const t = await api('/travel');
  assert.equal(t.allTime.places, 1);
  assert.equal(t.allTime.bucketList, 1);
  assert.equal(t.year.tripDays, 1);
  // The trip shows up on the day and the calendar.
  const day = await api(`/days/${TODAY}`);
  assert.equal(day.travel[0].placeName, 'New Orleans');
  const cal = await api(`/calendar/${MONTH}`);
  assert.equal(cal.days.find((x) => x.date === TODAY).travel, 'New Orleans');
  // Clicking the map drops a pin at the nearest real town.
  await page.getByRole('button', { name: 'USA', exact: true }).click();
  await page.locator('.tm-land').first().waitFor();
  const box = await page.locator('.tmap > svg').boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await page.locator('.picked-place').waitFor();
  await page.keyboard.press('Escape');
  // Open a place from its pin.
  await page.locator('.tm-pin.visited').first().click();
  await page.locator('.place-visit', { hasText: 'Jazz weekend' }).waitFor();
  await page.keyboard.press('Escape');
});

await step('Vision board: image and quote cards, goal progress, reorder, achieved', async () => {
  await page.goto(BASE + '/vision');
  await page.getByRole('button', { name: 'Add the first card' }).click();
  await page.locator('.vf-drop input[type=file]').setInputFiles(PHOTO);
  await page.locator('.vf-drop img').waitFor();
  await page.locator('#v-title').fill('Beach house');
  await page.locator('#v-goal').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Add to board' }).click();
  await toast('Added to your vision board');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Words' }).click();
  await page.locator('#v-body').fill('Phone down, eyes up.');
  await page.getByRole('button', { name: 'Add to board' }).click();
  await toast('Added to your vision board');
  let v = await api('/vision');
  assert.equal(v.items.length, 2);
  assert.equal(v.items[0].body, 'Phone down, eyes up.'); // newest first
  assert.ok(v.items[1].goal && typeof v.items[1].goal.pct === 'number');
  await page.locator('.vcard .vcard-goal').first().waitFor();
  // Original image bytes are kept as-is.
  const bytes = Buffer.from(await (await fetch(BASE + v.items[1].imageUrl)).arrayBuffer());
  assert.ok(bytes.equals(fs.readFileSync(PHOTO)));
  // Drag to reorder.
  await page.locator('.vcard', { hasText: 'Beach house' }).dragTo(page.locator('.vcard', { hasText: 'Phone down' }));
  await waitFor(async () => (await api('/vision')).items[0].title === 'Beach house', 5000);
  // Mark achieved from the card.
  await page.locator('.vcard', { hasText: 'Phone down' }).locator('.vcard-open').click();
  await page.getByRole('button', { name: 'Achieved', exact: true }).click();
  await toast('Marked achieved');
  v = await api('/vision');
  assert.equal(v.items.find((x) => x.body === 'Phone down, eyes up.').achievedOn, TODAY);
  await page.keyboard.press('Escape');
  await page.locator('.vcard-done').waitFor();
});

await step('Search and command palette', async () => {
  await page.goto(BASE + '/');
  await page.locator('.greeting h1').waitFor();
  await page.keyboard.press('Control+k');
  const box = page.getByPlaceholder('Search your life, or type a command…');
  await box.fill('HVAC');
  await page.locator('.cmd-item', { hasText: 'HVAC website' }).first().waitFor();
  await box.fill('Bench Press');
  await page.locator('.cmd-item', { hasText: 'Exercise history' }).first().click();
  await page.waitForURL(/\/gym\/exercises\/\d+/);
});

await step('Export data (JSON and CSV)', async () => {
  const j = await api('/data/export.json');
  assert.equal(j.app, 'almanac');
  assert.ok(j.tables.work_sessions.length >= 2);
  const csv = await (await fetch(BASE + '/api/data/csv/work')).text();
  assert.match(csv, /Homepage for the HVAC website/);
});

let backupFile;
await step('Backup data (zip download from Settings)', async () => {
  await page.goto(BASE + '/settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download backup' }).click()]);
  backupFile = path.join(DATA, 'e2e-backup.zip');
  await dl.saveAs(backupFile);
  assert.ok(fs.statSync(backupFile).size > 1000);
});

await step('Restore data from the backup', async () => {
  // Change something, then restore.
  await fetch(BASE + '/api/income', { method: 'POST', headers: { 'content-type': 'application/json', 'x-local-date': TODAY }, body: JSON.stringify({ date: TODAY, amountCents: 777700, source: 'After backup', kind: 'other' }) });
  assert.ok((await api('/income')).some((i) => i.source === 'After backup'));
  await page.goto(BASE + '/settings');
  const input = page.locator('input[type=file][accept*="zip"]');
  await input.setInputFiles(backupFile);
  await page.getByRole('button', { name: 'Restore', exact: true }).last().click();
  await toast('Backup restored');
  const inc = await api('/income');
  assert.ok(!inc.some((i) => i.source === 'After backup'));
  assert.equal((await api('/photos')).current.complete, true);
});

await step('Dark, Tiffany and light themes, remembered', async () => {
  await page.goto(BASE + '/');
  await page.locator('.theme-toggle').getByRole('radio', { name: 'Dark' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await page.reload();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await page.locator('.theme-toggle').getByRole('radio', { name: 'Tiffany' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'tiffany');
  await page.waitForTimeout(600);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(bg, 'rgb(6, 7, 7)');
  await page.locator('.theme-toggle').getByRole('radio', { name: 'Light' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
});

await step('Mobile layout', async () => {
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await m.newPage();
  await p.goto(BASE + '/');
  await p.locator('.tabbar').waitFor();
  assert.equal(await p.locator('.sidebar').isVisible(), false);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `horizontal overflow ${overflow}px`);
  await p.locator('.tab-add').tap();
  await p.getByRole('button', { name: /Weight/ }).first().waitFor();
  for (const route of ['/today', '/work', '/money', '/gym', '/calendar', '/year', '/goals', '/vision', '/travel', '/screen-time', '/settings', `/reviews/month/${MONTH}`]) {
    await p.goto(BASE + route);
    await p.waitForLoadState('networkidle');
    const o = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(o <= 0, `${route} overflows by ${o}px`);
  }
  await m.close();
});

await step('Application restart keeps all data', async () => {
  const before = await api('/dashboard');
  await stopServer();
  await startServer();
  const after = await api('/dashboard');
  assert.equal(after.today.earnedCents, before.today.earnedCents);
  assert.equal(after.today.minutes, before.today.minutes);
  assert.equal(after.month.totals.workouts, 2);
  await page.goto(BASE + '/');
  await page.locator('.greeting h1', { hasText: 'Ryan' }).waitFor();
});

await browser.close();
await stopServer();
const failed = results.filter((r) => !r.ok);
if (errors.length) console.log('\nPage errors:\n' + errors.join('\n'));
console.log(`\n${results.length - failed.length}/${results.length} workflows passed`);
process.exit(failed.length || errors.length ? 1 : 0);
