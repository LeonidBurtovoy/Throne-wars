// Deeper diagnostic than net-test.js: monkey-patches window.RTCPeerConnection
// BEFORE the page's own scripts run, so every PeerJS-created connection gets
// logged at the ICE level - candidate types found (host/srflx/relay),
// gathering state, ICE connection state transitions, and any errors. This
// answers "does it fail to find candidates at all, or find them but fail to
// pair, or succeed at STUN but fail at TURN" instead of just "did it open".
const { chromium } = require('playwright-core');

const INSTRUMENT = () => {
  const OrigRTCPeerConnection = window.RTCPeerConnection;
  let n = 0;
  window.RTCPeerConnection = function (...args) {
    const id = ++n;
    console.log(`[RTC#${id}] created with config:`, JSON.stringify(args[0]));
    const pc = new OrigRTCPeerConnection(...args);
    pc.addEventListener('icecandidate', (e) => {
      if (e.candidate) {
        const c = e.candidate;
        console.log(`[RTC#${id}] candidate: type=${c.type} protocol=${c.protocol} address=${c.address || '?'}`);
      } else {
        console.log(`[RTC#${id}] candidate gathering complete (null candidate)`);
      }
    });
    pc.addEventListener('icegatheringstatechange', () => console.log(`[RTC#${id}] iceGatheringState=${pc.iceGatheringState}`));
    pc.addEventListener('iceconnectionstatechange', () => console.log(`[RTC#${id}] iceConnectionState=${pc.iceConnectionState}`));
    pc.addEventListener('connectionstatechange', () => console.log(`[RTC#${id}] connectionState=${pc.connectionState}`));
    pc.addEventListener('icecandidateerror', (e) => console.log(`[RTC#${id}] icecandidateerror: ${e.errorCode} ${e.errorText} url=${e.url}`));
    return pc;
  };
  window.RTCPeerConnection.prototype = OrigRTCPeerConnection.prototype;
};

async function main() {
  const url = process.env.GAME_URL || 'http://127.0.0.1:8099/index.html';
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();

  await host.addInitScript(INSTRUMENT);
  await guest.addInitScript(INSTRUMENT);

  const hostLogs = [], guestLogs = [];
  host.on('console', (m) => { const t = m.text(); hostLogs.push(t); if (t.startsWith('[RTC')) console.log('[HOST]', t); });
  guest.on('console', (m) => { const t = m.text(); guestLogs.push(t); if (t.startsWith('[RTC')) console.log('[GUEST]', t); });

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
  console.log('room code:', code);
  if (!code) { console.log('FAILED: no room code'); await browser.close(); process.exit(1); }

  await guest.goto(url, { waitUntil: 'load' });
  await guest.click('#goto-net-btn');
  await guest.click('#net-join-choice');
  await guest.fill('#net-code-input', code);
  await guest.click('#net-join-btn');

  await host.waitForTimeout(15000);

  console.log('\n=== final host status ===', await host.textContent('#net-status').catch(() => '?'));
  console.log('=== final guest status ===', await guest.textContent('#net-status').catch(() => '?'));

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT_FAILED:', e); process.exit(1); });
