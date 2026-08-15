// Runs on the host's browser. Owns the real, authoritative `Game` — applies
// commands that arrive from the remote guest exactly the way it applies its
// own local commands (same `apply*Command` methods on Game), and streams
// periodic world snapshots back to the guest to render.

const SNAPSHOT_INTERVAL = 0.1; // ~10Hz — plenty smooth for a few dozen units, tiny bandwidth

export class NetworkHost {
  constructor(game, link) {
    this.game = game;
    this.link = link;
    this._snapshotTimer = 0;
    this.link.onMessage((msg) => this._handleMessage(msg));
  }

  _handleMessage(msg) {
    const { type } = msg;
    const owner = msg.owner;
    const g = this.game;
    switch (type) {
      case 'move': g.applyMoveCommand(owner, msg.unitIds, msg.wx, msg.wy, msg.attackMove); break;
      case 'attack': g.applyAttackCommand(owner, msg.unitIds, msg.targetId); break;
      case 'gather': g.applyGatherCommand(owner, msg.unitIds, msg.tx, msg.ty, msg.resourceType); break;
      case 'assist-build': g.applyAssistBuildCommand(owner, msg.unitIds, msg.buildingId); break;
      case 'build': g.applyBuildCommand(owner, msg.buildingType, msg.tx, msg.ty, msg.builderIds); break;
      case 'train': g.applyTrainCommand(owner, msg.buildingId, msg.role); break;
      case 'research': g.applyResearchCommand(owner, msg.buildingId, msg.key); break;
      case 'trade': g.applyTradeCommand(owner, msg.buildingId, msg.fromType); break;
      case 'stop': g.applyStopCommand(owner, msg.unitIds); break;
      default: break;
    }
  }

  // call once per frame from the host's own game loop, after game.update()
  tick(dt) {
    this._snapshotTimer += dt;
    if (this._snapshotTimer < SNAPSHOT_INTERVAL) return;
    this._snapshotTimer = 0;
    this.link.send({ type: 'snapshot', data: this.game.serializeSnapshot() });
  }
}
