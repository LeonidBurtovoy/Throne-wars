import { TILE, TILE_TYPE, START_GOLD, START_WOOD, START_STEEL, START_FOOD_CAP, FARM_FOOD, TRADE_BATCH, TRADE_BASE_RATE } from '../config.js';
import { FACTIONS, UNIT_STATS, BUILDING_STATS, opponentOf } from '../data/factions.js';
import { drawUnit, drawBuilding, drawGoldNode, drawSteelNode, drawTree, drawTerrainDetail, blendTerrainEdges } from '../data/sprites.js';
import { Unit } from '../entities/Unit.js';
import { Building } from '../entities/Building.js';
import { Camera } from './Camera.js';
import { FogOfWar } from '../map/FogOfWar.js';
import * as Combat from '../systems/Combat.js';
import { canAfford, spendResources, hasFoodRoom, reserveFood, releaseFood } from '../systems/Economy.js';
import * as Selection from '../systems/Selection.js';
import { separateUnits } from '../systems/Movement.js';
import { AIController } from '../systems/AI.js';
import * as HUD from '../ui/HUD.js';
import { UPGRADES, createDefaultUpgrades, getTradeRate } from '../data/upgrades.js';

const STARTING_WORKERS = 4;
const DEATH_FADE_DURATION = 0.5; // seconds a fallen unit lingers, fading out
const IMPACT_EFFECT_DURATION = 0.25; // seconds a hit-burst is visible

function formationOffset(i) {
  if (i === 0) return [0, 0];
  const angle = i * 2.39996; // golden-angle spiral spread
  const radius = Math.sqrt(i) * TILE * 0.65;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

export class Game {
  constructor({
    map, mapMeta, playerFaction, numOpponents, canvas, viewportWidth, viewportHeight,
    // multiplayer options — all default to today's single-player behavior
    localOwner = 0, humanOwners = [0], isRemoteGuest = false, isNetworkHost = false, remoteOwner = null,
  }) {
    this.map = map;
    this.mapMeta = mapMeta;
    this.playerFaction = playerFaction;
    this.tileSize = TILE;

    this.canvas = canvas;
    this.camera = new Camera(viewportWidth, viewportHeight, map.width * TILE, map.height * TILE);
    this.fog = new FogOfWar(map.width, map.height);

    this.units = [];
    this.buildings = [];
    this.projectiles = [];
    this.effects = []; // transient combat-hit visuals, see spawnImpactEffect
    this.selection = [];

    this.localOwner = localOwner;
    this.isRemoteGuest = isRemoteGuest;
    this.isNetworkHost = isNetworkHost;
    this.remoteOwner = remoteOwner;
    this.network = null; // attached externally by NetworkHost/NetworkGuest
    if (this.isNetworkHost) this._guestFog = new FogOfWar(map.width, map.height);

    const n = Math.max(1, Math.min(3, numOpponents || 1));
    this.allOwners = [0, ...Array.from({ length: n }, (_, i) => i + 1)];
    this.aiOwners = this.allOwners.filter((o) => o !== 0 && !humanOwners.includes(o));
    // alternate opponent houses for visual variety when there's more than one
    const factionForOwner = (i) => (i % 2 === 1 ? opponentOf(playerFaction) : playerFaction);

    this.players = [{ id: 0, faction: playerFaction, gold: START_GOLD, wood: START_WOOD, steel: START_STEEL, foodCap: START_FOOD_CAP, foodUsed: 0, upgrades: createDefaultUpgrades() }];
    for (const o of this.allOwners) {
      if (o === 0) continue;
      this.players[o] = { id: o, faction: factionForOwner(o), gold: START_GOLD, wood: START_WOOD, steel: START_STEEL, foodCap: START_FOOD_CAP, foodUsed: 0, upgrades: createDefaultUpgrades() };
    }

    this.aiControllers = this.aiOwners.map((o) => new AIController(o));
    this.buildPlacementMode = null;
    this.selectedResourceTile = null;
    this.gameTime = 0;
    this.gameOver = false;
    this.winnerOwner = null;
    this._fogTimer = 0;
    this.input = null;

    this._setup();
  }

  _setup() {
    if (this.isRemoteGuest) {
      // a guest doesn't simulate anything — it starts empty and is fully
      // populated by the first snapshot from the host
      this.camera.centerOn((this.map.width * TILE) / 2, (this.map.height * TILE) / 2);
      return;
    }

    const starts = this.mapMeta.starts;
    const townhalls = [];
    for (const owner of this.allOwners) {
      const pos = starts[owner];
      const th = new Building('townhall', owner, this.players[owner].faction, pos.x, pos.y, { instant: true });
      th.upgrades = this.players[owner].upgrades;
      this.map.occupy(th.tx, th.ty, th.size);
      this.buildings.push(th);
      townhalls.push(th);
    }

    for (const th of townhalls) {
      for (let i = 0; i < STARTING_WORKERS; i++) this.spawnUnitFromBuilding(th, 'worker');
      this.players[th.owner].foodUsed = STARTING_WORKERS;
    }

    const myTownhall = townhalls.find((th) => th.owner === this.localOwner) || townhalls[0];
    this.camera.centerOn(myTownhall.centerX, myTownhall.centerY);
    this._recomputeFog(true);
    HUD.updateResourceBar(this.players[this.localOwner]);
    HUD.updateSelectionPanel(this);
    const enemyNames = this.allOwners.filter((o) => o !== this.localOwner).map((o) => FACTIONS[this.players[o].faction].name).join(', ');
    this.addMessage(`${FACTIONS[this.players[this.localOwner].faction].name} против: ${enemyNames}. Битва началась.`);
  }

  // ---------------- combat/economy delegation ----------------
  performAttack(attacker, target, opts) { Combat.performAttack(this, attacker, target, opts); }
  performHeal(healer, target) { Combat.performHeal(this, healer, target); }
  applyDamageTo(target, dmg, attackerOwner) { Combat.applyDamageTo(this, target, dmg, attackerOwner); }
  dealSplashDamage(owner, x, y, r, dmg) { Combat.dealSplashDamage(this, owner, x, y, r, dmg); }
  getUnitsAndBuildingsForOwner(owner) { return Combat.getUnitsAndBuildingsForOwner(this, owner); }
  getEnemiesOf(owner) { return Combat.getEnemiesOf(this, owner); }
  findNearestEnemyInRange(entity, range) { return Combat.findNearestEnemyInRange(this, entity, range); }

  findNearbyResourceTile(nearTx, nearTy, type) {
    let best = null, bestDist = Infinity;
    for (const key of this.map.resourceAmount.keys()) {
      const [xs, ys] = key.split(',');
      const x = +xs, y = +ys;
      const tile = this.map.getTile(x, y);
      const tileType = tile === TILE_TYPE.GOLD ? 'gold' : tile === TILE_TYPE.FOREST ? 'wood' : tile === TILE_TYPE.STEEL ? 'steel' : null;
      if (tileType !== type) continue;
      const d = (x - nearTx) ** 2 + (y - nearTy) ** 2;
      if (d < bestDist) { bestDist = d; best = [x, y]; }
    }
    return best;
  }

  // Picks which resource a newly-freed AI worker should gather, balancing
  // toward roughly a 2:1 gold:wood ratio instead of always grabbing whichever
  // is geometrically closer — on some starts gold sits nearer than wood, and
  // "always nearest" left wood income at zero for the rest of the match.
  pickGatherAssignment(owner, nearTx, nearTy) {
    const goldTile = this.findNearbyResourceTile(nearTx, nearTy, 'gold');
    const woodTile = this.findNearbyResourceTile(nearTx, nearTy, 'wood');
    if (!goldTile && !woodTile) return null;
    if (!goldTile) return { type: 'wood', tile: woodTile };
    if (!woodTile) return { type: 'gold', tile: goldTile };
    const existingGold = this.units.filter((u) => !u.dead && u.owner === owner && u.gatherType === 'gold').length;
    const existingWood = this.units.filter((u) => !u.dead && u.owner === owner && u.gatherType === 'wood').length;
    const ratio = existingWood === 0 ? Infinity : existingGold / existingWood;
    return ratio > 2 ? { type: 'wood', tile: woodTile } : { type: 'gold', tile: goldTile };
  }

  findNearestDropoff(unit) {
    let best = null, bestDist = Infinity;
    for (const b of this.buildings) {
      if (b.dead || b.owner !== unit.owner || !b.stats.isDropoff || !b.complete) continue;
      const d = Math.hypot(b.centerX - unit.x, b.centerY - unit.y);
      if (d < bestDist) { bestDist = d; best = b; }
    }
    return best;
  }

  depositResource(owner, type, amount) {
    const player = this.players[owner];
    if (type === 'gold') player.gold += amount;
    else if (type === 'steel') player.steel += amount;
    else player.wood += amount;
  }

  spawnUnitFromBuilding(building, role) {
    const cx = building.tx + Math.floor(building.size / 2);
    const cy = building.ty + Math.floor(building.size / 2);
    const spot = this.map.findAdjacentWalkable(building.tx, building.ty, cx, cy) || [building.tx, building.ty + building.size];
    const wx = spot[0] * TILE + TILE / 2;
    const wy = spot[1] * TILE + TILE / 2;
    const unit = new Unit(role, building.owner, building.faction, wx, wy);
    unit.upgrades = this.players[building.owner].upgrades;
    this.units.push(unit);

    if (role === 'worker') {
      if (building.owner !== 0) {
        const pick = this.pickGatherAssignment(building.owner, building.tx, building.ty);
        if (pick) unit.orderGather(this.map, pick.tile[0], pick.tile[1], pick.type);
      }
    } else if (building.rallyPoint) {
      unit.moveTo(this.map, building.rallyPoint.x, building.rallyPoint.y);
    }
    return unit;
  }

  trainUnit(building, role) {
    if (this.isRemoteGuest) {
      if (building.owner !== this.localOwner) return false;
      this.network?.sendCommand('train', { owner: this.localOwner, buildingId: building.id, role });
      return true;
    }
    if (!building.complete) return false;
    const trains = BUILDING_STATS[building.type].trains;
    if (!trains || !trains.includes(role)) return false;
    const player = this.players[building.owner];
    const stats = UNIT_STATS[role];
    if (stats.maxCount && this.countOwned(building.owner, role) >= stats.maxCount) {
      if (building.owner === this.localOwner) this.addMessage('Уже есть в наличии — больше одного не завести');
      return false;
    }
    if (!canAfford(player, stats.cost)) { if (building.owner === this.localOwner) this.addMessage('Не хватает ресурсов'); return false; }
    if (!hasFoodRoom(player, stats.food)) { if (building.owner === this.localOwner) this.addMessage('Постройте больше пашен'); return false; }
    spendResources(player, stats.cost);
    reserveFood(player, stats.food);
    building.queueUnit(role);
    return true;
  }

  startBuildingConstruction(owner, type, tx, ty) {
    const size = BUILDING_STATS[type].size;
    if (!this.map.canPlaceBuilding(tx, ty, size)) return null;
    const player = this.players[owner];
    const cost = BUILDING_STATS[type].cost;
    if (!canAfford(player, cost)) return null;
    spendResources(player, cost);
    const building = new Building(type, owner, player.faction, tx, ty, { instant: false });
    building.upgrades = this.players[owner].upgrades;
    this.map.occupy(tx, ty, size);
    this.buildings.push(building);
    return building;
  }

  startResearch(building, key) {
    if (this.isRemoteGuest) {
      if (building.owner !== this.localOwner) return false;
      this.network?.sendCommand('research', { owner: this.localOwner, buildingId: building.id, key });
      return true;
    }
    const def = UPGRADES[key];
    if (!def || def.building !== building.type) return false;
    if (!building.complete || building.researching) return false;
    const player = this.players[building.owner];
    if (player.upgrades[key]) return false;
    if (!canAfford(player, def.cost)) { if (building.owner === this.localOwner) this.addMessage('Не хватает ресурсов'); return false; }
    spendResources(player, def.cost);
    building.researching = { key, timeLeft: def.time, totalTime: def.time };
    return true;
  }

  // Market: converts a fixed batch of one resource into the other at a rate
  // that improves with the marketRate upgrade. `fromType` is 'gold' or 'wood'.
  tradeResources(building, fromType) {
    if (this.isRemoteGuest) {
      if (building.owner !== this.localOwner) return false;
      this.network?.sendCommand('trade', { owner: this.localOwner, buildingId: building.id, fromType });
      return true;
    }
    if (!building.complete || building.type !== 'market') return false;
    const player = this.players[building.owner];
    if (player[fromType] < TRADE_BATCH) { if (building.owner === this.localOwner) this.addMessage('Не хватает ресурса для обмена'); return false; }
    const toType = fromType === 'gold' ? 'wood' : 'gold';
    const rate = TRADE_BASE_RATE + getTradeRate(player);
    player[fromType] -= TRADE_BATCH;
    player[toType] += Math.round(TRADE_BATCH * rate);
    return true;
  }

  completeResearch(owner, key) {
    this.players[owner].upgrades[key] = true;
    if (owner === this.localOwner) this.addMessage(`Исследовано: ${UPGRADES[key].name}`);
  }

  assignWorkerToBuild(owner, building) {
    const workers = this.units.filter((u) => !u.dead && u.owner === owner && u.role === 'worker');
    if (workers.length === 0) return;
    // exclude workers already headed to/working another site, so starting
    // two buildings in the same AI tick (e.g. a farm + the next build-order
    // item) doesn't keep grabbing the same worker and orphaning the first one
    const free = workers.filter((u) => u.state !== 'moving-to-build' && u.state !== 'building');
    const w = free.find((u) => u.state === 'idle') || free[0] || workers[0];
    w.orderBuild(this.map, building);
  }

  getMainTownHall(owner) {
    return this.buildings.find((b) => !b.dead && b.owner === owner && b.type === 'townhall') || null;
  }

  getAnyBuildingOfOwner(owner) {
    return this.buildings.find((b) => !b.dead && b.owner === owner) || null;
  }

  // living units of this role plus ones already queued in a production
  // building — used to enforce maxCount-capped units like the legend beast
  // so a second one can't be queued the instant the first is spent/trained
  countOwned(owner, role) {
    const alive = this.units.filter((u) => !u.dead && u.owner === owner && u.role === role).length;
    const queued = this.buildings.reduce((sum, b) => {
      if (b.dead || b.owner !== owner) return sum;
      return sum + b.trainQueue.filter((j) => j.role === role).length;
    }, 0);
    return alive + queued;
  }

  addMessage(text) { HUD.addLogMessage(text); }

  spawnImpactEffect(x, y) { this.effects.push({ x, y, age: 0, kind: 'hit' }); }
  spawnHealEffect(x, y) { this.effects.push({ x, y, age: 0, kind: 'heal' }); }

  // ---------------- id-based commands ----------------
  // Single source of truth for "make these units/buildings do X". Local
  // input handlers resolve `this.selection` into ids and call these; the
  // network host calls the same methods with ids that arrived from the
  // remote guest. Neither path duplicates game logic.

  _resolveUnits(owner, ids) {
    const idSet = new Set(ids);
    return this.units.filter((u) => !u.dead && u.owner === owner && idSet.has(u.id));
  }

  applyMoveCommand(owner, unitIds, wx, wy, attackMove = false) {
    const units = this._resolveUnits(owner, unitIds);
    units.forEach((u, i) => {
      const [ox, oy] = units.length > 1 ? formationOffset(i) : [0, 0];
      u.moveTo(this.map, wx + ox, wy + oy, { attackMove });
    });
  }

  applyAttackCommand(owner, unitIds, targetId) {
    const target = this.units.find((u) => !u.dead && u.id === targetId) || this.buildings.find((b) => !b.dead && b.id === targetId);
    if (!target) return;
    // healers have no attack stats — they follow along and heal instead
    for (const u of this._resolveUnits(owner, unitIds)) if (u.role !== 'healer') u.orderAttack(target);
  }

  applyGatherCommand(owner, unitIds, tx, ty, resourceType) {
    for (const u of this._resolveUnits(owner, unitIds)) if (u.role === 'worker') u.orderGather(this.map, tx, ty, resourceType);
  }

  applyAssistBuildCommand(owner, unitIds, buildingId) {
    const building = this.buildings.find((b) => !b.dead && b.id === buildingId);
    if (!building) return;
    for (const u of this._resolveUnits(owner, unitIds)) if (u.role === 'worker') u.orderBuild(this.map, building);
  }

  applyBuildCommand(owner, type, tx, ty, builderIds) {
    const building = this.startBuildingConstruction(owner, type, tx, ty);
    if (!building) { if (owner === this.localOwner) this.addMessage('Не хватает ресурсов или места'); return null; }
    for (const u of this._resolveUnits(owner, builderIds)) if (u.role === 'worker') u.orderBuild(this.map, building);
    return building;
  }

  applyTrainCommand(owner, buildingId, role) {
    const building = this.buildings.find((b) => !b.dead && b.id === buildingId && b.owner === owner);
    if (!building) return false;
    return this.trainUnit(building, role);
  }

  applyResearchCommand(owner, buildingId, key) {
    const building = this.buildings.find((b) => !b.dead && b.id === buildingId && b.owner === owner);
    if (!building) return false;
    return this.startResearch(building, key);
  }

  applyTradeCommand(owner, buildingId, fromType) {
    const building = this.buildings.find((b) => !b.dead && b.id === buildingId && b.owner === owner);
    if (!building) return false;
    return this.tradeResources(building, fromType);
  }

  applyStopCommand(owner, unitIds) {
    for (const u of this._resolveUnits(owner, unitIds)) u.stop();
  }

  // dispatches a local player's command: forwards to the network if this
  // instance is a remote guest, otherwise applies it immediately
  _issue(type, payload, applyFn) {
    if (this.isRemoteGuest) { this.network?.sendCommand(type, { owner: this.localOwner, ...payload }); return; }
    applyFn();
  }

  // ---------------- selection & commands (local input) ----------------

  setSelection(list) {
    for (const e of this.selection) e.selected = false;
    this.selection = list.filter((e) => e.owner === this.localOwner || list.length === 1);
    for (const e of this.selection) e.selected = true;
    HUD.updateSelectionPanel(this);
  }

  addToSelection(entity) {
    if (entity.owner !== this.localOwner) return;
    if (!this.selection.includes(entity)) { this.selection.push(entity); entity.selected = true; }
    HUD.updateSelectionPanel(this);
  }

  stopSelection() {
    const ids = this.selection.filter((e) => e.kind === 'unit' && e.owner === this.localOwner).map((e) => e.id);
    if (ids.length === 0) return;
    this._issue('stop', { unitIds: ids }, () => this.applyStopCommand(this.localOwner, ids));
  }

  handleLeftClick(wx, wy, shiftKey) {
    if (this.gameOver) return;
    const entity = Selection.findEntityAtPoint(this, wx, wy);
    if (!entity) {
      const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
      const type = this.map.getTile(tx, ty);
      const isResource = type === TILE_TYPE.GOLD || type === TILE_TYPE.FOREST || type === TILE_TYPE.STEEL;
      this.selectedResourceTile = isResource && this.fog.isExplored(tx, ty) ? { tx, ty } : null;
      if (!shiftKey) this.setSelection([]);
      return;
    }
    this.selectedResourceTile = null;
    if (shiftKey && entity.owner === this.localOwner) this.addToSelection(entity);
    else this.setSelection([entity]);
  }

  handleBoxSelect(wx0, wy0, wx1, wy1, shiftKey) {
    if (this.gameOver) return;
    const units = Selection.findOwnUnitsInBox(this, this.localOwner, wx0, wy0, wx1, wy1);
    if (units.length > 0) {
      if (shiftKey) units.forEach((u) => this.addToSelection(u));
      else this.setSelection(units);
    } else if (!shiftKey) {
      this.setSelection([]);
    }
  }

  handleRightClick(wx, wy) {
    if (this.gameOver) return;
    const owner = this.localOwner;
    const own = this.selection.filter((e) => e.kind === 'unit' && e.owner === owner);
    if (own.length === 0) return;
    const ids = own.map((e) => e.id);
    const target = Selection.findEntityAtPoint(this, wx, wy);
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);

    if (target && target.owner !== owner && target.owner !== undefined) {
      this._issue('attack', { unitIds: ids, targetId: target.id }, () => this.applyAttackCommand(owner, ids, target.id));
      this.addMessage('Отряд атакует врага');
      return;
    }
    if (target && target.kind === 'building' && target.owner === owner && !target.complete) {
      const workerIds = own.filter((u) => u.role === 'worker').map((u) => u.id);
      if (workerIds.length === 0) return;
      this._issue('assist-build', { unitIds: workerIds, buildingId: target.id }, () => this.applyAssistBuildCommand(owner, workerIds, target.id));
      return;
    }
    const tileType = this.map.getTile(tx, ty);
    if ((tileType === TILE_TYPE.GOLD || tileType === TILE_TYPE.FOREST || tileType === TILE_TYPE.STEEL) && own.some((u) => u.role === 'worker')) {
      const type = tileType === TILE_TYPE.GOLD ? 'gold' : tileType === TILE_TYPE.STEEL ? 'steel' : 'wood';
      const workerIds = own.filter((u) => u.role === 'worker').map((u) => u.id);
      const otherIds = own.filter((u) => u.role !== 'worker').map((u) => u.id);
      if (workerIds.length) this._issue('gather', { unitIds: workerIds, tx, ty, resourceType: type }, () => this.applyGatherCommand(owner, workerIds, tx, ty, type));
      if (otherIds.length) this._issue('move', { unitIds: otherIds, wx, wy, attackMove: false }, () => this.applyMoveCommand(owner, otherIds, wx, wy, false));
      return;
    }
    this._issue('move', { unitIds: ids, wx, wy, attackMove: false }, () => this.applyMoveCommand(owner, ids, wx, wy, false));
  }

  handleKeyDown(e) {
    if (e.key === 'Escape' && this.buildPlacementMode) this.cancelBuildPlacement();
    if (e.key.toLowerCase() === 's') this.stopSelection();
  }

  enterBuildPlacement(type) {
    this.buildPlacementMode = { type, size: BUILDING_STATS[type].size, valid: false, tx: 0, ty: 0 };
  }

  updatePlacementPreview(wx, wy) {
    if (!this.buildPlacementMode) return;
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    this.buildPlacementMode.tx = tx;
    this.buildPlacementMode.ty = ty;
    this.buildPlacementMode.valid = this.map.canPlaceBuilding(tx, ty, this.buildPlacementMode.size);
  }

  confirmBuildPlacement(wx, wy) {
    if (!this.buildPlacementMode) return;
    const { type, size } = this.buildPlacementMode;
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    if (!this.map.canPlaceBuilding(tx, ty, size)) { this.addMessage('Нельзя строить здесь'); return; }
    const owner = this.localOwner;
    const builderIds = this.selection.filter((e) => e.kind === 'unit' && e.role === 'worker' && e.owner === owner).map((e) => e.id);
    this._issue('build', { buildingType: type, tx, ty, builderIds }, () => {
      const building = this.applyBuildCommand(owner, type, tx, ty, builderIds);
      if (!building) this.addMessage('Не хватает ресурсов');
    });
    this.buildPlacementMode = null;
    HUD.updateSelectionPanel(this);
  }

  cancelBuildPlacement() { this.buildPlacementMode = null; }

  // ---------------- main loop ----------------

  update(dt) {
    if (this.input) this._panCamera(dt);

    if (this.isRemoteGuest) {
      // a guest never simulates locally — its whole world state comes from
      // the host's snapshots (see applySnapshot); this just keeps the
      // camera/HUD ticking between snapshots
      HUD.updateResourceBar(this.players[this.localOwner]);
      HUD.updateClock(this.gameTime);
      HUD.drawMinimap(this);
      return;
    }

    if (this.gameOver) return;
    this.gameTime += dt;

    for (const u of this.units) u.update(dt, this);
    for (const b of this.buildings) b.update(dt, this);
    for (const p of this.projectiles) p.update(dt, this);
    separateUnits(this.units.filter((u) => !u.dead));
    this._clampUnitsToMap();
    for (const ai of this.aiControllers) ai.update(dt, this);

    for (const e of this.effects) e.age += dt;
    this.effects = this.effects.filter((e) => e.age < IMPACT_EFFECT_DURATION);

    for (const owner of this.allOwners) {
      const player = this.players[owner];
      const farms = this.buildings.filter((b) => !b.dead && b.owner === owner && b.complete && b.type === 'farm').length;
      player.foodCap = START_FOOD_CAP + farms * FARM_FOOD;
    }

    this._cleanupDead(dt);

    this._fogTimer += dt;
    if (this._fogTimer > 0.2) { this._fogTimer = 0; this._recomputeFog(); }

    this._checkVictory();

    HUD.updateResourceBar(this.players[this.localOwner]);
    HUD.updateClock(this.gameTime);
    HUD.drawMinimap(this);
  }

  _panCamera(dt) {
    const { mouseX, mouseY, keysDown } = this.input;
    const speed = 460 * dt;
    const edge = 16;
    const dwellNeeded = 0.2; // seconds the cursor must rest at the edge before it starts scrolling
    let dx = 0, dy = 0;

    const atLeft = mouseX >= 0 && mouseX < edge;
    const atRight = mouseX > this.camera.width - edge && mouseX <= this.camera.width;
    const atTop = mouseY >= 0 && mouseY < edge;
    const atBottom = mouseY > this.camera.height - edge && mouseY <= this.camera.height;

    if (!this._edgeDwell) this._edgeDwell = { left: 0, right: 0, top: 0, bottom: 0 };
    const d = this._edgeDwell;
    d.left = atLeft ? d.left + dt : 0;
    d.right = atRight ? d.right + dt : 0;
    d.top = atTop ? d.top + dt : 0;
    d.bottom = atBottom ? d.bottom + dt : 0;

    if (d.left > dwellNeeded) dx -= speed;
    if (d.right > dwellNeeded) dx += speed;
    if (d.top > dwellNeeded) dy -= speed;
    if (d.bottom > dwellNeeded) dy += speed;

    if (keysDown.has('arrowleft')) dx -= speed;
    if (keysDown.has('arrowright')) dx += speed;
    if (keysDown.has('arrowup')) dy -= speed;
    if (keysDown.has('arrowdown')) dy += speed;
    if (dx || dy) this.camera.move(dx, dy);
  }

  // separateUnits() pushes overlapping units apart with no notion of map
  // edges — during a big fight clustered near a border (every start is in a
  // corner), repeated pushes could drift a unit's pixel position past the
  // map entirely with nothing to stop it. This keeps every unit's center
  // inside the playable area after physics runs each frame.
  _clampUnitsToMap() {
    const maxX = this.map.width * TILE, maxY = this.map.height * TILE;
    for (const u of this.units) {
      if (u.dead) continue;
      u.x = Math.max(u.radius, Math.min(maxX - u.radius, u.x));
      u.y = Math.max(u.radius, Math.min(maxY - u.radius, u.y));
    }
  }

  _cleanupDead(dt) {
    // fallen units linger for a moment, fading out (see _drawUnitEntity),
    // instead of just vanishing the instant their hp hits zero. The
    // once-only side effects (food refund, dropping out of selection) fire
    // on the frame a unit actually dies, not every frame it spends fading.
    for (const u of this.units) {
      if (!u.dead) continue;
      if (!u.deathHandled) {
        u.deathHandled = true;
        u.deathTimer = 0;
        releaseFood(this.players[u.owner], u.stats.food);
        if (this.selection.includes(u)) this.selection = this.selection.filter((e) => e !== u);
      } else {
        u.deathTimer += dt;
      }
    }
    this.units = this.units.filter((u) => !u.dead || u.deathTimer < DEATH_FADE_DURATION);

    for (const b of this.buildings) {
      if (!b.dead) continue;
      this.map.vacate(b.tx, b.ty, b.size);
      if (this.selection.includes(b)) this.selection = this.selection.filter((e) => e !== b);
    }
    this.buildings = this.buildings.filter((b) => !b.dead);

    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  _recomputeFog(force = false) {
    const sources = [];
    for (const u of this.units) if (!u.dead && u.owner === this.localOwner) sources.push({ tx: u.tileX, ty: u.tileY, radius: u.sight });
    for (const b of this.buildings) if (!b.dead && b.owner === this.localOwner) sources.push({ tx: b.tx + Math.floor(b.size / 2), ty: b.ty + Math.floor(b.size / 2), radius: b.sight });
    this.fog.recompute(sources);

    if (this.isNetworkHost && this.remoteOwner != null) {
      const guestSources = [];
      for (const u of this.units) if (!u.dead && u.owner === this.remoteOwner) guestSources.push({ tx: u.tileX, ty: u.tileY, radius: u.sight });
      for (const b of this.buildings) if (!b.dead && b.owner === this.remoteOwner) guestSources.push({ tx: b.tx + Math.floor(b.size / 2), ty: b.ty + Math.floor(b.size / 2), radius: b.sight });
      this._guestFog.recompute(guestSources);
    }
    if (force) HUD.drawMinimap(this, true);
  }

  _isOwnerAlive(owner) {
    return this.buildings.some((b) => b.owner === owner) || this.units.some((u) => u.owner === owner);
  }

  _checkVictory() {
    const p0alive = this._isOwnerAlive(0);
    const survivingOthers = this.allOwners.filter((o) => o !== 0 && this._isOwnerAlive(o));
    if (p0alive && survivingOthers.length > 0) return;
    this.gameOver = true;
    this.winnerOwner = p0alive ? 0 : (survivingOthers[0] ?? this.allOwners[1]);
    this._announceVictory();
  }

  // shared by the host's own live check and the guest's snapshot-driven
  // transition, so both sides show "Победа!"/"Поражение" from their own
  // point of view instead of a single hardcoded perspective
  _announceVictory() {
    if (this.winnerOwner == null || !this.players[this.winnerOwner]) return;
    const winnerFaction = FACTIONS[this.players[this.winnerOwner].faction].name;
    const text = this.winnerOwner === this.localOwner
      ? `Победа! ${winnerFaction} побеждает!`
      : `Поражение. ${winnerFaction} одержал верх.`;
    HUD.showVictory(text);
  }

  // ---------------- multiplayer snapshot sync ----------------

  // Host-side: a compact, JSON/structured-clone-safe description of the
  // world for the guest to render. Shared references (stats tables, live
  // upgrade flags) are deliberately NOT sent — the guest reconstructs them
  // locally from the same constants so upgrade bonuses stay live/correct.
  serializeSnapshot() {
    return {
      gameTime: this.gameTime,
      gameOver: this.gameOver,
      winnerOwner: this.winnerOwner,
      players: this.players.map((p) => ({ gold: p.gold, wood: p.wood, steel: p.steel, foodCap: p.foodCap, foodUsed: p.foodUsed, faction: p.faction, upgrades: { ...p.upgrades } })),
      units: this.units.filter((u) => !u.dead).map((u) => ({
        id: u.id, role: u.role, owner: u.owner, faction: u.faction, x: u.x, y: u.y,
        hp: u.hp, maxHp: u.maxHp, state: u.state, carrying: u.carrying,
        bobTimer: u.bobTimer, attackCooldown: u.attackCooldown,
      })),
      buildings: this.buildings.filter((b) => !b.dead).map((b) => ({
        id: b.id, type: b.type, owner: b.owner, faction: b.faction, tx: b.tx, ty: b.ty,
        hp: b.hp, maxHp: b.maxHp, buildProgress: b.buildProgress, complete: b.complete,
        trainQueue: b.trainQueue.map((j) => ({ role: j.role, timeLeft: j.timeLeft, totalTime: j.totalTime })),
        researching: b.researching ? { ...b.researching } : null,
      })),
      projectiles: this.projectiles.filter((p) => !p.dead).map((p) => ({ id: p.id, x: p.x, y: p.y, owner: p.owner, faction: p.faction })),
      fog: this._guestFog ? Array.from(this._guestFog.state) : null,
    };
  }

  // Guest-side: replaces the whole world with what the host just sent.
  // Entities are plain objects re-shaped to look like real Unit/Building
  // instances for render()/HUD (same fields those read), rebuilt from
  // scratch each snapshot rather than patched in place — simpler, and at
  // ~10 snapshots/sec the visual "snap" between positions is unnoticeable.
  applySnapshot(data) {
    const wasOver = this.gameOver;
    this.gameTime = data.gameTime;
    this.gameOver = data.gameOver;
    this.winnerOwner = data.winnerOwner;
    data.players.forEach((p, i) => { if (this.players[i]) Object.assign(this.players[i], p); });

    const selectedIds = new Set(this.selection.map((e) => e.id));

    this.units = data.units.map((u) => ({
      id: u.id, kind: 'unit', role: u.role, owner: u.owner, faction: u.faction,
      x: u.x, y: u.y, tileX: Math.floor(u.x / TILE), tileY: Math.floor(u.y / TILE),
      centerX: u.x, centerY: u.y, radius: u.role === 'legend' ? TILE * 0.48 : TILE * 0.27,
      hp: u.hp, maxHp: u.maxHp, state: u.state, carrying: u.carrying,
      bobTimer: u.bobTimer, attackCooldown: u.attackCooldown, selected: selectedIds.has(u.id),
      stats: UNIT_STATS[u.role], armor: UNIT_STATS[u.role].armor, upgrades: this.players[u.owner]?.upgrades,
    }));

    this.buildings = data.buildings.map((b) => ({
      id: b.id, kind: 'building', type: b.type, owner: b.owner, faction: b.faction,
      tx: b.tx, ty: b.ty, size: BUILDING_STATS[b.type].size, x: b.tx * TILE, y: b.ty * TILE,
      get centerX() { return this.x + (this.size * TILE) / 2; },
      get centerY() { return this.y + (this.size * TILE) / 2; },
      hp: b.hp, maxHp: b.maxHp, buildProgress: b.buildProgress, complete: b.complete,
      trainQueue: b.trainQueue, researching: b.researching, selected: selectedIds.has(b.id),
      stats: BUILDING_STATS[b.type], armor: BUILDING_STATS[b.type].armor || 0, upgrades: this.players[b.owner]?.upgrades,
    }));

    this.projectiles = data.projectiles.map((p) => ({ id: p.id, x: p.x, y: p.y, owner: p.owner, faction: p.faction }));

    this.selection = [...this.units, ...this.buildings].filter((e) => selectedIds.has(e.id));

    if (data.fog) this.fog.state.set(data.fog);

    HUD.updateResourceBar(this.players[this.localOwner]);
    HUD.updateSelectionPanel(this);
    HUD.drawMinimap(this, true);
    if (this.gameOver && !wasOver) this._announceVictory();
  }

  // ---------------- rendering ----------------

  render(ctx) {
    const { camera, map } = this;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#05050a';
    ctx.fillRect(0, 0, camera.width, camera.height);

    const tx0 = Math.max(0, Math.floor(camera.x / TILE));
    const ty0 = Math.max(0, Math.floor(camera.y / TILE));
    const tx1 = Math.min(map.width - 1, Math.ceil((camera.x + camera.width) / TILE));
    const ty1 = Math.min(map.height - 1, Math.ceil((camera.y + camera.height) / TILE));

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!this.fog.isExplored(tx, ty)) continue;
        const [sx, sy] = camera.worldToScreen(tx * TILE, ty * TILE);
        this._drawTerrainTile(ctx, tx, ty, sx, sy);
      }
    }

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!this.fog.isExplored(tx, ty)) continue;
        const type = map.getTile(tx, ty);
        const [sx, sy] = camera.worldToScreen(tx * TILE, ty * TILE);
        const seed = tx * 7 + ty * 13;
        if (type === TILE_TYPE.GOLD) drawGoldNode(ctx, sx, sy, TILE, this.gameTime, seed);
        else if (type === TILE_TYPE.STEEL) drawSteelNode(ctx, sx, sy, TILE, this.gameTime, seed);
        else if (type === TILE_TYPE.FOREST) drawTree(ctx, sx, sy, TILE, seed, this.gameTime);
        const isSelectedResource = this.selectedResourceTile && this.selectedResourceTile.tx === tx && this.selectedResourceTile.ty === ty;
        if (isSelectedResource) {
          ctx.strokeStyle = '#f0e6a0'; ctx.lineWidth = 2;
          ctx.strokeRect(sx + 1, sy + 1, TILE - 2, TILE - 2);
          this._drawResourceAmount(ctx, tx, ty, sx, sy);
        }
      }
    }

    const visibleBuildings = this.buildings.filter((b) => b.owner === this.localOwner || this.fog.isVisible(Math.floor(b.centerX / TILE), Math.floor(b.centerY / TILE)));
    for (const b of visibleBuildings) this._drawBuildingEntity(ctx, b);

    const visibleUnits = this.units.filter((u) => u.owner === this.localOwner || this.fog.isVisible(u.tileX, u.tileY));
    for (const u of visibleUnits) this._drawUnitEntity(ctx, u);

    for (const p of this.projectiles) {
      if (!this.fog.isVisible(Math.floor(p.x / TILE), Math.floor(p.y / TILE)) && p.owner !== this.localOwner) continue;
      const [sx, sy] = camera.worldToScreen(p.x, p.y);
      ctx.fillStyle = FACTIONS[p.faction].colorSecondary;
      ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill();
    }

    for (const e of this.effects) {
      if (!this.fog.isVisible(Math.floor(e.x / TILE), Math.floor(e.y / TILE))) continue;
      this._drawImpactEffect(ctx, e);
    }

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const [sx, sy] = camera.worldToScreen(tx * TILE, ty * TILE);
        if (!this.fog.isExplored(tx, ty)) { ctx.fillStyle = '#000'; ctx.fillRect(sx, sy, TILE + 1, TILE + 1); }
        else if (!this.fog.isVisible(tx, ty)) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(sx, sy, TILE + 1, TILE + 1); }
      }
    }

    if (this.buildPlacementMode) this._drawPlacementGhost(ctx);
  }

  _drawTerrainTile(ctx, tx, ty, sx, sy) {
    const type = this.map.getTile(tx, ty);
    const base = {
      [TILE_TYPE.GRASS]: '#33502c',
      [TILE_TYPE.FOREST]: '#2a4327',
      [TILE_TYPE.WATER]: '#233f66',
      [TILE_TYPE.ROCK]: '#4a453c',
      [TILE_TYPE.GOLD]: '#4a4034',
      [TILE_TYPE.STEEL]: '#33363e',
    }[type];
    ctx.fillStyle = base;
    ctx.fillRect(sx, sy, TILE + 1, TILE + 1);
    const shade = ((tx * 928371 + ty * 12923) % 5) - 2;
    if (type === TILE_TYPE.GRASS) {
      ctx.fillStyle = shade > 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
      ctx.fillRect(sx, sy, TILE, TILE);
    }
    blendTerrainEdges(ctx, type, sx, sy, TILE, {
      top: this.map.getTile(tx, ty - 1),
      bottom: this.map.getTile(tx, ty + 1),
      left: this.map.getTile(tx - 1, ty),
      right: this.map.getTile(tx + 1, ty),
    });
    drawTerrainDetail(ctx, type, sx, sy, TILE, tx, ty, this.gameTime);
  }

  _drawResourceAmount(ctx, tx, ty, sx, sy) {
    const amount = this.map.getResourceAmount(tx, ty);
    if (amount <= 0) return;
    const label = String(amount);
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    const lx = sx + TILE / 2, ly = sy + TILE - 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 2.4;
    ctx.strokeText(label, lx, ly);
    ctx.fillStyle = '#f0e6c8';
    ctx.fillText(label, lx, ly);
    ctx.textAlign = 'left';
  }

  _drawBuildingEntity(ctx, b) {
    const [sx, sy] = this.camera.worldToScreen(b.x, b.y);
    const sizePx = b.size * TILE;
    if (sx + sizePx < 0 || sy + sizePx < 0 || sx > this.camera.width || sy > this.camera.height) return;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(sx + sizePx / 2, sy + sizePx - 2, sizePx * 0.46, sizePx * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    drawBuilding(ctx, b.type, FACTIONS[b.faction], b.faction, sx, sy, sizePx, b.buildProgress, this.gameTime);
    if (b.selected) {
      ctx.strokeStyle = '#f0e6a0'; ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, sizePx - 2, sizePx - 2);
    }
    this._drawHealthBar(ctx, sx, sy - 8, sizePx, b.hp, b.maxHp);
    let barOffset = sizePx + 2;
    if (b.trainQueue.length > 0) {
      const job = b.trainQueue[0];
      const pct = 1 - job.timeLeft / job.totalTime;
      ctx.fillStyle = '#000'; ctx.fillRect(sx, sy + barOffset, sizePx, 4);
      ctx.fillStyle = '#d8b23a'; ctx.fillRect(sx, sy + barOffset, sizePx * pct, 4);
      barOffset += 6;
    }
    if (b.researching) {
      const pct = 1 - b.researching.timeLeft / b.researching.totalTime;
      ctx.fillStyle = '#000'; ctx.fillRect(sx, sy + barOffset, sizePx, 4);
      ctx.fillStyle = '#7ac6e0'; ctx.fillRect(sx, sy + barOffset, sizePx * pct, 4);
    }
  }

  _drawUnitEntity(ctx, u) {
    const [sx, sy] = this.camera.worldToScreen(u.x, u.y);
    const cullMargin = u.role === 'legend' ? 55 : 20;
    if (sx < -cullMargin || sy < -cullMargin || sx > this.camera.width + cullMargin || sy > this.camera.height + cullMargin) return;
    const drawSize = TILE * 0.85 * (u.role === 'legend' ? 1.9 : u.role === 'champion' ? 1.18 : 1);

    if (u.dead) {
      // a fallen unit just fades out where it lies — no shadow/HP bar/ring
      const fade = Math.max(0, 1 - (u.deathTimer || 0) / DEATH_FADE_DURATION);
      ctx.save();
      ctx.globalAlpha = fade;
      drawUnit(ctx, u, FACTIONS[u.faction], sx, sy, drawSize);
      ctx.restore();
      return;
    }

    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + drawSize * 0.4, drawSize * (u.role === 'legend' ? 0.44 : u.role === 'cavalry' ? 0.42 : u.role === 'siege' ? 0.4 : u.role === 'champion' ? 0.32 : 0.26), drawSize * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    if (u.selected) {
      ctx.strokeStyle = '#f0e6a0'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(sx, sy + drawSize * 0.35, drawSize * 0.5, drawSize * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
    }
    drawUnit(ctx, u, FACTIONS[u.faction], sx, sy, drawSize);
    if (u.carrying) {
      ctx.fillStyle = u.carrying.type === 'gold' ? '#d8b23a' : '#8a5a2a';
      ctx.fillRect(sx + drawSize * 0.28, sy - drawSize * 0.4, 5, 5);
    }
    this._drawHealthBar(ctx, sx - drawSize / 2, sy - drawSize / 2 - 7, drawSize, u.hp, u.maxHp);
  }

  _drawHealthBar(ctx, sx, sy, width, hp, maxHp) {
    const pct = Math.max(0, hp / maxHp);
    ctx.fillStyle = '#200'; ctx.fillRect(sx, sy, width, 4);
    ctx.fillStyle = pct > 0.5 ? '#3ab03a' : pct > 0.25 ? '#c0a030' : '#b03a3a';
    ctx.fillRect(sx, sy, width * pct, 4);
  }

  // a quick radiating hit-spark wherever damage lands — cheap "juice" that
  // makes combat read clearly without needing a real particle system
  _drawImpactEffect(ctx, e) {
    const [sx, sy] = this.camera.worldToScreen(e.x, e.y);
    const t = e.age / IMPACT_EFFECT_DURATION;
    const radius = 4 + t * 9;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.strokeStyle = e.kind === 'heal' ? '#8af0a0' : '#fff2c0';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + e.x * 0.7;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(a) * radius * 0.4, sy + Math.sin(a) * radius * 0.4);
      ctx.lineTo(sx + Math.cos(a) * radius, sy + Math.sin(a) * radius);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawPlacementGhost(ctx) {
    const { type, size, tx, ty, valid } = this.buildPlacementMode;
    const [sx, sy] = this.camera.worldToScreen(tx * TILE, ty * TILE);
    ctx.globalAlpha = 0.6;
    drawBuilding(ctx, type, FACTIONS[this.playerFaction], this.playerFaction, sx, sy, size * TILE, 1, this.gameTime);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = valid ? '#3ab03a' : '#b03a3a';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, size * TILE, size * TILE);
  }
}
