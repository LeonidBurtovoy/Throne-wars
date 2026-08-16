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
import { createUnitModel, createBuildingModel, createTreeModel, createGoldNodeModel, createSteelNodeModel } from './models.js';
import { FACTIONS } from '../data/factions.js';

const TERRAIN_COLOR = {
  0: '#2f5c28', // grass
  1: '#1d481f', // forest (tree-stand props sit on top, see _syncResourceProps)
  2: '#1c4f8c', // water
  3: '#544c3e', // rock
  4: '#4a4034', // gold (ore-outcrop prop sits on top)
  5: '#33363e', // steel (ore-outcrop prop sits on top)
};
const RESOURCE_TILE_TYPES = new Set([1, 4, 5]); // forest, gold, steel

export class Renderer3D {
  constructor(canvas, viewportWidth, viewportHeight) {
    this.canvas = canvas;
    this.width = viewportWidth;
    this.height = viewportHeight;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(viewportWidth, viewportHeight, false);
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#05050a');

    const halfW = viewportWidth / 2, halfH = viewportHeight / 2;
    this.camera = new THREE.OrthographicCamera(-halfW, halfW, halfH * 1.35, -halfH * 1.35, 1, 4000);
    this._elevRad = THREE.MathUtils.degToRad(55);
    this._camDist = 1200;

    this.scene.add(new THREE.AmbientLight('#8a90a0', 0.65));
    const sun = new THREE.DirectionalLight('#fff3d8', 1.1);
    sun.position.set(-400, 600, -300);
    sun.castShadow = true;
    sun.shadow.camera.left = -800; sun.shadow.camera.right = 800;
    sun.shadow.camera.top = 800; sun.shadow.camera.bottom = -800;
    sun.shadow.camera.far = 2000;
    sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun);
    this.scene.add(sun.target);

    this._raycaster = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this._terrainMesh = null;
    this._terrainMapRef = null;
    this._terrainColorDirty = 0;

    this._unitMeshes = new Map();
    this._buildingMeshes = new Map();
    this._resourceMeshes = new Map();
    this._projectileMeshes = [];
    this._placementGhost = null;
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
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
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
    let i = 0;
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const explored = fog.isExplored(tx, ty);
        if (!explored) {
          c.set('#020203');
        } else {
          c.set(TERRAIN_COLOR[map.getTile(tx, ty)] || TERRAIN_COLOR[0]);
          if (!fog.isVisible(tx, ty)) c.multiplyScalar(0.45);
        }
        for (let v = 0; v < 4; v++) { colorAttr.setXYZ(i, c.r, c.g, c.b); i++; }
      }
    }
    colorAttr.needsUpdate = true;
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
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(9, 11, 16),
          new THREE.MeshBasicMaterial({ color: '#f0e6a0', side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.5;
        ring.visible = false;
        const group = new THREE.Group();
        group.add(model);
        group.add(ring);
        this.scene.add(group);
        entry = { group, model, ring, lastX: u.x, lastY: u.y };
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
        const footprintPx = b.size * game.tileSize;
        const model = createBuildingModel(b.type, faction, b.faction, footprintPx);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(footprintPx * 0.55, footprintPx * 0.6, 24),
          new THREE.MeshBasicMaterial({ color: '#f0e6a0', side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.5;
        ring.visible = false;
        const group = new THREE.Group();
        group.add(model);
        group.add(ring);
        this.scene.add(group);
        entry = { group, model, ring };
        this._buildingMeshes.set(b.id, entry);
      }
      entry.group.position.set(b.centerX, 0, b.centerY);
      entry.model.scale.y = Math.max(0.08, b.buildProgress);
      entry.ring.visible = !!b.selected;
      entry.group.visible = true;
      // farm windmill blades — spins whether the farm is complete or not,
      // same simple time-based rotation the old 2D windmill used
      if (entry.model.userData.spinner) entry.model.userData.spinner.rotation.z = game.gameTime * 1.4;
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

  _syncPlacementGhost(game) {
    if (!game.buildPlacementMode) {
      if (this._placementGhost) { this._placementGhost.visible = false; }
      return;
    }
    const { type, size, tx, ty, valid } = game.buildPlacementMode;
    const footprintPx = size * game.tileSize;
    if (!this._placementGhost || this._placementGhost.userData.type !== type) {
      if (this._placementGhost) this.scene.remove(this._placementGhost);
      const faction = FACTIONS[game.playerFaction];
      const model = createBuildingModel(type, faction, game.playerFaction, footprintPx);
      model.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; } });
      model.userData.type = type;
      this._placementGhost = model;
      this.scene.add(model);
    }
    this._placementGhost.visible = true;
    this._placementGhost.position.set(tx * game.tileSize + footprintPx / 2, 0, ty * game.tileSize + footprintPx / 2);
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
  }

  // ---------------- main entry point, called once per frame from main.js ----------------
  render(game) {
    if (!this._terrainMesh || this._terrainMapRef !== game.map) {
      if (this._terrainMesh) this.scene.remove(this._terrainMesh);
      this._buildTerrain(game.map, game.tileSize);
      this._updateTerrainColors(game);
      this._syncResourceProps(game);
    } else {
      this._terrainColorDirty += 1;
      if (this._terrainColorDirty >= 6) { // throttle to roughly a few times/sec at 60fps
        this._terrainColorDirty = 0;
        this._updateTerrainColors(game);
        this._syncResourceProps(game);
      }
    }

    this._updateCamera(game);
    this._syncUnits(game);
    this._syncBuildings(game);
    this._syncProjectiles(game);
    this._syncPlacementGhost(game);

    this.renderer.render(this.scene, this.camera);
  }
}
