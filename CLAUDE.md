# Throne Wars — notes for Claude

Vanilla JS + Canvas/WebGL RTS, no build step, deployed via GitHub Pages
(`https://leonidburtovoy.github.io/Throne-wars/`). Rendering moved from a
2D canvas renderer to real 3D via Three.js (`src/render3d/`) partway
through this project's history — `src/data/sprites.js` now only supplies
small 2D HUD icons, not the battlefield view.

## Visual QA: you can actually see the WebGL output

`.devtools/screenshot.js` boots a real local match in headless Chrome
(via `playwright-core`, driving the system-installed Google Chrome — no
separate browser download) and saves a PNG of the live 3D scene. Use the
`Read` tool on the resulting PNG to actually look at it — this is real
visual feedback, not a headless logic-only stub.

Setup (one-time per machine/session if `node_modules` isn't present):
```
cd .devtools && npm install playwright-core
```

Usage (from `.devtools/`, with a static server already running from the
repo root, e.g. `python3 -m http.server 8099 &`):
```
node screenshot.js /tmp/shot.png --wait=4000 [--faction=stark|targaryen] [--map=map1..4] [--clip=x,y,w,h]
```
It clicks through the menu (faction → map → 1 opponent → start), waits
`--wait` ms for the game to boot and render, then screenshots. `--clip`
crops to a pixel region of the 1280x800 page if you need to zoom in on a
specific building/unit rather than the whole battlefield. Console errors
and WebGL driver warnings are printed after the screenshot path.

This is genuinely new capability, established 2026-08-17 after
discovering Node/Chrome were both available in this environment despite
an earlier (incorrect) assumption that they weren't. Use it before
telling the user a 3D/rendering change is done — reasoning about
Three.js geometry by hand (as most of `src/render3d/` was originally
built) is error-prone and was normal only because this tool didn't exist
yet. It already caught a real bug this way: the camera elevation angle
(55deg) rendered far more top-down than intended, hiding all building
facade detail — fixed to 32deg after comparing screenshots at several
angles.

## Testing game logic (headless, no browser)

Pure simulation logic (Unit/Building/AI/Combat/Economy/Selection/
Pathfinding, map generation, multiplayer command handling) is tested via
a custom Python ES-module bundler + DOM/canvas stub run through
`osascript -l JavaScript` (macOS JavaScriptCore) — this predates the
screenshot tooling above and still doesn't execute any `THREE.*` code
path, so it's the right tool for logic changes, while the screenshot
tool above is for anything touching `src/render3d/`. The bundler/stub/
driver scripts live in the session's scratchpad directory, not in this
repo — a fresh session needs to recreate them (bundle external
`https://` imports as no-ops, stub `document`/`canvas`, drive via
`osascript`) or ask the user where prior scratchpad files went.
