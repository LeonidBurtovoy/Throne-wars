import { UNIT_STATS, BUILDING_STATS } from '../data/factions.js';
import { TILE, GATHER } from '../config.js';
import { findPath } from '../map/Pathfinding.js';
import { getArmorBonus, getGatherTimeMultiplier, getCarryCapacityBonus, getHealRangeBonus } from '../data/upgrades.js';

let nextId = 1;

export class Unit {
  constructor(role, owner, faction, worldX, worldY) {
    this.id = nextId++;
    this.kind = 'unit';
    this.role = role;
    this.owner = owner; // 0 = human player, 1 = ai
    this.faction = faction;
    const stats = UNIT_STATS[role];
    this.stats = stats;
    this.x = worldX;
    this.y = worldY;
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.speed = stats.speed;
    this.sight = stats.sight;
    this.armor = stats.armor;
    this.radius = role === 'legend' ? TILE * 0.48 : TILE * 0.27;

    this.selected = false;
    this.dead = false;

    this.state = 'idle'; // idle | moving | attack-move | attacking | healing | gathering | returning-to-drop | building
    this.path = [];
    this.attackCooldown = 0;
    this.attackTarget = null;
    this.healTarget = null; // healer only
    this.moveGoal = null; // {x,y} world - final destination for attack-move re-checks
    this.aggressive = true;

    // gathering
    this.carrying = null; // { type: 'gold'|'wood'|'steel', amount }
    this.gatherTileX = null;
    this.gatherTileY = null;
    this.gatherType = null; // 'gold' | 'wood' | 'steel'
    this.gatherTimer = 0;
    this.dropoffBuilding = null;

    // hauling — physically carrying an intermediate good between two
    // specific buildings (e.g. warehouse -> fletcher, pasture -> stable),
    // a separate loop from gather/dropoff above even though it looks
    // similar, kept independent so it can't destabilize the well-tested
    // gather cycle
    this.haulFromBuilding = null;
    this.haulToBuilding = null;
    this.haulType = null; // 'wood' | 'steel' | 'hay'

    // construction
    this.buildTarget = null;

    this.bobTimer = Math.random() * 10;
    this._repathTimer = 0;
    this.upgrades = null; // set by Game at spawn time: reference to the owning player's upgrade flags
  }

  get tileX() { return Math.floor(this.x / TILE); }
  get tileY() { return Math.floor(this.y / TILE); }
  get centerX() { return this.x; }
  get centerY() { return this.y; }

  takeDamage(amount) {
    const dmg = Math.max(1, amount - (this.armor + getArmorBonus(this)));
    this.hp -= dmg;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.state = 'dead'; }
  }

  moveTo(map, wx, wy, opts = {}) {
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    const path = findPath(map, this.tileX, this.tileY, tx, ty);
    this.path = (path || []).map(([px, py]) => ({ x: px * TILE + TILE / 2, y: py * TILE + TILE / 2 }));
    this.moveGoal = { x: wx, y: wy };
    this.state = opts.attackMove ? 'attack-move' : 'moving';
    this.attackTarget = null;
    if (!opts.keepGather) { this.gatherType = null; this.gatherTileX = null; }
    if (!opts.keepBuild) this.buildTarget = null;
    this._clearHaul();
  }

  stop() {
    this.path = [];
    this.state = 'idle';
    this.attackTarget = null;
    this.moveGoal = null;
    this._clearHaul();
  }

  orderAttack(target) {
    this.attackTarget = target;
    this.path = [];
    this.state = 'attacking';
    this._clearHaul();
  }

  orderGather(map, tx, ty, type) {
    this.gatherType = type;
    this.gatherTileX = tx;
    this.gatherTileY = ty;
    this.carrying = null;
    this._clearHaul();
    const blocking = type === 'gold' || type === 'steel';
    let destX = tx, destY = ty;
    if (blocking) {
      const adj = map.findAdjacentWalkable(tx, ty, this.tileX, this.tileY);
      if (adj) { destX = adj[0]; destY = adj[1]; }
    }
    const path = findPath(map, this.tileX, this.tileY, destX, destY);
    this.path = (path || []).map(([px, py]) => ({ x: px * TILE + TILE / 2, y: py * TILE + TILE / 2 }));
    this.state = 'moving-to-gather';
  }

  orderBuild(map, building) {
    this.buildTarget = building;
    this._clearHaul();
    const targetTile = map.findAdjacentWalkable(building.tx, building.ty, this.tileX, this.tileY) || [building.tx, building.ty];
    const path = findPath(map, this.tileX, this.tileY, targetTile[0], targetTile[1]);
    this.path = (path || []).map(([px, py]) => ({ x: px * TILE + TILE / 2, y: py * TILE + TILE / 2 }));
    this.state = 'moving-to-build';
  }

  // physically carry `type` (wood/steel/hay) from one building to another,
  // looping forever until reassigned — mirrors orderGather/dropoff but
  // between two fixed buildings instead of a resource tile and any dropoff
  orderHaul(map, fromBuilding, toBuilding, type) {
    this.haulFromBuilding = fromBuilding;
    this.haulToBuilding = toBuilding;
    this.haulType = type;
    this.carrying = null;
    this.gatherType = null;
    this.buildTarget = null;
    this._headToHaulSource(map);
  }

  _clearHaul() {
    this.haulFromBuilding = null;
    this.haulToBuilding = null;
    this.haulType = null;
  }

  _headToHaulSource(map) {
    const from = this.haulFromBuilding;
    const target = map.findAdjacentWalkable(from.tx + Math.floor(from.size / 2), from.ty + Math.floor(from.size / 2), this.tileX, this.tileY) || [from.tx, from.ty];
    const path = findPath(map, this.tileX, this.tileY, target[0], target[1]);
    this.path = (path || []).map(([px, py]) => ({ x: px * TILE + TILE / 2, y: py * TILE + TILE / 2 }));
    this.state = 'moving-to-haul-pickup';
  }

  _headToHaulDest(map) {
    const to = this.haulToBuilding;
    const target = map.findAdjacentWalkable(to.tx + Math.floor(to.size / 2), to.ty + Math.floor(to.size / 2), this.tileX, this.tileY) || [to.tx, to.ty];
    const path = findPath(map, this.tileX, this.tileY, target[0], target[1]);
    this.path = (path || []).map(([px, py]) => ({ x: px * TILE + TILE / 2, y: py * TILE + TILE / 2 }));
    this.state = 'hauling-deliver';
  }

  distanceTo(other) {
    return Math.hypot(this.x - other.x, this.y - other.y);
  }

  _followPath(dt) {
    if (this.path.length === 0) return true; // arrived
    const wp = this.path[0];
    const dx = wp.x - this.x, dy = wp.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (dist <= step) {
      this.x = wp.x; this.y = wp.y;
      this.path.shift();
      if (this.path.length === 0) return true;
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
    return false;
  }

  update(dt, game) {
    if (this.dead) return;
    this.bobTimer += dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    switch (this.state) {
      case 'idle':
        if (this.role === 'healer') this._acquireNearbyWounded(game);
        else if (this.aggressive) this._acquireNearbyEnemy(game);
        break;

      case 'moving':
      case 'attack-move': {
        if (this.role === 'healer') {
          if (this._acquireNearbyWounded(game)) break;
        } else if (this.state === 'attack-move' && this._acquireNearbyEnemy(game)) break;
        const arrived = this._followPath(dt);
        if (arrived) this.state = 'idle';
        break;
      }

      case 'attacking':
        this._handleAttacking(dt, game);
        break;

      case 'healing':
        this._handleHealing(dt, game);
        break;

      case 'moving-to-gather': {
        const arrived = this._followPath(dt);
        if (arrived) { this.state = 'gathering'; this.gatherTimer = 0; }
        break;
      }

      case 'gathering':
        this._handleGathering(dt, game);
        break;

      case 'returning-to-drop':
        this._handleReturning(dt, game);
        break;

      case 'moving-to-haul-pickup': {
        const arrived = this._followPath(dt);
        if (arrived) this.state = 'hauling-pickup';
        break;
      }

      case 'hauling-pickup':
        this._handleHaulPickup(dt, game);
        break;

      case 'hauling-deliver': {
        const arrived = this._followPath(dt);
        if (arrived) this._handleHaulDeliver(game);
        break;
      }

      case 'moving-to-build': {
        const arrived = this._followPath(dt);
        if (arrived) this.state = 'building';
        break;
      }

      case 'building':
        this._handleBuilding(dt, game);
        break;
    }
  }

  _acquireNearbyEnemy(game) {
    if (this.role === 'worker' || this.role === 'healer') return false;
    const enemies = game.getEnemiesOf(this.owner);
    let best = null, bestDist = this.sight * TILE;
    for (const e of enemies) {
      if (e.dead || e.hp <= 0) continue;
      const d = Math.hypot(e.centerX - this.x, e.centerY - this.y);
      if (d < bestDist) { best = e; bestDist = d; }
    }
    if (best) { this.attackTarget = best; this.state = 'attacking'; return true; }
    return false;
  }

  // healer-only: scans for the nearest wounded ally (never itself, never an
  // enemy) within heal range and, if found, switches into the 'healing'
  // state — mirrors _acquireNearbyEnemy but heals instead of fights
  _acquireNearbyWounded(game) {
    const range = (this.stats.healRange + getHealRangeBonus(this)) * TILE;
    let best = null, bestDist = range;
    for (const u of game.units) {
      if (u.dead || u === this || u.owner !== this.owner || u.hp >= u.maxHp) continue;
      const d = Math.hypot(u.centerX - this.x, u.centerY - this.y);
      if (d < bestDist) { best = u; bestDist = d; }
    }
    if (best) { this.healTarget = best; this.path = []; this.state = 'healing'; return true; }
    return false;
  }

  _handleHealing(dt, game) {
    const target = this.healTarget;
    if (!target || target.dead || target.hp >= target.maxHp || target.owner !== this.owner) {
      this.healTarget = null;
      this.state = 'idle';
      return;
    }
    const range = (this.stats.healRange + getHealRangeBonus(this)) * TILE;
    const realDist = distanceToEntity(this, target);
    if (realDist > range) {
      this._repathTimer -= dt;
      if (this.path.length === 0 || this._repathTimer <= 0) {
        this._repathTimer = 0.5;
        const t = targetTileOf(target);
        const path = findPath(game.map, this.tileX, this.tileY, t.x, t.y);
        this.path = (path || []).map(([px, py]) => ({ x: px * TILE + TILE / 2, y: py * TILE + TILE / 2 }));
        if (this.path.length === 0) { this.healTarget = null; this.state = 'idle'; return; }
      }
      this._followPath(dt);
      return;
    }
    if (this.attackCooldown <= 0) {
      game.performHeal(this, target);
      this.attackCooldown = this.stats.healCooldown;
    }
  }

  _handleAttacking(dt, game) {
    const target = this.attackTarget;
    if (!target || target.dead || target.hp <= 0) {
      this.attackTarget = null;
      this.state = 'idle';
      return;
    }
    const range = this.stats.attackRange * TILE;
    const realDist = distanceToEntity(this, target);
    if (realDist > range) {
      this._repathTimer -= dt;
      if (this.path.length === 0 || this._repathTimer <= 0) {
        this._repathTimer = 0.5;
        const t = targetTileOf(target);
        const path = findPath(game.map, this.tileX, this.tileY, t.x, t.y);
        this.path = (path || []).map(([px, py]) => ({ x: px * TILE + TILE / 2, y: py * TILE + TILE / 2 }));
        if (this.path.length === 0) { this.attackTarget = null; this.state = 'idle'; return; }
      }
      this._followPath(dt);
      return;
    }
    if (this.attackCooldown <= 0) {
      game.performAttack(this, target);
      this.attackCooldown = this.stats.attackCooldown;
    }
  }

  _handleGathering(dt, game) {
    const map = game.map;
    const cap = (this.stats.carryCapacity || GATHER.carryCapacity) + getCarryCapacityBonus(this);
    if (this.carrying && this.carrying.amount >= cap) {
      this._headToDropoff(game);
      return;
    }
    const remaining = map.getResourceAmount(this.gatherTileX, this.gatherTileY);
    if (remaining <= 0) {
      // find another nearby tile of the same resource type, otherwise idle
      const found = game.findNearbyResourceTile(this.gatherTileX, this.gatherTileY, this.gatherType);
      if (found) { this.orderGather(map, found[0], found[1], this.gatherType); }
      else { this.state = 'idle'; }
      return;
    }
    this.gatherTimer += dt;
    const baseTick = this.gatherType === 'gold' ? GATHER.gatherTimeGold
      : this.gatherType === 'steel' ? GATHER.gatherTimeSteel
      : GATHER.gatherTimeWood;
    const tickTime = baseTick * getGatherTimeMultiplier(this);
    if (this.gatherTimer >= tickTime) {
      this.gatherTimer = 0;
      map.consumeResource(this.gatherTileX, this.gatherTileY, 1);
      if (!this.carrying) this.carrying = { type: this.gatherType, amount: 0 };
      this.carrying.amount += 1;
      if (this.carrying.amount >= cap) this._headToDropoff(game);
    }
  }

  _headToDropoff(game) {
    const drop = game.findNearestDropoff(this);
    if (!drop) { this.state = 'idle'; return; }
    this.dropoffBuilding = drop;
    const target = game.map.findAdjacentWalkable(drop.tx + Math.floor(drop.size / 2), drop.ty + Math.floor(drop.size / 2), this.tileX, this.tileY) || [drop.tx, drop.ty];
    const path = findPath(game.map, this.tileX, this.tileY, target[0], target[1]);
    this.path = (path || []).map(([px, py]) => ({ x: px * TILE + TILE / 2, y: py * TILE + TILE / 2 }));
    this.state = 'returning-to-drop';
  }

  _handleReturning(dt, game) {
    const arrived = this._followPath(dt);
    if (!arrived) return;
    if (this.carrying) {
      game.depositResource(this.owner, this.carrying.type, this.carrying.amount);
      this.carrying = null;
    }
    if (this.gatherTileX !== null && game.map.getResourceAmount(this.gatherTileX, this.gatherTileY) > 0) {
      this.orderGather(game.map, this.gatherTileX, this.gatherTileY, this.gatherType);
    } else if (this.gatherType) {
      const found = game.findNearbyResourceTile(this.gatherTileX ?? this.tileX, this.gatherTileY ?? this.tileY, this.gatherType);
      if (found) this.orderGather(game.map, found[0], found[1], this.gatherType);
      else this.state = 'idle';
    } else {
      this.state = 'idle';
    }
  }

  // waits at the source building, picks up a load once one's available and
  // the destination isn't already backed up, then heads out — a poll
  // instead of a one-shot check so a temporarily empty warehouse/pasture
  // doesn't strand the hauler in 'idle' forever
  _handleHaulPickup(dt, game) {
    const from = this.haulFromBuilding, to = this.haulToBuilding;
    if (!from || from.dead || !to || to.dead) { this.state = 'idle'; this._clearHaul(); return; }
    const destStats = BUILDING_STATS[to.type];
    if ((to.inputStock[this.haulType] || 0) >= destStats.inputCap) return; // destination full, wait
    const cap = (this.stats.carryCapacity || GATHER.carryCapacity) + getCarryCapacityBonus(this);
    let available;
    if (this.haulType === 'hay') {
      available = from.localStock.hay || 0;
    } else {
      available = game.players[this.owner][this.haulType] || 0;
    }
    const amount = Math.min(cap, available, destStats.inputCap - (to.inputStock[this.haulType] || 0));
    if (amount <= 0) return; // source empty, wait
    if (this.haulType === 'hay') from.localStock.hay -= amount;
    else game.players[this.owner][this.haulType] -= amount;
    this.carrying = { type: this.haulType, amount };
    this._headToHaulDest(game.map);
  }

  _handleHaulDeliver(game) {
    const to = this.haulToBuilding;
    if (to && !to.dead && this.carrying) {
      to.inputStock[this.carrying.type] = (to.inputStock[this.carrying.type] || 0) + this.carrying.amount;
    }
    this.carrying = null;
    if (!this.haulFromBuilding || this.haulFromBuilding.dead || !to || to.dead) { this.state = 'idle'; this._clearHaul(); return; }
    this._headToHaulSource(game.map);
  }

  _handleBuilding(dt, game) {
    const b = this.buildTarget;
    if (!b || b.dead) { this.state = 'idle'; this.buildTarget = null; return; }
    if (b.complete) {
      // same orderBuild/moving-to-build/building plumbing as fresh
      // construction, just repairing hp instead of raising buildProgress —
      // reused so a worker sent to an already-finished but damaged building
      // (see Game.handleRightClick) needs no separate state machine
      if (b.hp >= b.maxHp) { this.state = 'idle'; this.buildTarget = null; return; }
      b.repairTick(dt, game);
      return;
    }
    b.addBuildProgress(dt);
    if (b.complete) { this.state = 'idle'; this.buildTarget = null; }
  }
}

function targetTileOf(entity) {
  return { x: Math.floor(entity.x / TILE), y: Math.floor(entity.y / TILE) };
}

export function distanceToEntity(unit, target) {
  if (target.kind === 'building') {
    const cx = Math.min(Math.max(unit.x, target.x), target.x + target.size * TILE);
    const cy = Math.min(Math.max(unit.y, target.y), target.y + target.size * TILE);
    return Math.hypot(unit.x - cx, unit.y - cy);
  }
  return Math.hypot(unit.x - target.x, unit.y - target.y);
}
