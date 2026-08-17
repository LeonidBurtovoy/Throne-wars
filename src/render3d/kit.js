// Real modeled architecture pieces (Kenney "Castle Kit", CC0 license,
// https://kenney.nl/assets/castle-kit — see
// assets/kenney/castle-kit/LICENSE-castle-kit.txt) used to compose both
// castles from actual authored geometry instead of hand-placed box/
// cylinder/cone primitives. Every other building/unit/resource in this
// project is still procedural (see models.js) — this is a first, highest-
// value slice of a larger "replace primitives with real assets" pass.
//
// Pieces are GLTFLoader-loaded ONCE (preloadCastleKit, awaited in main.js
// during boot, before the render loop starts) and cached as templates;
// composing a castle then just clones+positions the cached templates,
// staying synchronous like every other factory in models.js. GLTFLoader
// itself imports THREE via the bare 'three' specifier internally, which
// is why index.html now carries an import map (see its <head>) — the
// rest of this project's files still use direct unpkg URLs, which
// resolve to the exact same module under that same import map, so both
// styles coexist safely.

import * as THREE from 'three';

const KIT_BASE = 'assets/kenney/castle-kit/';
// world-units per 1x1 kit tile — chosen so a castle's overall footprint
// lands close to what the selection ring (sized from footprintPx in
// Renderer3D._syncBuildings, independent of this file) already expects
export const KIT_UNIT = 26;

const CASTLE_KIT_PIECES = [
  'wall.glb', 'wall-corner.glb',
  'tower-square-base.glb', 'tower-square-mid.glb', 'tower-square-top.glb',
  'tower-square-roof.glb', 'tower-square-top-roof-high.glb',
  'flag.glb', 'flag-pennant.glb',
];

const _cache = new Map();
let _loader = null;

export async function preloadCastleKit() {
  if (!_loader) {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    _loader = new GLTFLoader();
  }
  await Promise.all(CASTLE_KIT_PIECES.map((name) => new Promise((resolve, reject) => {
    if (_cache.has(name)) { resolve(); return; }
    _loader.load(KIT_BASE + name, (gltf) => {
      gltf.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      _cache.set(name, gltf.scene);
      resolve();
    }, undefined, reject);
  })));
}

// clones a cached piece, scaled from 1-kit-unit to world units, optionally
// tinted (multiplies the natural sandstone texture's color) for house
// identity — a light cool tint for Stark, a dark warm one for Targaryen
function piece(name, tint) {
  const template = _cache.get(name);
  if (!template) throw new Error(`castle kit piece not preloaded: ${name} (call preloadCastleKit() first)`);
  const obj = template.clone(true);
  obj.scale.setScalar(KIT_UNIT);
  if (tint) {
    const tintColor = new THREE.Color(tint);
    obj.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.color.multiply(tintColor);
      }
    });
  }
  return obj;
}

// a straight run of wall pieces between two kit-grid points (must be
// axis-aligned and an integer number of tiles apart — true for every call
// site below, since whole castles are laid out on the kit's own grid)
function wallRun(x0, z0, x1, z1, tint) {
  const g = new THREE.Group();
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.round(Math.hypot(dx, dz));
  const stepX = dx / len, stepZ = dz / len;
  const angle = Math.atan2(dx, dz);
  for (let i = 0; i < len; i++) {
    const seg = piece('wall.glb', tint);
    seg.position.set((x0 + stepX * (i + 0.5)) * KIT_UNIT, 0, (z0 + stepZ * (i + 0.5)) * KIT_UNIT);
    seg.rotation.y = angle;
    g.add(seg);
  }
  return g;
}

// a tower stack at a kit-grid position: a base, `extraMid` extra segments
// for taller keeps, then a roof — roofName lets the two castles use
// different cap styles (a tall spire for Winterfell, a shorter peaked
// roof for Dragonstone) while sharing the same base/mid pieces
function towerStack(x, z, extraMid, roofName, tint) {
  const g = new THREE.Group();
  let yUnits = 0;
  const base = piece('tower-square-base.glb', tint);
  base.position.set(x * KIT_UNIT, 0, z * KIT_UNIT);
  g.add(base);
  yUnits += 1.01;
  for (let i = 0; i < extraMid; i++) {
    const mid = piece('tower-square-mid.glb', tint);
    mid.position.set(x * KIT_UNIT, yUnits * KIT_UNIT, z * KIT_UNIT);
    g.add(mid);
    yUnits += 1.01;
  }
  const top = piece('tower-square-top.glb', tint);
  top.position.set(x * KIT_UNIT, yUnits * KIT_UNIT, z * KIT_UNIT);
  g.add(top);
  yUnits += 0.3;
  const roof = piece(roofName, tint);
  roof.position.set(x * KIT_UNIT, yUnits * KIT_UNIT, z * KIT_UNIT);
  g.add(roof);
  const roofHeight = roofName === 'tower-square-roof.glb' ? 2.01 : 1.35;
  g.userData.topYUnits = yUnits + roofHeight;
  return g;
}

export { piece, wallRun, towerStack };
