// Drives two independent headless Chrome browser contexts through the
// real host/join network flow (real PeerJS/WebRTC, not mocked) to
// diagnose "multiplayer doesn't work" reports - something that was
// previously untestable in this environment (no second browser/device),
// now possible with playwright-core driving two separate contexts.
const { chromium } = require('playwright-core');

async function main() {
  const url = process.env.GAME_URL || 'http://127.0.0.1:8099/index.html';
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  const hostLogs = [], guestLogs = [];
  host.on('console', (m) => hostLogs.push(`[host console.${m.type()}] ${m.text()}`));
  host.on('pageerror', (e) => hostLogs.push(`[host pageerror] ${e.message}`));
  guest.on('console', (m) => guestLogs.push(`[guest console.${m.type()}] ${m.text()}`));
  guest.on('pageerror', (e) => guestLogs.push(`[guest pageerror] ${e.message}`));

  console.log('--- host: navigating and starting host flow ---');
  await host.goto(url, { waitUntil: 'load' });
  await host.click('#goto-net-btn');
  await host.click('#net-host-choice');
  await host.click('#net-faction-select [data-faction="stark"]');
  await host.click('#net-map-select [data-map="map1"]');
  await host.click('#net-host-start-btn');

  // wait for the room code to appear in #net-status
  let code = null;
  for (let i = 0; i < 30; i++) {
    const status = await host.textContent('#net-status').catch(() => '');
    const m = status && status.match(/[A-Z0-9]{5}/);
    if (m) { code = m[0]; break; }
    await host.waitForTimeout(500);
  }
  console.log('host room code:', code, '| host status text:', await host.textContent('#net-status').catch(() => '(none)'));
  if (!code) {
    console.log('--- FAILED: no room code appeared ---');
    console.log(hostLogs.join('\n'));
    await browser.close();
    process.exit(1);
  }

  console.log('--- guest: navigating and joining with code', code, '---');
  await guest.goto(url, { waitUntil: 'load' });
  await guest.click('#goto-net-btn');
  await guest.click('#net-join-choice');
  await guest.fill('#net-code-input', code);
  await guest.click('#net-join-btn');

  await host.waitForTimeout(27000);

  const hostScreen = await host.evaluate(() => document.getElementById('game-screen')?.classList.contains('hidden') === false);
  const guestScreen = await guest.evaluate(() => document.getElementById('game-screen')?.classList.contains('hidden') === false);
  const hostBootError = await host.evaluate(() => { const el = document.getElementById('boot-error'); return el && el.style.display !== 'none' ? el.textContent : null; });
  const guestBootError = await guest.evaluate(() => { const el = document.getElementById('boot-error'); return el && el.style.display !== 'none' ? el.textContent : null; });

  console.log('host reached game-screen:', hostScreen, '| host boot-error:', hostBootError);
  console.log('guest reached game-screen:', guestScreen, '| guest boot-error:', guestBootError);

  await host.screenshot({ path: '/tmp/net_host.png' });
  await guest.screenshot({ path: '/tmp/net_guest.png' });

  console.log('--- host logs ---\n' + hostLogs.slice(-30).join('\n'));
  console.log('--- guest logs ---\n' + guestLogs.slice(-30).join('\n'));

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT_FAILED:', e); process.exit(1); });
