# elevator-simulation

Web-based elevator simulation project with two separate demos.

## Live Demos (GitHub Pages)

- Basic elevator simulation: `https://jay11063.github.io/elevator-simulation/`
- NPC passenger simulation: `https://jay11063.github.io/elevator-simulation/npc-sim.html`

## Simulations

### 1) Basic Elevator (`index.html`)

- Supports both cabin floor buttons and hall call buttons (`Up`/`Down`)
- `Down` is disabled on floor 1, `Up` is disabled on the top floor
- Direction-aware scheduling
- Cabin floor requests can be toggled off by pressing again
  - The currently active moving target cannot be canceled

### 2) NPC Passenger Simulation (`npc-sim.html`)

- Random passenger spawning on each floor
- Each passenger has an origin floor and a destination floor
- Passengers wait, board, move, exit, and disappear with animations
- Full-capacity edge case handled (no door open/close loop)
- Total passengers in the building are capped at `12`

## Local Run

Open either file in a browser:

- `index.html` for the basic simulation
- `npc-sim.html` for the NPC simulation

If your browser blocks ES module loading in `file://` mode, run with a local web server.

## Project Structure

- `index.html`, `style.css`, `app.js`: basic simulation entry files
- `npc-sim.html`, `npc-sim.css`, `npc-sim.js`: NPC simulation entry files
- `src/app/*`: modularized logic for the basic simulation
- `src/npc/*`: modularized logic for the NPC simulation
