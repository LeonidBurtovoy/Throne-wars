const TRAVELING_STATES = new Set(['moving', 'attack-move', 'moving-to-gather', 'moving-to-build', 'returning-to-drop']);
function isTraveling(u) { return TRAVELING_STATES.has(u.state); }

// Lightweight pairwise separation so units don't stack on top of each other.
// O(n^2) is fine for the unit counts a browser skirmish like this reaches.
//
// A unit that is currently walking anywhere is never pushed and never pushes
// anyone else — that's what lets two columns pass clean through each other
// on a narrow path instead of shoving to a standstill. Separation only ever
// applies between two units that are both stationary (idle, fighting on the
// spot, gathering, building), so parked crowds still nudge apart instead of
// occupying the exact same pixel forever.
export function separateUnits(units) {
  const n = units.length;
  for (let i = 0; i < n; i++) {
    const a = units[i];
    if (a.dead || isTraveling(a)) continue;
    for (let j = i + 1; j < n; j++) {
      const b = units[j];
      if (b.dead || isTraveling(b)) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const minDist = a.radius + b.radius;
      if (dist > 0 && dist < minDist) {
        const overlap = (minDist - dist) / 2;
        const nx = dx / dist, ny = dy / dist;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b.x += nx * overlap; b.y += ny * overlap;
      } else if (dist === 0) {
        a.x -= 0.5; b.x += 0.5;
      }
    }
  }
}
