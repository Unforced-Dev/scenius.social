const { chromium } = require('/Users/parachute/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const BASE = 'http://127.0.0.1:3000';
const HANDLE = 'zz-playwright-walk';
let pass = 0, fail = 0;
const ok = (m) => { console.log('  \x1b[32m✓\x1b[0m ' + m); pass++; };
const bad = (m) => { console.log('  \x1b[31m✗ ' + m + '\x1b[0m'); fail++; };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  [pageerror] ' + e.message));

  // ============ LOGGED-OUT READ FLOWS ============
  console.log('\n— logged-out read flows —');
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  (await p.locator('text=come alive').count()) ? ok('home hero renders') : bad('home hero missing');
  (await p.locator('text=Techne').first().count()) ? ok('home shows seeded scenes') : bad('no scenes on home');
  await p.screenshot({ path: '/tmp/walk-1-home.png', fullPage: true });

  // nav → Scenes
  await p.click('nav >> text=Scenes');
  await p.waitForLoadState('networkidle');
  (await p.locator('text=Woven Web').count()) ? ok('scenes list renders') : bad('scenes list missing');

  // open a scene
  await p.goto(BASE + '/s/techne', { waitUntil: 'networkidle' });
  (await p.locator('h1:has-text("Techne")').count()) ? ok('scene masthead renders') : bad('scene masthead missing');
  (await p.locator('text=Scene Builders').count()) ? ok('scene sidebar renders') : bad('sidebar missing');
  await p.screenshot({ path: '/tmp/walk-2-scene.png', fullPage: true });
  await p.screenshot({ path: '/tmp/walk-2b-scene-viewport.png' });

  // open an event from the scene calendar
  const evLink = p.locator('a[href^="/e/"]').first();
  if (await evLink.count()) {
    await evLink.click();
    await p.waitForLoadState('networkidle');
  } else {
    // fall back: events aren't links yet — go via the scene's first event name
    console.log('  (event rows not linked; checking event page directly is skipped)');
  }
  await p.screenshot({ path: '/tmp/walk-3-event.png', fullPage: true });

  // ============ LOG IN (dev seam) ============
  console.log('\n— logging in (dev seam) —');
  const r = await p.goto(BASE + '/api/dev/login');
  const body = await r.text();
  body.includes('"ok":true') ? ok('dev login ok') : bad('dev login failed: ' + body.slice(0,120));
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  (await p.locator('nav >> text=Create scene').count()) ? ok('nav shows Create scene when logged in') : bad('not logged in');

  // ============ CREATE A SCENE ============
  console.log('\n— create a scene —');
  await p.goto(BASE + '/scenes/new', { waitUntil: 'networkidle' });
  (await p.locator('text=Create a scene').count()) ? ok('create-scene form loads') : bad('create-scene form missing');
  await p.fill('input[name=name]', 'Playwright Walk Scene');
  await p.fill('input[name=handle]', HANDLE);
  await p.selectOption('select[name=type]', 'hybrid');
  await p.fill('textarea[name=description]', 'A scene created by the Playwright walkthrough.');
  await p.fill('input[name=locality]', 'Boulder');
  await p.fill('input[name=region]', 'CO');
  await p.click('button[type=submit]:has-text("Create scene")');
  await p.waitForURL('**/s/' + HANDLE, { timeout: 15000 }).catch(() => {});
  (p.url().endsWith('/s/' + HANDLE)) ? ok('scene created → redirected to scene page') : bad('no redirect, at ' + p.url());
  (await p.locator('h1:has-text("Playwright Walk Scene")').count()) ? ok('new scene renders') : bad('new scene not rendering');
  (await p.locator('text=Add event').count()) ? ok('"+ Add event" visible (creator is builder/steward)') : bad('Add event button missing');
  await p.screenshot({ path: '/tmp/walk-4-new-scene.png', fullPage: true });

  // ============ CREATE AN EVENT (with capacity) ============
  console.log('\n— create an event —');
  await p.goto(BASE + '/s/' + HANDLE + '/events/new', { waitUntil: 'networkidle' });
  (await p.locator('text=Add an event').count()) ? ok('create-event form loads') : bad('create-event form missing');
  await p.fill('input[name=name]', 'Playwright Test Gathering');
  await p.fill('input[name=date]', '2026-09-15');
  await p.fill('input[name=startTime]', '19:00');
  await p.fill('input[name=endTime]', '21:00');
  await p.fill('input[name=locationName]', 'RegenHub');
  await p.fill('input[name=locality]', 'Boulder');
  await p.fill('input[name=capacity]', '2');
  await p.fill('textarea[name=description]', 'Created via Playwright.');
  await p.click('button[type=submit]:has-text("Add to scene calendar")');
  await p.waitForURL('**/s/' + HANDLE, { timeout: 15000 }).catch(() => {});
  await p.waitForLoadState('networkidle');
  (await p.locator('text=Playwright Test Gathering').count()) ? ok('event created → appears on scene calendar') : bad('event not on calendar');
  await p.screenshot({ path: '/tmp/walk-5-event-on-scene.png', fullPage: true });

  // ============ RSVP ============
  console.log('\n— RSVP —');
  await p.click('a[href^="/e/"]:has-text("Playwright Test Gathering")').catch(async () => {
    await p.locator('text=Playwright Test Gathering').first().click();
  });
  await p.waitForLoadState('networkidle');
  await p.locator('text=Attending').first().waitFor({ timeout: 6000 }).then(() => ok('event page shows capacity card')).catch(() => bad('capacity card missing'));
  // time should render in MDT (America/Denver) — 7:00 PM
  const bodyText = await p.locator('body').innerText();
  bodyText.includes('7:00') ? ok('event time renders correct wall-clock (7:00 PM)') : bad('event time wrong (no 7:00)');
  !bodyText.includes('@undefined') ? ok('host handle resolves (no @undefined)') : bad('host shows @undefined');
  await p.screenshot({ path: '/tmp/walk-6-event-page.png', fullPage: true });

  const rsvpBtn = p.locator('button:has-text("RSVP")').first();
  if (await rsvpBtn.count()) {
    await rsvpBtn.click();
    await p.waitForTimeout(2500);
    await p.waitForLoadState('networkidle');
    const t = await p.locator('body').innerText();
    t.includes("You're in") ? ok('RSVP → "You\'re in" (seat confirmed)') : bad('RSVP did not confirm: ' + (t.match(/You.{0,8}in|waitlist|pending/i)||['none']));
    await p.screenshot({ path: '/tmp/walk-7-rsvped.png', fullPage: true });
    const cancel = p.locator('button:has-text("Cancel RSVP")').first();
    if (await cancel.count()) {
      await cancel.click();
      await p.waitForTimeout(2500);
      ok('cancel RSVP clickable');
    }
  } else {
    bad('no RSVP button found');
  }

  await b.close();
  console.log('\n' + (fail === 0 ? '\x1b[32m▶ WALKTHROUGH PASSED ('+pass+')\x1b[0m' : '\x1b[31m▶ WALKTHROUGH: '+pass+' passed, '+fail+' failed\x1b[0m'));
  process.exit(fail === 0 ? 0 : 1);
})();
