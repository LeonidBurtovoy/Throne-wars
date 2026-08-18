// Boots a real match, orders a starting worker to walk across open ground,
// and screenshots several frames mid-stride - useful for checking unit
// animation (walk-bob, leg swing, weapon swing) since units are idle by
// default at boot and drag-select + right-click via synthetic screen
// coordinates proved unreliable to land precisely in a headless context.
//
// Requires a temporary debug hook NOT present in shipped code: add
// `window.__debugGame = game;` right after `game.input = new
// InputHandler(...)` in bootLocalGame() (src/main.js), run this script,
// then remove the hook again before committing anything. This bypasses
// screen-coordinate UI interaction entirely and drives the game directly
// (select a unit, issue a move command, read back live state) - much more
// reliable than simulating clicks for this kind of check.
const { chromium } = require('playwright-core');

async function main() {
  const url = process.env.GAME_URL || 'http://127.0.0.1:8099/index.html';
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));

  await page.goto(url, { waitUntil: 'load' });
  await page.click('#faction-select [data-faction="stark"]');
  await page.click('#map-select [data-map="map1"]');
  await page.click('#opponents-select [data-opponents="1"]');
  await page.click('#start-btn');
  await page.waitForTimeout(4000);

  const info = await page.evaluate(() => {
    const g = window.__debugGame;
    if (!g) return { error: 'no __debugGame - see this file\'s header comment' };
    const worker = g.units.find((u) => u.owner === 0 && u.role === 'worker');
    if (!worker) return { error: 'no worker found' };
    const th = g.getMainTownHall(0);
    // far enough that the unit stays clearly separated from its idle
    // siblings for several seconds, giving a wide window to catch frames
    const targetX = th.centerX + 2000, targetY = th.centerY + 50;
    g.applyMoveCommand(0, [worker.id], targetX, targetY, false);
    return { workerId: worker.id, state: worker.state, x: worker.x, y: worker.y, targetX, targetY };
  });
  console.log('move command result:', JSON.stringify(info));
  if (info.error) { await browser.close(); return; }

  for (let i = 1; i <= 6; i++) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `/tmp/walk${i}.png` });
  }
  console.log('saved /tmp/walk1.png .. walk6.png (full-viewport - the moving unit drifts away from its idle siblings, crop/zoom as needed once you see where it lands)');

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT_FAILED:', e); process.exit(1); });
