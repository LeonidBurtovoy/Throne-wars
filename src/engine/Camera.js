export class Camera {
  constructor(viewportWidth, viewportHeight, worldWidth, worldHeight) {
    this.x = 0;
    this.y = 0;
    this.width = viewportWidth;
    this.height = viewportHeight;
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
  }

  clamp() {
    this.x = Math.max(0, Math.min(this.worldWidth - this.width, this.x));
    this.y = Math.max(0, Math.min(this.worldHeight - this.height, this.y));
    if (this.worldWidth < this.width) this.x = (this.worldWidth - this.width) / 2;
    if (this.worldHeight < this.height) this.y = (this.worldHeight - this.height) / 2;
  }

  move(dx, dy) {
    this.x += dx; this.y += dy;
    this.clamp();
  }

  centerOn(wx, wy) {
    this.x = wx - this.width / 2;
    this.y = wy - this.height / 2;
    this.clamp();
  }

  worldToScreen(wx, wy) { return [wx - this.x, wy - this.y]; }
  screenToWorld(sx, sy) { return [sx + this.x, sy + this.y]; }
}
