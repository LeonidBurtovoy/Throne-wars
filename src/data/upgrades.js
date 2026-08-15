// Global per-player research: one-time upgrades that apply to every current
// and future unit/building of the relevant kind, mirroring WC2's Blacksmith model.

export const UPGRADES = {
  meleeAttack: { name: 'Закалённые клинки', building: 'barracks', cost: { gold: 150, wood: 90 }, time: 45, kind: 'attack', role: 'melee', bonus: 3 },
  meleeArmor: { name: 'Кованые латы', building: 'barracks', cost: { gold: 150, wood: 110 }, time: 45, kind: 'armor', role: 'melee', bonus: 2 },
  rangedAttack: { name: 'Гарпунные наконечники', building: 'archery', cost: { gold: 140, wood: 110 }, time: 45, kind: 'attack', role: 'ranged', bonus: 3 },
  rangedArmor: { name: 'Кожаные наручи', building: 'archery', cost: { gold: 120, wood: 90 }, time: 40, kind: 'armor', role: 'ranged', bonus: 1 },
  cavalryAttack: { name: 'Турнирные копья', building: 'stable', cost: { gold: 180, wood: 100 }, time: 50, kind: 'attack', role: 'cavalry', bonus: 4 },
  cavalryArmor: { name: 'Конная броня', building: 'stable', cost: { gold: 180, wood: 120 }, time: 50, kind: 'armor', role: 'cavalry', bonus: 2 },
  fortification: { name: 'Фортификация', building: 'townhall', cost: { gold: 200, wood: 150 }, time: 60, kind: 'buildingArmor', bonus: 2 },
  workerTools: { name: 'Улучшенные инструменты', building: 'townhall', cost: { gold: 100, wood: 100 }, time: 40, kind: 'gatherSpeed', bonus: 0.78 },
  // forge: a second, deeper tier of weapon upgrades that stacks on top of the
  // per-role ones above and applies to every combat role at once
  masterSmithing: { name: 'Мастера-оружейники', building: 'forge', cost: { gold: 240, wood: 160 }, time: 55, kind: 'attackAll', bonus: 3 },
  temperedArmor: { name: 'Закалённая броня', building: 'forge', cost: { gold: 220, wood: 160 }, time: 55, kind: 'armorAll', bonus: 2 },
  // workshop: economy tier-2 — a second gather-speed boost (stacks with
  // workerTools) plus a flat carry-capacity increase (fewer round trips)
  gatherSpeedII: { name: 'Отточенные приёмы', building: 'workshop', cost: { gold: 150, wood: 100 }, time: 45, kind: 'gatherSpeed', bonus: 0.85 },
  carryCapacity: { name: 'Большие мешки', building: 'workshop', cost: { gold: 130, wood: 90 }, time: 40, kind: 'carryCapacity', bonus: 5 },
};

export function createDefaultUpgrades() {
  const state = {};
  for (const key of Object.keys(UPGRADES)) state[key] = false;
  return state;
}

export function upgradesForBuilding(type) {
  return Object.entries(UPGRADES).filter(([, def]) => def.building === type);
}

export function getAttackBonus(entity) {
  if (!entity.upgrades || entity.kind !== 'unit') return 0;
  const key = entity.role + 'Attack';
  const def = UPGRADES[key];
  let bonus = def && entity.upgrades[key] ? def.bonus : 0;
  if (entity.upgrades.masterSmithing) bonus += UPGRADES.masterSmithing.bonus;
  return bonus;
}

export function getArmorBonus(entity) {
  if (!entity.upgrades) return 0;
  if (entity.kind === 'building') return entity.upgrades.fortification ? UPGRADES.fortification.bonus : 0;
  const key = entity.role + 'Armor';
  const def = UPGRADES[key];
  let bonus = def && entity.upgrades[key] ? def.bonus : 0;
  if (entity.upgrades.temperedArmor) bonus += UPGRADES.temperedArmor.bonus;
  return bonus;
}

export function getGatherTimeMultiplier(entity) {
  if (!entity.upgrades || entity.role !== 'worker') return 1;
  let mult = 1;
  if (entity.upgrades.workerTools) mult *= UPGRADES.workerTools.bonus;
  if (entity.upgrades.gatherSpeedII) mult *= UPGRADES.gatherSpeedII.bonus;
  return mult;
}

export function getCarryCapacityBonus(entity) {
  if (!entity.upgrades || entity.role !== 'worker') return 0;
  return entity.upgrades.carryCapacity ? UPGRADES.carryCapacity.bonus : 0;
}
