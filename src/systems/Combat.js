import { Projectile } from '../entities/Projectile.js';
import { getAttackBonus, getHealAmountBonus } from '../data/upgrades.js';

export function performAttack(game, attacker, target, opts = {}) {
  const stats = attacker.stats;
  const fromX = opts.fromX ?? attacker.x;
  const fromY = opts.fromY ?? attacker.y;
  const damage = stats.attack + getAttackBonus(attacker);

  if (stats.projectileSpeed) {
    const proj = new Projectile(
      attacker.owner, fromX, fromY, target,
      damage, stats.projectileSpeed, stats.splashRadius || 0, attacker.faction
    );
    game.projectiles.push(proj);
  } else {
    applyDamageTo(game, target, damage, attacker.owner);
  }
}

export function performHeal(game, healer, target) {
  const amount = healer.stats.healAmount + getHealAmountBonus(healer);
  target.hp = Math.min(target.maxHp, target.hp + amount);
  game.spawnHealEffect(target.centerX, target.centerY);
}

export function applyDamageTo(game, target, rawDamage, attackerOwner) {
  target.takeDamage(rawDamage);
  target.lastDamageAt = game.gameTime;
  if (attackerOwner !== undefined) target.lastAttackerOwner = attackerOwner;
  // single funnel point for every kind of hit (melee, projectile, splash) —
  // one spot to trigger the on-screen impact burst instead of duplicating
  // this at every attack call site
  game.spawnImpactEffect(target.centerX, target.centerY);
}

export function dealSplashDamage(game, owner, x, y, radius, damage) {
  const targets = getEnemiesOf(game, owner);
  for (const t of targets) {
    const d = Math.hypot(t.centerX - x, t.centerY - y);
    if (d <= radius) applyDamageTo(game, t, damage, owner);
  }
}

export function getUnitsAndBuildingsForOwner(game, owner) {
  const list = [];
  for (const u of game.units) if (u.owner === owner && !u.dead) list.push(u);
  for (const b of game.buildings) if (b.owner === owner && !b.dead) list.push(b);
  return list;
}

// Every unit/building belonging to any owner other than `owner` — with more
// than two players this is the "who can I fight" set, since there are no
// alliances: everyone not on your side is fair game.
export function getEnemiesOf(game, owner) {
  const list = [];
  for (const u of game.units) if (u.owner !== owner && !u.dead) list.push(u);
  for (const b of game.buildings) if (b.owner !== owner && !b.dead) list.push(b);
  return list;
}

export function findNearestEnemyInRange(game, entity, range) {
  const candidates = getEnemiesOf(game, entity.owner);
  let best = null, bestDist = range;
  const ex = entity.centerX, ey = entity.centerY;
  for (const c of candidates) {
    const d = Math.hypot(c.centerX - ex, c.centerY - ey);
    if (d <= bestDist) { best = c; bestDist = d; }
  }
  return best;
}
