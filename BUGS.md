# Odyssey — Battle of the Aegean: bug report

Revision tested: `03d45e1` (turn buttons) on `main`, served with `python3 -m http.server 8000`.
Full E2E + edge-case + audio pass. `node --check game.js` and `node --check audio.js` both pass.
Two defects were found in that pass; everything else planned passed (see "Verified" at the bottom).
Both are now fixed, along with three defects caught earlier while building the difficulty, audio and
navigation features.

| # | Bug | Status |
| --- | --- | --- |
| 1 | Refusing a turn by clicking the vessel on the board gave no feedback | Fixed |
| 2 | Battle top bar overflowed horizontally below ~600 px | Fixed |
| 3 | A pending AI turn could fire into a freshly started game | Fixed |
| 4 | The previous battle's enemy board could paint on the way into a new one | Fixed |
| 5 | Background music threw `AudioParam` errors and dropped notes | Fixed |

---

## Bug 1 — Turning a boxed-in vessel by clicking it on the board gives no feedback (the red flash is wiped)

**Severity:** medium (silent no-op; the user cannot tell whether the click registered)

**What happens**

A vessel that has no legal alternative orientation cannot turn — by design it should flash its cells red
(`flashPlacement`) and stay put. That works when the turn is requested with the new `.rotate-btn`, but the
identical refusal triggered by clicking the vessel *on the board* produces no flash at all: the vessel simply
does not move and nothing is drawn.

**Steps to reproduce**

1. Open `http://localhost:8000/index.html`, enter a name, "Begin the odyssey".
2. On the placement screen press "Let the harbour master arrange it" until a vessel is boxed in
   (e.g. a 5-cell Argo lying down at C8–G8 with neighbours on both sides — roughly 1 in 2 layouts has one).
3. Press that vessel's turn button in "Your fleet": its cells flash red and it stays put. ✅
4. Now click the same vessel directly on the board: it stays put but **no red flash appears**. ❌

Measured: `document.querySelectorAll('#board-placement .cell.invalid').length` is `5` immediately after the
button press and `0` immediately after the board click, for the same vessel in the same layout.

**Root cause**

`game.js:737` — the click-to-rotate gesture calls `rotateShip(ship)` from inside `endDrag`, and on failure
`rotateShip` (game.js:657) calls `flashPlacement`, which adds `.invalid` to the vessel's cells
(game.js:661-670). `endDrag` then **unconditionally** re-renders at `game.js:742`:

```js
      placement.drag = null;
      placement.moved = false;
      renderPlacement();
```

`renderPlacement` → `renderBoard` strips exactly that class at `game.js:574`
(`el.classList.remove("ship", ..., "preview", "invalid", ...)`), so the flash is removed in the same task in
which it was added. The button path has no such trailing re-render, which is why only that path shows the
flash. (`rotateShip` already re-renders itself on success, so the trailing call is redundant for rotation.)

**Suggested patch** (`game.js`, `endDrag`, lines 724-743)

```diff
     function endDrag(e) {
       if (!placement.drag) return;
       var ship = placement.drag.ship;
       var hit = placementCellFromEvent(e);
+      var turned = false;
       clearPreview();
       if (hit) {
         if (placement.moved) {
           var row = ship.horizontal ? hit.r : hit.r - placement.drag.offset;
           var col = ship.horizontal ? hit.c - placement.drag.offset : hit.c;
           if (canPlace(state.playerBoard, ship, row, col, ship.horizontal)) {
             place(state.playerBoard, ship, row, col, ship.horizontal);
           }
         } else {
-          rotateShip(ship);
+          rotateShip(ship);
+          turned = true;
         }
       }
       placement.drag = null;
       placement.moved = false;
-      renderPlacement();
+      if (!turned) renderPlacement();
     }
```

`rotateShip` renders the board itself when the turn succeeds, so skipping the trailing render keeps both
paths identical and lets the flash survive its 450 ms timeout.

**Fix applied:** the patch above, plus a `#placement-note` live region so a refused turn also states
"The Argo has no room to turn — move it first." for screen readers and anyone who misses the flash.

---

## Bug 2 — The battle top bar overflows horizontally below ~600 px (rival chip is clipped)

**Severity:** medium (regression on narrow viewports; part of the UI is off-screen)

**What happens**

On the battle screen at a 500 px-wide viewport the document is 594 px wide against a 485 px client width, so
the page scrolls sideways by 109 px and the rival chip (name, difficulty and 68 px avatar) is cut off at the
right edge. The placement and home screens are fine at the same width; only the battle screen overflows.

**Steps to reproduce**

1. Resize the browser (or use device metrics) to 500 × 800.
2. Start a game and reach the battle screen.
3. Observe the rival chip clipped at the right edge; `document.documentElement.scrollWidth` = 594 vs
   `clientWidth` = 485, and `window.scrollTo(500, 0)` leaves `window.scrollX === 109`.

Overflow by width (px of horizontal scroll): 700 → 0, 640 → 0, 600 → 9, 560 → 49, 520 → 89, 500 → 109,
420 → 189. So the breakpoint is ~600 px. 900 px is clean.

**Root cause**

`styles.css:616-626` — `.topbar` is a single non-wrapping flex row (`display: flex; justify-content:
space-between`) holding two `.player-chip`s and the turn stack. Its children have no `min-width: 0` and
`.chip-avatar` (`styles.css:629-635`) is a fixed 68 × 68 px, so the row's minimum content width (~594 px)
exceeds the viewport. The only game-screen breakpoint is `styles.css:741` (`max-width: 1250px`), which only
restacks `.game-grid` and never touches `.topbar`.

**Suggested patch** (`styles.css`, add after the existing `@media (max-width: 1250px)` block at line 741-744)

```css
@media (max-width: 620px) {
  .topbar { flex-wrap: wrap; justify-content: center; gap: 12px; padding: 12px 14px; }
  .player-chip { flex: 1 1 45%; min-width: 0; gap: 10px; }
  .player-chip.right { justify-content: flex-end; }
  .chip-avatar { width: 46px; height: 46px; }
  .chip-name { font-size: 17px; }
  .turn-stack { flex: 1 1 100%; order: 3; }
}
```

(Any equivalent that lets `.topbar` wrap and shrinks the avatars works; the essential parts are
`flex-wrap: wrap` on `.topbar`, `min-width: 0` on the chips and a smaller `.chip-avatar`.)

**Fix applied:** the patch above, extended to shrink the audio toggles to icons only at the same
breakpoint so they no longer sit on top of the battle chrome on a narrow screen.

---

## Bug 3 — A pending AI turn could fire into a freshly started game

**Severity:** high (would have let the rival shoot on the player's first turn of a new battle)

**What happens:** `endPlayerTurn` schedules the reply with `setTimeout(aiTurn, 850)`. Leaving the battle
("Return to harbour") or starting a rematch within that window left the timer pending; `aiTurn` only
checked the current global `state.over`, and the new state is not over, so the queued turn would run
against the new board.

**Root cause:** the timer handle was never stored, so nothing could cancel it (`game.js`, `endPlayerTurn`).

**Fix:** the handle is kept in `aiTimer` and cleared by `cancelAiTurn()`, which is now called from
`goHome()`, `goToPlacement()` and `finish()`.

---

## Bug 4 — The previous battle's enemy board could paint on the way into a new one

**Severity:** medium (a spoiler: the last game's revealed enemy fleet on the battle screen)

**What happens:** at the end of a battle the enemy board is re-rendered with the fleet revealed. On the
rematch path the new state was built but neither battle board was redrawn until `refreshGame()` ran
inside `startGame()`, so the stale, fully-revealed enemy board was still in the DOM throughout placement.

**Fix:** `goToPlacement()` now re-renders both battle boards against the new state (enemy with ships
hidden) before showing the placement screen. Note that rAF sampling of the transition never actually
caught a visible frame, so this is a latent-state fix rather than a reproduced visual bug.

---

## Bug 5 — Background music threw `AudioParam` errors and dropped notes

**Severity:** medium (console errors on every loop of the lyre theme)

**What happens:** enabling the music logged `Failed to set the 'value' property on 'AudioParam': The
provided float value is non-finite.` repeatedly, and the affected notes were silent.

**Root cause:** `audio.js` indexed `SCALE` (8 entries) with phrase degrees up to `9`, so `SCALE[8]` and
`SCALE[9]` were `undefined` and the note frequency evaluated to `NaN`.

**Fix:** `SCALE` extended to cover every degree the phrase uses (`[0, 2, 4, 5, 7, 9, 10, 12, 14, 16]`).
Verified afterwards with an `AnalyserNode` tap on the audio graph: non-zero peak output and zero console
errors.

---

## Minor observations (not filed as bugs)

- The fixed `.audio-bar` (`styles.css:653-660`, z-index 60) sits over the `.topbar` on the battle screen and,
  at 500 px, over the turn banner as well; it also stays clickable above the end overlay (z-index 50). All of
  this looks intentional ("toggles on every screen"), and nothing is made unusable at ≥900 px, but at very
  narrow widths the "Sound"/"Lyre" pills do sit on top of battle chrome.
- The refusal message when a vessel cannot turn is visual only (a 450 ms red flash) — there is no line in the
  Herald's chronicle or an aria-live announcement, so screen-reader users get no feedback either way.

---

## Verified working (no defect)

Placement: turn buttons exist for all five vessels and their labels/aria always match the actual on-board
orientation; 30 turns across 6 randomised layouts each matched the documented clamp-then-slide rule exactly
(never off-grid, never overlapping, always 17 occupied cells); refusals leave the vessel untouched; button and
board gestures agree; galley SVGs (including vertical ones) stay within 1 px of their cell span at 1400/900/
500 px; drag, overlap rejection, out-of-bounds rejection and randomize ×5 all correct; the battle fleet lists
still show hit pips, not turn buttons.

Battle: enemy sea never reveals AI vessels before the end (rAF sampling over both the first-game and rematch
placement→battle transitions found no frame with enemy ships/hits — the reported "flash" does not reproduce);
arrow/catapult FX spawn on the right cells and are cleaned up; FX never block clicks; already-resolved cells
and clicks during the AI turn are refused with the right log line and no shot count change; corner catapult
resolves 3 cells, a fully-resolved blast is refused without consuming a volley, the counter decrements once
and the weapon reverts to Arrow; stats are internally consistent.

End of game: victory and defeat overlays, enemy fleet revealed, victory/defeat voices, records written exactly
once, streak flips 2 → -1 on a loss with bestStreak preserved; "Sail again" resets boards/catapults/log and
keeps the captain; mid-battle "Return to harbour" confirms, Cancel resumes play, OK writes no record; hall of
captains sorts by wins then fewer losses and clears on confirmation.

Audio: defaults (Sound ON, Lyre OFF), no AudioContext before a gesture, persistence across reload, silence
with SFX off while visual FX still fire, music starts/loops/stops cleanly and resumes after reload on a click,
one voice per volley with a delayed sink, AI replies 890-948 ms with audio on, and zero console errors.
