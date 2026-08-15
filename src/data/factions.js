// Two houses, each mapped onto the same role set (worker / melee / ranged / cavalry / siege)
// so balance mirrors the classic "human vs orc" WC2 symmetry, just re-skinned.

export const FACTIONS = {
  stark: {
    name: 'Дом Старков',
    colorPrimary: '#7f93ab',
    colorSecondary: '#e7edf3',
    unitNames: {
      worker: 'Смерд',
      melee: 'Латник Севера',
      ranged: 'Лучник Винтерфелла',
      cavalry: 'Конный рыцарь',
      siege: 'Осадная башня',
    },
    buildingNames: {
      townhall: 'Чертог Старков',
      farm: 'Пашня',
      barracks: 'Казармы',
      archery: 'Псарня лучников',
      stable: 'Конюшня',
      tower: 'Дозорная башня',
      forge: 'Кузница',
      workshop: 'Мастерская снабжения',
    },
  },
  targaryen: {
    name: 'Дом Таргариенов',
    colorPrimary: '#8a1f1f',
    colorSecondary: '#1a1a1a',
    unitNames: {
      worker: 'Простолюдин',
      melee: 'Меч Драконьего Камня',
      ranged: 'Огненный стрелок',
      cavalry: 'Всадник на драконе',
      siege: 'Скорпион',
    },
    buildingNames: {
      townhall: 'Драконье Гнездо',
      farm: 'Плантация',
      barracks: 'Казармы Пламени',
      archery: 'Огненный двор',
      stable: 'Логово драконов',
      tower: 'Сторожевая башня',
      forge: 'Огненная кузница',
      workshop: 'Палата снабжения',
    },
  },
};

// Stats are faction-agnostic (symmetric balance) — only names/graphics differ.
export const UNIT_STATS = {
  worker: {
    role: 'worker', hp: 30, speed: 60, sight: 4, buildTime: 15,
    cost: { gold: 60, wood: 0 }, food: 1,
    attack: 2, attackRange: 0.6, attackCooldown: 1.0, armor: 0,
    carryCapacity: 10,
  },
  melee: {
    role: 'melee', hp: 60, speed: 55, sight: 4, buildTime: 20,
    cost: { gold: 60, wood: 20 }, food: 1,
    attack: 9, attackRange: 0.7, attackCooldown: 1.0, armor: 2,
  },
  ranged: {
    role: 'ranged', hp: 35, speed: 55, sight: 5, buildTime: 22,
    cost: { gold: 50, wood: 40 }, food: 1,
    attack: 6, attackRange: 4.2, attackCooldown: 1.3, armor: 0,
    projectileSpeed: 260,
  },
  cavalry: {
    role: 'cavalry', hp: 90, speed: 100, sight: 5, buildTime: 26,
    cost: { gold: 80, wood: 40 }, food: 2,
    attack: 14, attackRange: 0.8, attackCooldown: 1.0, armor: 3,
  },
  siege: {
    role: 'siege', hp: 50, speed: 35, sight: 5, buildTime: 34,
    cost: { gold: 120, wood: 80 }, food: 3,
    attack: 30, attackRange: 5.5, attackCooldown: 2.4, armor: 1,
    projectileSpeed: 160, splashRadius: 1.1,
  },
};

export const BUILDING_STATS = {
  townhall: {
    hp: 1200, size: 3, buildTime: 60, cost: { gold: 0, wood: 0 }, // pre-placed at game start
    trains: ['worker'], sight: 6, isDropoff: true, armor: 4,
  },
  farm: {
    hp: 180, size: 1, buildTime: 18, cost: { gold: 40, wood: 60 },
    sight: 3, foodProvided: 6, armor: 0,
  },
  barracks: {
    hp: 500, size: 2, buildTime: 40, cost: { gold: 120, wood: 80 },
    trains: ['melee'], sight: 4, armor: 2,
  },
  archery: {
    hp: 400, size: 2, buildTime: 40, cost: { gold: 100, wood: 100 },
    trains: ['ranged'], sight: 4, armor: 2,
  },
  stable: {
    hp: 450, size: 2, buildTime: 45, cost: { gold: 150, wood: 100 },
    trains: ['cavalry', 'siege'], sight: 4, armor: 2,
  },
  tower: {
    hp: 300, size: 1, buildTime: 30, cost: { gold: 80, wood: 40 },
    sight: 6, armor: 3,
    attack: 12, attackRange: 4.5, attackCooldown: 1.0, projectileSpeed: 280,
  },
  forge: {
    hp: 400, size: 2, buildTime: 40, cost: { gold: 150, wood: 100 },
    sight: 3, armor: 2,
  },
  workshop: {
    hp: 350, size: 2, buildTime: 35, cost: { gold: 120, wood: 120 },
    sight: 3, armor: 1,
  },
};

export function opponentOf(faction) {
  return faction === 'stark' ? 'targaryen' : 'stark';
}
