// Procedural 3D "model" templates built from plain Three.js primitives
// (boxes/spheres/cones/cylinders/torus) — there is no 3D modeling pipeline
// in this project (no build step, no asset files), so every unit/building
// is assembled from geometric shapes rather than sculpted/textured models.
// Every distinguishing feature carried over from the old 2D pixel-art
// version (per-building silhouettes, per-unit props, Stark ice/wolf vs
// Targaryen fire/dragon motifs) is rebuilt here in primitives instead of
// canvas paths, so nothing from the accumulated art direction is lost —
// it's translated, not discarded.

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

// MeshStandardMaterial (PBR-ish roughness/metalness) instead of Lambert —
// responds to light much more realistically, and lets metal props (swords,
// anvils, wheels) actually read as metal instead of flat-colored plastic.
function stdMat(color, { roughness = 0.85, metalness = 0.05 } = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
const METAL_FINISH = { roughness: 0.35, metalness: 0.75 };

export function box(w, h, d, color, matOpts) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stdMat(color, matOpts));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(rTop, rBottom, h, color, segments = 10, matOpts) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), stdMat(color, matOpts));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cone(r, h, color, segments = 4, matOpts) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, segments), stdMat(color, matOpts));
  mesh.castShadow = true;
  return mesh;
}

function ball(r, color, matOpts) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), stdMat(color, matOpts));
  mesh.castShadow = true;
  return mesh;
}

// a small glowing ember — used for Targaryen fire motifs (braziers, forge
// mouths, dragon jaws) since there's no real particle system here
function ember(r) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 6, 6), new THREE.MeshBasicMaterial({ color: '#f4b23a' }));
}

function darken(hex, amt) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - amt);
  return c;
}
function lighten(hex, amt) {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color('#ffffff'), amt);
  return c;
}

const SKIN = '#d9b382';
const WOOD = '#6b4a2a';
const WOOD_LIGHT = '#8a6238';
const METAL = '#c3c6cf';
const METAL_DARK = '#71717c';
// mail has a duller, less mirror-like sheen than the polished plate/blade
// finish (METAL_FINISH) — a lower metalness plus higher roughness reads as
// riveted rings rather than a solid steel sheet
const MAIL = '#888c92';
const MAIL_FINISH = { roughness: 0.55, metalness: 0.55 };

// ---------------- units ----------------

function humanoid({ legColor, bodyW, bodyH, bodyD, bodyColor, bodyMatOpts, headColor, headR }) {
  const group = new THREE.Group();
  const legH = bodyH * 0.35;
  const legs = box(bodyW * 0.7, legH, bodyD * 0.6, legColor);
  legs.position.y = legH / 2;
  group.add(legs);
  const torsoH = bodyH * 0.65;
  const torso = box(bodyW, torsoH, bodyD, bodyColor, bodyMatOpts);
  torso.position.y = legH + torsoH / 2;
  group.add(torso);
  const head = ball(headR, headColor);
  head.position.y = legH + torsoH + headR;
  group.add(head);
  group.userData.torsoTopY = legH + torsoH;
  group.userData.torsoH = torsoH;
  return group;
}

// chainmail is approximated (no real texture maps in this project) with a
// few subtly darker horizontal bands pressed into the mail-colored torso,
// plus a faction-colored cloth tabard worn over it for identity — mirrors
// how mail was actually worn under a surcoat historically, and keeps each
// house visually distinct even though the armor underneath reads the same
function addMailDetail(group, torsoTopY, torsoH, bodyW, bodyD, tabardColor) {
  for (let i = 0; i < 3; i++) {
    const band = box(bodyW * 1.01, 0.6, bodyD * 1.01, '#5c5f64', { roughness: 0.6, metalness: 0.4 });
    band.position.y = torsoTopY - torsoH * (0.25 + i * 0.28);
    group.add(band);
  }
  const tabard = box(bodyW * 0.72, torsoH * 0.85, 0.6, tabardColor, { roughness: 0.85 });
  tabard.position.set(0, torsoTopY - torsoH * 0.5, bodyD / 2 + 0.35);
  group.add(tabard);
}

function createWorkerModel(faction) {
  const g = humanoid({ legColor: '#3a3226', bodyW: 9, bodyH: 16, bodyD: 7, bodyColor: faction.colorSecondary, headColor: SKIN, headR: 3.4 });
  // arm + pickaxe built as one rigid group pivoted at the shoulder, so the
  // gather/attack swing (Renderer3D rotates userData.weapon) reads as a
  // real mining motion around the shoulder instead of just the handle
  // spinning in place while the head stayed fixed to the body — and sized
  // up well past the old twig-sized tool so it actually reads at a glance
  const shoulderY = g.userData.torsoTopY - 2.5;
  const arm = new THREE.Group();
  arm.position.set(4.3, shoulderY, 0);
  const forearm = box(2.4, 7, 2.4, SKIN, { roughness: 0.9 });
  forearm.position.set(3, -3.4, 0);
  forearm.rotation.z = -0.5;
  arm.add(forearm);
  const handle = cyl(0.9, 0.9, 11, WOOD, 6);
  handle.rotation.z = 1.05;
  handle.position.set(6.4, -6.4, 0);
  arm.add(handle);
  const pickHead = box(2.3, 2.3, 5.2, METAL_DARK, METAL_FINISH);
  pickHead.position.set(11, -4, 0);
  pickHead.rotation.z = 0.15;
  arm.add(pickHead);
  g.add(arm);
  g.userData.weapon = arm; // whole arm+pickaxe swings together
  return g;
}

function createMeleeModel(faction) {
  const g = humanoid({ legColor: '#2a2620', bodyW: 11, bodyH: 18, bodyD: 8, bodyColor: MAIL, bodyMatOpts: MAIL_FINISH, headColor: SKIN, headR: 3.6 });
  addMailDetail(g, g.userData.torsoTopY, g.userData.torsoH, 11, 8, faction.colorPrimary);
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 1, 12), new THREE.MeshStandardMaterial({ color: faction.colorSecondary }));
  shield.rotation.z = Math.PI / 2;
  shield.position.set(-6, 11, 0);
  g.add(shield);
  const sword = box(1, 9, 1, METAL, METAL_FINISH);
  sword.position.set(7, 12, 0);
  sword.rotation.z = -0.3;
  g.add(sword);
  g.userData.weapon = sword;
  return g;
}

function createRangedModel(faction) {
  const g = humanoid({ legColor: '#332a1c', bodyW: 9, bodyH: 16, bodyD: 7, bodyColor: MAIL, bodyMatOpts: MAIL_FINISH, headColor: SKIN, headR: 3.3 });
  addMailDetail(g, g.userData.torsoTopY, g.userData.torsoH, 9, 7, faction.colorSecondary);
  const quiver = cyl(1.4, 1.4, 6, '#5a4630', 6);
  quiver.rotation.z = 0.3;
  quiver.position.set(-4, 12, 3);
  g.add(quiver);
  const bow = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.35, 6, 10, Math.PI * 1.2), new THREE.MeshStandardMaterial({ color: WOOD }));
  bow.rotation.y = Math.PI / 2;
  bow.position.set(6, 10, 0);
  g.add(bow);
  return g;
}

function createChampionModel(faction) {
  const g = humanoid({ legColor: '#2a2620', bodyW: 14, bodyH: 22, bodyD: 10, bodyColor: MAIL, bodyMatOpts: MAIL_FINISH, headColor: SKIN, headR: 4 });
  addMailDetail(g, g.userData.torsoTopY, g.userData.torsoH, 14, 10, faction.colorPrimary);
  for (const side of [-1, 1]) {
    const pauldron = ball(2.6, METAL, METAL_FINISH);
    pauldron.position.set(side * 7.5, g.userData.torsoTopY - 1.5, 0);
    g.add(pauldron);
  }
  const plume = cone(1.2, 4, faction.colorSecondary, 8);
  plume.position.set(0, g.userData.torsoTopY + 8.5, -1);
  g.add(plume);
  const greatsword = box(1.6, 13, 1.6, METAL, METAL_FINISH);
  greatsword.position.set(8, g.userData.torsoTopY + 2, 0);
  greatsword.rotation.z = -0.15;
  g.add(greatsword);
  g.userData.weapon = greatsword;
  return g;
}

function createHealerModel(faction) {
  const g = humanoid({ legColor: '#3a3226', bodyW: 9, bodyH: 18, bodyD: 7, bodyColor: faction.colorSecondary, headColor: SKIN, headR: 3.2 });
  const hood = cone(4, 4, faction.colorPrimary, 8);
  hood.position.y = g.userData.torsoTopY + 5.5;
  g.add(hood);
  const staff = cyl(0.5, 0.5, 16, WOOD, 6);
  staff.position.set(6, 8, 0);
  g.add(staff);
  const charm = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 8), new THREE.MeshBasicMaterial({ color: '#96e6aa' }));
  charm.position.set(6, 16, 0);
  g.add(charm);
  return g;
}

function createCavalryModel(faction) {
  const g = new THREE.Group();
  const horseColor = '#5a3a20';
  const maneColor = darken(horseColor, 0.4);
  const horse = box(20, 11, 9, horseColor, { roughness: 0.85 });
  horse.position.y = 10;
  g.add(horse);
  // legs + hooves — the old model was a bare box with a rider on top and
  // no visible animal underneath it at all
  for (const [lx, lz] of [[7, 3.5], [7, -3.5], [-7, 3.5], [-7, -3.5]]) {
    const leg = cyl(1.3, 1, 10, horseColor, 6);
    leg.position.set(lx, 5, lz);
    g.add(leg);
    const hoof = cyl(1.4, 1.4, 1.6, '#1c1a16', 6);
    hoof.position.set(lx, 0.8, lz);
    g.add(hoof);
  }
  // neck + head, angled up and forward — there was previously no head at
  // all, just the torso box
  const neck = box(6, 9, 6, horseColor, { roughness: 0.85 });
  neck.position.set(11, 13.5, 0);
  neck.rotation.z = -0.5;
  g.add(neck);
  const head = box(4.5, 5, 5, horseColor, { roughness: 0.85 });
  head.position.set(15.5, 17.5, 0);
  g.add(head);
  const muzzle = box(3, 3, 3.6, '#3a2a18');
  muzzle.position.set(18.2, 16.3, 0);
  g.add(muzzle);
  for (const ez of [1.6, -1.6]) {
    const ear = cone(0.7, 2.2, horseColor, 4);
    ear.position.set(14.5, 20.5, ez);
    g.add(ear);
  }
  // mane along the neck ridge and a trailing tail — the two features
  // explicitly asked for, both absent from the old plain-box horse
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const strand = box(1.2, 3.6 - t * 1.6, 0.6, maneColor, { roughness: 1 });
    strand.position.set(13 - t * 8, 18 - t * 2.5, 0);
    strand.rotation.z = -0.5;
    g.add(strand);
  }
  const tail = cone(2, 12, maneColor, 6);
  tail.rotation.z = Math.PI / 2 + 0.25; // tips the cone from pointing +Y to trailing backward-and-down
  tail.position.set(-10, 11, 0);
  g.add(tail);

  const saddle = box(8, 2, 7, faction.colorSecondary);
  saddle.position.set(-1, 16.5, 0);
  g.add(saddle);
  const rider = humanoid({ legColor: '#2a2620', bodyW: 9, bodyH: 14, bodyD: 7, bodyColor: MAIL, bodyMatOpts: MAIL_FINISH, headColor: SKIN, headR: 3.2 });
  addMailDetail(rider, rider.userData.torsoTopY, rider.userData.torsoH, 9, 7, faction.colorPrimary);
  rider.position.y = 16;
  g.add(rider);
  const lance = box(1, 1, 20, WOOD);
  lance.position.set(9, 23, 0);
  lance.rotation.x = Math.PI / 2;
  lance.rotation.z = -0.15;
  g.add(lance);
  const pennant = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.2), new THREE.MeshStandardMaterial({ color: faction.colorSecondary, side: THREE.DoubleSide }));
  pennant.position.set(9, 25, -6);
  g.add(pennant);
  g.userData.weapon = lance;
  g.userData.legs = rider; // the rider bobs with the horse's gallop
  return g;
}

function createSiegeModel() {
  const g = new THREE.Group();
  const wagon = box(26, 8, 16, WOOD);
  wagon.position.y = 4;
  g.add(wagon);
  const wheels = [];
  for (const wz of [-8.5, 8.5]) {
    const wheel = cyl(4, 4, 2, METAL_DARK, 10, METAL_FINISH);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(0, 4, wz);
    g.add(wheel);
    wheels.push(wheel);
  }
  const arm = box(4, 4, 18, WOOD_LIGHT);
  arm.position.set(0, 11, 0);
  arm.rotation.x = -0.3;
  g.add(arm);
  g.userData.weapon = arm;
  g.userData.wheels = wheels; // spin while the wagon moves
  return g;
}

function createWolfModel(faction) {
  const g = new THREE.Group();
  const furBase = '#57564e';
  const body = box(30, 14, 12, furBase);
  body.position.y = 10;
  g.add(body);
  const ruff = ball(8, lighten(furBase, 0.08));
  ruff.scale.set(0.7, 1, 1.15);
  ruff.position.set(13, 13, 0);
  g.add(ruff);
  const head = box(10, 10, 10, furBase);
  head.position.set(18, 13, 0);
  g.add(head);
  const snout = box(6, 5, 6, '#3a352e');
  snout.position.set(24, 11, 0);
  g.add(snout);
  const nose = ball(1, '#14100a');
  nose.position.set(27, 10.5, 0);
  g.add(nose);
  for (const [lx, lz] of [[10, 4], [10, -4], [-10, 4], [-10, -4]]) {
    const leg = box(4, 10, 4, '#2c2824');
    leg.position.set(lx, 5, lz);
    g.add(leg);
    const paw = box(4.4, 1.4, 4.4, '#1c1a16');
    paw.position.set(lx, 0.7, lz);
    g.add(paw);
  }
  const tail = box(4, 4, 16, '#4a453c');
  tail.position.set(-19, 12, 0);
  tail.rotation.z = -0.3;
  g.add(tail);
  for (const ez of [3, -3]) {
    const ear = box(2, 4, 2, '#3a352e');
    ear.position.set(16, 19, ez);
    g.add(ear);
  }
  const eyeGlow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 6, 6), new THREE.MeshBasicMaterial({ color: '#cfeeff' }));
  eyeGlow.position.set(20.5, 14, 0);
  g.add(eyeGlow);
  // faction-colored chest marking, not armor — a natural marking
  const chest = box(1, 8, 9, faction.colorSecondary);
  chest.position.set(11, 10, 0);
  g.add(chest);
  return g;
}

function createDragonModel(faction) {
  const g = new THREE.Group();
  const primary = faction.colorPrimary;
  const dark = darken(primary, 0.35);
  // a scale sheen: lower roughness/higher metalness than a flat-painted
  // surface, so the hide catches light instead of reading as matte plastic
  const hideMat = { roughness: 0.45, metalness: 0.4 };
  const scaleColor = lighten(primary, 0.12);
  const scaleMat = new THREE.MeshStandardMaterial({ color: scaleColor, roughness: 0.4, metalness: 0.45, flatShading: true });
  const body = box(28, 14, 13, primary, hideMat);
  body.position.y = 11;
  g.add(body);
  for (let i = 0; i < 4; i++) {
    const spike = cone(1.4, 4, dark, 4);
    spike.position.set(6 - i * 5, 19, 0);
    g.add(spike);
  }
  // small overlapping scale plates flanking the spine ridge — the body was
  // otherwise a single smooth-colored box with no texture at all
  for (let i = 0; i < 6; i++) {
    const x = 9 - i * 3.2;
    for (const z of [3.5, -3.5]) {
      const plate = new THREE.Mesh(new THREE.OctahedronGeometry(1.3, 0), scaleMat);
      plate.scale.set(1, 0.5, 0.8);
      plate.position.set(x, 17.5, z);
      g.add(plate);
    }
  }
  const neck = box(8, 8, 8, primary, hideMat);
  neck.position.set(16, 17, 0);
  g.add(neck);
  const head = box(9, 7, 7, primary, hideMat);
  head.position.set(25, 20, 0);
  g.add(head);
  const jaw = box(4, 2, 5, dark);
  jaw.position.set(28, 17, 0);
  g.add(jaw);
  for (const hz of [2, -2]) {
    const horn = cone(0.8, 4, '#2a2420', 6);
    horn.position.set(23, 24, hz);
    horn.rotation.z = 0.3 * (hz > 0 ? 1 : -1);
    g.add(horn);
  }
  const fire = ember(1.6);
  fire.position.set(30, 17, 0);
  g.add(fire);
  const wings = [];
  for (const wz of [1, -1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 14), new THREE.MeshStandardMaterial({ color: dark, side: THREE.DoubleSide }));
    wing.position.set(-2, 19, wz * 9);
    wing.rotation.z = 0.35;
    wing.rotation.y = wz * 0.35;
    g.add(wing);
    wings.push(wing);
  }
  g.userData.wings = wings; // flapped by Renderer3D while airborne/moving
  const tail = box(4, 4, 20, primary, hideMat);
  tail.position.set(-20, 10, 0);
  g.add(tail);
  // tapering scale plates running down the tail
  for (let i = 0; i < 5; i++) {
    const plate = new THREE.Mesh(new THREE.OctahedronGeometry(1 - i * 0.1, 0), scaleMat);
    plate.scale.set(1, 0.5, 0.8);
    plate.position.set(-12 - i * 3.5, 12.5, 0);
    g.add(plate);
  }
  for (const [lx, lz] of [[6, 5], [6, -5], [-6, 5], [-6, -5]]) {
    const leg = box(4, 10, 4, dark);
    leg.position.set(lx, 5, lz);
    g.add(leg);
    for (const cz of [-1, 0, 1]) {
      const claw = cone(0.5, 1.6, '#1a1512', 4);
      claw.position.set(lx + cz, 0.6, lz);
      g.add(claw);
    }
  }
  return g;
}

export function createUnitModel(role, faction, factionKey) {
  switch (role) {
    case 'worker': return createWorkerModel(faction);
    case 'melee': return createMeleeModel(faction);
    case 'ranged': return createRangedModel(faction);
    case 'champion': return createChampionModel(faction);
    case 'healer': return createHealerModel(faction);
    case 'cavalry': return createCavalryModel(faction);
    case 'siege': return createSiegeModel();
    case 'legend': return factionKey === 'targaryen' ? createDragonModel(faction) : createWolfModel(faction);
    default: return createWorkerModel(faction);
  }
}

// ---------------- buildings ----------------

// crenellated parapet (Stark) or jagged spike ridge (Targaryen) along the
// top edge of a wall — the single most reused motif from the 2D version
function roofline(wallSize, y, isStark, color) {
  const group = new THREE.Group();
  const count = 5;
  for (let i = 0; i < count; i++) {
    const off = (i / (count - 1) - 0.5) * wallSize * 0.85;
    if (isStark) {
      const merlon = box(wallSize * 0.12, 2.2, wallSize * 0.12, color);
      merlon.position.set(off, y + 1.1, wallSize * 0.46);
      group.add(merlon);
    } else {
      const spike = cone(wallSize * 0.05, 3, color, 4);
      spike.position.set(off, y + 1.5, wallSize * 0.46);
      group.add(spike);
    }
  }
  return group;
}

function baseWallAndRoof(footprintPx, wallH, stoneColor, roofColor, roofRatio = 0.55) {
  const g = new THREE.Group();
  const wallSize = footprintPx * 0.88;
  const wall = box(wallSize, wallH, wallSize, stoneColor);
  wall.position.y = wallH / 2;
  g.add(wall);
  const roof = cone(footprintPx * 0.68, footprintPx * roofRatio, roofColor);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = wallH + footprintPx * roofRatio * 0.5;
  g.add(roof);
  g.userData.wallSize = wallSize;
  g.userData.wallH = wallH;
  g.userData.roofTopY = wallH + footprintPx * roofRatio;
  return g;
}

// A-frame roof made of two angled flat panels meeting at a ridge, instead
// of the single cone every baseWallAndRoof building shares — gives
// barracks/stable a real hall/barn silhouette. ridgeSpan runs along the
// ridge (the building's width, x); slopeSpan is the depth the roof slopes
// down across (z). The panel tilt is derived analytically (not eyeballed)
// so the two halves always meet cleanly at the ridge regardless of size.
function gableRoof(ridgeSpan, slopeSpan, wallH, roofH, color) {
  const g = new THREE.Group();
  const slopeLen = Math.hypot(slopeSpan / 2, roofH);
  const phi = Math.atan2(roofH, slopeSpan / 2);
  for (const side of [1, -1]) {
    const panel = box(ridgeSpan * 1.06, 0.7, slopeLen, color, { roughness: 0.85 });
    panel.position.set(0, wallH + roofH / 2, side * slopeSpan / 4);
    panel.rotation.x = side * phi;
    g.add(panel);
  }
  return g;
}

// four corner posts holding up a flat overhanging roof — an open-air shed
// silhouette (workshop/market) instead of a fully-walled hall, so they read
// as busy outdoor yards rather than another fortified box
function postRoof(wallSize, postH, roofColor) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = cyl(0.9, 1, postH, WOOD, 6);
      post.position.set(sx * wallSize * 0.42, postH / 2, sz * wallSize * 0.42);
      g.add(post);
    }
  }
  const roof = box(wallSize * 1.18, 1.2, wallSize * 1.18, roofColor, { roughness: 0.85 });
  roof.position.y = postH + 0.6;
  g.add(roof);
  g.userData.postH = postH;
  return g;
}

// Winterfell: not one symmetric spire but a sprawling cluster of stone
// towers at irregular heights/positions around a long main hall — the
// single biggest visual cue that separates it from every other building.
function createTownhallWinterfell(faction, footprintPx) {
  const g = new THREE.Group();
  const stone = '#6b7280';
  const trim = '#e7edf3';
  const hall = box(footprintPx * 0.78, 18, footprintPx * 0.5, stone);
  hall.position.y = 9;
  g.add(hall);
  const hallRoof = roofline(footprintPx * 0.78, 18, true, trim);
  hallRoof.position.z = 0;
  g.add(hallRoof);
  const towers = [
    { x: -footprintPx * 0.32, z: -footprintPx * 0.24, r: footprintPx * 0.13, h: 36 }, // the Great Keep — tallest
    { x: footprintPx * 0.3, z: -footprintPx * 0.2, r: footprintPx * 0.1, h: 24 },
    { x: footprintPx * 0.26, z: footprintPx * 0.26, r: footprintPx * 0.085, h: 16 }, // squat, uneven — a broken tower
    { x: -footprintPx * 0.24, z: footprintPx * 0.28, r: footprintPx * 0.11, h: 28 },
  ];
  let tallest = towers[0];
  for (const t of towers) {
    if (t.h > tallest.h) tallest = t;
    const shaft = cyl(t.r, t.r * 1.15, t.h, stone, 8);
    shaft.position.set(t.x, t.h / 2, t.z);
    g.add(shaft);
    const cren = roofline(t.r * 2.5, t.h, true, trim);
    cren.position.set(t.x, 0, t.z);
    g.add(cren);
    icicleRow(g, t.x, t.h - 1, t.z, t.r * 2.2);
  }
  const banner = box(1.6, footprintPx * 0.28, 1.6, faction.colorPrimary);
  banner.position.set(tallest.x, tallest.h + footprintPx * 0.14, tallest.z);
  g.add(banner);
  g.userData.wallH = 18;
  g.userData.roofTopY = tallest.h;
  return g;
}

// Dragonstone: built out of a black volcanic outcrop, one dramatic spired
// tower, dragon-wing carvings along the battlements, embers at the base
// where the rock still glows — deliberately NOT a symmetric fort either.
function createTownhallDragonstone(faction, footprintPx) {
  const g = new THREE.Group();
  const dark = '#241417';
  const rock = new THREE.Mesh(
    new THREE.IcosahedronGeometry(footprintPx * 0.56, 0),
    new THREE.MeshStandardMaterial({ color: '#1a1214', flatShading: true })
  );
  rock.scale.set(1.15, 0.42, 1.1);
  rock.position.y = footprintPx * 0.12;
  rock.castShadow = true; rock.receiveShadow = true;
  g.add(rock);
  const baseY = footprintPx * 0.22;
  const towerH = 42;
  const tower = cyl(footprintPx * 0.16, footprintPx * 0.22, towerH, dark, 10);
  tower.position.y = baseY + towerH / 2;
  g.add(tower);
  g.add(roofline(footprintPx * 0.46, baseY + towerH, false, '#0c0606'));
  // carved dragon-wing battlements around the tower base
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(footprintPx * 0.18, 1, footprintPx * 0.06),
      new THREE.MeshStandardMaterial({ color: dark, side: THREE.DoubleSide })
    );
    wing.position.set(Math.cos(a) * footprintPx * 0.22, baseY + 14, Math.sin(a) * footprintPx * 0.22);
    wing.rotation.y = a;
    wing.rotation.z = 0.45;
    g.add(wing);
  }
  for (const [ex, ez] of [[footprintPx * 0.3, footprintPx * 0.2], [-footprintPx * 0.25, -footprintPx * 0.15]]) {
    const glow = ember(1.8);
    glow.position.set(ex, footprintPx * 0.1, ez);
    g.add(glow);
  }
  const banner = box(1.6, footprintPx * 0.28, 1.6, faction.colorPrimary);
  banner.position.y = baseY + towerH + footprintPx * 0.14;
  g.add(banner);
  g.userData.wallH = baseY;
  g.userData.roofTopY = baseY + towerH;
  return g;
}

function icicleRow(parent, x, y, z, width) {
  for (let i = 0; i < 3; i++) {
    const off = (i / 2 - 0.5) * width * 0.7;
    const icicle = cone(0.4, 2 + (i % 2), '#d8ecf5', 4);
    icicle.rotation.x = Math.PI;
    icicle.position.set(x + off, y - 1, z + width * 0.42);
    parent.add(icicle);
  }
}

function createTownhall(faction, factionKey, footprintPx) {
  return factionKey === 'targaryen'
    ? createTownhallDragonstone(faction, footprintPx)
    : createTownhallWinterfell(faction, footprintPx);
}

// An actual cultivated field (plowed furrows + scattered wheat sheaves)
// with a small shed and windmill off to one side, instead of a building
// sitting square in the middle of the footprint.
function createFarm(faction, factionKey, footprintPx) {
  const isStark = factionKey !== 'targaryen';
  const g = new THREE.Group();
  const fieldSize = footprintPx * 1.5;
  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(fieldSize, fieldSize),
    new THREE.MeshStandardMaterial({ color: '#5a4a2a', side: THREE.DoubleSide })
  );
  field.rotation.x = -Math.PI / 2;
  field.position.y = 0.15;
  field.receiveShadow = true;
  g.add(field);
  for (let i = 0; i < 7; i++) {
    const furrow = box(fieldSize * 0.92, 0.3, 1, '#463620');
    furrow.position.set(0, 0.32, -fieldSize * 0.4 + i * (fieldSize * 0.8 / 6));
    g.add(furrow);
  }
  const shed = box(footprintPx * 0.4, 9, footprintPx * 0.32, isStark ? '#8a8f78' : '#7a5a3a');
  shed.position.set(footprintPx * 0.32, 4.5, -footprintPx * 0.32);
  g.add(shed);
  const shedRoof = cone(footprintPx * 0.3, 6, isStark ? '#4a5560' : faction.colorSecondary, 4);
  shedRoof.rotation.y = Math.PI / 4;
  shedRoof.position.set(footprintPx * 0.32, 12, -footprintPx * 0.32);
  g.add(shedRoof);
  // windmill: a pole + rotating cross of blades — Renderer3D spins
  // `userData.spinner` each frame for a bit of life on the field
  const pole = cyl(0.8, 1, 16, WOOD_LIGHT, 6);
  pole.position.set(footprintPx * 0.58, 8, -footprintPx * 0.32);
  g.add(pole);
  const blades = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const blade = box(0.8, 9, 1.2, '#3a3226');
    blade.rotation.z = (Math.PI / 2) * i;
    blades.add(blade);
  }
  blades.position.set(footprintPx * 0.58, 15, -footprintPx * 0.32);
  g.add(blades);
  g.userData.spinner = blades;
  for (const [sx, sz] of [[-0.32, 0.12], [0.05, 0.32], [-0.12, -0.22], [0.28, -0.05], [-0.3, -0.3]]) {
    const sheaf = cone(1.8, 3.6, '#e8c34a', 6);
    sheaf.position.set(footprintPx * sx, 1.8, footprintPx * sz);
    g.add(sheaf);
  }
  g.userData.wallH = 9;
  g.userData.roofTopY = 15;
  return g;
}

// A gable-roofed hall flanked by twin corner watch-posts — a garrison
// silhouette, distinct from the single generic tower every other basic
// building used to share via baseWallAndRoof.
function createBarracks(faction, factionKey, footprintPx) {
  const isStark = factionKey !== 'targaryen';
  const stone = isStark ? '#6b7280' : '#4a3230';
  const trim = isStark ? '#e7edf3' : '#180c0e';
  const g = new THREE.Group();
  const hallW = footprintPx * 0.86;
  const hallD = footprintPx * 0.6;
  const wallH = 15;
  const hall = box(hallW, wallH, hallD, stone);
  hall.position.y = wallH / 2;
  g.add(hall);
  const roofH = hallD * 0.42;
  g.add(gableRoof(hallW, hallD, wallH, roofH, isStark ? '#3d4a56' : '#221115'));
  const postH = wallH + 7;
  for (const side of [-1, 1]) {
    const post = cyl(footprintPx * 0.08, footprintPx * 0.09, postH, stone, 8);
    post.position.set(side * hallW / 2, postH / 2, hallD / 2);
    g.add(post);
    const cren = roofline(footprintPx * 0.2, postH, isStark, trim);
    cren.position.set(side * hallW / 2, 0, hallD / 2);
    g.add(cren);
  }
  // training dummy out front
  const dummyPost = cyl(0.8, 0.8, 8, WOOD, 6);
  dummyPost.position.set(0, 4, hallD * 0.5 + 6);
  g.add(dummyPost);
  const dummyHead = ball(1.6, '#c9a23a');
  dummyHead.position.set(0, 8.5, hallD * 0.5 + 6);
  g.add(dummyHead);
  const crossbar = box(4, 0.6, 0.6, WOOD);
  crossbar.position.set(0, 6.5, hallD * 0.5 + 6);
  g.add(crossbar);
  g.userData.wallH = wallH;
  g.userData.roofTopY = Math.max(wallH + roofH, postH + 3);
  return g;
}

function createArchery(faction, factionKey, footprintPx) {
  const isStark = factionKey !== 'targaryen';
  const g = new THREE.Group();
  const tentColor = isStark ? '#5a6672' : faction.colorSecondary;
  const tent = cone(footprintPx * 0.62, footprintPx * 0.85, tentColor, 8);
  tent.position.y = footprintPx * 0.425;
  g.add(tent);
  g.userData.wallH = 2;
  g.userData.roofTopY = footprintPx * 0.85;
  if (!isStark) { const f = ember(1.8); f.position.y = footprintPx * 0.85 + 1; g.add(f); }
  return g;
}

function createStable(faction, factionKey, footprintPx) {
  const isStark = factionKey !== 'targaryen';
  if (isStark) {
    // a proper long barn (gabled hall + hayloft door + a small paddock
    // fence off to the side) instead of the generic box+cone silhouette
    const g = new THREE.Group();
    const barnOffsetX = -footprintPx * 0.14;
    const barnW = footprintPx * 0.62;
    const barnD = footprintPx * 0.95;
    const wallH = 13;
    const barn = box(barnW, wallH, barnD, WOOD);
    barn.position.set(barnOffsetX, wallH / 2, 0);
    g.add(barn);
    const roofH = barnW * 0.55;
    // ridge runs along the barn's long axis (z), so the roof (built with
    // its ridge along local x) is rotated 90 degrees to match
    const roof = gableRoof(barnD, barnW, wallH, roofH, '#c9d3da');
    roof.rotation.y = Math.PI / 2;
    roof.position.x = barnOffsetX;
    g.add(roof);
    const loft = box(4, 4, 0.4, '#2a2218');
    loft.position.set(barnOffsetX, wallH - 2, barnD / 2 + 0.3);
    g.add(loft);
    // small paddock fence to the right of the barn
    for (let i = 0; i < 4; i++) {
      const post = cyl(0.5, 0.5, 4, WOOD, 6);
      post.position.set(footprintPx * 0.22 + i * footprintPx * 0.1, 2, footprintPx * 0.3);
      g.add(post);
    }
    const rail = box(footprintPx * 0.3, 0.6, 0.6, WOOD);
    rail.position.set(footprintPx * 0.37, 3, footprintPx * 0.3);
    g.add(rail);
    g.userData.wallH = wallH;
    g.userData.roofTopY = wallH + roofH;
    return g;
  }
  // Targaryen: dragon den — an irregular rocky mound instead of a wall+roof
  const g = new THREE.Group();
  const mound = new THREE.Mesh(new THREE.IcosahedronGeometry(footprintPx * 0.52, 0), new THREE.MeshStandardMaterial({ color: '#2a1c1c', flatShading: true }));
  mound.scale.set(1, 0.6, 1);
  mound.position.y = footprintPx * 0.28;
  mound.castShadow = true;
  g.add(mound);
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(footprintPx * 0.16, 10), new THREE.MeshBasicMaterial({ color: '#0c0606', side: THREE.DoubleSide }));
  mouth.position.set(0, footprintPx * 0.16, footprintPx * 0.4);
  mouth.rotation.x = -0.3;
  g.add(mouth);
  const glow = ember(2.2);
  glow.position.set(0, footprintPx * 0.18, footprintPx * 0.38);
  g.add(glow);
  g.userData.wallH = footprintPx * 0.28;
  g.userData.roofTopY = footprintPx * 0.56;
  return g;
}

function createTower(faction, factionKey, footprintPx) {
  const isStark = factionKey !== 'targaryen';
  const stone = isStark ? '#6b7280' : '#3a2226';
  const g = new THREE.Group();
  const shaft = cyl(footprintPx * 0.32, footprintPx * 0.38, 46, stone, 10);
  shaft.position.y = 23;
  g.add(shaft);
  g.add(roofline(footprintPx * 0.7, 44, isStark, isStark ? '#e7edf3' : '#180c0e'));
  g.userData.wallH = 46;
  g.userData.roofTopY = 50;
  if (!isStark) { const f = ember(2); f.position.y = 50; g.add(f); }
  return g;
}

// low, wide furnace shed with a big stone furnace mound built into one
// side (glowing vents, tall chimney) instead of a plain box interior — an
// industrial silhouette, not just a recolored hall
function createForge(faction, factionKey, footprintPx) {
  const isStark = factionKey !== 'targaryen';
  const stone = isStark ? '#5a5f68' : '#3a2622';
  const g = baseWallAndRoof(footprintPx, 14, stone, isStark ? '#3d4a56' : '#221115', 0.16);
  const mound = new THREE.Mesh(
    new THREE.IcosahedronGeometry(footprintPx * 0.24, 0),
    new THREE.MeshStandardMaterial({ color: '#2a2622', flatShading: true })
  );
  mound.scale.set(1, 0.7, 0.8);
  mound.position.set(footprintPx * 0.2, footprintPx * 0.1, -footprintPx * 0.05);
  mound.castShadow = true; mound.receiveShadow = true;
  g.add(mound);
  const chimney = box(3, 16, 3, '#2a2622');
  chimney.position.set(footprintPx * 0.2, 22, -footprintPx * 0.05);
  g.add(chimney);
  for (const vz of [-1.6, 0, 1.6]) {
    const vent = ember(1);
    vent.position.set(footprintPx * 0.34, footprintPx * 0.1, -footprintPx * 0.05 + vz);
    g.add(vent);
  }
  const anvil = box(6, 4, 3, METAL_DARK, METAL_FINISH);
  anvil.position.set(-footprintPx * 0.28, 2, footprintPx * 0.28);
  g.add(anvil);
  const glow = ember(1.6);
  glow.position.set(-footprintPx * 0.28, 4.6, footprintPx * 0.28);
  g.add(glow);
  return g;
}

// an open-air carpentry yard — four posts holding up a flat roof instead
// of a fully enclosed hall, workbench + crates + a cart wheel scattered
// underneath
function createWorkshop(faction, factionKey, footprintPx) {
  const isStark = factionKey !== 'targaryen';
  const g = postRoof(footprintPx * 0.86, 15, isStark ? '#6b5a44' : '#6a4a34');
  const bench = box(footprintPx * 0.4, 3, 6, WOOD_LIGHT);
  bench.position.set(-footprintPx * 0.05, 1.5, 0);
  g.add(bench);
  const crate = box(6, 6, 6, WOOD_LIGHT);
  crate.position.set(-footprintPx * 0.32, 3, footprintPx * 0.28);
  g.add(crate);
  const crate2 = box(4.5, 4.5, 4.5, WOOD_LIGHT);
  crate2.position.set(-footprintPx * 0.32, 2.25, footprintPx * 0.1);
  g.add(crate2);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(4, 0.7, 6, 10), stdMat(METAL_DARK, METAL_FINISH));
  wheel.rotation.y = 0.3;
  wheel.position.set(footprintPx * 0.32, 4, -footprintPx * 0.28);
  g.add(wheel);
  g.userData.wallH = 15;
  g.userData.roofTopY = g.userData.postH + 2;
  return g;
}

// a stepped plinth (two stacked platforms) topped by a columned cella —
// tall and ornate, the only building standing on a raised base
function createTemple(faction, factionKey, footprintPx) {
  const isStark = factionKey !== 'targaryen';
  const stone = isStark ? '#8a8f9a' : '#4a2c3a';
  const g = new THREE.Group();
  const step1 = box(footprintPx * 0.92, 2, footprintPx * 0.92, isStark ? '#6a6f78' : '#3a2230');
  step1.position.y = 1;
  g.add(step1);
  const step2 = box(footprintPx * 0.76, 2, footprintPx * 0.76, isStark ? '#787d86' : '#432735');
  step2.position.y = 3;
  g.add(step2);
  const wallH = 20;
  const cella = box(footprintPx * 0.5, wallH, footprintPx * 0.5, stone);
  cella.position.y = 4 + wallH / 2;
  g.add(cella);
  const roof = cone(footprintPx * 0.42, footprintPx * 0.22, isStark ? '#c9d3da' : '#6a2540');
  roof.position.y = 4 + wallH + footprintPx * 0.11;
  g.add(roof);
  for (const cx of [-1, -0.4, 0.4, 1]) {
    const col = cyl(1, 1, wallH, isStark ? '#c9ccd2' : '#5a3444', 8);
    col.position.set(cx * footprintPx * 0.28, 4 + wallH / 2, footprintPx * 0.36);
    g.add(col);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(footprintPx * 0.14, 0.8, 8, 16), new THREE.MeshStandardMaterial({ color: isStark ? '#e7edf3' : '#e2622a' }));
  ring.position.set(0, 4 + wallH * 0.7, footprintPx * 0.26);
  g.add(ring);
  g.userData.wallH = 4 + wallH;
  g.userData.roofTopY = 4 + wallH + footprintPx * 0.22;
  if (!isStark) { const f = ember(1.8); f.position.y = g.userData.roofTopY + 1; g.add(f); }
  return g;
}

// a small back-stall under a big faction-colored awning, surrounded by
// goods — an open bazaar, distinct from the workshop's plain wood-toned
// open shed even though both are post-and-roof structures
function createMarket(faction, factionKey, footprintPx) {
  const isStark = factionKey !== 'targaryen';
  const g = new THREE.Group();
  const wallH = 10;
  const stall = box(footprintPx * 0.4, wallH, footprintPx * 0.3, isStark ? '#7a6a4a' : '#6a4030');
  stall.position.set(-footprintPx * 0.22, wallH / 2, -footprintPx * 0.2);
  g.add(stall);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = cyl(0.8, 0.8, 13, WOOD, 6);
      post.position.set(sx * footprintPx * 0.36, 6.5, sz * footprintPx * 0.3 + footprintPx * 0.08);
      g.add(post);
    }
  }
  const awning = box(footprintPx * 0.9, 1, footprintPx * 0.68, faction.colorPrimary, { roughness: 0.8 });
  awning.position.set(0, 13, footprintPx * 0.08);
  awning.rotation.x = 0.12;
  g.add(awning);
  const crate = box(5, 5, 5, WOOD_LIGHT);
  crate.position.set(footprintPx * 0.3, 2.5, footprintPx * 0.32);
  g.add(crate);
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 1.8, 3, 8), stdMat('#8a6a3a', { roughness: 1 }));
  basket.position.set(footprintPx * 0.18, 1.5, footprintPx * 0.34);
  g.add(basket);
  const coin = cyl(2, 2, 1, '#d8b23a', 10);
  coin.position.set(-footprintPx * 0.05, 0.5, footprintPx * 0.34);
  g.add(coin);
  g.userData.wallH = wallH;
  g.userData.roofTopY = 14;
  return g;
}

const BUILDING_FACTORY = {
  townhall: createTownhall, farm: createFarm, barracks: createBarracks, archery: createArchery,
  stable: createStable, tower: createTower, forge: createForge, workshop: createWorkshop,
  temple: createTemple, market: createMarket,
};

export function createBuildingModel(type, faction, factionKey, footprintPx) {
  const factory = BUILDING_FACTORY[type];
  return factory ? factory(faction, factionKey, footprintPx) : baseWallAndRoof(footprintPx, 20, '#6b7280', '#3d4a56');
}

// ---------------- resource props ----------------

// a small stand of trees (not one lone tree) with jittered size/position/
// canopy shade per seed — a forest TILE should read as a patch of forest,
// not a single toy tree planted dead-center
export function createTreeModel(seed = 0) {
  const g = new THREE.Group();
  const offsets = [[0, 0], [3.4, 1.6], [-2.8, 2.4], [1.2, -3.2]];
  const n = 3 + (seed % 2); // 3 or 4 trees per stand
  for (let i = 0; i < n; i++) {
    const [ox, oz] = offsets[i];
    const jitterX = ((seed * 13 + i * 7) % 5) - 2;
    const jitterZ = ((seed * 5 + i * 11) % 5) - 2;
    const scale = 0.75 + (((seed + i) * 17) % 6) / 10;
    const tree = new THREE.Group();
    const trunk = cyl(0.7 * scale, 1 * scale, 7 * scale, WOOD, 6);
    trunk.position.y = 3.5 * scale;
    tree.add(trunk);
    const canopyColor = (seed + i) % 3 === 0 ? '#356a3a' : (seed + i) % 3 === 1 ? '#2d5a2f' : '#264d29';
    const canopy = cone(5 * scale, 9 * scale, canopyColor, 8);
    canopy.position.y = 9.5 * scale;
    tree.add(canopy);
    tree.position.set(ox + jitterX, 0, oz + jitterZ);
    tree.rotation.y = (seed + i) * 1.7;
    g.add(tree);
  }
  return g;
}

// ore embedded in a rock outcrop, sitting low to the ground, instead of
// floating gem crystals — irregular nugget lumps pressed into the stone
function oreOutcrop(rockColor, nuggetColor, glowColor, nuggetGeo) {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(
    new THREE.IcosahedronGeometry(5, 0),
    new THREE.MeshStandardMaterial({ color: rockColor, flatShading: true })
  );
  rock.scale.set(1.15, 0.52, 1.05);
  rock.position.y = 2.1;
  rock.castShadow = true; rock.receiveShadow = true;
  g.add(rock);
  const nuggets = [[1.6, 0.5, 1.5], [-1.3, 1.3, 1.2], [0.3, -1.7, 1.35], [-1.6, -0.7, 1.05]];
  for (const [nx, nz, nr] of nuggets) {
    const nugget = new THREE.Mesh(nuggetGeo(nr), new THREE.MeshStandardMaterial({ color: nuggetColor, flatShading: true }));
    nugget.position.set(nx, 3.3 + nr * 0.35, nz);
    nugget.rotation.set(nx, nz, nr);
    nugget.castShadow = true;
    g.add(nugget);
  }
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 6, 6), new THREE.MeshBasicMaterial({ color: glowColor }));
  glow.position.set(0.4, 4.3, 0);
  g.add(glow);
  return g;
}

export function createGoldNodeModel() {
  return oreOutcrop('#4a4034', '#d8b23a', '#fbe28a', (r) => new THREE.IcosahedronGeometry(r, 0));
}

export function createSteelNodeModel() {
  return oreOutcrop('#33363e', '#9fc0d4', '#eef6fb', (r) => new THREE.OctahedronGeometry(r, 0));
}

// ---------------- plain-ground scatter (grass tufts / rock pebbles) ----------------

// a small cluster of grass blades, plus a rare wildflower or pebble tucked
// in — the 3D equivalent of the old 2D ground-detail sprite (blade strokes
// + an occasional trinket), so grass tiles read as textured ground instead
// of a flat green swatch
export function createGrassTuft(seed = 0) {
  const g = new THREE.Group();
  const bladeShades = ['#4a8a3a', '#3f7a32', '#5a9a44'];
  for (let i = 0; i < 3; i++) {
    const jitterX = ((seed * 11 + i * 9) % 9) - 4;
    const jitterZ = ((seed * 7 + i * 13) % 9) - 4;
    const h = 2.4 + ((seed + i * 5) % 4) / 2;
    const blade = box(0.5, h, 2.2, bladeShades[(seed + i) % 3], { roughness: 0.9 });
    blade.position.set(jitterX, h / 2, jitterZ);
    blade.rotation.y = (((seed + i) * 47) % 100) / 100 * Math.PI * 2;
    blade.rotation.z = 0.18 * (((seed + i) % 3) - 1);
    g.add(blade);
  }
  const trinket = (seed * 31) % 100;
  if (trinket > 92) { // rare wildflower cluster
    const petal = trinket % 2 === 0 ? '#e8d278' : '#dcc2d2';
    for (const [ox, oz] of [[0, 0], [1.3, 0.5], [-1.1, 0.6]]) {
      const flower = ball(0.6, petal, { roughness: 0.6 });
      flower.position.set(ox, 2, oz);
      g.add(flower);
    }
  } else if (trinket > 80) { // small pebble underfoot
    const pebble = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#5a5648', flatShading: true }));
    pebble.scale.set(1, 0.55, 0.9);
    pebble.position.set(1, 0.5, -1);
    pebble.castShadow = true; pebble.receiveShadow = true;
    g.add(pebble);
  }
  return g;
}

// a couple of shaded boulders (plus an occasional moss patch) — the rock
// equivalent of a grass tuft, giving flat rock tiles some actual relief
// instead of a single dead-flat grey color
export function createRockDetail(seed = 0) {
  const g = new THREE.Group();
  const n = 2 + (seed % 2);
  for (let i = 0; i < n; i++) {
    const jitterX = ((seed * 9 + i * 11) % 11) - 5;
    const jitterZ = ((seed * 13 + i * 7) % 11) - 5;
    const r = 1.1 + ((seed + i * 3) % 5) / 4;
    const shade = (seed + i) % 2 === 0 ? '#57503f' : '#413c30';
    const boulder = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), new THREE.MeshStandardMaterial({ color: shade, flatShading: true, roughness: 1 }));
    boulder.scale.set(1, 0.6, 0.9);
    boulder.position.set(jitterX, r * 0.5, jitterZ);
    boulder.rotation.set(seed * 0.3, i * 0.7, seed + i);
    boulder.castShadow = true; boulder.receiveShadow = true;
    g.add(boulder);
  }
  if ((seed * 17) % 100 > 78) { // patch of moss on the shaded side
    const moss = box(2.4, 0.2, 1.6, '#4a6a3a', { roughness: 1 });
    moss.position.set(-2, 0.15, 2);
    g.add(moss);
  }
  return g;
}

// ---------------- carried resource (attached to a gathering worker) ----------------

// what a worker visibly carries while gathering — a log bundle on the back
// for wood, an ore chunk for steel, a bulging sack for gold — so you can
// tell what someone's hauling at a glance, same as the old 2D version's
// carried-resource icon but as an actual prop on the model.
export function createCarryProp(type) {
  if (type === 'wood') {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const log = cyl(0.7, 0.7, 6, WOOD, 6);
      log.rotation.z = Math.PI / 2;
      log.position.set(0, i * 1.2 - 1.2, 0);
      g.add(log);
    }
    return g;
  }
  if (type === 'steel') {
    const chunk = new THREE.Mesh(new THREE.OctahedronGeometry(1.8, 0), stdMat('#9fc0d4', { roughness: 0.3, metalness: 0.6 }));
    chunk.castShadow = true;
    return chunk;
  }
  // gold — a bulging sack
  const sack = new THREE.Mesh(new THREE.SphereGeometry(1.9, 8, 8), stdMat('#8a6a3a', { roughness: 0.95 }));
  sack.scale.set(1, 1.25, 1);
  sack.castShadow = true;
  return sack;
}
