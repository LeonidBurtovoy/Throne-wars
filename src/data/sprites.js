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

// ---------------- colour shading helpers (the whole "3D" trick) ----------------
// Everything here is still flat Canvas 2D — there is no real depth. The illusion
// of volume comes entirely from gradients (light source assumed top-left) and a
// darker "side" strip along the right/bottom edge of otherwise flat blocks, the
// same cheap trick isometric-ish RTS sprites have used forever.

function clamp255(v) { return Math.max(0, Math.min(255, v)); }
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex, amt) {
  if (typeof hex !== 'string' || hex[0] !== '#') return hex; // rgba(...)/named colours pass through unchanged
  const [r, g, b] = hexToRgb(hex);
  const mix = amt >= 0 ? 255 : 0;
  const t = Math.min(1, Math.abs(amt));
  const nr = clamp255(Math.round(r + (mix - r) * t));
  const ng = clamp255(Math.round(g + (mix - g) * t));
  const nb = clamp255(Math.round(b + (mix - b) * t));
  return `rgb(${nr},${ng},${nb})`;
}
function lighten(hex, amt) { return shade(hex, Math.abs(amt)); }
function darkenColor(hex, amt) { return shade(hex, -Math.abs(amt)); }

// Flat block -> lit-top/shadowed-bottom gradient plus a darker strip down the
// right edge standing in for a side face turned away from the light.
function shadedBlock(ctx, x, y, w, h, baseColor) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, lighten(baseColor, 0.3));
  g.addColorStop(1, darkenColor(baseColor, 0.3));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  const depth = Math.max(0.6, w * 0.16);
  ctx.fillStyle = darkenColor(baseColor, 0.45);
  ctx.fillRect(x + w - depth, y, depth, h);
}

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

// A single jointed quadruped/beast leg: hip -> knee -> paw instead of one
// straight stroke, plus a paw blob (or claws) at the foot — reads as an
// actual animal limb with a bend instead of a stick figure's leg.
function beastLeg(ctx, hipX, hipY, footY, phase, spread, color, width, claws = false) {
  const swing = Math.sin(phase * Math.PI * 2) * spread;
  const footX = hipX + swing;
  const kneeX = hipX + swing * 0.4;
  const kneeY = hipY + (footY - hipY) * 0.55;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hipX, hipY);
  ctx.lineTo(kneeX, kneeY);
  ctx.lineTo(footX, footY);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(footX, footY, width * 0.6, width * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  if (claws) {
    ctx.fillStyle = '#1a1512';
    for (const cx of [-0.55, 0, 0.55]) {
      ctx.beginPath();
      ctx.moveTo(footX + cx * width, footY + width * 0.3);
      ctx.lineTo(footX + cx * width - 0.3, footY + width * 0.95);
      ctx.lineTo(footX + cx * width + 0.3, footY + width * 0.95);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function head(ctx, cy, r, skinColor) {
  const g = ctx.createRadialGradient(-r * 0.3, cy - r * 0.35, r * 0.1, 0, cy, r * 1.1);
  g.addColorStop(0, lighten(skinColor, 0.3));
  g.addColorStop(1, darkenColor(skinColor, 0.2));
  ctx.fillStyle = g;
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
  shadedBlock(ctx, -3, -1.5, 6, 6.5, faction.colorSecondary);
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
  shadedBlock(ctx, -3.6, -2, 7.2, 7, faction.colorPrimary);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(-3.6, -2, 7.2, 2);
  outlineRect(ctx, -3.6, -2, 7.2, 7);
  ctx.fillStyle = FIXED.metalDark;
  ctx.fillRect(-3.9, -1, 1.6, 5.5);
  const shieldGrad = ctx.createRadialGradient(-5, 1.1, 0.4, -4.4, 1.8, 2.1);
  shieldGrad.addColorStop(0, lighten(faction.colorSecondary, 0.3));
  shieldGrad.addColorStop(1, darkenColor(faction.colorSecondary, 0.25));
  ctx.fillStyle = shieldGrad;
  ctx.beginPath(); ctx.arc(-4.4, 1.8, 1.9, 0, Math.PI * 2); ctx.fill(); // round shield on the off hand, domed via radial shading
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
  shadedBlock(ctx, -3, -1.5, 6, 6.4, faction.colorSecondary);
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
  const bodyCy = 3.6 - Math.abs(gallop) * 0.5;
  const horseGrad = ctx.createRadialGradient(-2, bodyCy - 2.5, 1, 0, bodyCy, 8.5);
  horseGrad.addColorStop(0, lighten(FIXED.horse, 0.22));
  horseGrad.addColorStop(1, darkenColor(FIXED.horse, 0.32));
  ctx.fillStyle = horseGrad;
  ctx.beginPath(); ctx.ellipse(0, bodyCy, 7.6, 4.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = FIXED.horseLight;
  ctx.beginPath(); ctx.ellipse(-1, 1.5, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = faction.colorSecondary;
  ctx.beginPath(); ctx.ellipse(-1.5, 0.4, 3.4, 1.6, 0, 0, Math.PI * 2); ctx.fill(); // saddle cloth
  ctx.fillStyle = FIXED.horseDark;
  ctx.beginPath();
  ctx.ellipse(6.6, 0.2, 2.4, 1.8, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = FIXED.horse;
  ctx.beginPath(); ctx.moveTo(-7, 2); ctx.quadraticCurveTo(-10.5, 3, -9.5, 7); ctx.quadraticCurveTo(-8, 4, -6.6, 3.6); ctx.closePath(); ctx.fill();

  shadedBlock(ctx, -2.6, -3.6, 6, 6, faction.colorPrimary);
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

  shadedBlock(ctx, -6.5, 3, 13, 4, FIXED.wood);
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
  shadedBlock(ctx, -3.5, -0.5, 7, 3.5, faction.colorSecondary);

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

function drawChampion(ctx, faction, anim) {
  const { walkPhase, attackT } = anim;
  const sway = Math.sin(walkPhase * Math.PI * 2) * 1.0;
  ctx.fillStyle = 'rgba(20,16,10,0.55)';
  ctx.beginPath();
  ctx.moveTo(-3.2, -2.2); ctx.lineTo(-5.4 + sway, 7.2); ctx.lineTo(3.2, 6.4); ctx.lineTo(2.8, -2.4);
  ctx.closePath(); ctx.fill(); // heavy cloak
  legPair(ctx, 3.4, 9.4, 1.8, walkPhase, '#2a2620', 3.2);
  shadedBlock(ctx, -4.2, -2.8, 8.4, 8, faction.colorPrimary);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(-4.2, -2.8, 8.4, 2);
  outlineRect(ctx, -4.2, -2.8, 8.4, 8);
  ctx.fillStyle = FIXED.metal;
  ctx.beginPath(); ctx.arc(-4.6, -1.8, 1.9, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(4.6, -1.8, 1.9, 0, Math.PI * 2); ctx.fill(); // pauldrons
  ctx.strokeStyle = FIXED.metalDark; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.arc(-4.6, -1.8, 1.9, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(4.6, -1.8, 1.9, 0, Math.PI * 2); ctx.stroke();
  head(ctx, -7, 2.7, FIXED.skin);
  ctx.fillStyle = FIXED.metal;
  ctx.beginPath(); ctx.arc(0, -7.4, 2.9, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  ctx.fillRect(-2.9, -7.6, 5.8, 1.3);
  ctx.fillStyle = faction.colorSecondary;
  ctx.beginPath();
  ctx.moveTo(0, -10.4); ctx.lineTo(-1, -7.6); ctx.lineTo(1, -7.6);
  ctx.closePath(); ctx.fill(); // crest plume

  const swing = attackT !== null ? Math.sin(attackT * Math.PI) : 0.1;
  const angle = -0.3 - swing * 2.0;
  ctx.save();
  ctx.translate(4, -1.6);
  ctx.rotate(angle);
  ctx.strokeStyle = FIXED.wood; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 1.6); ctx.lineTo(0, -1.2); ctx.stroke(); // handle
  ctx.strokeStyle = FIXED.metal; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -1.2); ctx.lineTo(0, -8.4); ctx.stroke(); // greatsword blade
  ctx.fillStyle = FIXED.metalDark;
  ctx.fillRect(-1.8, -1.8, 3.6, 1.2); // crossguard
  ctx.restore();
}

function drawHealer(ctx, faction, anim) {
  const { walkPhase, workPhase, working } = anim;
  legPair(ctx, 3.2, 8.6, 1.8, walkPhase, '#3a3226');
  ctx.fillStyle = 'rgba(20,16,10,0.4)';
  ctx.beginPath();
  ctx.moveTo(-3, -3); ctx.lineTo(-3.6, 6.6); ctx.lineTo(3.6, 6.6); ctx.lineTo(3, -3);
  ctx.closePath(); ctx.fill(); // long robe silhouette
  shadedBlock(ctx, -3, -1.5, 6, 6.5, faction.colorSecondary);
  outlineRect(ctx, -3, -1.5, 6, 6.5);
  ctx.strokeStyle = faction.colorPrimary; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-3, 1.6); ctx.lineTo(3, 1.6); ctx.stroke(); // sash/belt
  head(ctx, -5.6, 2.5, FIXED.skin);
  ctx.fillStyle = faction.colorPrimary;
  ctx.beginPath(); ctx.arc(0, -6.6, 2.6, Math.PI, 0); ctx.fill(); // hood

  const bob = working ? Math.sin(workPhase * Math.PI * 2) * 0.6 : 0;
  ctx.save();
  ctx.translate(3.4, -0.6 + bob * 0.2);
  ctx.rotate(0.25);
  ctx.strokeStyle = FIXED.wood; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 4.6); ctx.lineTo(0, -5.4); ctx.stroke(); // staff
  const glow = 0.5 + 0.5 * Math.max(0, Math.sin(walkPhase * Math.PI * 6));
  ctx.fillStyle = `rgba(150,230,170,${glow.toFixed(2)})`;
  ctx.beginPath(); ctx.arc(0, -5.6, 1.5, 0, Math.PI * 2); ctx.fill(); // glowing charm
  ctx.fillStyle = '#eafff0';
  ctx.beginPath(); ctx.arc(0, -5.6, 0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// the strongest unit in the game — a huge beast rather than an armoured
// person, so it gets its own quadruped/winged silhouette entirely instead
// of reusing the humanoid leg/head/torso helpers above. Stark and Targaryen
// versions are genuinely different creatures (direwolf vs dragon), not a
// recolour, so this dispatches on factionKey rather than faction colours.
function drawLegend(ctx, faction, anim, factionKey) {
  if (factionKey === 'targaryen') drawDragonBeast(ctx, faction, anim);
  else drawDirewolfBeast(ctx, faction, anim);
}

function drawDirewolfBeast(ctx, faction, anim) {
  const { walkPhase, attackT } = anim;
  const stride = Math.sin(walkPhase * Math.PI * 2);

  // ground contact shadow — grounds the paws instead of the beast looking
  // like it floats over its own feet
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(0, 9.6, 7.4, 1.6, 0, 0, Math.PI * 2); ctx.fill();

  // four legs, diagonally-opposite pairs swinging together (a real trot
  // gait), each anchored under the shoulder (front, +x) or haunch (back,
  // -x) instead of all four bunched at the body's center
  const furDark = '#2c2824', furMid = '#3a352e';
  beastLeg(ctx, 4.8, 4.6, 9.8, walkPhase, 2.4, furDark, 2.6);
  beastLeg(ctx, -4.8, 4.6, 9.8, walkPhase + 0.5, 2.4, furMid, 2.6);
  beastLeg(ctx, 5.6, 4.2, 9.6, walkPhase + 0.5, 2.2, furMid, 2.4);
  beastLeg(ctx, -5.6, 4.2, 9.6, walkPhase, 2.2, furDark, 2.4);

  // bushy tail — trails from the REAR (-x, opposite the head), not the face
  ctx.strokeStyle = '#4a453c'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-7, 1.6);
  ctx.quadraticCurveTo(-10.8, 0.2 + stride, -10, -3.8);
  ctx.stroke();
  ctx.strokeStyle = '#5a554a'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-8.5, 0.6); ctx.quadraticCurveTo(-10.5, 0, -9.9, -2.6); ctx.stroke();

  // long low body, fur shaded light-top/dark-belly for volume
  const bodyGrad = ctx.createLinearGradient(0, -3, 0, 5);
  bodyGrad.addColorStop(0, lighten('#6b6a62', 0.18));
  bodyGrad.addColorStop(0.5, '#57564e');
  bodyGrad.addColorStop(1, darkenColor('#57564e', 0.35));
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, 1, 8, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // frost-pale chest/belly marking in the house colour, not armour
  ctx.fillStyle = faction.colorSecondary;
  ctx.beginPath();
  ctx.ellipse(2.5, 2.6, 2.6, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.6;
  for (const yy of [-1.2, 0.4, 2]) { ctx.beginPath(); ctx.moveTo(-4.8, yy); ctx.lineTo(3.6, yy - 0.6); ctx.stroke(); }
  // shaggy fur tufts along the spine, breaking up the smooth gradient fill
  ctx.strokeStyle = 'rgba(20,18,15,0.4)'; ctx.lineWidth = 0.8; ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const fx = 5.5 - i * 2.3;
    const t = Math.max(-0.95, Math.min(0.95, fx / 8));
    const topY = 1 - 3.6 * Math.sqrt(1 - t * t);
    ctx.beginPath(); ctx.moveTo(fx, topY + 0.8); ctx.lineTo(fx - 0.4, topY - 0.6); ctx.stroke();
  }
  // thin frost-pale rim light along the back — separates the silhouette
  // from a dark background and reads as light catching the fur
  ctx.strokeStyle = 'rgba(220,230,235,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(0, 1, 8, 3.6, 0, Math.PI * 1.15, Math.PI * 1.75); ctx.stroke();

  // neck bridges the gap between body and head so the head doesn't look
  // bolted on separately
  ctx.fillStyle = darkenColor('#57564e', 0.05);
  ctx.beginPath();
  ctx.moveTo(4.8, -1.6); ctx.lineTo(7.6, -4.2); ctx.lineTo(6.4, 0.6); ctx.lineTo(4.4, 1.4);
  ctx.closePath(); ctx.fill();
  // fur ruff around the neck/shoulders — a jagged tuft collar, thicker
  // fur that real wolves (and heraldic direwolves) carry at the neck
  ctx.fillStyle = darkenColor('#6b6a62', 0.05);
  for (let i = 0; i < 5; i++) {
    const a = 4.6 + i * 0.55;
    ctx.beginPath();
    ctx.moveTo(a, -2 + i * 0.15);
    ctx.lineTo(a + 0.9, -3.4 + i * 0.2);
    ctx.lineTo(a + 1.5, -1.6 + i * 0.15);
    ctx.closePath();
    ctx.fill();
  }

  // head lunges forward and down when attacking, otherwise bobs with the stride
  const lunge = attackT !== null ? Math.sin(attackT * Math.PI) * 2.4 : 0;
  ctx.save();
  ctx.translate(7.4 + lunge, -3 - Math.abs(stride) * 0.4);
  ctx.rotate(-0.1 + lunge * 0.05);
  const headGrad = ctx.createRadialGradient(-1, -1, 0.5, 0, 0, 4.5);
  headGrad.addColorStop(0, lighten('#6b6a62', 0.2));
  headGrad.addColorStop(1, darkenColor('#57564e', 0.3));
  ctx.fillStyle = headGrad;
  // elongated skull tapering into a snout, instead of a short blunt polygon
  ctx.beginPath();
  ctx.moveTo(-2.4, -2); ctx.lineTo(1.6, -2.2); ctx.lineTo(3.4, -1.2);
  ctx.lineTo(5.6, -0.2); ctx.lineTo(5.4, 0.7); ctx.lineTo(3.2, 1.1);
  ctx.lineTo(1.4, 2.2); ctx.lineTo(-2.4, 2.1);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.4; ctx.stroke();
  // nose tip
  ctx.fillStyle = '#1c1a16';
  ctx.beginPath(); ctx.ellipse(5.4, 0.25, 0.5, 0.4, 0, 0, Math.PI * 2); ctx.fill();
  // ears
  ctx.fillStyle = '#3a352e';
  ctx.beginPath(); ctx.moveTo(-1.8, -2); ctx.lineTo(-1.2, -4.6); ctx.lineTo(0.2, -2.2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0.6, -2.2); ctx.lineTo(1.6, -4.4); ctx.lineTo(2.2, -1.8); ctx.closePath(); ctx.fill();
  // bared teeth along the jawline
  ctx.fillStyle = '#eef0ea';
  ctx.beginPath(); ctx.moveTo(4.6, 0.5); ctx.lineTo(5.3, 0.85); ctx.lineTo(4.6, 1); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(3.4, 1); ctx.lineTo(3.9, 1.3); ctx.lineTo(3.3, 1.4); ctx.closePath(); ctx.fill();
  // glowing eyes
  const glow = 0.6 + 0.4 * Math.max(0, Math.sin(walkPhase * Math.PI * 3));
  ctx.fillStyle = `rgba(210,235,255,${glow.toFixed(2)})`;
  ctx.beginPath(); ctx.arc(0.6, -0.7, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawDragonBeast(ctx, faction, anim) {
  const { walkPhase, attackT, moving } = anim;
  const flap = Math.sin(walkPhase * Math.PI * 2) * (moving ? 0.5 : 0.18);

  // ground contact shadow — grounds the paws instead of the beast looking
  // like it floats over its own feet
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(-1, 8.6, 6.2, 1.5, 0, 0, Math.PI * 2); ctx.fill();

  // hind legs, jointed with claws — a wyvern-style dragon (front limbs are
  // the wings, not separate arms) rather than four identical stick legs
  const legColor = darkenColor(faction.colorPrimary, 0.4);
  beastLeg(ctx, -2.6, 3.2, 8.6, walkPhase, 1.8, legColor, 2.8, true);
  beastLeg(ctx, 0.4, 3.4, 8.4, walkPhase + 0.5, 1.6, legColor, 2.6, true);

  // wings — spread behind the body, flapping with the stride
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(-1.5, -1);
    ctx.scale(side, 1);
    ctx.rotate(-0.3 - flap);
    const wingGrad = ctx.createLinearGradient(0, 0, 8, -6);
    wingGrad.addColorStop(0, darkenColor(faction.colorPrimary, 0.35));
    wingGrad.addColorStop(1, darkenColor(faction.colorPrimary, 0.6));
    ctx.fillStyle = wingGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(7.5, -6.5);
    ctx.lineTo(9.5, -3);
    ctx.lineTo(6, -1.5);
    ctx.lineTo(7, 1.5);
    ctx.lineTo(3, 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.6; ctx.stroke();
    // membrane veins radiating from the wing root — the single biggest cue
    // that reads as "leathery bat/dragon wing" rather than a flat fill
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.5;
    for (const [vx, vy] of [[7.5, -6.5], [9.5, -3], [7, 1.5]]) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(vx, vy); ctx.stroke();
    }
    ctx.restore();
  }

  // tail, tapering with a spade tip
  ctx.strokeStyle = darkenColor(faction.colorPrimary, 0.3); ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, 1.5);
  ctx.quadraticCurveTo(-10, 3, -9.5, 6.5);
  ctx.stroke();
  ctx.fillStyle = darkenColor(faction.colorPrimary, 0.3);
  ctx.beginPath(); ctx.moveTo(-9.5, 6.5); ctx.lineTo(-11, 8.5); ctx.lineTo(-8.3, 7.6); ctx.closePath(); ctx.fill();

  // scaled body, lit-top/shadowed-belly gradient
  const bodyGrad = ctx.createLinearGradient(0, -3.5, 0, 4.5);
  bodyGrad.addColorStop(0, lighten(faction.colorPrimary, 0.15));
  bodyGrad.addColorStop(0.5, faction.colorPrimary);
  bodyGrad.addColorStop(1, darkenColor(faction.colorPrimary, 0.45));
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(-1, 0.5, 7.5, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.arc(-1 + i * 2.4, 0.5, 3.2 - i * 0.3, -0.6, 0.6); ctx.stroke();
  }
  // thin rim light along the back — separates the silhouette from a dark
  // background and reads as light catching the scales
  ctx.strokeStyle = 'rgba(255,220,190,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(-1, 0.5, 7.5, 3.6, 0, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
  // spine ridge spikes — follow the body ellipse's actual top curve so they
  // sit flush on the back for the full length from shoulder to tail base,
  // tapering shorter toward each end instead of a short row floating over
  // just the middle
  ctx.fillStyle = darkenColor(faction.colorPrimary, 0.2);
  const bodyCx = -1, bodyCy = 0.5, bodyRx = 7.5, bodyRy = 3.6;
  for (let i = 0; i < 7; i++) {
    const sxp = 5.5 - i * 2.1;
    const t = Math.max(-0.92, Math.min(0.92, (sxp - bodyCx) / bodyRx));
    const topY = bodyCy - bodyRy * Math.sqrt(1 - t * t);
    const spikeLen = 1.3 + Math.max(0, 1.5 - Math.abs(i - 2) * 0.3);
    ctx.beginPath();
    ctx.moveTo(sxp, topY + 0.7);
    ctx.lineTo(sxp - 0.9, topY + 0.7 - spikeLen);
    ctx.lineTo(sxp + 0.7, topY + 0.4);
    ctx.closePath();
    ctx.fill();
  }

  // long neck rising to a horned head
  const lunge = attackT !== null ? Math.sin(attackT * Math.PI) : 0;
  ctx.save();
  ctx.translate(6.5, -1.5);
  ctx.rotate(-0.5 - lunge * 0.35);
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(0, 2); ctx.lineTo(-0.5, -4.5); ctx.lineTo(1.5, -5.5); ctx.lineTo(2.5, 1.5);
  ctx.closePath(); ctx.fill();
  // head + jaw
  ctx.save();
  ctx.translate(0.8, -5.5);
  ctx.rotate(0.3 + lunge * 0.4);
  ctx.fillStyle = darkenColor(faction.colorPrimary, 0.1);
  ctx.beginPath();
  ctx.moveTo(-1.6, -1); ctx.lineTo(2.6, -1.6); ctx.lineTo(4.6, 0.4); ctx.lineTo(2.2, 1.6); ctx.lineTo(-1.6, 1.4);
  ctx.closePath(); ctx.fill();
  // horns
  ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-1, -1.2); ctx.lineTo(-2.6, -3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0.2, -1.6); ctx.lineTo(-0.8, -3.4); ctx.stroke();
  // small chin spikes along the lower jaw — a frill instead of a smooth edge
  ctx.fillStyle = darkenColor(faction.colorPrimary, 0.25);
  for (let i = 0; i < 3; i++) {
    const jx = 2 - i * 1.3, jy = 1.5;
    ctx.beginPath(); ctx.moveTo(jx, jy); ctx.lineTo(jx - 0.3, jy + 1); ctx.lineTo(jx + 0.5, jy + 0.3); ctx.closePath(); ctx.fill();
  }
  // nostril
  ctx.fillStyle = '#1a1210';
  ctx.beginPath(); ctx.ellipse(3.2, -0.7, 0.35, 0.25, 0.4, 0, Math.PI * 2); ctx.fill();
  // fangs top and bottom, flanking the open jaw
  ctx.fillStyle = '#f0ece0';
  ctx.beginPath(); ctx.moveTo(3.6, -0.1); ctx.lineTo(4.1, 0.9); ctx.lineTo(3.1, 0.3); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(3.5, 1.1); ctx.lineTo(4, 0.2); ctx.lineTo(2.9, 0.7); ctx.closePath(); ctx.fill();
  // ember glow in the open jaw — this beast is ready to breathe fire
  flame(ctx, 4, 0.2, 0.55, anim.walkPhase * 10, 3);
  const eyeGlow = 0.6 + 0.4 * Math.max(0, Math.sin(walkPhase * Math.PI * 3));
  ctx.fillStyle = `rgba(255,210,140,${eyeGlow.toFixed(2)})`;
  ctx.beginPath(); ctx.arc(-0.4, -0.6, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.restore();
}

const DRAWERS = {
  worker: drawWorker, melee: drawMelee, ranged: drawRanged, cavalry: drawCavalry, siege: drawSiege,
  champion: drawChampion, healer: drawHealer, legend: drawLegend,
};

export function drawUnit(ctx, unit, faction, sx, sy, drawSize) {
  const anim = unitAnim(unit);
  ctx.imageSmoothingEnabled = false;
  withUnit(ctx, sx, sy, drawSize, () => DRAWERS[unit.role](ctx, faction, anim, unit.faction));
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

// Fills a rect with a lit-top/shadowed-bottom gradient, adds a darker strip
// down the right edge to read as a side face turned away from the light, a
// thin highlight along the top edge, then outlines the whole block — the
// single biggest lever for making a flat wall read as a beveled 3D block
// instead of a plain vector rectangle.
function outlinedRect(ctx, x, y, w, h, fillColor, outlineColor = 'rgba(10,8,6,0.55)', lineWidth = 1.4) {
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, lighten(fillColor, 0.24));
  grad.addColorStop(0.55, fillColor);
  grad.addColorStop(1, darkenColor(fillColor, 0.32));
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  const depth = Math.max(2, w * 0.14);
  ctx.fillStyle = darkenColor(fillColor, 0.48);
  ctx.fillRect(x + w - depth, y, depth, h);

  ctx.fillStyle = lighten(fillColor, 0.42);
  ctx.fillRect(x, y, w, Math.max(1, h * 0.05));

  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(x + lineWidth / 2, y + lineWidth / 2, w - lineWidth, h - lineWidth);
}

// Same lit-top/shadowed-bottom gradient idea for sloped roof triangles,
// where the peak catches the light and the eaves sit in shadow.
function roofGradient(ctx, yPeak, yBase, baseColor) {
  const g = ctx.createLinearGradient(0, yPeak, 0, yBase);
  g.addColorStop(0, lighten(baseColor, 0.3));
  g.addColorStop(1, darkenColor(baseColor, 0.32));
  return g;
}

// A coarse checkerboard of two close shades over a fill — mimics the
// dithering old 256-colour VGA sprites used to fake extra shading depth
// out of a tiny palette. Cheap, and reads as "hand-painted" at a glance.
function dither(ctx, x0, y0, w, h, colorA, colorB, cell = 3) {
  for (let yy = 0; yy < h; yy += cell) {
    for (let xx = 0; xx < w; xx += cell) {
      const on = ((Math.floor(xx / cell) + Math.floor(yy / cell)) % 2) === 0;
      ctx.fillStyle = on ? colorA : colorB;
      ctx.fillRect(x0 + xx, y0 + yy, cell, cell);
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
      outlinedRect(ctx, 0, top, sizePx, h, stone);
      stoneTexture(ctx, 0, top, sizePx, h, x + y);
      dither(ctx, sizePx * 0.08, top + h * 0.15, sizePx * 0.84, h * 0.55, stoneDark, isStark ? '#4c5460' : '#241419');
      ctx.fillStyle = '#171310';
      ctx.fillRect(sizePx * 0.42, top + h * 0.55, sizePx * 0.16, h * 0.42);

      // flanking corner towers — what makes this read as a castle, not a hall
      const towerW = sizePx * 0.17;
      const towerH = h * 1.35;
      const towerTop = sizePx - towerH;
      for (const tx2 of [-towerW * 0.15, sizePx - towerW * 0.85]) {
        outlinedRect(ctx, tx2, towerTop, towerW, towerH, stone);
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
      ctx.fillStyle = roofGradient(ctx, top - sizePx * 0.24, top, isStark ? '#3d4a56' : '#221115');
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
      outlinedRect(ctx, 0, top, sizePx, h, wall);
      ctx.beginPath();
      ctx.moveTo(0, top); ctx.lineTo(sizePx / 2, top - sizePx * 0.3); ctx.lineTo(sizePx, top);
      ctx.closePath();
      ctx.fillStyle = roofGradient(ctx, top - sizePx * 0.3, top, isStark ? '#4a5560' : secondary);
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
      outlinedRect(ctx, 0, top, sizePx, h, wall);
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
      ctx.fillStyle = roofGradient(ctx, top - sizePx * 0.15, sizePx, isStark ? '#5a6672' : secondary);
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,8,6,0.55)'; ctx.lineWidth = 1.4; ctx.stroke();
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
        outlinedRect(ctx, 0, top, sizePx, h, '#6b4a2a');
        ctx.fillStyle = roofGradient(ctx, top - sizePx * 0.26, top, '#c9d3da');
        ctx.beginPath();
        ctx.moveTo(-sizePx * 0.05, top); ctx.lineTo(sizePx / 2, top - sizePx * 0.26); ctx.lineTo(sizePx * 1.05, top);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = primary;
        ctx.fillRect(sizePx * 0.4, sizePx - h * 0.5, sizePx * 0.2, h * 0.5);
        icicles(ctx, 0, top, sizePx, 5);
      } else {
        // dragon den: a rocky mound with a dark cave mouth and an ember glow
        ctx.fillStyle = roofGradient(ctx, top, sizePx, '#2a1c1c');
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
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.4; ctx.stroke();
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
      outlinedRect(ctx, sizePx * 0.15, ttop, sizePx * 0.7, th, stone);
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
      outlinedRect(ctx, 0, top, sizePx, h, stoneF);
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
      outlinedRect(ctx, 0, top, sizePx, h, wallW);
      stoneTexture(ctx, 0, top, sizePx, h, x * 2 + y * 3);
      ctx.beginPath();
      ctx.moveTo(0, top); ctx.lineTo(sizePx / 2, top - sizePx * 0.2); ctx.lineTo(sizePx, top);
      ctx.closePath();
      ctx.fillStyle = roofGradient(ctx, top - sizePx * 0.2, top, secondary);
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

    case 'temple': {
      const wallT = isStark ? '#8a8f9a' : '#4a2c3a';
      outlinedRect(ctx, 0, top, sizePx, h, wallT);
      stoneTexture(ctx, 0, top, sizePx, h, x * 4 + y);
      ctx.beginPath();
      ctx.moveTo(0, top); ctx.lineTo(sizePx / 2, top - sizePx * 0.22); ctx.lineTo(sizePx, top);
      ctx.closePath();
      ctx.fillStyle = roofGradient(ctx, top - sizePx * 0.22, top, isStark ? '#c9d3da' : '#6a2540');
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,8,6,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
      // round window with a seven-pointed motif (sept) / radiating embers (temple of fire)
      const wx0 = sizePx * 0.5, wy0 = top + h * 0.4;
      ctx.strokeStyle = isStark ? '#e7edf3' : '#e2622a';
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(wx0, wy0, sizePx * 0.15, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(wx0, wy0);
        ctx.lineTo(wx0 + Math.cos(a) * sizePx * 0.15, wy0 + Math.sin(a) * sizePx * 0.15);
        ctx.stroke();
      }
      if (isStark) icicles(ctx, sizePx * 0.1, top, sizePx * 0.8, 5);
      else flame(ctx, sizePx * 0.5, top + h * 0.92, sizePx * 0.03, time, x + y);
      break;
    }

    case 'market': {
      const wallM = isStark ? '#7a6a4a' : '#6a4030';
      outlinedRect(ctx, 0, top, sizePx, h, wallM);
      stoneTexture(ctx, 0, top, sizePx, h, x * 6 + y);
      ctx.beginPath();
      ctx.moveTo(-sizePx * 0.05, top); ctx.lineTo(sizePx * 0.5, top - sizePx * 0.16); ctx.lineTo(sizePx * 1.05, top);
      ctx.closePath();
      ctx.fillStyle = roofGradient(ctx, top - sizePx * 0.16, top, secondary);
      ctx.fill(); // open-air stall awning
      ctx.strokeStyle = primary; ctx.lineWidth = 1.4;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(sizePx * (0.12 + i * 0.24), top - sizePx * 0.01);
        ctx.lineTo(sizePx * 0.5, top - sizePx * 0.15);
        ctx.stroke();
      } // awning ribs
      ctx.fillStyle = FIXED.woodLight;
      ctx.fillRect(sizePx * 0.1, sizePx - h * 0.3, h * 0.2, h * 0.26); // crate
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.5;
      ctx.strokeRect(sizePx * 0.1, sizePx - h * 0.3, h * 0.2, h * 0.26);
      ctx.fillStyle = '#d8b23a';
      for (let i = 0; i < 3; i++) ctx.fillRect(sizePx * 0.6, sizePx - h * (0.13 + i * 0.05), h * 0.16, h * 0.04); // coin stack
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.4;
      ctx.strokeRect(sizePx * 0.6, sizePx - h * 0.13 - h * 0.13, h * 0.16, h * 0.13);
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
    drawUnit(ctx, { role, faction: factionKey, bobTimer: 0.15, state: 'idle' }, faction, 18, 23, 28);
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
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(tile * 0.5, tile * 0.86, tile * 0.4, tile * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = roofGradient(ctx, tile * 0.12, tile * 0.92, '#4a4034');
  ctx.beginPath();
  ctx.moveTo(tile * 0.15, tile * 0.55);
  ctx.lineTo(tile * 0.45, tile * 0.12);
  ctx.lineTo(tile * 0.85, tile * 0.3);
  ctx.lineTo(tile * 0.9, tile * 0.75);
  ctx.lineTo(tile * 0.5, tile * 0.92);
  ctx.lineTo(tile * 0.1, tile * 0.8);
  ctx.closePath();
  ctx.fill();
  const nuggetGrad = ctx.createRadialGradient(tile * 0.42, tile * 0.35, tile * 0.04, tile * 0.48, tile * 0.45, tile * 0.32);
  nuggetGrad.addColorStop(0, '#fbe28a');
  nuggetGrad.addColorStop(0.55, '#d8b23a');
  nuggetGrad.addColorStop(1, '#8a6a1a');
  ctx.fillStyle = nuggetGrad;
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

// a rare ore vein: a dark rock shell around a rippled blue-white Valyrian
// steel core, with a slow cool shimmer (vs gold's warm sparkle) to read as
// a distinct, precious resource at a glance
export function drawSteelNode(ctx, x, y, tile, time = 0, seed = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(tile * 0.5, tile * 0.84, tile * 0.4, tile * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = roofGradient(ctx, tile * 0.14, tile * 0.9, '#2c2e34');
  ctx.beginPath();
  ctx.moveTo(tile * 0.18, tile * 0.5);
  ctx.lineTo(tile * 0.4, tile * 0.14);
  ctx.lineTo(tile * 0.82, tile * 0.28);
  ctx.lineTo(tile * 0.88, tile * 0.7);
  ctx.lineTo(tile * 0.52, tile * 0.9);
  ctx.lineTo(tile * 0.12, tile * 0.76);
  ctx.closePath();
  ctx.fill();
  const veinGrad = ctx.createRadialGradient(tile * 0.44, tile * 0.4, tile * 0.03, tile * 0.5, tile * 0.5, tile * 0.3);
  veinGrad.addColorStop(0, '#eef6fb');
  veinGrad.addColorStop(0.55, '#9fc0d4');
  veinGrad.addColorStop(1, '#4a5f6e');
  ctx.fillStyle = veinGrad;
  ctx.beginPath();
  ctx.moveTo(tile * 0.28, tile * 0.48);
  ctx.lineTo(tile * 0.42, tile * 0.24);
  ctx.lineTo(tile * 0.68, tile * 0.34);
  ctx.lineTo(tile * 0.58, tile * 0.58);
  ctx.lineTo(tile * 0.32, tile * 0.62);
  ctx.closePath();
  ctx.fill();
  // the characteristic rippled smoke-lines of Valyrian steel
  ctx.strokeStyle = 'rgba(30,36,42,0.4)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 3; i++) {
    const yy = tile * (0.32 + i * 0.1);
    ctx.beginPath();
    ctx.moveTo(tile * 0.3, yy);
    ctx.quadraticCurveTo(tile * 0.44, yy - tile * 0.03, tile * 0.58, yy);
    ctx.stroke();
  }
  const shimmer = 0.35 + 0.5 * Math.max(0, Math.sin(time * 1.1 + seed));
  ctx.fillStyle = `rgba(210,235,245,${shimmer.toFixed(2)})`;
  ctx.beginPath(); ctx.arc(tile * 0.46, tile * 0.4, tile * 0.045, 0, Math.PI * 2); ctx.fill();
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
  shadedBlock(ctx, tile * (0.46 + baseWobble), tile * 0.55, tile * 0.1, tile * 0.32, FIXED.wood);

  ctx.save();
  ctx.translate(tile * (0.5 + baseWobble), tile * 0.55);
  ctx.rotate(sway);
  const leaf = (cx, cy, r, base) => {
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, lighten(base, 0.32));
    g.addColorStop(1, darkenColor(base, 0.28));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  };
  leaf(0, -tile * 0.18, tile * 0.3, '#284d2c');
  leaf(-tile * 0.1, -tile * 0.26, tile * 0.2, '#356a3a');
  leaf(tile * 0.08, -tile * 0.32, tile * 0.13, '#468048');
  ctx.restore();
  ctx.restore();
}

// ---------------- terrain texture detail ----------------

export function drawTerrainDetail(ctx, type, sx, sy, tile, tx, ty, time = 0) {
  switch (type) {
    case 0: { // grass — blade tufts, plus an occasional flower or pebble for variety
      for (let i = 0; i < 4; i++) {
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
      const trinket = hash2(tx * 17.3, ty * 5.7);
      const tkx = sx + hash2(tx * 4.1, ty * 9.2) * tile;
      const tky = sy + tile * 0.3 + hash2(tx * 9.9, ty * 2.3) * tile * 0.55;
      if (trinket > 0.93) { // tiny wildflower cluster
        ctx.fillStyle = hash2(tx, ty * 3) > 0.5 ? 'rgba(232,210,120,0.85)' : 'rgba(220,190,210,0.8)';
        for (const [ox, oy] of [[0, 0], [1.4, 0.4], [-1.2, 0.6]]) {
          ctx.beginPath(); ctx.arc(tkx + ox, tky + oy, 0.9, 0, Math.PI * 2); ctx.fill();
        }
      } else if (trinket > 0.86) { // small pebble, gives the ground a bit of grit
        ctx.fillStyle = 'rgba(90,86,74,0.5)';
        ctx.beginPath(); ctx.ellipse(tkx, tky, 1.8, 1.1, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 0.5; ctx.stroke();
      }
      break;
    }

    case 2: { // water — animated wave bands plus a drifting specular glint
      ctx.strokeStyle = 'rgba(180,210,235,0.25)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 2; i++) {
        const offset = Math.sin(time * 1.4 + tx * 0.6 + ty * 0.3 + i) * 3;
        ctx.beginPath();
        ctx.moveTo(sx + 2, sy + tile * (0.35 + i * 0.35) + offset);
        ctx.quadraticCurveTo(sx + tile * 0.5, sy + tile * (0.3 + i * 0.35) + offset, sx + tile - 2, sy + tile * (0.35 + i * 0.35) + offset);
        ctx.stroke();
      }
      const glint = Math.max(0, Math.sin(time * 0.6 + tx * 0.9 + ty * 0.4));
      if (glint > 0.55) {
        ctx.fillStyle = `rgba(220,240,255,${(glint * 0.3).toFixed(2)})`;
        ctx.beginPath();
        ctx.ellipse(sx + tile * (0.3 + hash2(tx, ty) * 0.4), sy + tile * (0.3 + hash2(ty, tx) * 0.4), tile * 0.16, tile * 0.05, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 3: { // rock — cracks, a couple of shaded boulders, and a moss fleck
      const h1 = hash2(tx, ty);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx + tile * 0.2, sy + tile * 0.8);
      ctx.lineTo(sx + tile * (0.4 + h1 * 0.2), sy + tile * 0.4);
      ctx.lineTo(sx + tile * 0.75, sy + tile * 0.55);
      ctx.stroke();

      const bx = sx + tile * (0.58 + hash2(tx * 6.1, ty * 2.4) * 0.22);
      const by = sy + tile * (0.68 + hash2(tx * 2.4, ty * 6.1) * 0.18);
      const br = tile * (0.1 + hash2(tx, ty * 4) * 0.05);
      const boulderGrad = ctx.createRadialGradient(bx - br * 0.4, by - br * 0.4, br * 0.1, bx, by, br);
      boulderGrad.addColorStop(0, 'rgba(255,255,255,0.14)');
      boulderGrad.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = boulderGrad;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(sx + tile * 0.15, sy + tile * 0.12, tile * 0.3, tile * 0.14);
      if (hash2(tx * 3.3, ty * 8.8) > 0.8) {
        ctx.fillStyle = 'rgba(90,120,70,0.35)';
        ctx.beginPath(); ctx.ellipse(sx + tile * 0.25, sy + tile * 0.85, tile * 0.1, tile * 0.05, 0, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
  }
}

// Faint gradient band bled from a differing neighbour tile into this tile's
// edge — the classic "coastline/treeline" trick that turns a hard grid of
// solid-colour tiles into terrain masses that actually read as blending
// into one another instead of tessellated squares.
const BLEND_RGB = {
  0: '58,90,50',   // grass
  1: '34,62,34',   // forest floor
  2: '30,54,88',   // water
  3: '66,61,54',   // rock
};

function edgeBlend(ctx, sx, sy, tile, dir, rgb) {
  const feather = tile * 0.4;
  let grad;
  if (dir === 'top') grad = ctx.createLinearGradient(0, sy, 0, sy + feather);
  else if (dir === 'bottom') grad = ctx.createLinearGradient(0, sy + tile, 0, sy + tile - feather);
  else if (dir === 'left') grad = ctx.createLinearGradient(sx, 0, sx + feather, 0);
  else grad = ctx.createLinearGradient(sx + tile, 0, sx + tile - feather, 0);
  grad.addColorStop(0, `rgba(${rgb},0.5)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = grad;
  if (dir === 'top') ctx.fillRect(sx, sy, tile, feather);
  else if (dir === 'bottom') ctx.fillRect(sx, sy + tile - feather, tile, feather);
  else if (dir === 'left') ctx.fillRect(sx, sy, feather, tile);
  else ctx.fillRect(sx + tile - feather, sy, feather, tile);
}

// `neighbors` = { top, right, bottom, left } tile-type numbers (or undefined
// for out-of-bounds). Only grass/forest/water/rock participate — gold/steel
// are small props on top of the ground, not terrain masses to blend against.
export function blendTerrainEdges(ctx, type, sx, sy, tile, neighbors) {
  if (!(type in BLEND_RGB)) return;
  const { top, right, bottom, left } = neighbors;
  if (top in BLEND_RGB && top !== type) edgeBlend(ctx, sx, sy, tile, 'top', BLEND_RGB[top]);
  if (bottom in BLEND_RGB && bottom !== type) edgeBlend(ctx, sx, sy, tile, 'bottom', BLEND_RGB[bottom]);
  if (left in BLEND_RGB && left !== type) edgeBlend(ctx, sx, sy, tile, 'left', BLEND_RGB[left]);
  if (right in BLEND_RGB && right !== type) edgeBlend(ctx, sx, sy, tile, 'right', BLEND_RGB[right]);
}
