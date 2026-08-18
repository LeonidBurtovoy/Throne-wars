// Boots a full host+guest match (real WebRTC via the now-working TURN
// config) and lets it run for a while, capturing the GUEST's console
// errors/warnings and screenshots specifically - the guest render path
// (NetworkGuest/applySnapshot) is a much less-exercised code path than the
// host's own simulation+render, so this is where guest-only bugs would
// show up that never appear in normal single-player testing.
const { chromium } = require('playwright-core');

async function main() {
  const url = process.env.GAME_URL || 'http://127.0.0.1:8099/index.html';
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  const guestLogs = [];
  guest.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') guestLogs.push(`[guest ${m.type()}] ${m.text()}`); });
  guest.on('pageerror', (e) => guestLogs.push(`[guest pageerror] ${e.message}\n${e.stack || ''}`));
  const hostLogs = [];
  host.on('pageerror', (e) => hostLogs.push(`[host pageerror] ${e.message}`));

  await host.goto(url, { waitUntil: 'load' });
  await host.click('#goto-net-btn');
  await host.click('#net-host-choice');
  await host.click('#net-faction-select [data-faction="stark"]');
  await host.click('#net-map-select [data-map="map1"]');
  await host.click('#net-host-start-btn');

  let code = null;
  for (let i = 0; i < 20; i++) {
    const status = await host.textContent('#net-status').catch(() => '');
    const m = status && status.match(/[A-Z0-9]{5}/);
    if (m) { code = m[0]; break; }
    await host.waitForTimeout(500);
  }
  if (!code) { console.log('FAILED: no room code'); await browser.close(); process.exit(1); }
  console.log('room code:', code);

  await guest.goto(url, { waitUntil: 'load' });
  await guest.click('#goto-net-btn');
  await guest.click('#net-join-choice');
  await guest.fill('#net-code-input', code);
  await guest.click('#net-join-btn');

  await host.waitForTimeout(8000);

  const hostReady = await host.evaluate(() => document.getElementById('game-screen')?.classList.contains('hidden') === false);
  const guestReady = await guest.evaluate(() => document.getElementById('game-screen')?.classList.contains('hidden') === false);
  console.log('host in game:', hostReady, '| guest in game:', guestReady);

  await host.screenshot({ path: '/tmp/gc_host.png' });
  await guest.screenshot({ path: '/tmp/gc_guest.png' });

  // exercise some guest-side interaction: drag-select + a couple of clicks,
  // since input handling for a guest is a distinct code path too
  await guest.mouse.move(360, 295);
  await guest.mouse.down();
  await guest.mouse.move(440, 340, { steps: 5 });
  await guest.mouse.up();
  await guest.waitForTimeout(300);
  await guest.mouse.click(500, 300, { button: 'right' });
  await guest.waitForTimeout(3000);

  await guest.screenshot({ path: '/tmp/gc_guest2.png' });

  console.log('\n=== guest console errors/warnings ===');
  console.log(guestLogs.length ? guestLogs.join('\n') : '(none)');
  console.log('\n=== host pageerrors ===');
  console.log(hostLogs.length ? hostLogs.join('\n') : '(none)');

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT_FAILED:', e); process.exit(1); });
