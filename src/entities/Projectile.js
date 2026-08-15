let nextId = 1;

export class Projectile {
  constructor(owner, x, y, target, damage, speed, splashRadius = 0, faction) {
    this.id = nextId++;
    this.owner = owner;
    this.x = x;
    this.y = y;
    this.target = target;
    this.damage = damage;
    this.speed = speed;
    this.splashRadius = splashRadius;
    this.faction = faction;
    this.dead = false;
    // snapshot last known position in case the target dies mid-flight
    this.lastKnownX = target.centerX;
    this.lastKnownY = target.centerY;
  }

  update(dt, game) {
    if (this.dead) return;
    let tx = this.lastKnownX, ty = this.lastKnownY;
    if (this.target && !this.target.dead && this.target.hp > 0) {
      tx = this.target.centerX; ty = this.target.centerY;
      this.lastKnownX = tx; this.lastKnownY = ty;
    }
    const dx = tx - this.x, dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (dist <= step) {
      this._impact(game, tx, ty);
      this.dead = true;
      return;
    }
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
  }

  _impact(game, x, y) {
    if (this.splashRadius > 0) {
      game.dealSplashDamage(this.owner, x, y, this.splashRadius, this.damage);
    } else if (this.target && !this.target.dead && this.target.hp > 0) {
      game.applyDamageTo(this.target, this.damage, this.owner);
    }
  }
}
