export class InputHandler {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    // starts at the canvas center, not (0,0) - (0,0) is coincidentally
    // always "at the edge" for _panCamera's edge-scroll check below, so
    // before the very first real mousemove event fires, the camera would
    // silently scroll toward the top-left corner every frame on its own.
    // Normally a few pixels of unwanted drift by the time a real player's
    // mouse reaches the game area - but for a network guest specifically,
    // whose camera only gets centered once real data arrives (well after
    // the game loop has already been running on stale (0,0) for a while,
    // unlike the local/host path which centers before the loop starts),
    // this could drag a freshly-centered camera away before the player
    // ever gets to click anything, making a just-fixed camera-centering
    // bug look like an unrelated "clicking things does nothing" bug.
    this.mouseX = canvas.width / 2;
    this.mouseY = canvas.height / 2;
    this.mouseDown = false;
    this.dragStart = null;
    this.dragging = false;
    this.keysDown = new Set();
    this._bind();
  }

  _rectPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  _bind() {
    // bound to window, not the canvas: the topbar overlays the canvas's top
    // edge and the bottom HUD bar sits right below it, so a canvas-only
    // listener stops receiving events the moment the cursor crosses onto
    // either — edge-pan would then either freeze mid-scroll (using the last
    // in-canvas position forever) or never trigger at all near the top.
    // Coordinates are computed relative to the canvas regardless of which
    // element the event actually landed on, so this is safe everywhere.
    window.addEventListener('mousemove', (e) => {
      const [sx, sy] = this._rectPos(e);
      this.mouseX = sx; this.mouseY = sy;
      const [wx, wy] = this.game.renderer3D.screenToWorld(sx, sy);
      if (this.mouseDown && this.dragStart) {
        const dx = sx - this.dragStart[0], dy = sy - this.dragStart[1];
        if (Math.hypot(dx, dy) > 5) this.dragging = true;
      }
      if (this.game.buildPlacementMode) this.game.updatePlacementPreview(wx, wy);
    });

    this.canvas.addEventListener('mousedown', (e) => {
      const [sx, sy] = this._rectPos(e);
      const [wx, wy] = this.game.renderer3D.screenToWorld(sx, sy);
      if (e.button === 0) {
        if (this.game.buildPlacementMode) {
          this.game.confirmBuildPlacement(wx, wy);
          return;
        }
        this.mouseDown = true;
        this.dragStart = [sx, sy];
        this.dragging = false;
      } else if (e.button === 2) {
        if (this.game.buildPlacementMode) { this.game.cancelBuildPlacement(); return; }
        this.game.handleRightClick(wx, wy);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      if (!this.mouseDown) return;
      const [sx, sy] = this._rectPos(e);
      const shiftKey = e.shiftKey;
      if (this.dragging) {
        const [wx0, wy0] = this.game.renderer3D.screenToWorld(this.dragStart[0], this.dragStart[1]);
        const [wx1, wy1] = this.game.renderer3D.screenToWorld(sx, sy);
        this.game.handleBoxSelect(wx0, wy0, wx1, wy1, shiftKey);
      } else {
        const [wx, wy] = this.game.renderer3D.screenToWorld(sx, sy);
        this.game.handleLeftClick(wx, wy, shiftKey);
      }
      this.mouseDown = false;
      this.dragStart = null;
      this.dragging = false;
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      this.keysDown.add(e.key.toLowerCase());
      this.game.handleKeyDown(e);
    });
    window.addEventListener('keyup', (e) => this.keysDown.delete(e.key.toLowerCase()));
  }

  getDragBox() {
    if (!this.dragging || !this.dragStart) return null;
    return [this.dragStart[0], this.dragStart[1], this.mouseX, this.mouseY];
  }
}
