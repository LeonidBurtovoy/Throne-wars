export const TILE = 32;

export const TILE_TYPE = {
  GRASS: 0,
  FOREST: 1,
  WATER: 2,
  ROCK: 3,
  GOLD: 4,
  STEEL: 5, // rare Valyrian steel ore — gathered like gold, spent only on upgrades
};

// tiles a unit cannot walk onto
export const BLOCKING_TILES = new Set([TILE_TYPE.WATER, TILE_TYPE.ROCK, TILE_TYPE.GOLD, TILE_TYPE.STEEL]);

export const VIEWPORT = {
  width: 960,
  height: 600,
};

// height of the non-overlapping HUD strip below the map view (minimap +
// selection panel + command grid) — kept here alongside VIEWPORT since
// main.js needs both to size the game screen
export const BOTTOM_HUD_HEIGHT = 172;

export const GATHER = {
  carryCapacity: 10,
  gatherTimeGold: 1.4,   // seconds per "tick" mined while standing on gold tile
  gatherTimeWood: 1.1,   // seconds per tick chopped
  gatherTimeSteel: 2.6,  // slow — Valyrian steel is deliberately scarce and precious
  goldNodeAmount: 4000,
  woodNodeAmount: 200,   // per forest tile
  steelNodeAmount: 60,   // tiny compared to gold/wood — a handful of veins per map
};

export const FARM_FOOD = 6;
export const START_GOLD = 300;
export const START_WOOD = 150;
export const START_STEEL = 0;
export const START_FOOD_CAP = 4;

// market resource-exchange: how much of the source resource is spent per
// trade, and what fraction of it comes back as the other resource before
// the marketRate upgrade improves the cut
export const TRADE_BATCH = 100;
export const TRADE_BASE_RATE = 0.6;

export const FOG = {
  UNSEEN: 0,
  EXPLORED: 1,
  VISIBLE: 2,
};
