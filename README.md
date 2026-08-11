# Odyssey — Battle of the Aegean

A browser-based Battleship-style game set in Ancient Greece: the fleets are **Greek vessels**,
normal shots are **arrows** and the area weapon is a **catapult** volley. Plain HTML, CSS and
JavaScript — no build tools, no frameworks, no dependencies. All artwork (avatars, vessels,
columns, vines, trident) is drawn in SVG/CSS.

## Play

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Rules

- Standard 10 × 10 sea, standard ship-size set rendered as Greek vessels:
  Argo (5), War Trireme (4), Bireme (3), Merchant Galley (3), Fishing Skiff (2).
- Each side has **2 catapult volleys**. A volley strikes a plus-shaped 5-cell area (target cell
  plus the four orthogonally adjacent cells); cells outside the sea are simply not hit.
- Each turn you fire **either** one arrow **or** one catapult — never both.
- Live stats panel shows the rival's shots, hits, misses, hit/miss ratio, accuracy, vessels sunk
  and catapults remaining, for the current session only.

## Setup flow

1. Enter your name. If that name has played in this browser before, the herald greets you back
   and shows your win/loss record and current streak.
2. Pick a character for yourself and a separate one for your rival — Odysseus, Athena, Poseidon,
   Circe, Achilles or Hermes (`assets/avatars/`) — or upload your own image (max 4 MB).
3. Arrange your fleet (drag to move, click to turn, or let the harbour master arrange it),
   then set sail.

## Player records

Records are stored in `localStorage` under `odyssey.captains.v1`, keyed by the lower-cased name,
holding wins, losses, current streak (positive = wins, negative = losses) and best win streak.
They persist only in the browser they were created in; there is no account or password.

## AI

The rival hunts on a parity grid biased toward open water, switches to targeting mode after a
hit, locks onto the vessel's axis once two hits line up, and spends its catapults deliberately —
around a wounded vessel where a plus-shaped volley is likely to finish it, or over dense
unexplored water if the hunt drags on.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup for the setup, placement and game screens, plus the decorative layer |
| `styles.css` | All styling, animated decor and responsive layout |
| `game.js` | Game model, rendering, AI, turn flow and localStorage records |
| `assets/avatars/` | Default Greek character avatars (SVG) |
| `BUGS.md` | Bugs found during testing and how they were fixed |
