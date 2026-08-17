import { VIEWPORT, BOTTOM_HUD_HEIGHT } from './config.js';
import { generateMap } from './map/mapData.js';
import { Game } from './engine/Game.js';
import { InputHandler } from './engine/Input.js';
import { Renderer3D } from './render3d/Renderer3D.js';
import { preloadCastleKit } from './render3d/kit.js';
import { initMinimap } from './ui/HUD.js';
import { hostRoom, joinRoom, makeLink } from './net/PeerLink.js';
import { NetworkHost } from './net/NetworkHost.js';
import { NetworkGuest } from './net/NetworkGuest.js';

const SCREENS = ['menu-screen', 'net-screen', 'game-screen'];

function reportFatal(title, err) {
  const box = document.getElementById('boot-error');
  const detail = err && err.stack ? err.stack : String(err);
  if (box) {
    box.style.display = 'block';
    box.textContent += title + '\n' + detail + '\n\n';
  }
  console.error(title, err);
}

function requireEl(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Не найден элемент #${id} — проверь index.html`);
  return el;
}

function showScreen(id) {
  for (const s of SCREENS) requireEl(s).classList.toggle('hidden', s !== id);
}

// ---------------- local (vs AI) menu ----------------

let selectedFaction = null;
let selectedMap = null;
let selectedOpponents = null;

try {
  const factionButtons = document.querySelectorAll('#faction-select .option-card');
  const mapButtons = document.querySelectorAll('#map-select .option-card');
  const opponentButtons = document.querySelectorAll('#opponents-select .option-card');
  const startBtn = requireEl('start-btn');

  factionButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      factionButtons.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedFaction = btn.dataset.faction;
      updateStartButton();
    });
  });

  mapButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      mapButtons.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedMap = btn.dataset.map;
      updateStartButton();
    });
  });

  opponentButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      opponentButtons.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedOpponents = parseInt(btn.dataset.opponents, 10);
      updateStartButton();
    });
  });

  function updateStartButton() {
    startBtn.disabled = !(selectedFaction && selectedMap && selectedOpponents);
  }

  startBtn.addEventListener('click', () => {
    try {
      showScreen('game-screen');
      bootLocalGame(selectedFaction, selectedMap, selectedOpponents)
        .catch((err) => reportFatal('Ошибка запуска игры (bootGame)', err));
    } catch (err) {
      reportFatal('Ошибка запуска игры (bootGame)', err);
    }
  });

  requireEl('restart-btn').addEventListener('click', () => {
    window.location.reload();
  });
} catch (err) {
  reportFatal('Ошибка инициализации меню', err);
}

// ---------------- network menu ----------------

let netFaction = null;
let netMap = null;

try {
  requireEl('goto-net-btn').addEventListener('click', () => { resetNetPanels(); showScreen('net-screen'); });
  requireEl('net-back-btn').addEventListener('click', () => showScreen('menu-screen'));

  requireEl('net-host-choice').addEventListener('click', () => {
    requireEl('net-host-panel').classList.remove('hidden');
    requireEl('net-join-panel').classList.add('hidden');
    requireEl('net-choice').classList.add('hidden');
  });
  requireEl('net-join-choice').addEventListener('click', () => {
    requireEl('net-join-panel').classList.remove('hidden');
    requireEl('net-host-panel').classList.add('hidden');
    requireEl('net-choice').classList.add('hidden');
  });

  const netFactionButtons = document.querySelectorAll('#net-faction-select .option-card');
  const netMapButtons = document.querySelectorAll('#net-map-select .option-card');
  const netHostStartBtn = requireEl('net-host-start-btn');

  netFactionButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      netFactionButtons.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      netFaction = btn.dataset.faction;
      netHostStartBtn.disabled = !(netFaction && netMap);
    });
  });
  netMapButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      netMapButtons.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      netMap = btn.dataset.map;
      netHostStartBtn.disabled = !(netFaction && netMap);
    });
  });

  netHostStartBtn.addEventListener('click', async () => {
    netHostStartBtn.disabled = true;
    try {
      const { code, conn } = await hostRoom({ onStatus: setNetStatus });
      setNetStatus(`Комната: ${code} — жду соперника…`);
      const link = makeLink(conn, { onClose: () => setNetStatus('Соперник отключился.', true) });
      link.send({ type: 'start', mapId: netMap, hostFaction: netFaction });
      setNetStatus('Соперник подключился! Начинаем битву…');
      showScreen('game-screen');
      bootNetworkHostGame(netFaction, netMap, link)
        .catch((err) => reportFatal('Ошибка запуска игры (bootNetworkHostGame)', err));
    } catch (err) {
      setNetStatus('Не удалось создать комнату: ' + (err && err.message ? err.message : err), true);
      netHostStartBtn.disabled = false;
    }
  });

  const codeInput = requireEl('net-code-input');
  const joinBtn = requireEl('net-join-btn');
  joinBtn.addEventListener('click', async () => {
    const code = codeInput.value.trim();
    if (code.length !== 5) { setNetStatus('Введи 5-значный код комнаты.', true); return; }
    joinBtn.disabled = true;
    try {
      const { conn } = await joinRoom(code, { onStatus: setNetStatus });
      const link = makeLink(conn, { onClose: () => setNetStatus('Соединение с хостом потеряно.', true) });
      setNetStatus('Подключено. Ждём начала игры от хоста…');
      link.onMessage((msg) => {
        if (msg.type === 'start') {
          showScreen('game-screen');
          bootNetworkGuestGame(msg.hostFaction, msg.mapId, link)
            .catch((err) => reportFatal('Ошибка запуска игры (bootNetworkGuestGame)', err));
        }
      });
    } catch (err) {
      setNetStatus('Не удалось подключиться: ' + (err && err.message ? err.message : err), true);
      joinBtn.disabled = false;
    }
  });
} catch (err) {
  reportFatal('Ошибка инициализации сетевого меню', err);
}

function setNetStatus(text, isError) {
  const el = requireEl('net-status');
  el.textContent = text;
  el.classList.toggle('error', !!isError);
}

function resetNetPanels() {
  requireEl('net-choice').classList.remove('hidden');
  requireEl('net-host-panel').classList.add('hidden');
  requireEl('net-join-panel').classList.add('hidden');
  setNetStatus('');
}

// ---------------- boot ----------------

function prepareCanvas() {
  const canvas = requireEl('game-canvas');
  canvas.width = VIEWPORT.width;
  canvas.height = VIEWPORT.height;
  canvas.style.width = VIEWPORT.width + 'px';
  canvas.style.height = VIEWPORT.height + 'px';
  // size the game screen to exactly canvas + bottom HUD bar (stacked in
  // normal flow — see style.css) so nothing overlaps the map view; the
  // topbar overlays the canvas's own top edge and adds no extra height
  const gameScreen = requireEl('game-screen');
  gameScreen.style.width = VIEWPORT.width + 'px';
  gameScreen.style.height = (VIEWPORT.height + BOTTOM_HUD_HEIGHT) + 'px';
  return canvas;
}

function runLoop(game, extraTick) {
  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    try {
      game.update(dt);
      game.renderer3D.render(game);
      if (extraTick) extraTick(dt);
    } catch (err) {
      reportFatal('Ошибка во время игрового цикла (update/render)', err);
      return; // stop the loop so the error stays visible instead of spamming
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// castle-kit pieces (see render3d/kit.js) are loaded once, before the
// first render() call — every building factory that uses them assumes the
// cache is already populated and throws otherwise, so this must be
// awaited before runLoop starts on every boot path
async function bootLocalGame(faction, mapId, numOpponents) {
  const canvas = prepareCanvas();
  const { map, starts, name } = generateMap(mapId);
  const game = new Game({
    map,
    mapMeta: { starts, name },
    playerFaction: faction,
    numOpponents,
    canvas,
    viewportWidth: VIEWPORT.width,
    viewportHeight: VIEWPORT.height,
  });
  game.renderer3D = new Renderer3D(canvas, VIEWPORT.width, VIEWPORT.height);
  game.input = new InputHandler(canvas, game);
  initMinimap(game);
  await preloadCastleKit();
  runLoop(game);
}

async function bootNetworkHostGame(faction, mapId, link) {
  const canvas = prepareCanvas();
  const { map, starts, name } = generateMap(mapId);
  const game = new Game({
    map,
    mapMeta: { starts, name },
    playerFaction: faction,
    numOpponents: 1,
    humanOwners: [0, 1],
    canvas,
    viewportWidth: VIEWPORT.width,
    viewportHeight: VIEWPORT.height,
    localOwner: 0,
    isNetworkHost: true,
    remoteOwner: 1,
  });
  const host = new NetworkHost(game, link);
  game.renderer3D = new Renderer3D(canvas, VIEWPORT.width, VIEWPORT.height);
  game.input = new InputHandler(canvas, game);
  initMinimap(game);
  await preloadCastleKit();
  runLoop(game, (dt) => host.tick(dt));
}

async function bootNetworkGuestGame(hostFaction, mapId, link) {
  const canvas = prepareCanvas();
  const { map, starts, name } = generateMap(mapId);
  const game = new Game({
    map,
    mapMeta: { starts, name },
    playerFaction: hostFaction,
    numOpponents: 1,
    humanOwners: [0, 1],
    canvas,
    viewportWidth: VIEWPORT.width,
    viewportHeight: VIEWPORT.height,
    localOwner: 1,
    isRemoteGuest: true,
  });
  new NetworkGuest(game, link);
  game.renderer3D = new Renderer3D(canvas, VIEWPORT.width, VIEWPORT.height);
  game.input = new InputHandler(canvas, game);
  initMinimap(game);
  await preloadCastleKit();
  runLoop(game);
}
