export function canAfford(player, cost) {
  return player.gold >= (cost.gold || 0) && player.wood >= (cost.wood || 0);
}

export function spendResources(player, cost) {
  player.gold -= (cost.gold || 0);
  player.wood -= (cost.wood || 0);
}

export function refundResources(player, cost, ratio = 1) {
  player.gold += Math.floor((cost.gold || 0) * ratio);
  player.wood += Math.floor((cost.wood || 0) * ratio);
}

export function hasFoodRoom(player, amount) {
  return player.foodUsed + amount <= player.foodCap;
}

export function reserveFood(player, amount) {
  player.foodUsed += amount;
}

export function releaseFood(player, amount) {
  player.foodUsed = Math.max(0, player.foodUsed - amount);
}
