import { FOG } from '../config.js';

export class FogOfWar {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.state = new Uint8Array(width * height); // FOG.UNSEEN by default
  }

  get(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return FOG.UNSEEN;
    return this.state[ty * this.width + tx];
  }

  isVisible(tx, ty) { return this.get(tx, ty) === FOG.VISIBLE; }
  isExplored(tx, ty) { return this.get(tx, ty) >= FOG.EXPLORED; }

  // recompute from a list of {tx, ty, radius} vision sources belonging to the viewing player
  recompute(sources) {
    for (let i = 0; i < this.state.length; i++) {
      if (this.state[i] === FOG.VISIBLE) this.state[i] = FOG.EXPLORED;
    }
    for (const { tx, ty, radius } of sources) {
      const r = Math.ceil(radius);
      const r2 = radius * radius;
      for (let dy = -r; dy <= r; dy++) {
        const y = ty + dy;
        if (y < 0 || y >= this.height) continue;
        for (let dx = -r; dx <= r; dx++) {
          const x = tx + dx;
          if (x < 0 || x >= this.width) continue;
          if (dx * dx + dy * dy <= r2) this.state[y * this.width + x] = FOG.VISIBLE;
        }
      }
    }
  }
}
