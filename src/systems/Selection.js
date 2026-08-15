export function findUnitAtPoint(game, wx, wy) {
  let best = null, bestDist = Infinity;
  for (let i = game.units.length - 1; i >= 0; i--) {
    const u = game.units[i];
    if (u.dead) continue;
    const d = Math.hypot(u.x - wx, u.y - wy);
    if (d <= u.radius + 2 && d < bestDist) { best = u; bestDist = d; }
  }
  return best;
}

export function findBuildingAtPoint(game, wx, wy) {
  const TILE = game.tileSize;
  const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
  for (let i = game.buildings.length - 1; i >= 0; i--) {
    const b = game.buildings[i];
    if (b.dead) continue;
    if (tx >= b.tx && tx < b.tx + b.size && ty >= b.ty && ty < b.ty + b.size) return b;
  }
  return null;
}

export function findEntityAtPoint(game, wx, wy) {
  return findUnitAtPoint(game, wx, wy) || findBuildingAtPoint(game, wx, wy);
}

export function findOwnUnitsInBox(game, owner, x0, y0, x1, y1) {
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
  const result = [];
  for (const u of game.units) {
    if (u.dead || u.owner !== owner) continue;
    if (u.x >= minX && u.x <= maxX && u.y >= minY && u.y <= maxY) result.push(u);
  }
  return result;
}
