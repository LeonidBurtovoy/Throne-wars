export const TILE = 32;

export const TILE_TYPE = {
  GRASS: 0,
  FOREST: 1,
  WATER: 2,
  ROCK: 3,
  GOLD: 4,
};

// tiles a unit cannot walk onto
export const BLOCKING_TILES = new Set([TILE_TYPE.WATER, TILE_TYPE.ROCK, TILE_TYPE.GOLD]);

export const VIEWPORT = {
  width: 960,
  height: 660,
};

export const GATHER = {
  carryCapacity: 10,
  gatherTimeGold: 1.4,   // seconds per "tick" mined while standing on gold tile
  gatherTimeWood: 1.1,   // seconds per tick chopped
  goldNodeAmount: 4000,
  woodNodeAmount: 200,   // per forest tile
};

export const FARM_FOOD = 6;
export const START_GOLD = 300;
export const START_WOOD = 150;
export const START_FOOD_CAP = 4;

export const FOG = {
  UNSEEN: 0,
  EXPLORED: 1,
  VISIBLE: 2,
};
