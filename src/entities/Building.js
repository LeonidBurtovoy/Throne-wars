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

  takeDamage(amount) {
    const dmg = Math.max(1, amount - (this.armor + getArmorBonus(this)));
    this.hp -= dmg;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  }

  queueUnit(role) {
    const stats = UNIT_STATS[role];
    this.trainQueue.push({ role, timeLeft: stats.buildTime, totalTime: stats.buildTime });
  }

  update(dt, game) {
    if (this.dead) return;

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
