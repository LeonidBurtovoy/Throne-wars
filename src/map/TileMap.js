import { TILE_TYPE, BLOCKING_TILES, GATHER } from '../config.js';

export class TileMap {
  constructor(width, height, tiles) {
    this.width = width;
    this.height = height;
    this.tiles = tiles; // Uint8Array length width*height
    this.resourceAmount = new Map(); // "x,y" -> remaining amount (forest/gold)
    this.buildingOccupancy = new Set(); // "x,y" occupied by a building footprint

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = this.tiles[y * width + x];
        if (t === TILE_TYPE.FOREST) this.resourceAmount.set(`${x},${y}`, GATHER.woodNodeAmount);
        else if (t === TILE_TYPE.GOLD) this.resourceAmount.set(`${x},${y}`, GATHER.goldNodeAmount);
        else if (t === TILE_TYPE.STEEL) this.resourceAmount.set(`${x},${y}`, GATHER.steelNodeAmount);
      }
    }
  }

  inBounds(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  getTile(tx, ty) {
    if (!this.inBounds(tx, ty)) return TILE_TYPE.ROCK;
    return this.tiles[ty * this.width + tx];
  }

  setTile(tx, ty, type) {
    if (!this.inBounds(tx, ty)) return;
    this.tiles[ty * this.width + tx] = type;
  }

  isBlocked(tx, ty) {
    if (!this.inBounds(tx, ty)) return true;
    if (this.buildingOccupancy.has(`${tx},${ty}`)) return true;
    return BLOCKING_TILES.has(this.getTile(tx, ty));
  }

  occupy(tx, ty, size) {
    for (let y = ty; y < ty + size; y++)
      for (let x = tx; x < tx + size; x++)
        this.buildingOccupancy.add(`${x},${y}`);
  }

  vacate(tx, ty, size) {
    for (let y = ty; y < ty + size; y++)
      for (let x = tx; x < tx + size; x++)
        this.buildingOccupancy.delete(`${x},${y}`);
  }

  canPlaceBuilding(tx, ty, size) {
    for (let y = ty; y < ty + size; y++) {
      for (let x = tx; x < tx + size; x++) {
        if (!this.inBounds(x, y)) return false;
        if (this.buildingOccupancy.has(`${x},${y}`)) return false;
        if (BLOCKING_TILES.has(this.getTile(x, y))) return false;
      }
    }
    return true;
  }

  getResourceAmount(tx, ty) {
    return this.resourceAmount.get(`${tx},${ty}`) || 0;
  }

  consumeResource(tx, ty, amount) {
    const key = `${tx},${ty}`;
    const remaining = (this.resourceAmount.get(key) || 0) - amount;
    if (remaining <= 0) {
      this.resourceAmount.delete(key);
      const type = this.getTile(tx, ty);
      if (type === TILE_TYPE.FOREST) this.setTile(tx, ty, TILE_TYPE.GRASS);
      return 0;
    }
    this.resourceAmount.set(key, remaining);
    return remaining;
  }

  // nearest walkable tile adjacent to a (possibly blocking) target tile
  findAdjacentWalkable(tx, ty, fromX, fromY) {
    const candidates = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = tx + dx, ny = ty + dy;
        if (this.inBounds(nx, ny) && !this.isBlocked(nx, ny)) candidates.push([nx, ny]);
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      const da = (a[0] - fromX) ** 2 + (a[1] - fromY) ** 2;
      const db = (b[0] - fromX) ** 2 + (b[1] - fromY) ** 2;
      return da - db;
    });
    return candidates[0];
  }
}
