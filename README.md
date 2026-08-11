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
- Hits and misses play impact effects: a blood splat for an arrow hit, an explosion for a catapult
  hit, a small splash for a missed arrow and rolling smoke for a missed volley.
- Vessels are drawn as ancient galleys — hull, ram, oars, shields and sail — spanning the cells
  they occupy, rather than plain blocks.
- Live stats panel shows the rival's shots, hits, misses, hit/miss ratio, accuracy, vessels sunk
  and catapults remaining, for the current session only.

## Setup flow

1. Enter your name and choose a difficulty (Easy, Medium or Hard). If that name has played in
   this browser before, the herald greets you back and shows your win/loss record and streak.
2. Pick a character for yourself and a separate one for your rival — Odysseus, Athena, Poseidon,
   Circe, Achilles or Hermes (`assets/avatars/`) — or upload your own image (max 4 MB).
3. Arrange your fleet (drag to move, click to turn, or let the harbour master arrange it),
   then set sail.

## Player records

Records are stored in `localStorage` under `odyssey.captains.v1`, keyed by the lower-cased name,
holding wins, losses, current streak (positive = wins, negative = losses) and best win streak.
They persist only in the browser they were created in; there is no account or password.

The home screen shows a **Hall of captains** scoreboard of every stored captain (wins, losses,
current streak, best streak), with a link to erase all records. A **Return to harbour** button on
the placement screen, the battle screen and the end-of-battle card goes back to the home screen;
leaving mid-battle asks for confirmation and records nothing.

## AI and difficulty

| Difficulty | Behaviour |
| --- | --- |
| Easy (Deckhand) | Fires at random cells, follows up a hit only about half the time and lets its catapults fly on a whim. |
| Medium (Helmsman) | Searches at random but always works around a hit until the vessel is sunk; saves catapults for a wounded vessel. |
| Hard (Strategos) | Hunts on a parity grid biased toward open water, locks onto the vessel's axis once two hits line up, and spends catapults deliberately — around a wounded vessel or over dense unexplored water if the hunt drags on. |

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup for the setup, placement and game screens, plus the decorative layer |
| `styles.css` | All styling, animated decor and responsive layout |
| `game.js` | Game model, rendering, AI, turn flow and localStorage records |
| `assets/avatars/` | Default Greek character avatars (SVG) |
| `BUGS.md` | Bugs found during testing and how they were fixed |
