// Simple grid A* with 8-directional movement and no corner-cutting.

class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(item, priority) {
    this.items.push({ item, priority });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].priority <= this.items[i].priority) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }
  pop() {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      while (true) {
        let smallest = i;
        const l = i * 2 + 1, r = i * 2 + 2;
        if (l < this.items.length && this.items[l].priority < this.items[smallest].priority) smallest = l;
        if (r < this.items.length && this.items[r].priority < this.items[smallest].priority) smallest = r;
        if (smallest === i) break;
        [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
        i = smallest;
      }
    }
    return top ? top.item : null;
  }
}

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

function octile(dx, dy) {
  dx = Math.abs(dx); dy = Math.abs(dy);
  return dx > dy ? (dx - dy) + dy * Math.SQRT2 : (dy - dx) + dx * Math.SQRT2;
}

// returns array of [tx, ty] tile-coordinate waypoints (excluding start), or null
export function findPath(map, startX, startY, goalX, goalY, maxNodes = 4000) {
  if (!map.inBounds(goalX, goalY)) return null;
  if (map.isBlocked(goalX, goalY)) {
    const adj = map.findAdjacentWalkable(goalX, goalY, startX, startY);
    if (!adj) return null;
    goalX = adj[0]; goalY = adj[1];
  }
  if (startX === goalX && startY === goalY) return [];

  const key = (x, y) => y * map.width + x;
  const open = new MinHeap();
  const gScore = new Map();
  const cameFrom = new Map();
  const closed = new Set();

  gScore.set(key(startX, startY), 0);
  open.push([startX, startY], octile(goalX - startX, goalY - startY));

  let expanded = 0;
  while (open.size > 0) {
    if (++expanded > maxNodes) return null;
    const [cx, cy] = open.pop();
    const ck = key(cx, cy);
    if (closed.has(ck)) continue;
    closed.add(ck);

    if (cx === goalX && cy === goalY) {
      const path = [];
      let cur = ck;
      while (cameFrom.has(cur)) {
        const [px, py] = cameFrom.get(cur);
        path.push([cur % map.width, Math.floor(cur / map.width)]);
        cur = key(px, py);
      }
      path.reverse();
      return path;
    }

    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!map.inBounds(nx, ny)) continue;
      if (map.isBlocked(nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        // forbid cutting across a blocked corner
        if (map.isBlocked(cx + dx, cy) || map.isBlocked(cx, cy + dy)) continue;
      }
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const tentative = gScore.get(ck) + cost;
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, tentative);
        cameFrom.set(nk, [cx, cy]);
        open.push([nx, ny], tentative + octile(goalX - nx, goalY - ny));
      }
    }
  }
  return null;
}
