---
name: testing-odyssey
description: How to run an end-to-end / edge-case test pass on the Odyssey (Battle of the Aegean) static Battleship app — serving it, driving it over CDP, seeding the RNG, forcing wins/losses safely, and proving that sounds actually played.
---

# Testing the Odyssey Battleship app

Dependency-free static app (`index.html`, `styles.css`, `game.js`, `audio.js`, `assets/avatars/*.svg`).
No build, no login, no secrets.

## Devin Secrets Needed

None.

## Run it

```bash
cd <repo> && python3 -m http.server 8000     # may already be running
# http://localhost:8000/index.html
```

Drive the already-running Chrome over CDP (`http://localhost:29229`) with
`playwright.sync_api.sync_playwright().chromium.connect_over_cdp(...)`; take the existing context/page so the
GUI recording shows the same window you are scripting. Resize with
`Emulation.setDeviceMetricsOverride` via `page.context.new_cdp_session(page)` and clear it afterwards
(`Emulation.clearDeviceMetricsOverride`) or later screenshots stay letterboxed.

## Make the game deterministic

All state lives in a closure, so read it indirectly:

- Add an init script that replaces `Math.random` with a seeded mulberry32 and exposes `window.__reseed(seed)`.
  Re-implementing `randomize()` (player board first, then AI board) then predicts both fleets exactly — that is
  how you force a fast win by clicking only true enemy ship cells.
- Alternatively derive on-board vessel geometry from the DOM: for each `.ship-layer .vessel-wrap`, collect the
  `.cell`s whose rects fall inside the wrap's rect (±4 px). That gives cells, size and orientation
  (`width >= height` → horizontal) without touching game internals, and doubles as the artwork-alignment check.

## Break conditions that matter

- The enemy board is only clickable on the player's turn: wait for `#board-enemy.interactive` between shots and
  cap the loop (~250 iterations). Clicking cells in DOM order with no wait will hang forever.
- Watch for `#overlay` / game-over between clicks; the AI can win first on Hard.
- To force a loss, fire only at water you know is empty and let the AI grind; expect 70+ AI turns, so allow
  several minutes and re-check `over` each turn.

## Proving audio really played

Patch `window.AudioContext` in an init script, insert an `AnalyserNode` in front of `destination`, override the
`destination` getter, and poll peak amplitude into `window.__peak` every 20 ms. Also wrap `OdysseyAudio.play`
to log the voice names. Useful thresholds observed: an SFX voice peaks ~0.1-0.5; "silence" with Sound off is
< 1e-3. Music is default OFF by design (autoplay policy) and starts on the toggle click; a document click
handler calls `wake()`.

localStorage keys: `odyssey.captains.v1` (records), `odyssey.sfx.v1`, `odyssey.music.v1` (`"1"`/`"0"`).

## Gotchas that produced false results

- Building a specific placement layout with synthetic drags is unreliable (drop origin depends on the grab
  offset). Prefer a property test: predict the outcome of `rotateShip` from DOM-derived geometry and compare,
  over several randomised layouts — that exercises both the "moves" and the "refused" branches.
- A refusal check must target a vessel that genuinely cannot turn; verify with the prediction first, otherwise
  you will "prove" a bug that is really your test clicking empty water.
- Catapult edge tests must use pristine coordinates; re-firing into an already-resolved area is refused by
  design and looks like a miscount.
- `elementFromPoint` just outside `.audio-bar` lands on `.topbar`; the fixed audio bar (z-index 60) is meant to
  float over everything including the overlay (z-index 50), so don't score that as an obstruction bug without
  looking at a screenshot.

## Known weak spots to re-check

- Narrow viewports: the battle `.topbar` is a non-wrapping flex row and may overflow below ~600 px (rival chip
  clipped, page scrolls sideways). Check `documentElement.scrollWidth` vs `clientWidth` on the *battle* screen,
  not just the home screen.
- Placement feedback: a trailing `renderPlacement()` can strip the `.invalid` red flash added by
  `flashPlacement`, so a refused turn may be silent on one gesture but not the other. Compare the
  `.cell.invalid` count immediately (<100 ms) after the turn button vs after clicking the vessel on the board.

## Gotchas learned the hard way

- Clear `localStorage` before comparing layout geometry across revisions: a stored captain record adds a
  `#chip-player-record` line to the player chip and changes its height, which reads as a false regression.
- To diff two revisions visually, `git archive <rev> | tar -x -C /tmp/old` and serve the copy on a second
  port, then measure both with the same script.
