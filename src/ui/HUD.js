import { FACTIONS, BUILDING_STATS, UNIT_STATS } from '../data/factions.js';
import { TILE, TILE_TYPE, TRADE_BATCH, TRADE_BASE_RATE } from '../config.js';
import { canAfford, hasFoodRoom } from '../systems/Economy.js';
import { upgradesForBuilding, getAttackBonus, getArmorBonus, getHealAmountBonus, getTradeRate } from '../data/upgrades.js';
import { getUnitIcon, getBuildingIcon } from '../data/sprites.js';

const el = (id) => document.getElementById(id);

export function displayName(entity, ownFaction) {
  const faction = FACTIONS[entity.faction];
  if (entity.kind === 'unit') return faction.unitNames[entity.role];
  return faction.buildingNames[entity.type];
}

export function displayDescription(entity) {
  return entity.kind === 'unit' ? UNIT_STATS[entity.role].description : BUILDING_STATS[entity.type].description;
}

export function updateResourceBar(player) {
  el('res-gold').textContent = Math.floor(player.gold);
  el('res-wood').textContent = Math.floor(player.wood);
  el('res-steel').textContent = Math.floor(player.steel);
  el('res-food').textContent = `${player.foodUsed}/${player.foodCap}`;
}

export function updateClock(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  el('game-clock').textContent = `${m}:${s}`;
}

let lastMessages = [];
export function addLogMessage(text) {
  lastMessages.push(text);
  if (lastMessages.length > 4) lastMessages.shift();
  el('message-log').textContent = lastMessages.join('  |  ');
}

function costLabel(cost) {
  const parts = [];
  if (cost.gold) parts.push(`${cost.gold}з`);
  if (cost.wood) parts.push(`${cost.wood}д`);
  if (cost.steel) parts.push(`${cost.steel}с`);
  return parts.join(' ');
}

function statSpan(label, base, bonus) {
  if (!bonus) return `<span>${label} ${base}</span>`;
  return `<span>${label} ${base + bonus}<span class="bonus"> (+${bonus})</span></span>`;
}

function statsHTML(entity) {
  const hpLine = `<span>❤ ${Math.ceil(entity.hp)}/${entity.maxHp}</span>`;
  if (entity.kind === 'unit') {
    const stats = entity.stats;
    const parts = [hpLine];
    if (stats.attack) {
      parts.push(statSpan('⚔', stats.attack, getAttackBonus(entity)));
      parts.push(statSpan('🛡', entity.armor, getArmorBonus(entity)));
    }
    if (stats.speed) parts.push(`<span>⚡ ${stats.speed}</span>`);
    if (stats.healAmount) parts.push(statSpan('✚', stats.healAmount, getHealAmountBonus(entity)));
    if (entity.carrying) parts.push(`<span>${entity.carrying.type === 'gold' ? '🪙' : '🪵'} ${entity.carrying.amount}</span>`);
    return parts.join('');
  }
  const armBonus = getArmorBonus(entity);
  const parts = [hpLine, statSpan('🛡', entity.armor, armBonus)];
  if (entity.stats.attack) parts.push(`<span>⚔ ${entity.stats.attack}</span><span>➤ ${entity.stats.attackRange}</span>`);
  return parts.join('');
}

export function updateSelectionPanel(game) {
  const sel = game.selection;
  const nameEl = el('selection-name');
  const hpFill = el('selection-hp-fill');
  const portrait = el('selection-portrait');
  const buttonsEl = el('command-buttons');
  buttonsEl.innerHTML = '';

  if (sel.length === 0) {
    nameEl.textContent = '-';
    nameEl.title = '';
    hpFill.style.width = '100%';
    hpFill.style.background = '#3ab03a';
    portrait.style.background = '#26221a';
    portrait.style.backgroundImage = 'none';
    portrait.title = '';
    el('selection-stats').innerHTML = '';
    return;
  }

  const first = sel[0];
  const faction = FACTIONS[first.faction];
  portrait.style.background = faction.colorPrimary;

  const statsEl = el('selection-stats');
  if (sel.length === 1) {
    const iconUrl = first.kind === 'unit'
      ? getUnitIcon(first.role, faction, first.faction)
      : getBuildingIcon(first.type, faction, first.faction);
    portrait.style.backgroundImage = `url(${iconUrl})`;
    const desc = displayDescription(first);
    nameEl.textContent = displayName(first, game.playerFaction);
    nameEl.title = desc;
    portrait.title = desc;
    const pct = Math.max(0, (first.hp / first.maxHp) * 100);
    hpFill.style.width = pct + '%';
    hpFill.style.background = pct > 50 ? '#3ab03a' : pct > 25 ? '#c0a030' : '#b03a3a';
    statsEl.innerHTML = statsHTML(first);
  } else {
    portrait.style.backgroundImage = 'none';
    portrait.title = '';
    nameEl.textContent = `Выбрано отряд: ${sel.length}`;
    nameEl.title = '';
    hpFill.style.width = '100%';
    hpFill.style.background = '#3ab03a';
    statsEl.innerHTML = '';
  }

  const player = game.players[game.localOwner];
  const isSingleBuilding = sel.length === 1 && first.kind === 'building' && first.owner === game.localOwner;
  const allOwnWorkers = sel.every((e) => e.kind === 'unit' && e.owner === game.localOwner && e.role === 'worker');
  const allOwnUnits = sel.every((e) => e.kind === 'unit' && e.owner === game.localOwner);

  const addButton = (label, cost, disabled, onClick, iconUrl, tooltip) => {
    const btn = document.createElement('button');
    btn.className = 'cmd-btn';
    btn.disabled = !!disabled;
    if (tooltip) btn.title = tooltip;
    const icon = iconUrl ? `<img class="cmd-icon" src="${iconUrl}" alt="" />` : '';
    btn.innerHTML = `${icon}<span>${label}</span>${cost ? `<span class="cost">${costLabel(cost)}</span>` : ''}`;
    btn.onclick = onClick;
    buttonsEl.appendChild(btn);
  };

  if (isSingleBuilding) {
    // No full-width "label row" dividers here on purpose — every one of
    // those used to force its own row in the button grid (a grid row never
    // shrinks below its minimum height even for a one-line label), which
    // was enough extra rows to push the upgrade buttons below the fixed-
    // height HUD bar and off-screen. Everything is a plain button now, so
    // it packs into as few rows as the grid's column count allows.
    const trains = first.stats.trains;
    if (trains && first.complete) {
      for (const role of trains) {
        const stats = UNIT_STATS[role];
        const queued = first.trainQueue.length;
        const capped = stats.maxCount && game.countOwned(player.id, role) >= stats.maxCount;
        const name = faction.unitNames[role] + (queued > 0 ? ` (${queued})` : capped ? ' (макс.)' : '');
        const disabled = capped || !canAfford(player, stats.cost) || !hasFoodRoom(player, stats.food) || queued >= 5;
        const tooltip = capped ? `${stats.description} Уже есть — больше одного не завести за игру.` : stats.description;
        addButton(name, stats.cost, disabled, () => {
          game.trainUnit(first, role);
          updateSelectionPanel(game);
        }, getUnitIcon(role, faction, first.faction), tooltip);
      }
    }
    const upgrades = first.complete ? upgradesForBuilding(first.type) : [];
    for (const [key, def] of upgrades) {
      const done = player.upgrades[key];
      const inProgress = first.researching && first.researching.key === key;
      const disabled = done || !!first.researching || !canAfford(player, def.cost);
      const label = done ? `✓ ${def.name}` : inProgress ? `${def.name}…` : def.name;
      addButton(label, done ? null : def.cost, disabled, () => {
        game.startResearch(first, key);
        updateSelectionPanel(game);
      }, null, def.description);
    }
    if (first.type === 'market' && first.complete) {
      const rate = TRADE_BASE_RATE + getTradeRate(player);
      const gain = Math.round(TRADE_BATCH * rate);
      addButton(`Дерево → Золото (${gain})`, { wood: TRADE_BATCH }, player.wood < TRADE_BATCH, () => {
        game.tradeResources(first, 'wood');
        updateSelectionPanel(game);
      }, null, `Обменять ${TRADE_BATCH} дерева на ${gain} золота.`);
      addButton(`Золото → Дерево (${gain})`, { gold: TRADE_BATCH }, player.gold < TRADE_BATCH, () => {
        game.tradeResources(first, 'gold');
        updateSelectionPanel(game);
      }, null, `Обменять ${TRADE_BATCH} золота на ${gain} дерева.`);
    }
  } else if (allOwnWorkers) {
    for (const type of ['farm', 'barracks', 'archery', 'stable', 'tower', 'forge', 'workshop', 'temple', 'market']) {
      const stats = BUILDING_STATS[type];
      const name = faction.buildingNames[type];
      const disabled = !canAfford(player, stats.cost);
      addButton(name, stats.cost, disabled, () => game.enterBuildPlacement(type), getBuildingIcon(type, faction, first.faction), stats.description);
    }
    addButton('Стоп', null, false, () => game.stopSelection());
  } else if (allOwnUnits) {
    addButton('Стоп', null, false, () => game.stopSelection());
  }
}

export function showVictory(text) {
  el('victory-text').textContent = text;
  el('victory-screen').classList.remove('hidden');
}

// ---------------- Minimap ----------------

let minimapCtx = null;
let lastMinimapDraw = 0;

export function initMinimap(game) {
  const canvas = el('minimap-canvas');
  minimapCtx = canvas.getContext('2d');

  const jump = (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const wx = px * game.map.width * TILE;
    const wy = py * game.map.height * TILE;
    game.camera.centerOn(wx, wy);
  };
  let dragging = false;
  canvas.addEventListener('mousedown', (e) => { dragging = true; jump(e); });
  window.addEventListener('mouseup', () => { dragging = false; });
  canvas.addEventListener('mousemove', (e) => { if (dragging) jump(e); });
}

const TERRAIN_COLORS = {
  [TILE_TYPE.GRASS]: '#2f4a2a',
  [TILE_TYPE.FOREST]: '#1f3a20',
  [TILE_TYPE.WATER]: '#1a2a4a',
  [TILE_TYPE.ROCK]: '#3a3630',
  [TILE_TYPE.GOLD]: '#8a7020',
  [TILE_TYPE.STEEL]: '#6a92a8',
};

export function drawMinimap(game, force = false) {
  if (!minimapCtx) return; // not initialized yet (initMinimap runs after Game's constructor)
  const now = performance.now();
  if (!force && now - lastMinimapDraw < 180) return;
  lastMinimapDraw = now;

  const canvas = el('minimap-canvas');
  const ctx = minimapCtx;
  const w = canvas.width, h = canvas.height;
  const map = game.map;
  const sx = w / map.width, sy = h / map.height;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const explored = game.fog.isExplored(tx, ty);
      if (!explored) continue;
      ctx.fillStyle = TERRAIN_COLORS[map.getTile(tx, ty)] || '#2f4a2a';
      ctx.fillRect(tx * sx, ty * sy, Math.ceil(sx), Math.ceil(sy));
      if (!game.fog.isVisible(tx, ty)) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(tx * sx, ty * sy, Math.ceil(sx), Math.ceil(sy));
      }
    }
  }

  const drawDot = (entity, size) => {
    if (!game.fog.isVisible(Math.floor(entity.x / TILE), Math.floor(entity.y / TILE)) && entity.owner !== game.localOwner) return;
    ctx.fillStyle = FACTIONS[entity.faction].colorPrimary;
    ctx.fillRect((entity.x / TILE) * sx - size / 2, (entity.y / TILE) * sy - size / 2, size, size);
  };
  for (const b of game.buildings) if (!b.dead) drawDot(b, 4);
  for (const u of game.units) if (!u.dead) drawDot(u, 2);

  const camTx0 = game.camera.x / TILE, camTy0 = game.camera.y / TILE;
  const camTx1 = (game.camera.x + game.camera.width) / TILE, camTy1 = (game.camera.y + game.camera.height) / TILE;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(camTx0 * sx, camTy0 * sy, (camTx1 - camTx0) * sx, (camTy1 - camTy0) * sy);
}
