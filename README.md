# elevator-simulation

Simple web elevator movement simulation.

## Run

1. Open `index.html` in a browser.

## Current scope

- Cabin floor buttons are available for in-elevator destination selection.
- Hall-call buttons (Up/Down) are available on each floor.
- Floor 1 has no Down call and the top floor has no Up call.
- Cabin button can be toggled off by pressing again, except for the active target floor.
- Same-direction calls in the current run are served first.
- Opposite-direction calls are deferred until the current run finishes.
- Elevator movement includes a short stop on arrival.

