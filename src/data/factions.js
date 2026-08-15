// Two houses, each mapped onto the same role set (worker / melee / ranged / cavalry / siege /
// champion / healer) so balance mirrors the classic "human vs orc" WC2 symmetry, just re-skinned.

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
      champion: 'Рыцарь Винтерфелла',
      healer: 'Мейстер',
      legend: 'Лютоволк',
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
      temple: 'Септа Семерых',
      market: 'Торговый двор',
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
      champion: 'Драконий страж',
      healer: 'Жрец Р\'глора',
      legend: 'Дракон',
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
      temple: 'Чертог Р\'глора',
      market: 'Торговая гавань',
    },
  },
};

// Stats are faction-agnostic (symmetric balance) — only names/graphics differ.
// `description` is shown as a tooltip everywhere the unit appears in the UI.
export const UNIT_STATS = {
  worker: {
    role: 'worker', hp: 30, speed: 60, sight: 4, buildTime: 15,
    cost: { gold: 60, wood: 0 }, food: 1,
    attack: 2, attackRange: 0.6, attackCooldown: 1.0, armor: 0,
    carryCapacity: 10,
    description: 'Добывает золото и дерево, строит и достраивает здания. Дешёвый, слабый в бою — основа экономики.',
  },
  melee: {
    role: 'melee', hp: 60, speed: 55, sight: 4, buildTime: 20,
    cost: { gold: 60, wood: 20 }, food: 1,
    attack: 9, attackRange: 0.7, attackCooldown: 1.0, armor: 2,
    description: 'Дешёвая пехота ближнего боя. Хорош числом на ранних стадиях игры.',
  },
  ranged: {
    role: 'ranged', hp: 35, speed: 55, sight: 5, buildTime: 22,
    cost: { gold: 50, wood: 40 }, food: 1,
    attack: 6, attackRange: 4.2, attackCooldown: 1.3, armor: 0,
    projectileSpeed: 260,
    description: 'Стреляет издалека, но хрупок в ближнем бою — держите позади пехоты.',
  },
  cavalry: {
    role: 'cavalry', hp: 90, speed: 100, sight: 5, buildTime: 26,
    cost: { gold: 80, wood: 40 }, food: 2,
    attack: 14, attackRange: 0.8, attackCooldown: 1.0, armor: 3,
    description: 'Быстрый и сильный всадник. Отлично добивает лучников и рабочих на флангах.',
  },
  siege: {
    role: 'siege', hp: 50, speed: 35, sight: 5, buildTime: 34,
    cost: { gold: 120, wood: 80 }, food: 3,
    attack: 30, attackRange: 5.5, attackCooldown: 2.4, armor: 1,
    projectileSpeed: 160, splashRadius: 1.1,
    description: 'Медленная осадная машина с огромным уроном по площади. Лучший выбор против зданий и толпы.',
  },
  champion: {
    role: 'champion', hp: 130, speed: 45, sight: 4, buildTime: 30,
    cost: { gold: 140, wood: 60 }, food: 2,
    attack: 16, attackRange: 0.75, attackCooldown: 1.1, armor: 4,
    description: 'Тяжёлый элитный латник: больше здоровья и брони, чем у обычной пехоты, но дороже и медленнее.',
  },
  healer: {
    role: 'healer', hp: 40, speed: 55, sight: 5, buildTime: 24,
    cost: { gold: 80, wood: 30 }, food: 1, armor: 0,
    healAmount: 4, healRange: 3.2, healCooldown: 1.2,
    description: 'Не сражается — сам находит и лечит раненых союзников поблизости. Держите его рядом с отрядом в бою.',
  },
  // the single strongest unit in the game — huge, expensive, steel-gated,
  // and capped at one per player (see maxCount) so it stays a rare showpiece
  // rather than a spammable answer to everything
  legend: {
    role: 'legend', hp: 450, speed: 65, sight: 7, buildTime: 90,
    cost: { gold: 380, wood: 180, steel: 50 }, food: 4,
    attack: 40, attackRange: 0.9, attackCooldown: 1.0, armor: 7,
    maxCount: 1,
    description: 'Величайший зверь дома — огромный, почти неуязвимый в бою. На весь матч можно вырастить только одного.',
  },
};

export const BUILDING_STATS = {
  townhall: {
    hp: 1200, size: 3, buildTime: 60, cost: { gold: 0, wood: 0 }, // pre-placed at game start
    trains: ['worker'], sight: 6, isDropoff: true, armor: 4,
    description: 'Главное здание: готовит рабочих, принимает добытые ресурсы. Поражение при его потере без других зданий.',
  },
  farm: {
    hp: 180, size: 1, buildTime: 18, cost: { gold: 40, wood: 60 },
    sight: 3, foodProvided: 6, armor: 0,
    description: 'Увеличивает лимит еды — стройте больше, чтобы содержать больше юнитов.',
  },
  barracks: {
    hp: 500, size: 2, buildTime: 40, cost: { gold: 120, wood: 80 },
    trains: ['melee', 'champion'], sight: 4, armor: 2,
    description: 'Готовит пехоту ближнего боя — обычную и тяжёлую элитную.',
  },
  archery: {
    hp: 400, size: 2, buildTime: 40, cost: { gold: 100, wood: 100 },
    trains: ['ranged'], sight: 4, armor: 2,
    description: 'Готовит стрелков дальнего боя.',
  },
  stable: {
    hp: 450, size: 2, buildTime: 45, cost: { gold: 150, wood: 100 },
    trains: ['cavalry', 'siege', 'legend'], sight: 4, armor: 2,
    description: 'Готовит конницу, осадные машины и легендарного зверя дома.',
  },
  tower: {
    hp: 300, size: 1, buildTime: 30, cost: { gold: 80, wood: 40 },
    sight: 7, armor: 3,
    attack: 12, attackRange: 5.5, attackCooldown: 1.0, projectileSpeed: 280,
    description: 'Неподвижное оборонительное строение — стреляет дальше любого мобильного юнита, само атакует врагов в радиусе обзора.',
  },
  forge: {
    hp: 400, size: 2, buildTime: 40, cost: { gold: 150, wood: 100 },
    sight: 3, armor: 2,
    description: 'Углублённые улучшения оружия и брони — усиливают все боевые юниты сразу.',
  },
  workshop: {
    hp: 350, size: 2, buildTime: 35, cost: { gold: 120, wood: 120 },
    sight: 3, armor: 1,
    description: 'Углублённые улучшения экономики — ускоряет добычу ресурсов и увеличивает переносимый запас.',
  },
  temple: {
    hp: 380, size: 2, buildTime: 42, cost: { gold: 130, wood: 90 },
    trains: ['healer'], sight: 4, armor: 1,
    description: 'Готовит целителей и улучшает силу исцеления.',
  },
  market: {
    hp: 300, size: 2, buildTime: 30, cost: { gold: 100, wood: 80 },
    sight: 3, armor: 1,
    description: 'Позволяет обменивать золото на дерево и наоборот, когда одного ресурса не хватает.',
  },
};

export function opponentOf(faction) {
  return faction === 'stark' ? 'targaryen' : 'stark';
}
