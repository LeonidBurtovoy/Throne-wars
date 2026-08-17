// Real 3D rendering via Three.js, imported as an ES module straight from a
// CDN URL (no build step in this project, so no npm install — Three.js
// dropped its global/UMD <script> build around r150, so a plain global
// <script> tag like the PeerJS one below is not reliable for it; a direct
// ES module import is the current, supported way to load it from a CDN).
// This class owns everything WebGL-related; Game.js stays pure simulation
// (units/buildings/economy), with zero knowledge of how it's drawn — this
// file is the only place that translates game state into a 3D scene.
//
// Camera: an orthographic camera at a fixed ~55-degree downward tilt with
// NO yaw rotation, so world X stays screen-X and world Y (the game's other
// ground axis) maps straight to Three.js Z — deliberately NOT a diamond-
// rotated isometric view. That keeps click-raycasting simple and reliable
// (a plain ray/plane intersection) instead of a hand-derived projection,
// which matters a lot given this code cannot be visually verified in this
// environment — only Three.js's own well-tested raycasting is trusted for
// the "did the click land on the right tile" math.

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { createUnitModel, createBuildingModel, createTreeModel, createGoldNodeModel, createSteelNodeModel, createCarryProp, createGrassTuft, createRockDetail, box } from './models.js';
import { FACTIONS } from '../data/factions.js';
import { TILE_TYPE } from '../config.js';

const TERRAIN_COLOR = {
  0: '#2f5c28', // grass
  1: '#1d481f', // forest (tree-stand props sit on top, see _syncResourceProps)
  2: '#1c4f8c', // water
  3: '#544c3e', // rock
  4: '#4a4034', // gold (ore-outcrop prop sits on top)
  5: '#33363e', // steel (ore-outcrop prop sits on top)
};
const RESOURCE_TILE_TYPES = new Set([1, 4, 5]); // forest, gold, steel
const MOVING_STATES = new Set(['moving', 'attack-move', 'moving-to-gather', 'moving-to-build', 'returning-to-drop']);
const WORKING_STATES = new Set(['gathering', 'building']);

// deterministic per-tile pseudo-random value in [0,1) — used for terrain
// color mottling and to seed ground-scatter props, so the same tile always
// looks the same across frames/sessions without storing anything per tile
function tileNoise(tx, ty) {
  let h = (tx * 374761393 + ty * 668265263) ^ 0x5bf03635;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 1000) / 1000;
}

// Visual-only scale multipliers — bigger, more imposing models on screen
// without touching gameplay math (collision radius, tile footprint,
// pathfinding all stay exactly as Game.js computes them; only what gets
// drawn is bigger).
const UNIT_SCALE = 1.65;
const BUILDING_SCALE = 1.45;
const RESOURCE_SCALE = 1.5;

export class Renderer3D {
  constructor(canvas, viewportWidth, viewportHeight) {
    this.canvas = canvas;
    this.width = viewportWidth;
    this.height = viewportHeight;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // render at the display's actual pixel density (capped at 2x for
    // performance) — without this, every HiDPI/Retina screen renders at
    // half (or less) of its real resolution and looks soft/blurry
    this.renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2));
    this.renderer.setSize(viewportWidth, viewportHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // softer, less jagged shadow edges
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // filmic tone mapping — rolls off bright highlights naturally instead
    // of clipping them, the single biggest lever for a "realistic" (vs
    // flat/cartoonish) response to the new real lights
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // ACES rolls off highlights but also visibly darkens the overall image
    // versus no tone mapping at all — 1.15 read as genuinely dark with the
    // light levels below; pushed up hard to compensate
    this.renderer.toneMappingExposure = 1.9;

    this.scene = new THREE.Scene();
    // a bright, clear daytime sky instead of a near-black void — the old
    // near-black background/fog color was a leftover from the flat 2D
    // canvas' void color and reads as "dark" the instant any sky is
    // visible in a real 3D scene
    const SKY = '#8fb2da';
    this.scene.background = new THREE.Color(SKY);
    // atmospheric depth: distant terrain fades toward the sky color instead
    // of every tile reading at full contrast regardless of distance — pushed
    // further out so it only affects the far edge of view, not most of it
    this.scene.fog = new THREE.Fog(SKY, 1500, 3600);

    // world-units-per-pixel MUST match on both axes (matching the old 2D
    // camera's plain 1:1 mapping), or the whole scene reads as visibly
    // stretched/squashed — a previous version widened only the vertical
    // frustum (halfH * 1.5) to give tall building models extra headroom
    // near the top edge, which threw the horizontal/vertical scale out of
    // sync and squashed everything vertically by that same 1.5x. A uniform
    // margin on all four sides gives the same headroom without distorting
    // the aspect ratio.
    const halfW = viewportWidth / 2, halfH = viewportHeight / 2;
    const FRUSTUM_MARGIN = 1.15;
    this.camera = new THREE.OrthographicCamera(
      -halfW * FRUSTUM_MARGIN, halfW * FRUSTUM_MARGIN,
      halfH * FRUSTUM_MARGIN, -halfH * FRUSTUM_MARGIN,
      1, 4000
    );
    // 55deg read as nearly top-down (no facade/detail visible at all).
    // 32deg showed plenty of detail but let short units reveal almost as
    // much side-facade as tall buildings proportionally, so units read as
    // oversized next to buildings they should be dwarfed by. 44deg is the
    // middle ground: enough tilt to still show real facade/detail, steep
    // enough that unit-vs-building scale reads correctly again.
    this._elevRad = THREE.MathUtils.degToRad(44);
    this._camDist = 1200;

    // sky/ground bounce light instead of flat ambient — reads as real
    // outdoor daylight rather than a uniform grey fill
    this.scene.add(new THREE.HemisphereLight('#cfe0f7', '#4a4030', 1.05));
    // the sun: repositioned every frame in _updateCamera to follow the
    // camera's look-at target, so its shadow frustum always covers the
    // currently-visible ground instead of only the area near world origin
    // (which would leave most of a large map permanently unshadowed)
    const sun = new THREE.DirectionalLight('#fff6e0', 2.6);
    sun.castShadow = true;
    sun.shadow.camera.left = -900; sun.shadow.camera.right = 900;
    sun.shadow.camera.top = 900; sun.shadow.camera.bottom = -900;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 2200;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0015;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
    // cool fill light from the opposite side of the sun — keeps shadowed
    // faces readable instead of going flat black, the classic cheap
    // "3-point lighting" trick for a scene lit by an environment instead
    // of one hard light source
    const fill = new THREE.DirectionalLight('#7fa0cc', 0.7);
    fill.position.set(1, 1, 1); // relative offset only, repositioned with the sun each frame
    this.scene.add(fill);
    this.scene.add(fill.target);
    this.fill = fill;

    this._raycaster = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this._terrainMesh = null;
    this._terrainMapRef = null;
    this._terrainColorDirty = 0;

    this._unitMeshes = new Map();
    this._buildingMeshes = new Map();
    this._resourceMeshes = new Map();
    this._detailMeshes = new Map();
    this._projectileMeshes = [];
    this._effectMeshes = [];
    this._placementGhost = null;
    this._resourceAmountLabel = null;
  }

  // ---------------- input: screen pixel -> world (x,y) via raycasting ----------------
  screenToWorld(sx, sy) {
    const ndcX = (sx / this.width) * 2 - 1;
    const ndcY = -(sy / this.height) * 2 + 1;
    this._raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    const hit = new THREE.Vector3();
    const ok = this._raycaster.ray.intersectPlane(this._groundPlane, hit);
    if (!ok) return [0, 0];
    return [hit.x, hit.z];
  }

  // ---------------- terrain ----------------
  _buildTerrain(map, TILE) {
    const positions = [];
    const colors = [];
    const indices = [];
    let vc = 0;
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const x0 = tx * TILE, x1 = x0 + TILE;
        const z0 = ty * TILE, z1 = z0 + TILE;
        positions.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1);
        for (let i = 0; i < 4; i++) colors.push(0, 0, 0);
        indices.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
        vc += 4;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    // DoubleSide: hand-built geometry, and this environment has no way to
    // visually confirm triangle winding is front-facing-up — safer to pay
    // a small draw cost than risk an invisible ground plane
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this._terrainMesh = mesh;
    this._terrainMapRef = map;
  }

  _updateTerrainColors(game) {
    const map = game.map, fog = game.fog;
    const colorAttr = this._terrainMesh.geometry.getAttribute('color');
    const c = new THREE.Color();
    const t = game.gameTime;
    let i = 0;
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const explored = fog.isExplored(tx, ty);
        if (!explored) {
          c.set('#020203');
        } else {
          const type = map.getTile(tx, ty);
          c.set(TERRAIN_COLOR[type] || TERRAIN_COLOR[0]);
          // deterministic per-tile mottling so a solid terrain color doesn't
          // read as one dead-flat swatch per tile — cheap "texture" without
          // an actual texture map, stable across frames since it's seeded
          // purely from tile coordinates
          c.multiplyScalar(0.88 + tileNoise(tx, ty) * 0.24);
          if (type === TILE_TYPE.WATER) {
            // a moving glint recomputed on this same throttled cadence —
            // choppy rather than a smooth shader-driven wave, but reads as
            // "alive" instead of a flat-colored pond
            const glint = 0.85 + 0.3 * Math.max(0, Math.sin(t * 1.6 + tx * 0.6 + ty * 0.4));
            c.multiplyScalar(glint);
          }
          if (!fog.isVisible(tx, ty)) c.multiplyScalar(0.45);
        }
        for (let v = 0; v < 4; v++) { colorAttr.setXYZ(i, c.r, c.g, c.b); i++; }
      }
    }
    colorAttr.needsUpdate = true;
  }

  // A left-anchored bar (dark background + colored fill), tilted at a fixed
  // angle to face the fixed-angle camera. The fill geometry never resizes —
  // only its scale.x plus a matching position offset — so it depletes/fills
  // from a fixed left edge instead of shrinking from both sides at once.
  // Shared by unit/building HP bars and the building training/research bar.
  _makeBar(width, fillColor) {
    const bg = box(width, 2.6, 1, '#161412', { roughness: 1 });
    const fill = box(width, 1.9, 1.5, fillColor, { roughness: 0.6 });
    const bar = new THREE.Group();
    bar.add(bg);
    bar.add(fill);
    bar.rotation.x = -0.85;
    return { bar, fill, width };
  }

  // a small canvas-texture billboard used for the resource-amount readout —
  // the texture is only redrawn when the displayed number actually changes
  // (see _setAmountLabel), not every frame, since 2D canvas text drawing is
  // comparatively expensive
  _makeAmountLabel() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 24;
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(18, 7, 1);
    sprite.userData.canvas = canvas;
    sprite.userData.ctx = canvas.getContext('2d');
    sprite.userData.texture = texture;
    sprite.userData.lastText = null;
    return sprite;
  }

  _setAmountLabel(sprite, amount) {
    const text = String(Math.max(0, Math.floor(amount)));
    if (sprite.userData.lastText === text) return;
    sprite.userData.lastText = text;
    const ctx = sprite.userData.ctx, canvas = sprite.userData.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = '#f0e6c8';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    sprite.userData.texture.needsUpdate = true;
  }

  // shows the remaining amount above whichever resource tile the player
  // last clicked (game.selectedResourceTile, set by Game.handleLeftClick,
  // untouched by the 3D rewrite) — matches the old 2D renderer's behavior
  // of only labeling the clicked tile, not every resource tile on screen
  _syncResourceAmountLabel(game) {
    const sel = game.selectedResourceTile;
    if (!sel) {
      if (this._resourceAmountLabel) this._resourceAmountLabel.visible = false;
      return;
    }
    const amount = game.map.getResourceAmount(sel.tx, sel.ty);
    if (amount <= 0) {
      if (this._resourceAmountLabel) this._resourceAmountLabel.visible = false;
      return;
    }
    if (!this._resourceAmountLabel) {
      this._resourceAmountLabel = this._makeAmountLabel();
      this.scene.add(this._resourceAmountLabel);
    }
    const TILE = game.tileSize;
    const label = this._resourceAmountLabel;
    label.visible = true;
    label.position.set(sel.tx * TILE + TILE / 2, 22, sel.ty * TILE + TILE / 2);
    this._setAmountLabel(label, amount);
  }

  // grass tufts / rock pebbles scattered on plain ground tiles — bounded to
  // roughly the current camera viewport (plus a small margin) rather than
  // the whole map, so the live prop count stays proportional to what's
  // actually on screen instead of growing with total map size
  _syncTerrainDetail(game) {
    const map = game.map, fog = game.fog, TILE = game.tileSize, cam = game.camera;
    const margin = 2;
    const tx0 = Math.max(0, Math.floor(cam.x / TILE) - margin);
    const ty0 = Math.max(0, Math.floor(cam.y / TILE) - margin);
    const tx1 = Math.min(map.width - 1, Math.floor((cam.x + cam.width) / TILE) + margin);
    const ty1 = Math.min(map.height - 1, Math.floor((cam.y + cam.height) / TILE) + margin);
    const seen = new Set();
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!fog.isVisible(tx, ty)) continue; // only decorate ground currently in sight
        const type = map.getTile(tx, ty);
        if (type !== TILE_TYPE.GRASS && type !== TILE_TYPE.ROCK) continue; // resource tiles already get a tree/ore prop
        const key = tx + ',' + ty;
        let entry = this._detailMeshes.get(key);
        if (entry && entry.type !== type) {
          this.scene.remove(entry.model);
          this._detailMeshes.delete(key);
          entry = null;
        }
        if (!entry) {
          const seed = tx * 7 + ty * 13;
          const model = type === TILE_TYPE.GRASS ? createGrassTuft(seed) : createRockDetail(seed);
          model.position.set(tx * TILE + TILE / 2, 0, ty * TILE + TILE / 2);
          this.scene.add(model);
          entry = { model, type };
          this._detailMeshes.set(key, entry);
        }
        seen.add(key);
      }
    }
    for (const [key, entry] of this._detailMeshes) {
      if (seen.has(key)) continue;
      this.scene.remove(entry.model);
      this._detailMeshes.delete(key);
    }
  }

  _setBarPct(barInfo, pct, color) {
    const p = Math.max(0.03, Math.min(1, pct));
    barInfo.fill.scale.x = p;
    barInfo.fill.position.x = -(barInfo.width / 2) * (1 - p);
    if (color) barInfo.fill.material.color.set(color);
  }

  // ---------------- entity sync ----------------
  _syncUnits(game) {
    const seen = new Set();
    for (const u of game.units) {
      if (u.dead) continue;
      const visible = u.owner === game.localOwner || game.fog.isVisible(u.tileX ?? Math.floor(u.x / game.tileSize), u.tileY ?? Math.floor(u.y / game.tileSize));
      if (!visible) continue;
      seen.add(u.id);
      let entry = this._unitMeshes.get(u.id);
      if (!entry) {
        const faction = FACTIONS[u.faction];
        const model = createUnitModel(u.role, faction, u.faction);
        model.scale.setScalar(UNIT_SCALE);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(9 * UNIT_SCALE, 11 * UNIT_SCALE, 16),
          new THREE.MeshBasicMaterial({ color: '#f0e6a0', side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.5;
        ring.visible = false;
        // HP bar — always visible above the unit, not just when selected
        // (matches the old 2D renderer's health bar, which was never
        // gated behind selection either)
        const bbox = new THREE.Box3().setFromObject(model);
        const hpWidth = Math.max(9, (bbox.max.x - bbox.min.x) * 0.55);
        const hpBarInfo = this._makeBar(hpWidth, '#3ab03a');
        hpBarInfo.bar.position.y = bbox.max.y + 4;
        const group = new THREE.Group();
        group.add(model);
        group.add(ring);
        group.add(hpBarInfo.bar);
        this.scene.add(group);
        entry = { group, model, ring, hpBarInfo, lastX: u.x, lastY: u.y };
        this._unitMeshes.set(u.id, entry);
      }
      entry.group.position.set(u.x, 0, u.y);
      const dx = u.x - entry.lastX, dy = u.y - entry.lastY;
      if (dx * dx + dy * dy > 0.4) {
        entry.model.rotation.y = Math.atan2(dx, dy);
        entry.lastX = u.x; entry.lastY = u.y;
      }
      entry.ring.visible = !!u.selected;
      entry.group.visible = true;

      const hpPct = Math.max(0, u.hp / u.maxHp);
      this._setBarPct(entry.hpBarInfo, hpPct, hpPct > 0.5 ? '#3ab03a' : hpPct > 0.25 ? '#c0a030' : '#b03a3a');

      // bring back the animation the 2D version had: a walking bob, weapon
      // swings on attack, tool swings while gathering/building, dragon wing
      // flaps and cart wheels turning — static gliding models read as dead
      const moving = MOVING_STATES.has(u.state);
      const working = WORKING_STATES.has(u.state);
      entry.model.position.y = moving ? Math.abs(Math.sin((u.bobTimer * 3.6) % (Math.PI * 2))) * 2.2 : 0;

      const weapon = entry.model.userData.weapon;
      if (weapon) {
        let swing = 0;
        if (u.state === 'attacking' && u.attackCooldown > 0 && u.stats.attackCooldown > 0) {
          const elapsed = u.stats.attackCooldown - u.attackCooldown;
          const swingDur = Math.min(0.4, u.stats.attackCooldown * 0.55);
          if (elapsed >= 0 && elapsed < swingDur) swing = Math.sin((elapsed / swingDur) * Math.PI) * 1.1;
        } else if (working) {
          swing = Math.sin(u.bobTimer * 2.6 * Math.PI * 2) * 0.6;
        }
        weapon.rotation.x = swing;
      }
      const wings = entry.model.userData.wings;
      if (wings) {
        // both wings flap together in sync (like a real bird/dragon), not
        // opposite each other — their built-in Y rotation is what's already
        // mirrored (left vs right), Z is the flap axis and stays shared
        const flap = Math.sin(u.bobTimer * 5) * (moving ? 0.5 : 0.15);
        wings.forEach((wing) => { wing.rotation.z = 0.35 + flap; });
      }
      const wheels = entry.model.userData.wheels;
      if (wheels && moving) {
        wheels.forEach((wheel) => { wheel.rotation.y = u.bobTimer * 6; });
      }

      // what the worker is hauling — a prop on their back, swapped in/out
      // as gathering starts/stops or the resource type changes
      if (u.carrying) {
        if (!entry.carryProp || entry.carryType !== u.carrying.type) {
          if (entry.carryProp) entry.model.remove(entry.carryProp);
          const prop = createCarryProp(u.carrying.type);
          prop.position.set(-4.5, (entry.model.userData.torsoTopY || 10) - 1, 0);
          entry.model.add(prop);
          entry.carryProp = prop;
          entry.carryType = u.carrying.type;
        }
        entry.carryProp.visible = true;
      } else if (entry.carryProp) {
        entry.carryProp.visible = false;
      }
    }
    for (const [id, entry] of this._unitMeshes) {
      if (seen.has(id)) continue;
      this.scene.remove(entry.group);
      this._unitMeshes.delete(id);
    }
  }

  _syncBuildings(game) {
    const seen = new Set();
    for (const b of game.buildings) {
      if (b.dead) continue;
      const visible = b.owner === game.localOwner || game.fog.isVisible(Math.floor(b.centerX / game.tileSize), Math.floor(b.centerY / game.tileSize));
      if (!visible) continue;
      seen.add(b.id);
      let entry = this._buildingMeshes.get(b.id);
      if (!entry) {
        const faction = FACTIONS[b.faction];
        // BUILDING_SCALE inflates the visual footprint only — the real
        // gameplay footprint (b.size * tileSize, used for collision/
        // placement) is untouched, this just makes the model/ring bigger
        const footprintPx = b.size * game.tileSize * BUILDING_SCALE;
        const model = createBuildingModel(b.type, faction, b.faction, footprintPx);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(footprintPx * 0.55, footprintPx * 0.6, 24),
          new THREE.MeshBasicMaterial({ color: '#f0e6a0', side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.5;
        ring.visible = false;
        // training/research progress bar — only shown while something is
        // actually queued/researching
        const progressInfo = this._makeBar(footprintPx * 0.7, '#d8b23a');
        progressInfo.bar.visible = false;
        // HP bar — always visible above the building, same as the old 2D
        // renderer (never gated behind selection)
        const hpInfo = this._makeBar(footprintPx * 0.7, '#3ab03a');
        const group = new THREE.Group();
        group.add(model);
        group.add(ring);
        group.add(progressInfo.bar);
        group.add(hpInfo.bar);
        this.scene.add(group);
        entry = { group, model, ring, progressInfo, hpInfo };
        this._buildingMeshes.set(b.id, entry);
      }
      entry.group.position.set(b.centerX, 0, b.centerY);
      entry.model.scale.y = Math.max(0.08, b.buildProgress);
      entry.ring.visible = !!b.selected;
      entry.group.visible = true;
      // farm windmill blades — spins whether the farm is complete or not,
      // same simple time-based rotation the old 2D windmill used
      if (entry.model.userData.spinner) entry.model.userData.spinner.rotation.z = game.gameTime * 1.4;

      const roofY = entry.model.userData.roofTopY || 20;
      entry.hpInfo.bar.position.y = roofY + 4;
      this._setBarPct(entry.hpInfo, Math.max(0, b.hp / b.maxHp));

      let barPct = null, barColor = null;
      if (b.trainQueue && b.trainQueue.length > 0) {
        const job = b.trainQueue[0];
        barPct = 1 - job.timeLeft / job.totalTime;
        barColor = '#d8b23a';
      } else if (b.researching) {
        barPct = 1 - b.researching.timeLeft / b.researching.totalTime;
        barColor = '#7ac6e0';
      }
      if (barPct !== null && b.complete) {
        entry.progressInfo.bar.visible = true;
        entry.progressInfo.bar.position.y = roofY + 9;
        this._setBarPct(entry.progressInfo, barPct, barColor);
      } else {
        entry.progressInfo.bar.visible = false;
      }
    }
    for (const [id, entry] of this._buildingMeshes) {
      if (seen.has(id)) continue;
      this.scene.remove(entry.group);
      this._buildingMeshes.delete(id);
    }
  }

  // forest/gold/steel tiles get a real prop on top of the colored ground
  // (a small tree stand or an ore outcrop) instead of just a flat color —
  // rebuilt whenever a tile's resource type changes (e.g. a chopped-down
  // forest tile reverting to grass removes its tree stand)
  _syncResourceProps(game) {
    const map = game.map, fog = game.fog, TILE = game.tileSize;
    const seen = new Set();
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (!fog.isExplored(tx, ty)) continue;
        const type = map.getTile(tx, ty);
        if (!RESOURCE_TILE_TYPES.has(type)) continue;
        const key = tx + ',' + ty;
        let entry = this._resourceMeshes.get(key);
        if (entry && entry.type !== type) {
          this.scene.remove(entry.model);
          this._resourceMeshes.delete(key);
          entry = null;
        }
        if (!entry) {
          const seed = tx * 7 + ty * 13;
          const model = type === 1 ? createTreeModel(seed) : type === 4 ? createGoldNodeModel() : createSteelNodeModel();
          model.scale.setScalar(RESOURCE_SCALE);
          model.position.set(tx * TILE + TILE / 2, 0, ty * TILE + TILE / 2);
          this.scene.add(model);
          entry = { model, type };
          this._resourceMeshes.set(key, entry);
        }
        seen.add(key);
      }
    }
    for (const [key, entry] of this._resourceMeshes) {
      if (seen.has(key)) continue;
      this.scene.remove(entry.model);
      this._resourceMeshes.delete(key);
    }
  }

  _syncProjectiles(game) {
    for (const m of this._projectileMeshes) this.scene.remove(m);
    this._projectileMeshes = [];
    for (const p of game.projectiles) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(3, 6, 6),
        new THREE.MeshBasicMaterial({ color: FACTIONS[p.faction]?.colorSecondary || '#ffffff' })
      );
      mesh.position.set(p.x, 8, p.y);
      this.scene.add(mesh);
      this._projectileMeshes.push(mesh);
    }
  }

  // radiating spark burst wherever damage lands (gold) or healing ticks
  // (green) — cheap "juice" that makes combat/healing read clearly,
  // rebuilt from scratch every frame since game.effects entries are
  // themselves short-lived (game.js prunes them after ~0.25s)
  _syncEffects(game) {
    for (const m of this._effectMeshes) this.scene.remove(m);
    this._effectMeshes = [];
    for (const e of game.effects) {
      if (!game.fog.isVisible(Math.floor(e.x / game.tileSize), Math.floor(e.y / game.tileSize))) continue;
      const t = Math.min(1, e.age / 0.25);
      const color = e.kind === 'heal' ? '#8af0a0' : '#fff2c0';
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(2 + t * 6, 3 + t * 7, 10),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.max(0, 1 - t), side: THREE.DoubleSide })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(e.x, 6, e.y);
      this.scene.add(mesh);
      this._effectMeshes.push(mesh);
    }
  }

  _syncPlacementGhost(game) {
    if (!game.buildPlacementMode) {
      if (this._placementGhost) { this._placementGhost.visible = false; }
      return;
    }
    const { type, size, tx, ty, valid } = game.buildPlacementMode;
    // realFootprintPx positions the ghost on the actual tile grid it will
    // occupy; the model itself is built at the same inflated BUILDING_SCALE
    // size as a real placed building, so the preview matches what you get
    const realFootprintPx = size * game.tileSize;
    const visualFootprintPx = realFootprintPx * BUILDING_SCALE;
    if (!this._placementGhost || this._placementGhost.userData.type !== type) {
      if (this._placementGhost) this.scene.remove(this._placementGhost);
      const faction = FACTIONS[game.playerFaction];
      const model = createBuildingModel(type, faction, game.playerFaction, visualFootprintPx);
      model.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; } });
      model.userData.type = type;
      this._placementGhost = model;
      this.scene.add(model);
    }
    this._placementGhost.visible = true;
    this._placementGhost.position.set(tx * game.tileSize + realFootprintPx / 2, 0, ty * game.tileSize + realFootprintPx / 2);
    this._placementGhost.traverse((o) => {
      if (o.material && o.material.color) o.material.color.set(valid ? '#3ab03a' : '#b03a3a');
    });
  }

  // ---------------- camera ----------------
  _updateCamera(game) {
    const cam = game.camera;
    const targetX = cam.x + cam.width / 2;
    const targetZ = cam.y + cam.height / 2;
    const cosE = Math.cos(this._elevRad), sinE = Math.sin(this._elevRad);
    this.camera.position.set(targetX, this._camDist * sinE, targetZ + this._camDist * cosE);
    this.camera.lookAt(targetX, 0, targetZ);
    this.camera.updateProjectionMatrix();

    // the sun (and its shadow frustum) follows the same look-at point so
    // shadows stay correct anywhere on the map, not just near world origin
    this.sun.position.set(targetX - 400, 600, targetZ - 300);
    this.sun.target.position.set(targetX, 0, targetZ);
    this.sun.target.updateMatrixWorld();

    // fill light mirrors the sun from the opposite side, same follow logic
    this.fill.position.set(targetX + 400, 300, targetZ + 300);
    this.fill.target.position.set(targetX, 0, targetZ);
    this.fill.target.updateMatrixWorld();
  }

  // ---------------- main entry point, called once per frame from main.js ----------------
  render(game) {
    if (!this._terrainMesh || this._terrainMapRef !== game.map) {
      if (this._terrainMesh) this.scene.remove(this._terrainMesh);
      this._buildTerrain(game.map, game.tileSize);
      this._updateTerrainColors(game);
      this._syncResourceProps(game);
      this._syncTerrainDetail(game);
    } else {
      this._terrainColorDirty += 1;
      if (this._terrainColorDirty >= 6) { // throttle to roughly a few times/sec at 60fps
        this._terrainColorDirty = 0;
        this._updateTerrainColors(game);
        this._syncResourceProps(game);
        this._syncTerrainDetail(game);
      }
    }

    this._updateCamera(game);
    this._syncUnits(game);
    this._syncBuildings(game);
    this._syncProjectiles(game);
    this._syncEffects(game);
    this._syncResourceAmountLabel(game);
    this._syncPlacementGhost(game);

    this.renderer.render(this.scene, this.camera);
  }
}
