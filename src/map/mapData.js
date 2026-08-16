import { TILE_TYPE } from '../config.js';
import { TileMap } from './TileMap.js';

function fillRect(tiles, w, x0, y0, x1, y1, type) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0) continue;
      tiles[y * w + x] = type;
    }
  }
}

function circlePatch(tiles, w, h, cx, cy, r, type) {
  for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) tiles[y * w + x] = type;
    }
  }
}

function mirrorPoint(w, h, x, y) {
  return [w - 1 - x, h - 1 - y];
}

function buildBase(width, height) {
  const tiles = new Uint8Array(width * height).fill(TILE_TYPE.GRASS);
  fillRect(tiles, width, 0, 0, width - 1, 0, TILE_TYPE.ROCK);
  fillRect(tiles, width, 0, height - 1, width - 1, height - 1, TILE_TYPE.ROCK);
  fillRect(tiles, width, 0, 0, 0, height - 1, TILE_TYPE.ROCK);
  fillRect(tiles, width, width - 1, 0, width - 1, height - 1, TILE_TYPE.ROCK);
  return tiles;
}

// places a 2x2 gold cluster near (cx,cy) and its point-symmetric mirror
// (which lands near the opposite corner of a 4-corner-symmetric map).
// Mirrors the block's near corner (cx,cy), not the far corner (cx+1,cy+1) —
// mirroring the far corner was off by one tile in both axes, confirmed by a
// strict point-symmetry check across the whole tile grid.
function placeGoldCluster(tiles, w, h, cx, cy) {
  const cells = [[0, 0], [1, 0], [0, 1], [1, 1]];
  for (const [dx, dy] of cells) tiles[(cy + dy) * w + (cx + dx)] = TILE_TYPE.GOLD;
  const [mx, my] = mirrorPoint(w, h, cx, cy);
  for (const [dx, dy] of cells) tiles[(my - dy) * w + (mx - dx)] = TILE_TYPE.GOLD;
}

function placeForestPatch(tiles, w, h, cx, cy, r) {
  circlePatch(tiles, w, h, cx, cy, r, TILE_TYPE.FOREST);
  const [mx, my] = mirrorPoint(w, h, cx, cy);
  circlePatch(tiles, w, h, mx, my, r, TILE_TYPE.FOREST);
}

// same mirrored-pair idea as placeForestPatch, for water pockets that aren't
// centered on the map (a circle placed exactly at the map center is already
// self-symmetric under the 180-degree corner mirror and doesn't need this)
function placeWaterPatch(tiles, w, h, cx, cy, r) {
  circlePatch(tiles, w, h, cx, cy, r, TILE_TYPE.WATER);
  const [mx, my] = mirrorPoint(w, h, cx, cy);
  circlePatch(tiles, w, h, mx, my, r, TILE_TYPE.WATER);
}

// a single Valyrian-steel ore tile plus its mirror — deliberately tiny
// (unlike the 2x2 gold cluster) since this resource is meant to stay scarce
function placeSteelVein(tiles, w, h, cx, cy) {
  tiles[cy * w + cx] = TILE_TYPE.STEEL;
  const [mx, my] = mirrorPoint(w, h, cx, cy);
  tiles[my * w + mx] = TILE_TYPE.STEEL;
}

// fills a rect and its point-mirrored counterpart — unlike a single fillRect
// "at the center", this is symmetric by construction regardless of whether
// the map's width/height is odd or even (an even dimension has no tile that
// is exactly its own mirror, so anything meant to be centered must always
// be placed as an explicit pair, never a single bare shape)
function placeRectPatch(tiles, w, h, x0, y0, x1, y1, type) {
  fillRect(tiles, w, x0, y0, x1, y1, type);
  const [mx0, my0] = mirrorPoint(w, h, x1, y1);
  const [mx1, my1] = mirrorPoint(w, h, x0, y0);
  fillRect(tiles, w, mx0, my0, mx1, my1, type);
}

// 4 corner start points: [top-left, top-right, bottom-left, bottom-right].
// Only the first (numOpponents + 1) are actually used by Game, but all four
// are always generated so any map supports 1-3 opponents.
function cornerStarts(width, height, inset) {
  return [
    { x: inset, y: inset },
    { x: width - inset - 4, y: inset },
    { x: inset, y: height - inset - 4 },
    { x: width - inset - 4, y: height - inset - 4 },
  ];
}

// All four maps sized up ~25% from their previous dimensions (bigger
// strongholds and bigger units need more room to actually feel bigger
// instead of just crowding the same footprint).

function generateMap1() {
  const width = 66, height = 48;
  const tiles = buildBase(width, height);

  // through the mirror-pair helper, not a bare circlePatch — the map's
  // dimensions are even, so no tile is exactly its own mirror
  placeWaterPatch(tiles, width, height, Math.floor(width / 2), Math.floor(height / 2), 8);

  // top-left seed (auto-mirrors to bottom-right)
  placeGoldCluster(tiles, width, height, 13, 5);
  placeGoldCluster(tiles, width, height, 17, 11);
  placeForestPatch(tiles, width, height, 5, 15, 3);
  placeForestPatch(tiles, width, height, 17, 9, 3);
  placeForestPatch(tiles, width, height, 8, 23, 4);

  // top-right seed (auto-mirrors to bottom-left)
  placeGoldCluster(tiles, width, height, 48, 5);
  placeGoldCluster(tiles, width, height, 44, 11);
  placeForestPatch(tiles, width, height, 57, 15, 3);
  placeForestPatch(tiles, width, height, 46, 9, 3);

  // rare Valyrian-steel veins, scattered across contested no-man's-land
  // between the corner bases rather than tucked next to anyone's start
  placeSteelVein(tiles, width, height, 18, 24);
  placeSteelVein(tiles, width, height, 33, 10);

  const map = new TileMap(width, height, tiles);
  return {
    map,
    starts: cornerStarts(width, height, 4),
    name: 'Речные земли',
  };
}

function generateMap2() {
  const width = 80, height = 58;
  const tiles = buildBase(width, height);

  // through the mirror-pair helper, not a bare fillRect — same even-
  // dimension reasoning as map1's lake above
  const midX = Math.floor(width / 2);
  placeRectPatch(tiles, width, height, midX - 1, 2, midX + 1, height - 3, TILE_TYPE.ROCK);
  placeRectPatch(tiles, width, height, midX - 1, Math.floor(height / 2) - 3, midX + 1, Math.floor(height / 2) + 3, TILE_TYPE.GRASS);

  // top-left seed (auto-mirrors to bottom-right)
  placeGoldCluster(tiles, width, height, 13, 5);
  placeGoldCluster(tiles, width, height, 16, 14);
  placeForestPatch(tiles, width, height, 5, 15, 3);
  placeForestPatch(tiles, width, height, 6, 21, 4);
  placeForestPatch(tiles, width, height, 21, 19, 3);

  // top-right seed (auto-mirrors to bottom-left)
  placeGoldCluster(tiles, width, height, 58, 6);
  placeGoldCluster(tiles, width, height, 54, 15);
  placeForestPatch(tiles, width, height, 50, 13, 3);
  placeForestPatch(tiles, width, height, 65, 20, 3);

  // rare Valyrian-steel veins, one pocket on each side of the central
  // mountain pass so both flanks have something worth fighting over
  placeSteelVein(tiles, width, height, 23, 29);
  placeSteelVein(tiles, width, height, 11, 38);

  const map = new TileMap(width, height, tiles);
  return {
    map,
    starts: cornerStarts(width, height, 4),
    name: 'Пепельный перевал',
  };
}

// Wide open plains threaded by a winding river of lake pockets — no chokepoint
// at all, unlike map1's single central lake or map2's mountain pass. The
// richest map (extra gold clusters, extra steel veins) to reward players who
// contest the open middle instead of turtling in a corner.
function generateMap3() {
  const width = 70, height = 52;
  const tiles = buildBase(width, height);

  // the "central" lake also goes through the mirror helper — an even-sized
  // map has no tile that is exactly its own mirror, so a single bare
  // circlePatch here would land slightly off-center and break symmetry
  placeWaterPatch(tiles, width, height, Math.floor(width / 2), Math.floor(height / 2), 6);
  placeWaterPatch(tiles, width, height, 20, 15, 4);
  placeWaterPatch(tiles, width, height, 48, 16, 4);

  // top-left seed (auto-mirrors to bottom-right)
  placeGoldCluster(tiles, width, height, 11, 5);
  placeGoldCluster(tiles, width, height, 15, 13);
  placeForestPatch(tiles, width, height, 5, 16, 3);
  placeForestPatch(tiles, width, height, 18, 8, 3);
  placeForestPatch(tiles, width, height, 6, 24, 4);

  // top-right seed (auto-mirrors to bottom-left)
  placeGoldCluster(tiles, width, height, 56, 5);
  placeGoldCluster(tiles, width, height, 53, 13);
  placeForestPatch(tiles, width, height, 63, 16, 3);
  placeForestPatch(tiles, width, height, 50, 8, 3);

  // extra gold out in the open middle ground — worth fighting over
  placeGoldCluster(tiles, width, height, 30, 38);

  // richest map for Valyrian steel too — three veins per side
  placeSteelVein(tiles, width, height, 13, 30);
  placeSteelVein(tiles, width, height, 35, 8);
  placeSteelVein(tiles, width, height, 58, 25);

  const map = new TileMap(width, height, tiles);
  return {
    map,
    starts: cornerStarts(width, height, 4),
    name: 'Королевский тракт',
  };
}

// A single sealed causeway through a swamp splitting the map in two — the
// hardest chokepoint of the four maps (map2's mountain pass still leaves a
// sliver of open ground at the very top/bottom edges; this one is fully
// sealed edge-to-edge, so the causeway is the *only* way across).
function generateMap4() {
  const width = 72, height = 50;
  const tiles = buildBase(width, height);

  const midX = Math.floor(width / 2);
  const midY = Math.floor(height / 2);
  // both the swamp band and the causeway gap go through the mirror-pair
  // helper, not a bare fillRect — same even-dimension reasoning as the lake
  // in map3 above (there's no single tile that's exactly its own mirror)
  placeRectPatch(tiles, width, height, midX - 2, 1, midX + 2, height - 2, TILE_TYPE.WATER);
  placeRectPatch(tiles, width, height, midX - 2, midY - 3, midX + 2, midY + 3, TILE_TYPE.GRASS);

  // top-left seed (auto-mirrors to bottom-right)
  placeGoldCluster(tiles, width, height, 11, 5);
  placeGoldCluster(tiles, width, height, 15, 13);
  placeForestPatch(tiles, width, height, 5, 16, 3);
  placeForestPatch(tiles, width, height, 17, 9, 3);
  placeForestPatch(tiles, width, height, 7, 24, 4);

  // top-right seed (auto-mirrors to bottom-left)
  placeGoldCluster(tiles, width, height, 58, 5);
  placeGoldCluster(tiles, width, height, 54, 13);
  placeForestPatch(tiles, width, height, 65, 16, 3);
  placeForestPatch(tiles, width, height, 52, 9, 3);

  // steel sits right next to the causeway on both sides — controlling the
  // Neck means controlling the map's whole steel supply. The two seeds must
  // not be mirror images of each other, or the second call just re-draws
  // the first pair's tiles instead of adding two new ones.
  placeSteelVein(tiles, width, height, midX - 10, midY - 10);
  placeSteelVein(tiles, width, height, midX - 10, midY + 10);

  const map = new TileMap(width, height, tiles);
  return {
    map,
    starts: cornerStarts(width, height, 4),
    name: 'Перешеек',
  };
}

export function generateMap(mapId) {
  if (mapId === 'map2') return generateMap2();
  if (mapId === 'map3') return generateMap3();
  if (mapId === 'map4') return generateMap4();
  return generateMap1();
}
