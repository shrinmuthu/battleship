# Yacht Battle

A browser-based Battleship-style game where the fleets are **yachts**. Plain HTML, CSS and
JavaScript — no build tools, no frameworks, no dependencies.

## Play

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Rules

- Standard 10 × 10 grid, standard ship-size set rendered as yachts:
  Mega Yacht (5), Super Yacht (4), Cruiser Yacht (3), Sport Yacht (3), Dinghy (2).
- Each side has **2 bombs**. A bomb strikes a plus-shaped 5-cell area (target cell plus the
  four orthogonally adjacent cells); cells outside the grid are simply not hit.
- Each turn you take **either** one normal shot **or** one bomb — never both.
- Live stats panel shows the AI's shots, hits, misses, hit/miss ratio, accuracy, yachts sunk
  and bombs remaining, for the current session only.

## Setup flow

1. Enter your name.
2. Pick a character avatar for yourself and a separate one for the AI opponent — choose from the
   built-in characters in `assets/avatars/` or upload your own image (max 4 MB).
3. Arrange your yachts (drag to move, click to rotate, or randomize), then set sail.

## AI

The AI hunts on a parity grid biased toward open water, switches to targeting mode after a hit,
locks onto the ship's axis once two hits line up, and spends its bombs deliberately — around a
wounded yacht where a plus blast is likely to finish it, or over dense unexplored water if
hunting drags on.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup for the setup, placement and game screens |
| `styles.css` | All styling |
| `game.js` | Game model, rendering, AI and turn flow |
| `assets/avatars/` | Default character avatars (SVG) |
| `BUGS.md` | Bugs found during testing and how they were fixed |
