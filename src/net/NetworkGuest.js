// Runs on the guest's browser. The guest's `Game` never simulates locally
// (see `isRemoteGuest` in Game.js) — this class just applies snapshots that
// arrive from the host and forwards the guest's own commands back to it.

export class NetworkGuest {
  constructor(game, link) {
    this.game = game;
    this.link = link;
    game.network = this;
    this.link.onMessage((msg) => {
      if (msg.type === 'snapshot') this.game.applySnapshot(msg.data);
    });
  }

  sendCommand(type, args) {
    this.link.send({ type, ...args });
  }
}
