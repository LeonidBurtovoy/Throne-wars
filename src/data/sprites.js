// Procedural pixel-art rendering — every sprite is drawn live with canvas
// primitives (rects/arcs/strokes) each frame, driven by the unit's state,
// so walking, swinging and working read as actual animation rather than a
// single static bitmap. Nothing here is a copy of any existing game's art.

const FIXED = {
  skin: '#d9b382',
  metal: '#c3c6cf',
  metalDark: '#71717c',
  wood: '#6b4a2a',
  woodLight: '#8a6238',
  outline: '#14100a',
  horse: '#5a3a20',
  horseDark: '#3e2716',
  horseLight: '#75512f',
  leather: '#5a4630',
  string: '#e8dfc8',
};

const TRAVELING_STATES = new Set(['moving', 'attack-move', 'moving-to-gather', 'moving-to-build', 'returning-to-drop']);
const WORKING_STATES = new Set(['gathering', 'building']);

function unitAnim(u) {
  const moving = TRAVELING_STATES.has(u.state);
  const working = WORKING_STATES.has(u.state);
  const walkPhase = moving ? (u.bobTimer * 3.6) % 1 : (u.bobTimer * 0.5) % 1;
  const workPhase = working ? (u.bobTimer * 2.6) % 1 : 0;

  let attackT = null;
  if (u.state === 'attacking' && u.attackCooldown > 0 && u.stats.attackCooldown > 0) {
    const elapsed = u.stats.attackCooldown - u.attackCooldown;
    const swingDur = Math.min(0.4, u.stats.attackCooldown * 0.55);
    if (elapsed >= 0 && elapsed < swingDur) attackT = elapsed / swingDur;
  }
  return { moving, working, walkPhase, workPhase, attackT };
}

// ---------------- shared primitive helpers (local space: -10..10, y-down, feet ~ +9) ----------------

function withUnit(ctx, sx, sy, drawSize, fn) {
  ctx.save();
  ctx.translate(sx, sy);
  const s = drawSize / 20;
  ctx.scale(s, s);
  fn(ctx);
  ctx.restore();
}

function legPair(ctx, hipY, footY, spread, phase, color, width = 2.4) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const swing = Math.sin(phase * Math.PI * 2 + (i === 0 ? 0 : Math.PI)) * spread;
    ctx.beginPath();
    ctx.moveTo(side * 1.6, hipY);
    ctx.lineTo(side * 1.6 + swing, footY);
    ctx.stroke();
  }
}

function head(ctx, cy, r, skinColor) {
  ctx.fillStyle = skinColor;
  ctx.beginPath(); ctx.arc(0, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.5; ctx.stroke();
  ctx.fillStyle = FIXED.outline;
  ctx.beginPath(); ctx.arc(1.1, cy - 0.2, 0.5, 0, Math.PI * 2); ctx.fill();
}

function outlineRect(ctx, x, y, w, h, color = 'rgba(0,0,0,0.32)') {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(x, y, w, h);
}

// ---------------- unit role drawers ----------------

function drawWorker(ctx, faction, anim) {
  const { walkPhase, workPhase, working } = anim;
  legPair(ctx, 3.2, 8.6, 2, walkPhase, '#3a3226');
  ctx.fillStyle = faction.colorSecondary;
  ctx.fillRect(-3, -1.5, 6, 6.5);
  ctx.fillStyle = faction.colorPrimary;
  ctx.fillRect(-3, -1.5, 6, 2.6);
  outlineRect(ctx, -3, -1.5, 6, 6.5);
  ctx.fillStyle = FIXED.wood;
  ctx.fillRect(-3.3, 3, 1.8, 2.4); // small satchel on the hip
  ctx.strokeStyle = '#241a10'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(-3, 1.6); ctx.lineTo(3, 1.6); ctx.stroke(); // belt line
  head(ctx, -5.5, 2.6, FIXED.skin);
  ctx.fillStyle = faction.colorPrimary;
  ctx.beginPath(); ctx.arc(0, -6.8, 2.3, Math.PI, 0); ctx.fill();

  const toolSwing = working ? Math.sin(workPhase * Math.PI * 2) * 0.9 : 0.15;
  ctx.save();
  ctx.translate(3.2, -0.5);
  ctx.rotate(0.7 + toolSwing);
  ctx.strokeStyle = FIXED.wood; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(5.2, -1.5); ctx.stroke();
  ctx.fillStyle = FIXED.metalDark;
  ctx.fillRect(4.6, -2.6, 2.2, 1.6);
  ctx.restore();
}

function drawMelee(ctx, faction, anim) {
  const { walkPhase, attackT } = anim;
  const sway = Math.sin(walkPhase * Math.PI * 2) * 1.1;
  ctx.fillStyle = 'rgba(20,16,10,0.55)';
  ctx.beginPath();
  ctx.moveTo(-2.6, -1.6); ctx.lineTo(-4.6 + sway, 6.4); ctx.lineTo(2.6, 5.6); ctx.lineTo(2.2, -1.8);
  ctx.closePath(); ctx.fill(); // cloak
  legPair(ctx, 3, 8.8, 2.1, walkPhase, '#2a2620', 2.8);
  ctx.fillStyle = faction.colorPrimary;
  ctx.fillRect(-3.6, -2, 7.2, 7);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(-3.6, -2, 7.2, 2);
  outlineRect(ctx, -3.6, -2, 7.2, 7);
  ctx.fillStyle = FIXED.metalDark;
  ctx.fillRect(-3.9, -1, 1.6, 5.5);
  ctx.fillStyle = faction.colorSecondary;
  ctx.beginPath(); ctx.arc(-4.4, 1.8, 1.9, 0, Math.PI * 2); ctx.fill(); // round shield on the off hand
  ctx.strokeStyle = FIXED.metalDark; ctx.lineWidth = 0.5; ctx.stroke();
  head(ctx, -6, 2.5, FIXED.skin);
  ctx.fillStyle = FIXED.metal;
  ctx.beginPath(); ctx.arc(0, -6.4, 2.7, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  ctx.fillRect(-2.7, -6.6, 5.4, 1.3);

  const swing = attackT !== null ? Math.sin(attackT * Math.PI) : 0.1;
  const restAngle = -0.35;
  const angle = restAngle - swing * 2.1;
  ctx.save();
  ctx.translate(3.4, -1.2);
  ctx.rotate(angle);
  ctx.strokeStyle = FIXED.metal; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -6.6); ctx.stroke();
  ctx.fillStyle = FIXED.metalDark;
  ctx.fillRect(-1.4, -1.4, 2.8, 1.3);
  ctx.restore();
}

function drawRanged(ctx, faction, anim) {
  const { walkPhase, attackT } = anim;
  legPair(ctx, 3, 8.6, 1.9, walkPhase, '#332a1c', 2.2);
  ctx.save();
  ctx.translate(-2.6, -3);
  ctx.rotate(-0.4);
  ctx.fillStyle = FIXED.leather;
  ctx.fillRect(-0.8, 0, 1.7, 5.2); // quiver on the back
  ctx.fillStyle = '#c9401f';
  ctx.fillRect(-0.9, -0.6, 0.7, 1.4);
  ctx.fillStyle = '#e0d0a0';
  ctx.fillRect(0.1, -0.6, 0.7, 1.4);
  ctx.restore();
  ctx.fillStyle = faction.colorSecondary;
  ctx.fillRect(-3, -1.5, 6, 6.4);
  outlineRect(ctx, -3, -1.5, 6, 6.4);
  head(ctx, -5.6, 2.4, FIXED.skin);
  ctx.fillStyle = faction.colorPrimary;
  ctx.beginPath();
  ctx.moveTo(-2.8, -4.8); ctx.lineTo(0, -8.2); ctx.lineTo(2.8, -4.8);
  ctx.lineTo(2.2, -3); ctx.lineTo(-2.2, -3);
  ctx.closePath(); ctx.fill();

  const draw = attackT !== null ? Math.sin(attackT * Math.PI) : 0.25;
  ctx.save();
  ctx.translate(3.6, -0.3);
  ctx.strokeStyle = FIXED.wood; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(0, 0, 4.4, -1.15, 1.15); ctx.stroke();
  ctx.strokeStyle = FIXED.string; ctx.lineWidth = 0.7;
  const pull = 1.4 + draw * 2.4;
  ctx.beginPath();
  ctx.moveTo(Math.cos(-1.15) * 4.4, Math.sin(-1.15) * 4.4);
  ctx.lineTo(-pull, 0);
  ctx.lineTo(Math.cos(1.15) * 4.4, Math.sin(1.15) * 4.4);
  ctx.stroke();
  ctx.restore();
}

function drawCavalry(ctx, faction, anim) {
  const { walkPhase, attackT } = anim;
  const gallop = Math.sin(walkPhase * Math.PI * 2);

  ctx.fillStyle = FIXED.horseDark;
  for (const side of [-1, 1]) {
    const swing = Math.sin(walkPhase * Math.PI * 2 + (side === -1 ? 0 : Math.PI)) * 2.4;
    ctx.fillRect(side * 3.4 - 0.6 + swing * 0.3, 5.4, 1.3, 4);
  }
  ctx.fillStyle = FIXED.horse;
  ctx.beginPath(); ctx.ellipse(0, 3.6 - Math.abs(gallop) * 0.5, 7.6, 4.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = FIXED.horseLight;
  ctx.beginPath(); ctx.ellipse(-1, 1.5, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = faction.colorSecondary;
  ctx.beginPath(); ctx.ellipse(-1.5, 0.4, 3.4, 1.6, 0, 0, Math.PI * 2); ctx.fill(); // saddle cloth
  ctx.fillStyle = FIXED.horseDark;
  ctx.beginPath();
  ctx.ellipse(6.6, 0.2, 2.4, 1.8, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = FIXED.horse;
  ctx.beginPath(); ctx.moveTo(-7, 2); ctx.quadraticCurveTo(-10.5, 3, -9.5, 7); ctx.quadraticCurveTo(-8, 4, -6.6, 3.6); ctx.closePath(); ctx.fill();

  ctx.fillStyle = faction.colorPrimary;
  ctx.fillRect(-2.6, -3.6, 6, 6);
  outlineRect(ctx, -2.6, -3.6, 6, 6);
  head(ctx, -6.2, 2.1, FIXED.skin);
  ctx.fillStyle = FIXED.metal;
  ctx.beginPath(); ctx.arc(0, -6.6, 2.4, Math.PI, Math.PI * 2); ctx.fill();

  const thrust = attackT !== null ? Math.sin(attackT * Math.PI) * 3.5 : 0;
  ctx.strokeStyle = FIXED.wood; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(2, -2.5); ctx.lineTo(9 + thrust, -4.5); ctx.stroke();
  ctx.fillStyle = FIXED.metal;
  ctx.beginPath(); ctx.moveTo(9 + thrust, -4.5); ctx.lineTo(11 + thrust, -4.9); ctx.lineTo(9.4 + thrust, -3.6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = faction.colorSecondary;
  ctx.beginPath(); ctx.moveTo(5.5 + thrust * 0.6, -3.5); ctx.lineTo(8 + thrust * 0.6, -4.3); ctx.lineTo(5.7 + thrust * 0.6, -4.9); ctx.closePath(); ctx.fill(); // pennant
}

function drawSiege(ctx, faction, anim) {
  const { moving, walkPhase, attackT } = anim;
  const wheelAngle = moving ? walkPhase * Math.PI * 2 : 0;

  ctx.fillStyle = FIXED.wood;
  ctx.fillRect(-6.5, 3, 13, 4);
  outlineRect(ctx, -6.5, 3, 13, 4, 'rgba(0,0,0,0.4)');
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.5;
  for (const plank of [-3.2, 0, 3.2]) { ctx.beginPath(); ctx.moveTo(plank, 3); ctx.lineTo(plank, 7); ctx.stroke(); }
  for (const wx of [-4.2, 4.2]) {
    ctx.save();
    ctx.translate(wx, 6.6);
    ctx.rotate(wheelAngle);
    ctx.fillStyle = FIXED.metalDark;
    ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a2a30'; ctx.lineWidth = 0.5;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 2.6, Math.sin(a) * 2.6); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.fillStyle = faction.colorSecondary;
  ctx.fillRect(-3.5, -0.5, 7, 3.5);

  const cocked = attackT !== null ? 1 - Math.min(1, attackT * 2) : 0.75;
  const armAngle = -0.3 - cocked * 1.5;
  ctx.save();
  ctx.translate(-1, 1.5);
  ctx.rotate(armAngle);
  ctx.strokeStyle = FIXED.woodLight; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -7.5); ctx.stroke();
  ctx.fillStyle = faction.colorPrimary;
  ctx.beginPath(); ctx.arc(0, -7.5, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

const DRAWERS = { worker: drawWorker, melee: drawMelee, ranged: drawRanged, cavalry: drawCavalry, siege: drawSiege };

export function drawUnit(ctx, unit, faction, sx, sy, drawSize) {
  const anim = unitAnim(unit);
  ctx.imageSmoothingEnabled = false;
  withUnit(ctx, sx, sy, drawSize, () => DRAWERS[unit.role](ctx, faction, anim));
}

// ---------------- Buildings ----------------
// Stark structures lean on grey stone, crenellations and icicles with a
// simple carved wolf-head crest; Targaryen structures lean on dark
// stone/obsidian, jagged dragon-horn cresting and a stylised dragon sigil,
// with a live brazier flame — all original silhouettes, not copies of any
// show's actual heraldry.

function hash2(x, y) {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function stoneTexture(ctx, x0, y0, w, h, seedBase) {
  ctx.fillStyle = 'rgba(0,0,0,0.09)';
  const cols = Math.max(1, Math.floor(w / 9));
  const rows = Math.max(1, Math.floor(h / 7));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (hash2(seedBase + i * 3.1, j * 2.7) > 0.62) ctx.fillRect(x0 + i * 9 + 1, y0 + j * 7 + 1, 7, 5);
    }
  }
}

function wolfHead(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-3.2, -0.4); ctx.lineTo(-4.4, -3.6); ctx.lineTo(-1.4, -1.6);
  ctx.lineTo(0, -2.2); ctx.lineTo(1.4, -1.6); ctx.lineTo(4.4, -3.6); ctx.lineTo(3.2, -0.4);
  ctx.lineTo(2.2, 2.4); ctx.lineTo(0, 4); ctx.lineTo(-2.2, 2.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#14100a';
  ctx.beginPath(); ctx.arc(-1.1, -0.3, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(1.1, -0.3, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function dragonSigil(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 4.2);
  ctx.lineTo(-4.6, -2.2);
  ctx.lineTo(-1.7, -1.3);
  ctx.lineTo(-2.5, -4.4);
  ctx.lineTo(0, -1.7);
  ctx.lineTo(2.5, -4.4);
  ctx.lineTo(1.7, -1.3);
  ctx.lineTo(4.6, -2.2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function icicles(ctx, x0, y, w, count, color = '#d8ecf5') {
  ctx.fillStyle = color;
  const step = w / count;
  for (let i = 0; i < count; i++) {
    const len = 2.5 + ((i * 37) % 5);
    ctx.beginPath();
    ctx.moveTo(x0 + i * step, y);
    ctx.lineTo(x0 + i * step + step * 0.5, y + len);
    ctx.lineTo(x0 + i * step + step, y);
    ctx.closePath();
    ctx.fill();
  }
}

function dragonSpikes(ctx, x0, y, w, count, color) {
  ctx.fillStyle = color;
  const step = w / count;
  for (let i = 0; i < count; i++) {
    ctx.beginPath();
    ctx.moveTo(x0 + i * step, y);
    ctx.lineTo(x0 + i * step + step * 0.5, y - (3 + (i % 2) * 2.4));
    ctx.lineTo(x0 + i * step + step, y);
    ctx.closePath();
    ctx.fill();
  }
}

function wheatSheaf(ctx, cx, baseY, s) {
  ctx.strokeStyle = '#c9a23a'; ctx.lineWidth = 0.6;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * 0.9 * s, baseY);
    ctx.lineTo(cx + i * 0.5 * s, baseY - 6 * s);
    ctx.stroke();
  }
  ctx.fillStyle = '#e8c34a';
  ctx.beginPath(); ctx.ellipse(cx, baseY - 6.5 * s, 2.6 * s, 1.6 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5a4222'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(cx - 1.5 * s, baseY - 3 * s); ctx.lineTo(cx + 1.5 * s, baseY - 3 * s); ctx.stroke();
}

function flame(ctx, cx, cy, s, time = 0, seed = 0) {
  const flick = Math.sin(time * 8 + seed) * 0.18 + Math.sin(time * 3.1 + seed) * 0.12;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.rotate(flick);
  ctx.fillStyle = '#c8401f';
  ctx.beginPath();
  ctx.moveTo(0, 3.4); ctx.quadraticCurveTo(-2.6, 0.4, -1, -3); ctx.quadraticCurveTo(0, -1.2, 0.7, -3.8);
  ctx.quadraticCurveTo(1.8, -0.8, 0, 3.4);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f4b23a';
  ctx.beginPath(); ctx.ellipse(0, 0.8, 1, 1.7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawBuilding(ctx, type, faction, factionKey, x, y, sizePx, progress = 1, time = 0) {
  const primary = faction.colorPrimary;
  const secondary = faction.colorSecondary;
  const isStark = factionKey !== 'targaryen';
  ctx.save();
  ctx.translate(x, y);

  const h = sizePx * (0.35 + 0.65 * progress);
  const top = sizePx - h;

  ctx.fillStyle = '#2a2620';
  ctx.fillRect(0, sizePx - 4, sizePx, 4);

  switch (type) {
    case 'townhall': {
      const stone = isStark ? '#6b7280' : '#3a2226';
      const stoneDark = isStark ? '#575f6e' : '#28171b';
      ctx.fillStyle = stone;
      ctx.fillRect(0, top, sizePx, h);
      stoneTexture(ctx, 0, top, sizePx, h, x + y);
      ctx.fillStyle = stoneDark;
      ctx.fillRect(sizePx * 0.08, top + h * 0.15, sizePx * 0.84, h * 0.55);
      ctx.fillStyle = '#171310';
      ctx.fillRect(sizePx * 0.42, top + h * 0.55, sizePx * 0.16, h * 0.42);

      // flanking corner towers — what makes this read as a castle, not a hall
      const towerW = sizePx * 0.17;
      const towerH = h * 1.35;
      const towerTop = sizePx - towerH;
      for (const tx2 of [-towerW * 0.15, sizePx - towerW * 0.85]) {
        ctx.fillStyle = stone;
        ctx.fillRect(tx2, towerTop, towerW, towerH);
        stoneTexture(ctx, tx2, towerTop, towerW, towerH, x + y + tx2);
        ctx.fillStyle = isStark ? '#2e3a44' : '#180c0e';
        if (isStark) {
          ctx.beginPath();
          ctx.moveTo(tx2 - 1, towerTop);
          ctx.lineTo(tx2 + towerW / 2, towerTop - sizePx * 0.15);
          ctx.lineTo(tx2 + towerW + 1, towerTop);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(tx2, towerTop - sizePx * 0.05, towerW, sizePx * 0.05);
          dragonSpikes(ctx, tx2, towerTop, towerW, 2, '#180c0e');
        }
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(tx2 + towerW * 0.35, towerTop + towerH * 0.25, towerW * 0.3, towerH * 0.2);
      }

      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(sizePx / 2, top - sizePx * 0.24);
      ctx.lineTo(sizePx, top);
      ctx.closePath();
      ctx.fillStyle = isStark ? '#3d4a56' : '#221115';
      ctx.fill();

      if (isStark) {
        ctx.fillStyle = stone;
        for (let i = 0; i < 5; i++) ctx.fillRect(sizePx * (0.05 + i * 0.19), top - 2, sizePx * 0.1, 4);
        icicles(ctx, sizePx * 0.1, top, sizePx * 0.8, 6);
        wolfHead(ctx, sizePx * 0.5, top + h * 0.34, sizePx * 0.028, '#e7edf3');
      } else {
        dragonSpikes(ctx, 0, top, sizePx, 6, '#221115');
        dragonSigil(ctx, sizePx * 0.5, top + h * 0.32, sizePx * 0.028, primary);
        flame(ctx, sizePx * 0.16, top + h * 0.08, sizePx * 0.022, time, x);
        flame(ctx, sizePx * 0.84, top + h * 0.08, sizePx * 0.022, time, y + 3);
      }

      ctx.fillStyle = primary;
      ctx.fillRect(sizePx * 0.42, top - sizePx * 0.44, sizePx * 0.06, sizePx * 0.24);
      ctx.fillRect(sizePx * 0.42, top - sizePx * 0.44, sizePx * 0.18, sizePx * 0.09);
      break;
    }

    case 'farm': {
      const wall = isStark ? '#8a8f78' : '#7a5a3a';
      ctx.fillStyle = wall;
      ctx.fillRect(0, top, sizePx, h);
      ctx.beginPath();
      ctx.moveTo(0, top); ctx.lineTo(sizePx / 2, top - sizePx * 0.3); ctx.lineTo(sizePx, top);
      ctx.closePath();
      ctx.fillStyle = isStark ? '#4a5560' : secondary;
      ctx.fill();
      if (isStark) {
        ctx.fillStyle = 'rgba(240,248,255,0.8)';
        ctx.beginPath();
        ctx.moveTo(sizePx * 0.06, top - sizePx * 0.02); ctx.lineTo(sizePx / 2, top - sizePx * 0.26); ctx.lineTo(sizePx * 0.94, top - sizePx * 0.02);
        ctx.lineTo(sizePx * 0.5, top - sizePx * 0.14);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(226,98,42,0.4)';
        ctx.fillRect(sizePx * 0.1, top - sizePx * 0.12, sizePx * 0.8, sizePx * 0.08);
      }

      // windmill tucked beside the barn, sails slowly turning
      const millX = sizePx * 0.76, millW = sizePx * 0.13;
      ctx.fillStyle = isStark ? '#7a7566' : '#8a6a48';
      ctx.fillRect(millX, top - sizePx * 0.04, millW, h * 0.7);
      ctx.save();
      ctx.translate(millX + millW / 2, top - sizePx * 0.04);
      ctx.rotate(time * 1.4);
      ctx.strokeStyle = '#3a3226'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * sizePx * 0.15, Math.sin(a) * sizePx * 0.15); ctx.stroke();
      }
      ctx.restore();

      ctx.strokeStyle = FIXED.wood; ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(i * sizePx / 3.2, sizePx); ctx.lineTo(i * sizePx / 3.2, sizePx - 6); ctx.stroke();
      }
      wheatSheaf(ctx, sizePx * 0.14, sizePx - 1, 0.6);
      wheatSheaf(ctx, sizePx * 0.4, sizePx - 1, 0.6);
      break;
    }

    case 'barracks': {
      const wall = isStark ? '#6b7280' : '#4a3230';
      ctx.fillStyle = wall;
      ctx.fillRect(0, top, sizePx, h);
      stoneTexture(ctx, 0, top, sizePx, h, x * 3 + y);
      ctx.fillStyle = primary;
      ctx.fillRect(0, top, sizePx, h * 0.16);
      ctx.fillStyle = secondary;
      ctx.fillRect(sizePx * 0.85, top - sizePx * 0.32, sizePx * 0.06, sizePx * 0.32);
      ctx.fillStyle = primary;
      ctx.fillRect(sizePx * 0.79, top - sizePx * 0.32, sizePx * 0.16, sizePx * 0.13);
      if (isStark) {
        wolfHead(ctx, sizePx * 0.87, top - sizePx * 0.255, sizePx * 0.02, '#e7edf3');
        icicles(ctx, 0, top, sizePx, 5);
      } else {
        dragonSigil(ctx, sizePx * 0.87, top - sizePx * 0.255, sizePx * 0.02, '#1a1a1a');
        dragonSpikes(ctx, 0, top, sizePx, 5, '#221115');
      }

      // training yard: a straw dummy and a leaning spear+shield out front
      const dx0 = sizePx * 0.1, dy0 = sizePx * 0.92;
      ctx.strokeStyle = FIXED.wood; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(dx0, dy0); ctx.lineTo(dx0, dy0 - sizePx * 0.22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dx0 - sizePx * 0.05, dy0 - sizePx * 0.16); ctx.lineTo(dx0 + sizePx * 0.05, dy0 - sizePx * 0.16); ctx.stroke();
      ctx.fillStyle = '#c9a23a';
      ctx.beginPath(); ctx.ellipse(dx0, dy0 - sizePx * 0.24, sizePx * 0.035, sizePx * 0.045, 0, 0, Math.PI * 2); ctx.fill();

      const sx2 = sizePx * 0.25, sy2 = sizePx * 0.94;
      ctx.strokeStyle = FIXED.metal; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sx2, sy2); ctx.lineTo(sx2 + sizePx * 0.09, sy2 - sizePx * 0.3); ctx.stroke();
      ctx.fillStyle = secondary;
      ctx.beginPath(); ctx.ellipse(sx2 - sizePx * 0.02, sy2 - sizePx * 0.14, sizePx * 0.045, sizePx * 0.07, 0.3, 0, Math.PI * 2); ctx.fill();
      break;
    }

    case 'archery': {
      ctx.beginPath();
      ctx.moveTo(0, sizePx);
      ctx.lineTo(sizePx / 2, top - sizePx * 0.15);
      ctx.lineTo(sizePx, sizePx);
      ctx.closePath();
      ctx.fillStyle = isStark ? '#5a6672' : secondary;
      ctx.fill();
      ctx.fillStyle = primary;
      ctx.fillRect(sizePx * 0.35, sizePx - h * 0.3, sizePx * 0.3, h * 0.3);
      ctx.strokeStyle = isStark ? '#e7edf3' : '#e2622a';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(sizePx * 0.5, sizePx * 0.62, sizePx * 0.14, -1.3, 1.3);
      ctx.stroke();
      if (!isStark) flame(ctx, sizePx * 0.5, top - sizePx * 0.15, sizePx * 0.022, time, x + y);
      break;
    }

    case 'stable': {
      if (isStark) {
        ctx.fillStyle = '#6b4a2a';
        ctx.fillRect(0, top, sizePx, h);
        ctx.fillStyle = '#c9d3da';
        ctx.beginPath();
        ctx.moveTo(-sizePx * 0.05, top); ctx.lineTo(sizePx / 2, top - sizePx * 0.26); ctx.lineTo(sizePx * 1.05, top);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = primary;
        ctx.fillRect(sizePx * 0.4, sizePx - h * 0.5, sizePx * 0.2, h * 0.5);
        icicles(ctx, 0, top, sizePx, 5);
      } else {
        // dragon den: a rocky mound with a dark cave mouth and an ember glow
        ctx.fillStyle = '#2a1c1c';
        ctx.beginPath();
        ctx.moveTo(0, sizePx);
        ctx.lineTo(sizePx * 0.08, top + h * 0.3);
        ctx.lineTo(sizePx * 0.3, top);
        ctx.lineTo(sizePx * 0.5, top - sizePx * 0.12);
        ctx.lineTo(sizePx * 0.7, top);
        ctx.lineTo(sizePx * 0.92, top + h * 0.3);
        ctx.lineTo(sizePx, sizePx);
        ctx.closePath();
        ctx.fill();
        dragonSpikes(ctx, sizePx * 0.15, top + h * 0.05, sizePx * 0.7, 4, '#1a0e0e');
        ctx.fillStyle = '#0c0606';
        ctx.beginPath();
        ctx.ellipse(sizePx * 0.5, sizePx * 0.74, sizePx * 0.22, sizePx * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
        flame(ctx, sizePx * 0.5, sizePx * 0.8, sizePx * 0.032, time, x * 0.5);
      }
      break;
    }

    case 'tower': {
      const th = sizePx * 1.7 * progress;
      const ttop = sizePx - th;
      const stone = isStark ? '#6b7280' : '#3a2226';
      ctx.fillStyle = stone;
      ctx.fillRect(sizePx * 0.15, ttop, sizePx * 0.7, th);
      stoneTexture(ctx, sizePx * 0.15, ttop, sizePx * 0.7, th, x + y * 2);
      if (isStark) {
        ctx.fillStyle = primary;
        for (let i = 0; i < 3; i++) ctx.fillRect(sizePx * 0.15 + i * sizePx * 0.25, ttop, sizePx * 0.15, sizePx * 0.12);
        icicles(ctx, sizePx * 0.15, ttop + sizePx * 0.12, sizePx * 0.7, 4);
      } else {
        dragonSpikes(ctx, sizePx * 0.15, ttop, sizePx * 0.7, 3, '#221115');
        flame(ctx, sizePx * 0.5, ttop - sizePx * 0.16, sizePx * 0.03, time, x + y);
      }
      break;
    }

    case 'forge': {
      const stoneF = isStark ? '#5a5f68' : '#3a2622';
      ctx.fillStyle = stoneF;
      ctx.fillRect(0, top, sizePx, h);
      stoneTexture(ctx, 0, top, sizePx, h, x * 5 + y);
      ctx.fillStyle = '#2a2622';
      ctx.fillRect(sizePx * 0.6, top - sizePx * 0.35, sizePx * 0.14, sizePx * 0.35); // chimney
      const smoke = Math.sin(time * 1.1 + x) * 2;
      ctx.fillStyle = 'rgba(160,160,160,0.35)';
      ctx.beginPath(); ctx.ellipse(sizePx * 0.67 + smoke, top - sizePx * 0.42, sizePx * 0.06, sizePx * 0.04, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#14100c';
      ctx.beginPath(); ctx.ellipse(sizePx * 0.28, top + h * 0.62, sizePx * 0.14, sizePx * 0.16, 0, 0, Math.PI * 2); ctx.fill(); // furnace mouth
      flame(ctx, sizePx * 0.28, top + h * 0.66, sizePx * 0.03, time, x + 1);
      ctx.fillStyle = FIXED.metalDark;
      ctx.fillRect(sizePx * 0.6, sizePx - h * 0.24, sizePx * 0.22, h * 0.16); // anvil block
      ctx.fillRect(sizePx * 0.56, sizePx - h * 0.28, sizePx * 0.3, h * 0.06);
      ctx.fillStyle = primary;
      ctx.fillRect(0, top, sizePx, h * 0.12);
      break;
    }

    case 'workshop': {
      const wallW = isStark ? '#6b5a44' : '#6a4a34';
      ctx.fillStyle = wallW;
      ctx.fillRect(0, top, sizePx, h);
      stoneTexture(ctx, 0, top, sizePx, h, x * 2 + y * 3);
      ctx.beginPath();
      ctx.moveTo(0, top); ctx.lineTo(sizePx / 2, top - sizePx * 0.2); ctx.lineTo(sizePx, top);
      ctx.closePath();
      ctx.fillStyle = secondary;
      ctx.fill();
      // stacked crates + barrels out front
      ctx.fillStyle = FIXED.woodLight;
      ctx.fillRect(sizePx * 0.08, sizePx - h * 0.32, h * 0.22, h * 0.28);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.5;
      ctx.strokeRect(sizePx * 0.08, sizePx - h * 0.32, h * 0.22, h * 0.28);
      ctx.fillStyle = FIXED.wood;
      ctx.beginPath(); ctx.ellipse(sizePx * 0.42, sizePx - h * 0.12, h * 0.11, h * 0.15, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = FIXED.metalDark; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(sizePx * 0.42 - h * 0.11, sizePx - h * 0.18); ctx.lineTo(sizePx * 0.42 + h * 0.11, sizePx - h * 0.18); ctx.stroke();
      // cart wheel leaning against the wall
      ctx.save();
      ctx.translate(sizePx * 0.82, sizePx - h * 0.2);
      ctx.rotate(0.15);
      ctx.strokeStyle = FIXED.metalDark; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, h * 0.16, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * h * 0.16, Math.sin(a) * h * 0.16); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = primary;
      ctx.fillRect(0, top, sizePx, h * 0.1);
      break;
    }
  }

  if (progress < 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, sizePx, sizePx);
  }

  ctx.restore();
}

// ---------------- cached icons for HUD buttons ----------------

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const unitIconCache = new Map();
export function getUnitIcon(role, faction, factionKey) {
  const key = role + '_' + factionKey;
  if (!unitIconCache.has(key)) {
    const c = makeCanvas(36, 36);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    drawUnit(ctx, { role, bobTimer: 0.15, state: 'idle' }, faction, 18, 23, 28);
    unitIconCache.set(key, c.toDataURL());
  }
  return unitIconCache.get(key);
}

const buildingIconCache = new Map();
export function getBuildingIcon(type, faction, factionKey) {
  const key = type + '_' + factionKey;
  if (!buildingIconCache.has(key)) {
    const c = makeCanvas(36, 36);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    drawBuilding(ctx, type, faction, factionKey, 2, 2, 32, 1, 0);
    buildingIconCache.set(key, c.toDataURL());
  }
  return buildingIconCache.get(key);
}

// ---------------- Resource nodes ----------------

export function drawGoldNode(ctx, x, y, tile, time = 0, seed = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#4a4034';
  ctx.beginPath();
  ctx.moveTo(tile * 0.15, tile * 0.55);
  ctx.lineTo(tile * 0.45, tile * 0.12);
  ctx.lineTo(tile * 0.85, tile * 0.3);
  ctx.lineTo(tile * 0.9, tile * 0.75);
  ctx.lineTo(tile * 0.5, tile * 0.92);
  ctx.lineTo(tile * 0.1, tile * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#d8b23a';
  ctx.beginPath();
  ctx.moveTo(tile * 0.25, tile * 0.5);
  ctx.lineTo(tile * 0.45, tile * 0.25);
  ctx.lineTo(tile * 0.7, tile * 0.35);
  ctx.lineTo(tile * 0.6, tile * 0.6);
  ctx.lineTo(tile * 0.35, tile * 0.65);
  ctx.closePath();
  ctx.fill();
  const sparkle = 0.4 + 0.6 * Math.max(0, Math.sin(time * 2.4 + seed));
  ctx.fillStyle = `rgba(255,245,200,${sparkle.toFixed(2)})`;
  ctx.beginPath(); ctx.arc(tile * 0.48, tile * 0.42, tile * 0.05, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawTree(ctx, x, y, tile, seed = 0, time = 0) {
  const baseWobble = Math.sin(seed * 12.9898) * 0.15;
  const sway = Math.sin(time * 0.9 + seed) * 0.05;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(tile * (0.5 + baseWobble), tile * 0.82, tile * 0.26, tile * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = FIXED.wood;
  ctx.fillRect(tile * (0.46 + baseWobble), tile * 0.55, tile * 0.1, tile * 0.32);

  ctx.save();
  ctx.translate(tile * (0.5 + baseWobble), tile * 0.55);
  ctx.rotate(sway);
  ctx.fillStyle = '#284d2c';
  ctx.beginPath(); ctx.arc(0, -tile * 0.18, tile * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#356a3a';
  ctx.beginPath(); ctx.arc(-tile * 0.1, -tile * 0.26, tile * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#468048';
  ctx.beginPath(); ctx.arc(tile * 0.08, -tile * 0.32, tile * 0.13, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.restore();
}

// ---------------- terrain texture detail ----------------

export function drawTerrainDetail(ctx, type, sx, sy, tile, tx, ty, time = 0) {
  switch (type) {
    case 0: // grass — a few blade tufts, deterministic per tile
      for (let i = 0; i < 3; i++) {
        const h1 = hash2(tx * 3 + i, ty * 7 + i);
        const h2 = hash2(tx * 11 + i, ty * 5 - i);
        const bx = sx + h1 * tile;
        const by = sy + tile * 0.55 + h2 * tile * 0.4;
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(120,160,90,0.5)' : 'rgba(30,50,25,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + 1.5, by - 3.5 - h1 * 2);
        ctx.stroke();
      }
      break;

    case 2: { // water — animated wave bands
      ctx.strokeStyle = 'rgba(180,210,235,0.25)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 2; i++) {
        const offset = Math.sin(time * 1.4 + tx * 0.6 + ty * 0.3 + i) * 3;
        ctx.beginPath();
        ctx.moveTo(sx + 2, sy + tile * (0.35 + i * 0.35) + offset);
        ctx.quadraticCurveTo(sx + tile * 0.5, sy + tile * (0.3 + i * 0.35) + offset, sx + tile - 2, sy + tile * (0.35 + i * 0.35) + offset);
        ctx.stroke();
      }
      break;
    }

    case 3: { // rock — cracks + highlight
      const h1 = hash2(tx, ty);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx + tile * 0.2, sy + tile * 0.8);
      ctx.lineTo(sx + tile * (0.4 + h1 * 0.2), sy + tile * 0.4);
      ctx.lineTo(sx + tile * 0.75, sy + tile * 0.55);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(sx + tile * 0.15, sy + tile * 0.12, tile * 0.3, tile * 0.14);
      break;
    }
  }
}
