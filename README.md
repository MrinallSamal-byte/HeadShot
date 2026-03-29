# HEADSHOT

Browser-based multiplayer top-down 2.5D shooter built with:

- Node.js 18+
- Express 4
- Socket.IO 4
- HTML5 Canvas
- Vanilla JS and CSS

## Run

```bash
npm install
npm start
```

Then open `http://localhost:3000` in one or more browser tabs.

## Docker

Build and run locally:

```bash
docker build -t headshot .
docker run --rm -p 3000:3000 headshot
```

Then open `http://localhost:3000`.

For Render:

- Create a new Web Service from this repo
- Choose `Docker` as the environment
- Render will use the repo-root [Dockerfile](/home/mrinall-samal/Projects/Games/headshot/Dockerfile)
- Keep the service as a `Web Service`
- Let Render provide its runtime `PORT` env var automatically

## Controls

- `WASD` or arrow keys: move
- Mouse: aim
- Left click / hold: fire
- Right click or `Z`: sniper scope
- `R`: reload
- `Enter`: chat
- `Tab`: scoreboard while alive, spectate-cycle while dead
- `Esc`: settings
- `M`: mute

## Features

- Landing page with quick play, private room creation, join-by-code, and how-to modal
- Live lobby with ready state, host settings, kick control, copyable room code, and manual team switching
- Server-authoritative room state, bullets, damage, pickups, respawns, timers, and match end conditions
- Three procedural maps: Warehouse, City Block, Bunker
- Three selectable modes in the UI: FFA, TDM, KOTH
- Eight weapons with unique fire rate, spread, ammo, and reload timings
- Canvas renderer with camera follow, 2.5D wall shading, particles, custom crosshair, and procedural pickups
- DOM HUD with health, armor, ammo, reload bar, kill feed, timer, minimap, scoreboard, chat, and connection overlay
- Death screen with gun selection and respawn flow
- End-of-round leaderboard with replay and return options
- Socket reconnection and session resume between lobby and game pages
- Procedural Web Audio sound effects with volume and mute controls

## Notes

- Runtime state is stored entirely in memory. No database is required.
- Audio is synthesized with Web Audio API, so `/public/assets/sounds` is intentionally unused by default.
- Sprites are rendered procedurally on canvas, so `/public/assets/sprites` is available for future art swaps.

## Project Structure

```text
public/
  index.html
  game.html
  css/
  js/
  assets/
server/
  index.js
  room-manager.js
  game-state.js
  physics.js
  guns-config.js
package.json
README.md
```
