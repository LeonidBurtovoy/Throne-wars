// Procedural 3D "model" templates built from plain Three.js primitives
// (boxes/spheres/cones) — there is no 3D modeling pipeline in this project
// (no build step, no asset files), so every unit/building is assembled
// from geometric shapes rather than sculpted/textured models. Each factory
// returns a fresh THREE.Group; meshes inside share geometry/material
// instances across calls where the color is identical is NOT attempted
// here for simplicity — correctness over micro-optimization for v1.

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

function box(w, h, d, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function darken(hex, amt) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - amt);
  return c;
}

function humanoid({ legColor, bodyW, bodyH, bodyD, bodyColor, headColor, headR }) {
  const group = new THREE.Group();
  const legH = bodyH * 0.35;
  const legs = box(bodyW * 0.7, legH, bodyD * 0.6, legColor);
  legs.position.y = legH / 2;
  group.add(legs);
  const torsoH = bodyH * 0.65;
  const torso = box(bodyW, torsoH, bodyD, bodyColor);
  torso.position.y = legH + torsoH / 2;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 8, 8), new THREE.MeshLambertMaterial({ color: headColor }));
  head.position.y = legH + torsoH + headR;
  head.castShadow = true;
  group.add(head);
  return group;
}

const SKIN = '#d9b382';
const WOOD = '#6b4a2a';

function createWolfModel(faction) {
  const g = new THREE.Group();
  const furBase = '#57564e';
  const body = box(30, 14, 12, furBase);
  body.position.y = 10;
  g.add(body);
  const head = box(10, 10, 10, furBase);
  head.position.set(18, 13, 0);
  g.add(head);
  const snout = box(6, 5, 6, '#3a352e');
  snout.position.set(24, 11, 0);
  g.add(snout);
  for (const [lx, lz] of [[10, 4], [10, -4], [-10, 4], [-10, -4]]) {
    const leg = box(4, 10, 4, '#2c2824');
    leg.position.set(lx, 5, lz);
    g.add(leg);
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
  const body = box(28, 14, 13, primary);
  body.position.y = 11;
  g.add(body);
  const neck = box(8, 8, 8, primary);
  neck.position.set(16, 17, 0);
  g.add(neck);
  const head = box(9, 7, 7, primary);
  head.position.set(25, 20, 0);
  g.add(head);
  const jaw = box(4, 2, 5, dark);
  jaw.position.set(28, 17, 0);
  g.add(jaw);
  for (const wz of [1, -1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 14), new THREE.MeshLambertMaterial({ color: dark, side: THREE.DoubleSide }));
    wing.position.set(-2, 19, wz * 9);
    wing.rotation.z = 0.35;
    wing.rotation.y = wz * 0.35;
    g.add(wing);
  }
  const tail = box(4, 4, 20, primary);
  tail.position.set(-20, 10, 0);
  g.add(tail);
  for (const [lx, lz] of [[6, 5], [6, -5], [-6, 5], [-6, -5]]) {
    const leg = box(4, 10, 4, dark);
    leg.position.set(lx, 5, lz);
    g.add(leg);
  }
  const spike = box(2, 5, 2, dark);
  spike.position.set(4, 19, 0);
  g.add(spike);
  return g;
}

export function createUnitModel(role, faction, factionKey) {
  const primary = faction.colorPrimary;
  const secondary = faction.colorSecondary;
  switch (role) {
    case 'worker':
      return humanoid({ legColor: '#3a3226', bodyW: 9, bodyH: 16, bodyD: 7, bodyColor: secondary, headColor: SKIN, headR: 3.4 });
    case 'melee':
      return humanoid({ legColor: '#2a2620', bodyW: 11, bodyH: 18, bodyD: 8, bodyColor: primary, headColor: SKIN, headR: 3.6 });
    case 'ranged':
      return humanoid({ legColor: '#332a1c', bodyW: 9, bodyH: 16, bodyD: 7, bodyColor: secondary, headColor: SKIN, headR: 3.3 });
    case 'champion':
      return humanoid({ legColor: '#2a2620', bodyW: 14, bodyH: 22, bodyD: 10, bodyColor: primary, headColor: SKIN, headR: 4 });
    case 'healer':
      return humanoid({ legColor: '#3a3226', bodyW: 9, bodyH: 18, bodyD: 7, bodyColor: secondary, headColor: SKIN, headR: 3.2 });
    case 'cavalry': {
      const g = new THREE.Group();
      const horse = box(22, 12, 10, '#5a3a20');
      horse.position.y = 6;
      g.add(horse);
      const rider = humanoid({ legColor: '#2a2620', bodyW: 9, bodyH: 14, bodyD: 7, bodyColor: primary, headColor: SKIN, headR: 3.2 });
      rider.position.y = 12;
      g.add(rider);
      return g;
    }
    case 'siege': {
      const g = new THREE.Group();
      const wagon = box(26, 8, 16, WOOD);
      wagon.position.y = 4;
      g.add(wagon);
      const arm = box(4, 4, 18, '#8a6238');
      arm.position.set(0, 11, 0);
      arm.rotation.x = -0.3;
      g.add(arm);
      return g;
    }
    case 'legend':
      return factionKey === 'targaryen' ? createDragonModel(faction) : createWolfModel(faction);
    default:
      return humanoid({ legColor: '#3a3226', bodyW: 9, bodyH: 16, bodyD: 7, bodyColor: secondary, headColor: SKIN, headR: 3.4 });
  }
}

const WALL_HEIGHT = {
  townhall: 30, farm: 16, barracks: 22, archery: 20, stable: 20,
  tower: 42, forge: 20, workshop: 20, temple: 24, market: 18,
};

export function createBuildingModel(type, faction, factionKey, footprintPx) {
  const isStark = factionKey !== 'targaryen';
  const stoneColor = isStark ? '#6b7280' : '#3a2226';
  const roofColor = isStark ? '#3d4a56' : '#221115';
  const wallH = WALL_HEIGHT[type] || 20;
  const g = new THREE.Group();
  const wallSize = footprintPx * 0.92;
  const wall = box(wallSize, wallH, wallSize, stoneColor);
  wall.position.y = wallH / 2;
  g.add(wall);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(footprintPx * 0.72, footprintPx * 0.55, 4),
    new THREE.MeshLambertMaterial({ color: roofColor })
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.y = wallH + footprintPx * 0.275;
  roof.castShadow = true;
  g.add(roof);
  const flag = box(1.6, footprintPx * 0.3, 1.6, faction.colorPrimary);
  flag.position.y = wallH + footprintPx * 0.55 + footprintPx * 0.15;
  g.add(flag);
  return g;
}
