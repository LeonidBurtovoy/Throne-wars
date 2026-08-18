// Hosts+joins a real match, then has the GUEST click their own townhall
// (now that the camera-centering fix puts it near screen-center) and
// checks whether the selection panel (#selection-name, #command-buttons)
// actually populates - reproduces "clicking the castle showed nothing".
const { chromium } = require('playwright-core');

async function main() {
  const url = process.env.GAME_URL || 'http://127.0.0.1:8099/index.html';
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const host = await hostCtx.newPage();
  const guest = await guestCtx.newPage();
  const guestLogs = [];
  guest.on('console', (m) => { if (m.type() === 'error') guestLogs.push(`[guest error] ${m.text()}`); });
  guest.on('pageerror', (e) => guestLogs.push(`[guest pageerror] ${e.message}\n${e.stack || ''}`));

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

  // poll for a real snapshot having actually landed (food count "4/6" only
  // appears once starting workers exist in the data) instead of a fixed
  // sleep - WebRTC connection timing is too variable for a fixed wait to
  // be reliable
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const food = await guest.evaluate(() => document.querySelector('#topbar')?.textContent || '');
    if (food.includes('4/6')) { ready = true; break; }
    await guest.waitForTimeout(500);
  }
  console.log('guest snapshot data ready:', ready);
  await guest.waitForTimeout(500); // let camera-centering settle after data first lands

  await guest.screenshot({ path: '/tmp/gs_before_click.png' });

  // diagnose BEFORE clicking: what does screenToWorld/findEntityAtPoint
  // actually compute at this exact pixel, and where does the game think
  // its own townhall's tile bounds are (requires the temporary
  // window.__debugGame hook - see main.js bootNetworkGuestGame)
  const diag = await guest.evaluate(() => {
    const g = window.__debugGame;
    if (!g) return { error: 'no __debugGame' };
    const [wx, wy] = g.renderer3D.screenToWorld(880, 200);
    const th = g.buildings.find((b) => b.owner === g.localOwner && b.type === 'townhall');
    const TILE = g.tileSize;
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    return {
      clickWorld: { wx, wy, tx, ty },
      townhall: th ? { tx: th.tx, ty: th.ty, size: th.size, x: th.x, y: th.y, centerX: th.centerX, centerY: th.centerY } : null,
      cameraXYWH: { x: g.camera.x, y: g.camera.y, width: g.camera.width, height: g.camera.height },
      buildingCount: g.buildings.length,
      inputMouse: { mouseX: g.input.mouseX, mouseY: g.input.mouseY },
      edgeDwell: g._edgeDwell,
    };
  });
  console.log('diagnostic:', JSON.stringify(diag, null, 2));

  // isolate: does calling handleLeftClick directly with these exact world
  // coordinates work (selection logic itself), independent of the DOM
  // click/event path (Input.js's rect math, synthetic mouse events, etc)?
  // click exactly at the townhall's own known world-space center - the
  // real test of whether selection logic itself is fixed, independent of
  // guessing the right screen pixel for an approximate 3D-tilted projection
  const directResult = await guest.evaluate(() => {
    const g = window.__debugGame;
    const th = g.buildings.find((b) => b.owner === g.localOwner && b.type === 'townhall');
    g.handleLeftClick(th.centerX, th.centerY, false);
    return { selectionLength: g.selection.length, selectionIds: g.selection.map((e) => e.id), selectionTypes: g.selection.map((e) => e.type || e.role) };
  });
  console.log('direct handleLeftClick (at townhall centerX/centerY) result:', JSON.stringify(directResult));
  await guest.waitForTimeout(200);
  const directPanel = await guest.evaluate(() => ({
    selectionName: document.getElementById('selection-name')?.textContent,
    commandButtonCount: document.getElementById('command-buttons')?.children.length,
  }));
  console.log('panel after direct call:', JSON.stringify(directPanel));

  // the townhall's starting corner is near a map edge, so centerOn() clamps
  // the camera at the map boundary rather than putting it at screen-center
  // (same clamping any player's camera gets) - click its actual visible
  // position from the screenshot instead of assuming screen-center
  await guest.mouse.click(880, 200, { button: 'left' });
  await guest.waitForTimeout(300);

  const panelInfo = await guest.evaluate(() => {
    return {
      selectionName: document.getElementById('selection-name')?.textContent,
      portraitTitle: document.getElementById('selection-portrait')?.title,
      commandButtonCount: document.getElementById('command-buttons')?.children.length,
      commandButtonLabels: Array.from(document.getElementById('command-buttons')?.children || []).map((b) => b.textContent),
    };
  });
  console.log('selection panel after clicking (880,200):', JSON.stringify(panelInfo, null, 2));

  await guest.screenshot({ path: '/tmp/gs_after_click.png' });

  if (guestLogs.length) { console.log('\n=== guest errors ===\n' + guestLogs.join('\n')); }

  await browser.close();
}
main().catch((e) => { console.error('SCRIPT_FAILED:', e); process.exit(1); });
