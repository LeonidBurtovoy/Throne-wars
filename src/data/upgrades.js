// Global per-player research: one-time upgrades that apply to every current
// and future unit/building of the relevant kind, mirroring WC2's Blacksmith model.
// `description` is shown as a tooltip on the research button.

// Every upgrade also costs a bit of Valyrian steel — the rare third resource
// mined from ore veins scattered around the map (see mapData.js). Regular
// unit/building costs never touch steel; it exists specifically to gate
// research, so "прокачка" always means fighting over those ore veins too.
export const UPGRADES = {
  meleeAttack: {
    name: 'Закалённые клинки', building: 'barracks', cost: { gold: 150, wood: 90, steel: 10 }, time: 45,
    kind: 'attack', role: 'melee', bonus: 3,
    description: 'Увеличивает урон атаки пехоты ближнего боя на +3.',
  },
  meleeArmor: {
    name: 'Кованые латы', building: 'barracks', cost: { gold: 150, wood: 110, steel: 10 }, time: 45,
    kind: 'armor', role: 'melee', bonus: 2,
    description: 'Увеличивает броню пехоты ближнего боя на +2.',
  },
  championAttack: {
    name: 'Тяжёлые двуручники', building: 'barracks', cost: { gold: 200, wood: 120, steel: 16 }, time: 55,
    kind: 'attack', role: 'champion', bonus: 4,
    description: 'Увеличивает урон атаки элитных латников на +4.',
  },
  championArmor: {
    name: 'Рыцарские доспехи', building: 'barracks', cost: { gold: 200, wood: 140, steel: 16 }, time: 55,
    kind: 'armor', role: 'champion', bonus: 3,
    description: 'Увеличивает броню элитных латников на +3.',
  },
  rangedAttack: {
    name: 'Гарпунные наконечники', building: 'archery', cost: { gold: 140, wood: 110, steel: 10 }, time: 45,
    kind: 'attack', role: 'ranged', bonus: 3,
    description: 'Увеличивает урон атаки стрелков на +3.',
  },
  rangedArmor: {
    name: 'Кожаные наручи', building: 'archery', cost: { gold: 120, wood: 90, steel: 8 }, time: 40,
    kind: 'armor', role: 'ranged', bonus: 1,
    description: 'Увеличивает броню стрелков на +1.',
  },
  cavalryAttack: {
    name: 'Турнирные копья', building: 'stable', cost: { gold: 180, wood: 100, steel: 12 }, time: 50,
    kind: 'attack', role: 'cavalry', bonus: 4,
    description: 'Увеличивает урон атаки конницы на +4.',
  },
  cavalryArmor: {
    name: 'Конная броня', building: 'stable', cost: { gold: 180, wood: 120, steel: 12 }, time: 50,
    kind: 'armor', role: 'cavalry', bonus: 2,
    description: 'Увеличивает броню конницы на +2.',
  },
  fortification: {
    name: 'Фортификация', building: 'townhall', cost: { gold: 200, wood: 150, steel: 14 }, time: 60,
    kind: 'buildingArmor', bonus: 2,
    description: 'Увеличивает броню всех зданий на +2.',
  },
  workerTools: {
    name: 'Улучшенные инструменты', building: 'townhall', cost: { gold: 100, wood: 100, steel: 8 }, time: 40,
    kind: 'gatherSpeed', bonus: 0.78,
    description: 'Ускоряет добычу золота и дерева рабочими.',
  },
  // forge: a second, deeper tier of weapon upgrades that stacks on top of the
  // per-role ones above and applies to every combat role at once
  masterSmithing: {
    name: 'Мастера-оружейники', building: 'forge', cost: { gold: 240, wood: 160, steel: 22 }, time: 55,
    kind: 'attackAll', bonus: 3,
    description: 'Увеличивает урон атаки ВСЕХ боевых юнитов на +3, поверх остальных улучшений оружия.',
  },
  temperedArmor: {
    name: 'Закалённая броня', building: 'forge', cost: { gold: 220, wood: 160, steel: 20 }, time: 55,
    kind: 'armorAll', bonus: 2,
    description: 'Увеличивает броню ВСЕХ юнитов на +2, поверх остальных улучшений брони.',
  },
  // workshop: economy tier-2 — a second gather-speed boost (stacks with
  // workerTools) plus a flat carry-capacity increase (fewer round trips)
  gatherSpeedII: {
    name: 'Отточенные приёмы', building: 'workshop', cost: { gold: 150, wood: 100, steel: 14 }, time: 45,
    kind: 'gatherSpeed', bonus: 0.85,
    description: 'Ещё сильнее ускоряет добычу ресурсов (складывается с "Улучшенными инструментами").',
  },
  carryCapacity: {
    name: 'Большие мешки', building: 'workshop', cost: { gold: 130, wood: 90, steel: 12 }, time: 40,
    kind: 'carryCapacity', bonus: 5,
    description: 'Рабочие переносят больше ресурса за один поход — меньше беготни туда-обратно.',
  },
  // temple: healer power tier
  healPower: {
    name: 'Дар исцеления', building: 'temple', cost: { gold: 140, wood: 80, steel: 12 }, time: 40,
    kind: 'healAmount', bonus: 3,
    description: 'Увеличивает количество здоровья, восстанавливаемого целителем за раз, на +3.',
  },
  healRangeUp: {
    name: 'Благословение', building: 'temple', cost: { gold: 120, wood: 70, steel: 10 }, time: 35,
    kind: 'healRange', bonus: 1.2,
    description: 'Увеличивает радиус, на котором целитель находит раненых союзников.',
  },
  // market: trade tier
  marketRate: {
    name: 'Выгодная торговля', building: 'market', cost: { gold: 150, wood: 60, steel: 14 }, time: 35,
    kind: 'tradeRate', bonus: 0.15,
    description: 'Улучшает курс обмена ресурсов на торговом дворе.',
  },
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

export function getHealAmountBonus(entity) {
  if (!entity.upgrades || entity.role !== 'healer') return 0;
  return entity.upgrades.healPower ? UPGRADES.healPower.bonus : 0;
}

export function getHealRangeBonus(entity) {
  if (!entity.upgrades || entity.role !== 'healer') return 0;
  return entity.upgrades.healRangeUp ? UPGRADES.healRangeUp.bonus : 0;
}

export function getTradeRate(player) {
  return player.upgrades.marketRate ? UPGRADES.marketRate.bonus : 0;
}
