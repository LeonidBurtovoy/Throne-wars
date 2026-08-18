import { BUILDING_STATS, UNIT_STATS } from '../data/factions.js';
import { TILE } from '../config.js';
import { getArmorBonus } from '../data/upgrades.js';

let nextId = 1;

export class Building {
  constructor(type, owner, faction, tx, ty, opts = {}) {
    this.id = nextId++;
    this.kind = 'building';
    this.type = type;
    this.owner = owner;
    this.faction = faction;
    this.stats = BUILDING_STATS[type];
    this.tx = tx;
    this.ty = ty;
    this.size = this.stats.size;
    this.x = tx * TILE;
    this.y = ty * TILE;
    this.maxHp = this.stats.hp;
    this.sight = this.stats.sight;
    this.armor = this.stats.armor || 0;

    this.complete = !!opts.instant;
    this.buildProgress = opts.instant ? 1 : 0.05;
    this.hp = opts.instant ? this.maxHp : Math.max(1, Math.floor(this.maxHp * this.buildProgress));

    this.trainQueue = [];
    // production chain state — harmless/unused fields for buildings that
    // don't produce anything (see BUILDING_STATS.haulInput/producesLocal)
    this.inputStock = {}; // filled by hauling workers, e.g. { wood: 8 } on a fletcher
    this.localStock = {}; // grown in place, e.g. { hay: 5 } on a pasture
    this._prodTimer = 0;
    this._growTimer = 0;
    const cx = tx * TILE + (this.size * TILE) / 2;
    const cy = ty * TILE + (this.size * TILE) / 2;
    this.rallyPoint = { x: cx, y: cy + this.size * TILE };

    this.dead = false;
    this.attackCooldown = 0;
    this.attackTarget = null;
    this.upgrades = null; // set by Game: reference to the owning player's upgrade flags
    this.researching = null; // { key, timeLeft, totalTime }
  }

  get centerX() { return this.x + (this.size * TILE) / 2; }
  get centerY() { return this.y + (this.size * TILE) / 2; }

  addBuildProgress(dt) {
    if (this.complete) return;
    this.buildProgress = Math.min(1, this.buildProgress + dt / this.stats.buildTime);
    this.hp = Math.max(1, Math.floor(this.maxHp * this.buildProgress));
    if (this.buildProgress >= 1) { this.complete = true; this.hp = this.maxHp; }
  }

  // a worker sent to a complete-but-damaged building (see
  // Unit._handleBuilding and Game.handleRightClick) restores hp over time
  // at the same pace as original construction, spending a fraction of the
  // building's original build cost proportional to the hp actually restored
  // (a full repair costs half the original cost) — if the owner can't
  // afford this tick's share, repair just stalls instead of going into debt
  repairTick(dt, game) {
    if (!this.complete || this.hp >= this.maxHp) return false;
    const rate = this.maxHp / this.stats.buildTime;
    const healAmount = Math.min(rate * dt, this.maxHp - this.hp);
    const frac = healAmount / this.maxHp;
    const goldCost = this.stats.cost.gold * 0.5 * frac;
    const woodCost = this.stats.cost.wood * 0.5 * frac;
    const player = game.players[this.owner];
    if (player.gold < goldCost || player.wood < woodCost) return false;
    player.gold -= goldCost;
    player.wood -= woodCost;
    this.hp = Math.min(this.maxHp, this.hp + healAmount);
    return true;
  }

  takeDamage(amount) {
    const dmg = Math.max(1, amount - (this.armor + getArmorBonus(this)));
    this.hp -= dmg;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  }

  queueUnit(role) {
    const stats = UNIT_STATS[role];
    this.trainQueue.push({ role, timeLeft: stats.buildTime, totalTime: stats.buildTime });
  }

  // converts a batch of hauled-in resource (inputStock[haulInput]) into one
  // unit of the equipment/animal it produces, at a steady pace — mirrors
  // trainQueue's timeLeft-countdown shape but keyed off available input
  // instead of a fixed queue, since haulers deliver on their own schedule
  _productionTick(dt, game) {
    const stats = this.stats;
    if ((this.inputStock[stats.haulInput] || 0) < stats.inputPerUnit) { this._prodTimer = 0; return; }
    this._prodTimer += dt;
    if (this._prodTimer < stats.productionTime) return;
    this._prodTimer = 0;
    this.inputStock[stats.haulInput] -= stats.inputPerUnit;
    game.players[this.owner][stats.produces] += 1;
  }

  // passive local growth (pasture's hay) — no hauling involved on this end,
  // just a capped stockpile that grows on its own for workers to collect
  _localGrowTick(dt) {
    const stats = this.stats;
    const cur = this.localStock[stats.producesLocal] || 0;
    if (cur >= stats.localCap) { this._growTimer = 0; return; }
    this._growTimer += dt;
    if (this._growTimer < stats.localGrowTime) return;
    this._growTimer = 0;
    this.localStock[stats.producesLocal] = Math.min(stats.localCap, cur + 1);
  }

  update(dt, game) {
    if (this.dead) return;

    if (this.complete && this.stats.haulInput) this._productionTick(dt, game);
    if (this.complete && this.stats.producesLocal) this._localGrowTick(dt);

    if (this.complete && this.trainQueue.length > 0) {
      const job = this.trainQueue[0];
      job.timeLeft -= dt;
      if (job.timeLeft <= 0) {
        this.trainQueue.shift();
        game.spawnUnitFromBuilding(this, job.role);
      }
    }

    if (this.complete && this.researching) {
      this.researching.timeLeft -= dt;
      if (this.researching.timeLeft <= 0) {
        game.completeResearch(this.owner, this.researching.key);
        this.researching = null;
      }
    }

    if (this.complete && this.stats.attack) {
      if (this.attackCooldown > 0) this.attackCooldown -= dt;
      if (!this.attackTarget || this.attackTarget.dead || this.attackTarget.hp <= 0) {
        this.attackTarget = game.findNearestEnemyInRange(this, this.stats.attackRange * TILE);
      }
      if (this.attackTarget && this.attackCooldown <= 0) {
        const dist = Math.hypot(this.attackTarget.centerX - this.centerX, this.attackTarget.centerY - this.centerY);
        if (dist <= this.stats.attackRange * TILE) {
          game.performAttack(this, this.attackTarget, { fromX: this.centerX, fromY: this.centerY });
          this.attackCooldown = this.stats.attackCooldown;
        }
      }
    }
  }
}
