import { canAfford, hasFoodRoom } from './Economy.js';
import { BUILDING_STATS, UNIT_STATS } from '../data/factions.js';
import { TILE } from '../config.js';
import { upgradesForBuilding } from '../data/upgrades.js';

const DECISION_INTERVAL = 1.5; // was 2.5 — react and build faster
const UNDER_ATTACK_WINDOW = 9; // seconds a hit on our stuff still counts as "recent"

const MAX_WORKERS = 18; // was 14 — bigger maps and more buildings need a bigger economy to actually staff them
const PRODUCTION_SCALING = [
  { type: 'barracks', workersNeeded: 8 },
  { type: 'archery', workersNeeded: 10 },
  { type: 'stable', workersNeeded: 12 },
];
// trainer building -> the equipment-source building it depends on, so the
// AI raises the source once it has a reason to (see step 3c below)
const SUPPORT_PAIRS = [
  ['archery', 'fletcher'],
  ['barracks', 'armory'],
  ['stable', 'pasture'],
];

export class AIController {
  constructor(owner) {
    this.owner = owner;
    this.timer = 0;
    this.waveThreshold = 6;
    this.buildOrder = ['barracks', 'archery', 'stable'];
  }

  // the worker target climbs over the course of the match instead of
  // plateauing, so a longer game keeps snowballing into a bigger economy
  // and, in turn, unlocks the second round of production buildings below.
  // Ramps a bit faster than before (every 50s instead of every 60s) and
  // caps higher (18 vs 14), but keeps the same base of 6 — pushing the
  // early-game target too high starves gold (worker training is pure
  // gold, no wood) at exactly the moment barracks/archery need it too.
  _targetWorkers(game) {
    return Math.min(MAX_WORKERS, 6 + Math.floor(game.gameTime / 50));
  }

  update(dt, game) {
    this.timer += dt;
    if (this.timer < DECISION_INTERVAL) return;
    this.timer = 0;
    this._tick(game);
  }

  _tick(game) {
    const player = game.players[this.owner];
    const base = game.getMainTownHall(this.owner);
    if (!base) return;

    const own = game.units.filter((u) => !u.dead && u.owner === this.owner);
    const workers = own.filter((u) => u.role === 'worker');
    const military = own.filter((u) => u.role !== 'worker');
    const buildings = game.buildings.filter((b) => !b.dead && b.owner === this.owner);

    // 0. reclaim idle workers — a worker goes idle once whatever it was
    // building completes and otherwise just stands there forever, so
    // without this the economy quietly bleeds workers into doing nothing
    // every time the AI puts one up a building
    for (const w of workers) {
      if (w.state !== 'idle') continue;
      const pick = game.pickGatherAssignment(this.owner, w.tileX, w.tileY);
      if (pick) w.orderGather(game.map, pick.tile[0], pick.tile[1], pick.type);
    }

    // 1. keep training workers — the target itself grows with game time
    const targetWorkers = this._targetWorkers(game);
    if (workers.length < targetWorkers && base.trainQueue.length < 2) {
      game.trainUnit(base, 'worker');
    }

    // 1c. keep exactly one dedicated hauler per equipment-producing building
    // so fletcher/armory/stable never permanently starve of input and the
    // equip-gate above doesn't stall the AI's whole military production
    if (workers.length >= 6) this._maintainHaulers(game, buildings, workers);

    // 1b. rare Valyrian steel is needed for every upgrade — once the
    // economy can spare a pair of hands, keep exactly one worker mining it
    // instead of leaving research permanently stalled on a missing resource
    if (workers.length >= 5) {
      const steelWorkers = workers.filter((w) => w.gatherType === 'steel').length;
      if (steelWorkers === 0) {
        const steelTile = game.findNearbyResourceTile(base.tx, base.ty, 'steel');
        if (steelTile) {
          const candidate = workers.find((w) => w.gatherType === 'gold' && w.state === 'gathering');
          if (candidate) candidate.orderGather(game.map, steelTile[0], steelTile[1], 'steel');
        }
      }
    }

    // 1d. a fletcher taxes wood continuously (unlike the one-time building
    // costs the default 3:1 gold bias was tuned around) — once it exists,
    // keep a few more workers on wood so it doesn't starve every other
    // wood-costed building (farms, a stable) indefinitely
    if (buildings.some((b) => b.type === 'fletcher' && b.complete)) {
      const woodWorkers = workers.filter((w) => w.gatherType === 'wood').length;
      if (woodWorkers < 4) {
        const candidate = workers.find((w) => w.gatherType === 'gold' && w.state === 'gathering');
        const woodTile = candidate && game.findNearbyResourceTile(base.tx, base.ty, 'wood');
        if (woodTile) candidate.orderGather(game.map, woodTile[0], woodTile[1], 'wood');
      }
    }

    // 2. food safety net
    const buildingFarm = buildings.some((b) => b.type === 'farm' && !b.complete);
    if (player.foodCap - player.foodUsed <= 2 && !buildingFarm) {
      this._tryBuild(game, 'farm');
    }

    // 3. build order progression (one military building type at a time)
    for (const type of this.buildOrder) {
      const has = buildings.some((b) => b.type === type);
      if (!has) { this._tryBuild(game, type); break; }
    }

    // 3b. once the economy can support it, double up production buildings
    // one at a time (more parallel training = a real, growing army instead
    // of a single barracks trickle), then raise a defensive tower
    for (const { type, workersNeeded } of PRODUCTION_SCALING) {
      if (workers.length < workersNeeded) continue;
      const count = buildings.filter((b) => b.type === type).length;
      if (count > 0 && count < 2) { this._tryBuild(game, type); break; }
    }
    if (workers.length >= 9 && !buildings.some((b) => b.type === 'tower')) {
      this._tryBuild(game, 'tower');
    }
    // tech buildings — no unit training, just deeper weapon/economy research
    if (workers.length >= 7 && !buildings.some((b) => b.type === 'forge')) {
      this._tryBuild(game, 'forge');
    } else if (workers.length >= 9 && !buildings.some((b) => b.type === 'workshop')) {
      this._tryBuild(game, 'workshop');
    } else if (workers.length >= 8 && !buildings.some((b) => b.type === 'temple')) {
      this._tryBuild(game, 'temple');
    } else if (workers.length >= 10 && !buildings.some((b) => b.type === 'market')) {
      this._tryBuild(game, 'market');
    }

    // 3c. equipment-source buildings — once the trainer building that needs
    // the equipment exists, raise its supply building too, otherwise the
    // equip-gate (see Game.trainUnit) would permanently block that role
    for (const [trainerType, supportType] of SUPPORT_PAIRS) {
      const hasTrainer = buildings.some((b) => b.type === trainerType && b.complete);
      const hasSupport = buildings.some((b) => b.type === supportType);
      if (hasTrainer && !hasSupport) { this._tryBuild(game, supportType); break; }
    }

    // 4. train military — within a building that offers more than one role
    // (the stable trains both cavalry and siege), fill in whichever role
    // we currently have the least of instead of always the first option.
    // The townhall is skipped here: it "trains" workers too, but that's
    // already handled by the population-capped step 1 above — without this
    // exclusion the townhall got queued a second, uncapped time here.
    for (const b of buildings) {
      if (b.type === 'townhall' || !b.complete || b.trainQueue.length >= 2) continue;
      const trains = BUILDING_STATS[b.type].trains;
      if (!trains) continue;
      // prefer whichever role we have fewest of, but only among roles we can
      // actually afford right now — otherwise the least-count pick gets
      // permanently stuck reaching for an expensive unit (champion/legend)
      // the instant it has 1+ of the cheaper option, silently failing every
      // tick forever instead of continuing to train what it can afford
      const affordable = trains.filter((r) => {
        const s = UNIT_STATS[r];
        if (s.maxCount && game.countOwned(b.owner, r) >= s.maxCount) return false;
        if (s.equip && (player[s.equip] || 0) < 1) return false;
        return canAfford(player, s.cost) && hasFoodRoom(player, s.food);
      });
      const pool = affordable.length > 0 ? affordable : trains;
      const role = pool.length === 1
        ? pool[0]
        : pool.reduce((best, r) => (own.filter((u) => u.role === r).length < own.filter((u) => u.role === best).length ? r : best), pool[0]);
      game.trainUnit(b, role);
    }

    // 5. once the economy is running, spend spare resources on research
    if (workers.length >= 4 && player.gold > 180) {
      for (const b of buildings) {
        if (!b.complete || b.researching) continue;
        const options = upgradesForBuilding(b.type).filter(([key]) => !player.upgrades[key]);
        if (options.length === 0) continue;
        const [key] = options[Math.floor(Math.random() * options.length)];
        if (game.startResearch(b, key)) break;
      }
    }

    // 5b. lopsided economy? use the market to even it out instead of sitting
    // on a pile of one resource while starved of the other
    const market = buildings.find((b) => b.type === 'market' && b.complete);
    if (market) {
      if (player.gold > 300 && player.wood < 60) game.tradeResources(market, 'gold');
      else if (player.wood > 300 && player.gold < 60) game.tradeResources(market, 'wood');
    }

    // 6. defend home — anything idle or still marching to a stale objective
    // gets recalled toward whichever of our buildings was hit recently
    const underAttack = buildings.filter((b) => game.gameTime - (b.lastDamageAt ?? -999) < UNDER_ATTACK_WINDOW);
    if (underAttack.length > 0) {
      const rally = underAttack[0];
      for (const u of military) {
        if (u.state === 'idle' || u.state === 'attack-move') {
          u.moveTo(game.map, rally.centerX, rally.centerY, { attackMove: true });
        }
      }
    }

    // 7. pick the weakest/closest living rival and strike — either once a
    // full wave has amassed, or opportunistically when we clearly
    // outnumber them, so free-for-alls don't just stall out waiting
    const targetOwner = pickTargetOwner(game, this.owner);
    if (targetOwner != null) {
      const idleMilitary = military.filter((u) => u.state === 'idle');
      const targetMilitary = game.units.filter((u) => !u.dead && u.owner === targetOwner && u.role !== 'worker').length;
      const readyForWave = idleMilitary.length >= this.waveThreshold;
      const opportunistic = idleMilitary.length >= 4 && idleMilitary.length > targetMilitary * 1.5;
      if ((readyForWave || opportunistic) && idleMilitary.length > 0) {
        const targetBuilding = game.getMainTownHall(targetOwner) || game.getAnyBuildingOfOwner(targetOwner);
        if (targetBuilding) {
          for (const u of idleMilitary) {
            const jitterX = (Math.random() - 0.5) * TILE * 4;
            const jitterY = (Math.random() - 0.5) * TILE * 4;
            u.moveTo(game.map, targetBuilding.centerX + jitterX, targetBuilding.centerY + jitterY, { attackMove: true });
          }
          this.waveThreshold += 3;
        }
      }
    }
  }

  // one steady hauler per production building — picks an idle or currently-
  // gathering worker (gathering is the least disruptive job to interrupt;
  // there are usually several) rather than pulling one off a build site
  _maintainHaulers(game, buildings, workers) {
    const haulTargets = buildings.filter((b) => b.complete && BUILDING_STATS[b.type].haulInput);
    for (const b of haulTargets) {
      const HAUL_STATES = new Set(['moving-to-haul-pickup', 'hauling-pickup', 'hauling-deliver']);
      const already = workers.some((w) => w.haulToBuilding === b && HAUL_STATES.has(w.state));
      if (already) continue;
      const candidate = workers.find((w) => w.state === 'gathering' || w.state === 'idle');
      if (!candidate) continue;
      game.applyHaulCommand(this.owner, [candidate.id], b.id);
    }
  }

  _tryBuild(game, type) {
    const player = game.players[this.owner];
    const cost = BUILDING_STATS[type].cost;
    if (!canAfford(player, cost)) return false;
    const base = game.getMainTownHall(this.owner);
    if (!base) return false;
    const size = BUILDING_STATS[type].size;
    const spot = findBuildSpot(game, base.tx, base.ty, size);
    if (!spot) return false;
    const building = game.startBuildingConstruction(this.owner, type, spot[0], spot[1]);
    if (building) game.assignWorkerToBuild(this.owner, building);
    return !!building;
  }
}

// Among all still-living rivals (which, with more than one AI, includes the
// other bots — nobody is allied), prefer whoever has the smallest army,
// breaking ties toward whoever is closer. This gives multi-opponent games
// some emergent dynamics: bots will happily pile onto whoever looks weakest.
function pickTargetOwner(game, selfOwner) {
  const selfBase = game.getMainTownHall(selfOwner);
  let best = null;
  let bestScore = Infinity;
  for (const owner of game.allOwners) {
    if (owner === selfOwner) continue;
    const alive = game.buildings.some((b) => !b.dead && b.owner === owner) || game.units.some((u) => !u.dead && u.owner === owner);
    if (!alive) continue;
    const militaryCount = game.units.filter((u) => !u.dead && u.owner === owner && u.role !== 'worker').length;
    const enemyBase = game.getMainTownHall(owner) || game.getAnyBuildingOfOwner(owner);
    const dist = enemyBase && selfBase ? Math.hypot(enemyBase.centerX - selfBase.centerX, enemyBase.centerY - selfBase.centerY) : 5000;
    const score = militaryCount * 400 + dist * 0.15;
    if (score < bestScore) { bestScore = score; best = owner; }
  }
  return best;
}

function findBuildSpot(game, baseTx, baseTy, size) {
  const map = game.map;
  for (let radius = 2; radius <= 14; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const tx = baseTx + dx, ty = baseTy + dy;
        if (map.canPlaceBuilding(tx, ty, size)) return [tx, ty];
      }
    }
  }
  return null;
}
