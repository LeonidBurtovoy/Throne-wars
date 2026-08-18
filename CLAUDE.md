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

## Network multiplayer QA: two real headless browsers

`.devtools/net-test.js` drives two independent headless Chrome contexts
(`browser.newContext()` twice) through the real host/join UI flow with
real PeerJS/WebRTC — not mocked. `.devtools/ice-test.js` goes one level
deeper: it monkey-patches `window.RTCPeerConnection` via `page.addInitScript`
*before* PeerJS's own script runs, so every actual `RTCPeerConnection` PeerJS
creates gets logged at the ICE level (candidate types found - host/srflx/
relay, `icecandidateerror` events with real STUN/TURN error codes, gathering/
connection state transitions). Previously the only guidance here was "can't
test this, need two real devices"; that's no longer true, and ice-test.js in
particular answers *why* a connection isn't opening, not just *whether*.

Round 1 (2026-08-17) added a custom `config: { iceServers: [...] }` to
`new Peer(...)` (a public TURN relay, openrelay via metered.ca), believing
PeerJS's default was STUN-only. **This was wrong and made things worse.**
Round 2 (2026-08-18, after the user reported it still wasn't working)
used ice-test.js to actually inspect the RTCPeerConnection config PeerJS
was constructing, and found: passing `config` to `new Peer(...)` *replaces*
PeerJS's default entirely rather than merging with it. PeerJS's real
default already includes a working TURN relay (`turn:eu-0.turn.peerjs.com`
/ `turn:us-0.turn.peerjs.com`, valid built-in credentials) alongside Google
STUN - confirmed by literally diffing the RTCPeerConnection config with and
without the override. The substituted metered.ca relay, meanwhile, was
actively broken from this test environment: DNS lookup failures
(`icecandidateerror` code 701) and `400` TURN-allocate errors on the rare
lookup that did resolve. **Fix: removed the custom `config` entirely** -
`PeerLink.js` now trusts PeerJS's own default, which is demonstrably better
configured than the hand-rolled replacement was. Lesson: verify an
assumption about a third-party library's defaults (e.g. by inspecting what
it actually constructs, like ice-test.js does) before "fixing" it -
guessing led directly to a regression here.

The 25s connection timeout (added round 1, kept) is still worth having
regardless of ICE config: without it, a connection that doesn't open hangs
"Ждём соперника…"/"Подключаемся…" forever with zero feedback either way.

Residual caveat, unchanged by the round-2 fix: this specific sandboxed test
environment cannot complete a real end-to-end WebRTC connection no matter
which ICE servers are configured - `ice-test.js` shows both peers
successfully getting real `srflx` (STUN-reflexive, i.e. actual public IP)
candidates from Google's STUN server, so basic UDP STUN traffic does get
out and back, but `iceConnectionState` never advances past `checking` in
the observation window, and separately, DNS lookups for *both*
`turn.peerjs.com` and `metered.ca` fail from inside this environment even
though the same hostnames resolve fine when queried directly against
8.8.8.8 from a plain shell command. That combination (STUN works, TURN
hostnames won't resolve, peer connectivity checks stall) points at this
sandbox's own DNS/UDP setup, not at the application code - but it does mean
true end-to-end multiplayer connectivity has never actually been verified
working from here, on either round of this fix. If a future report says it
*still* doesn't connect: re-run `ice-test.js` first. A real
`icecandidateerror`/state-transition trail (not a silent hang) narrows the
next step down a lot faster than reading PeerLink.js again from scratch.

## Real modeled assets (Kenney Castle Kit) — started 2026-08-17

Both castles (`src/render3d/kit.js`) are composed from real Kenney "Castle
Kit" pieces (CC0, `assets/kenney/castle-kit/`, ~2.2MB committed to the
repo) instead of hand-placed box/cylinder/cone primitives — a dramatic
visual upgrade discovered by actually looking at screenshots and deciding
the primitive approach had a hard ceiling. Everything else (units, other
buildings, resource props) is still procedural in `models.js` — this was
step one of a larger "replace primitives with real assets" pass, not the
whole thing. Natural next step if asked to continue: units need a rigged
character pack (e.g. Kenney "Blocky Characters", also CC0, already test-
downloaded during this pass) plus actual `AnimationMixer` wiring in
`Renderer3D.js` — a materially bigger job than the castles (which are
static prop composition) since it touches animation state per game unit
state (idle/walk/attack/gather), not just one-time geometry placement.

Pipeline, if extending this to more assets:
1. Find a pack on kenney.nl (CC0, no attribution required). Direct zip
   download links are inside the asset page's HTML behind a "Continue
   without donating" link (`grep -n '\.zip' ` on the fetched page), not
   discoverable from the static listing alone.
2. Unzip, take the `Models/GLB format/` folder (self-contained-ish; some
   pieces reference `Textures/colormap.png` by relative path despite
   being .glb, so that file needs to ship alongside the pieces, not just
   the pieces themselves — a `THREE.GLTFLoader: Couldn't load texture`
   console warning is the tell if it's missing).
3. Copy needed pieces into `assets/kenney/<pack>/`, plus its
   `License.txt` for provenance (renamed `LICENSE-<pack>.txt` to avoid
   colliding with other packs' license files in the same parent dir).
4. Measure real piece dimensions before composing anything —
   `.devtools/inspect.js '<file1>.glb,<file2>.glb,...'` loads each
   through a real GLTFLoader in headless Chrome and dumps bounding-box
   size/min/max. Kenney's kits are grid-modular (this pack's pieces are
   all 1x1 kit-tile footprint, walls/tower-bases 1.31 tall, roofs
   variable) — guessing dimensions instead of measuring wastes rounds.
5. Preview pieces visually before wiring into the real game —
   `.devtools/preview.html?files=a.glb,b.glb&base=/assets/.../` laid out
   in a grid, screenshotted via `node screenshot.js out.png --raw` with
   `GAME_URL` pointed at the preview page (`--raw` skips the normal
   menu-click boot sequence). This is what caught the actual Kenney art
   style (a cohesive tan sandstone texture, not flat-colored) before any
   composition work started.
6. GLTFLoader itself imports THREE via the bare `'three'` specifier
   internally (unlike the rest of this project, which imports THREE via
   a direct unpkg URL) — needs the import map already added to
   `index.html`'s `<head>` (and to `.devtools/inspect.html`/
   `preview.html` for standalone testing). Both import styles resolve to
   the same underlying module under that map, so they coexist safely;
   no need to convert the rest of the codebase's imports.
7. Loading is inherently async; the rest of this codebase's model
   factories are synchronous. Resolved by preloading ALL needed pieces
   once during boot (`preloadCastleKit()`, awaited in each of `main.js`'s
   three boot functions before `runLoop` starts) and caching the loaded
   templates; the actual per-building factory functions just clone from
   the cache and stay synchronous like every other factory in
   `models.js`. `kit.piece()` throws loudly if called before preload
   completes — a signal to check the await is actually in place, not a
   bug to work around.
8. The custom Python bundler used for headless logic tests (see below)
   needed its `is_external()` check extended to also skip bare
   specifiers (`three`, `three/addons/...`), not just `http(s)://` URLs
   — otherwise it tries to resolve them as local files and fails.

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
