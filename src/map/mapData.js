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
// (which lands near the opposite corner of a 4-corner-symmetric map)
function placeGoldCluster(tiles, w, h, cx, cy) {
  const cells = [[0, 0], [1, 0], [0, 1], [1, 1]];
  for (const [dx, dy] of cells) tiles[(cy + dy) * w + (cx + dx)] = TILE_TYPE.GOLD;
  const [mx, my] = mirrorPoint(w, h, cx + 1, cy + 1);
  for (const [dx, dy] of cells) tiles[(my - dy) * w + (mx - dx)] = TILE_TYPE.GOLD;
}

function placeForestPatch(tiles, w, h, cx, cy, r) {
  circlePatch(tiles, w, h, cx, cy, r, TILE_TYPE.FOREST);
  const [mx, my] = mirrorPoint(w, h, cx, cy);
  circlePatch(tiles, w, h, mx, my, r, TILE_TYPE.FOREST);
}

// a single Valyrian-steel ore tile plus its mirror — deliberately tiny
// (unlike the 2x2 gold cluster) since this resource is meant to stay scarce
function placeSteelVein(tiles, w, h, cx, cy) {
  tiles[cy * w + cx] = TILE_TYPE.STEEL;
  const [mx, my] = mirrorPoint(w, h, cx, cy);
  tiles[my * w + mx] = TILE_TYPE.STEEL;
}

// 4 corner start points: [top-left, top-right, bottom-left, bottom-right].
// Only the first (numOpponents + 1) are actually used by Game, but all four
// are always generated so any map supports 1-3 opponents.
function cornerStarts(width, height, inset) {
  return [
    { x: inset, y: inset },
    { x: width - inset - 3, y: inset },
    { x: inset, y: height - inset - 3 },
    { x: width - inset - 3, y: height - inset - 3 },
  ];
}

function generateMap1() {
  const width = 52, height = 38;
  const tiles = buildBase(width, height);

  circlePatch(tiles, width, height, Math.floor(width / 2), Math.floor(height / 2), 6, TILE_TYPE.WATER);

  // top-left seed (auto-mirrors to bottom-right)
  placeGoldCluster(tiles, width, height, 10, 4);
  placeGoldCluster(tiles, width, height, 13, 9);
  placeForestPatch(tiles, width, height, 4, 12, 2);
  placeForestPatch(tiles, width, height, 13, 7, 2);
  placeForestPatch(tiles, width, height, 6, 18, 3);

  // top-right seed (auto-mirrors to bottom-left)
  placeGoldCluster(tiles, width, height, 38, 4);
  placeGoldCluster(tiles, width, height, 35, 9);
  placeForestPatch(tiles, width, height, 45, 12, 2);
  placeForestPatch(tiles, width, height, 36, 7, 2);

  // rare Valyrian-steel veins, scattered across contested no-man's-land
  // between the corner bases rather than tucked next to anyone's start
  placeSteelVein(tiles, width, height, 14, 19);
  placeSteelVein(tiles, width, height, 26, 8);

  const map = new TileMap(width, height, tiles);
  return {
    map,
    starts: cornerStarts(width, height, 3),
    name: 'Речные земли',
  };
}

function generateMap2() {
  const width = 64, height = 46;
  const tiles = buildBase(width, height);

  const midX = Math.floor(width / 2);
  fillRect(tiles, width, midX - 1, 2, midX + 1, height - 3, TILE_TYPE.ROCK);
  fillRect(tiles, width, midX - 1, Math.floor(height / 2) - 3, midX + 1, Math.floor(height / 2) + 3, TILE_TYPE.GRASS);

  // top-left seed (auto-mirrors to bottom-right)
  placeGoldCluster(tiles, width, height, 10, 4);
  placeGoldCluster(tiles, width, height, 13, 11);
  placeForestPatch(tiles, width, height, 4, 12, 2);
  placeForestPatch(tiles, width, height, 5, 17, 3);
  placeForestPatch(tiles, width, height, 17, 15, 2);

  // top-right seed (auto-mirrors to bottom-left)
  placeGoldCluster(tiles, width, height, 46, 5);
  placeGoldCluster(tiles, width, height, 43, 12);
  placeForestPatch(tiles, width, height, 40, 10, 2);
  placeForestPatch(tiles, width, height, 52, 16, 2);

  // rare Valyrian-steel veins, one pocket on each side of the central
  // mountain pass so both flanks have something worth fighting over
  placeSteelVein(tiles, width, height, 18, 23);
  placeSteelVein(tiles, width, height, 9, 30);

  const map = new TileMap(width, height, tiles);
  return {
    map,
    starts: cornerStarts(width, height, 3),
    name: 'Пепельный перевал',
  };
}

export function generateMap(mapId) {
  if (mapId === 'map2') return generateMap2();
  return generateMap1();
}
