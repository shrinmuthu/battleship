/* Yacht Battle — a Battleship-style game with yachts, bombs and an AI rival.
   Single-file vanilla JS, no build tools. */
(function () {
  "use strict";

  var SIZE = 10;
  var BOMBS_PER_PLAYER = 2;
  var LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

  var FLEET = [
    { id: "mega", name: "Mega Yacht", size: 5 },
    { id: "super", name: "Super Yacht", size: 4 },
    { id: "cruiser", name: "Cruiser Yacht", size: 3 },
    { id: "sport", name: "Sport Yacht", size: 3 },
    { id: "dinghy", name: "Dinghy", size: 2 }
  ];

  var DEFAULT_AVATARS = [
    { id: "captain", name: "Captain Marlow", src: "assets/avatars/captain.svg" },
    { id: "admiral", name: "Admiral Reyes", src: "assets/avatars/admiral.svg" },
    { id: "navigator", name: "Navigator Wren", src: "assets/avatars/navigator.svg" },
    { id: "skipper", name: "Skipper Kai", src: "assets/avatars/skipper.svg" },
    { id: "commodore", name: "Commodore Vale", src: "assets/avatars/commodore.svg" },
    { id: "corsair", name: "Corsair Nix", src: "assets/avatars/corsair.svg" }
  ];

  var MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

  // ---------------------------------------------------------------- helpers
  function $(id) { return document.getElementById(id); }
  function idx(r, c) { return r * SIZE + c; }
  function inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
  function coordLabel(r, c) { return LETTERS[r] + (c + 1); }
  function plusCells(r, c) {
    var out = [];
    [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
      var rr = r + d[0], cc = c + d[1];
      if (inBounds(rr, cc)) out.push({ r: rr, c: cc });
    });
    return out;
  }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  // ---------------------------------------------------------------- model
  function makeFleet() {
    return FLEET.map(function (s) {
      return { id: s.id, name: s.name, size: s.size, cells: [], hits: 0, sunk: false, row: 0, col: 0, horizontal: true };
    });
  }

  function createBoard() {
    return {
      ships: makeFleet(),
      shipAt: new Array(SIZE * SIZE).fill(null), // ship id per cell
      shots: new Array(SIZE * SIZE).fill(null)   // null | "miss" | "hit"
    };
  }

  function shipById(board, id) {
    for (var i = 0; i < board.ships.length; i++) if (board.ships[i].id === id) return board.ships[i];
    return null;
  }

  function canPlace(board, ship, row, col, horizontal) {
    for (var i = 0; i < ship.size; i++) {
      var r = horizontal ? row : row + i;
      var c = horizontal ? col + i : col;
      if (!inBounds(r, c)) return false;
      var occupant = board.shipAt[idx(r, c)];
      if (occupant !== null && occupant !== ship.id) return false;
    }
    return true;
  }

  function unplace(board, ship) {
    ship.cells.forEach(function (p) { board.shipAt[idx(p.r, p.c)] = null; });
    ship.cells = [];
  }

  function place(board, ship, row, col, horizontal) {
    unplace(board, ship);
    ship.row = row; ship.col = col; ship.horizontal = horizontal;
    for (var i = 0; i < ship.size; i++) {
      var r = horizontal ? row : row + i;
      var c = horizontal ? col + i : col;
      ship.cells.push({ r: r, c: c });
      board.shipAt[idx(r, c)] = ship.id;
    }
  }

  function randomizeBoard(board) {
    board.shipAt = new Array(SIZE * SIZE).fill(null);
    board.ships.forEach(function (s) { s.cells = []; });
    board.ships.forEach(function (ship) {
      var placed = false, guard = 0;
      while (!placed && guard < 5000) {
        guard++;
        var horizontal = Math.random() < 0.5;
        var row = Math.floor(Math.random() * SIZE);
        var col = Math.floor(Math.random() * SIZE);
        if (canPlace(board, ship, row, col, horizontal)) {
          place(board, ship, row, col, horizontal);
          placed = true;
        }
      }
    });
    return board;
  }

  /* Fire a single cell. Returns null when the cell was already resolved. */
  function fireAt(board, r, c) {
    var i = idx(r, c);
    if (board.shots[i] !== null) return null;
    var shipId = board.shipAt[i];
    if (shipId === null) {
      board.shots[i] = "miss";
      return { r: r, c: c, result: "miss" };
    }
    board.shots[i] = "hit";
    var ship = shipById(board, shipId);
    ship.hits++;
    var justSunk = false;
    if (ship.hits >= ship.size && !ship.sunk) { ship.sunk = true; justSunk = true; }
    return { r: r, c: c, result: "hit", ship: ship, sunk: justSunk };
  }

  function allSunk(board) {
    return board.ships.every(function (s) { return s.sunk; });
  }

  // ---------------------------------------------------------------- state
  var state = null;

  function freshState() {
    return {
      playerName: "Skipper",
      playerAvatar: DEFAULT_AVATARS[0].src,
      aiAvatar: DEFAULT_AVATARS[1].src,
      aiName: "Rival",
      playerBoard: createBoard(),   // holds the player's yachts, shot at by the AI
      aiBoard: createBoard(),       // holds the AI's yachts, shot at by the player
      turn: "player",
      playerBombs: BOMBS_PER_PLAYER,
      aiBombs: BOMBS_PER_PLAYER,
      busy: false,
      over: false,
      weapon: "shot",
      ai: {
        targets: [],        // queue of promising cells {r,c}
        hitStack: [],       // unresolved hits belonging to a live yacht
        lastOrigin: null,
        shots: 0, hits: 0, misses: 0, sunk: 0, turns: 0
      },
      you: { shots: 0, hits: 0, misses: 0, sunk: 0, turns: 0 }
    };
  }

  // ---------------------------------------------------------------- avatars
  var chosen = { player: DEFAULT_AVATARS[0].src, ai: DEFAULT_AVATARS[1].src };

  function buildAvatarOptions(which) {
    var container = $("options-" + which);
    container.innerHTML = "";
    DEFAULT_AVATARS.forEach(function (av) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "avatar-option";
      btn.setAttribute("role", "radio");
      btn.title = av.name;
      btn.setAttribute("aria-label", av.name);
      btn.dataset.src = av.src;
      btn.innerHTML = '<img src="' + av.src + '" alt="' + escapeHtml(av.name) + '" />';
      btn.addEventListener("click", function () { selectAvatar(which, av.src); });
      container.appendChild(btn);
    });
    selectAvatar(which, chosen[which]);
  }

  function selectAvatar(which, src) {
    chosen[which] = src;
    $("preview-" + which).src = src;
    Array.prototype.forEach.call($("options-" + which).children, function (btn) {
      var on = btn.dataset.src === src;
      btn.classList.toggle("selected", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  function wireUpload(which) {
    var input = $("upload-" + which);
    var err = $("upload-" + which + "-error");
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      err.hidden = true;
      if (!file) return;
      if (!/^image\//.test(file.type)) {
        err.textContent = "That file is not an image — please pick a PNG, JPG, GIF or SVG.";
        err.hidden = false;
        input.value = "";
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        err.textContent = "Image is too large (max 4 MB).";
        err.hidden = false;
        input.value = "";
        return;
      }
      var reader = new FileReader();
      reader.onload = function () { selectAvatar(which, reader.result); };
      reader.onerror = function () {
        err.textContent = "Could not read that file — please try another one.";
        err.hidden = false;
      };
      reader.readAsDataURL(file);
      input.value = "";
    });
  }

  // ---------------------------------------------------------------- board rendering
  function buildBoardEl(el) {
    el.innerHTML = "";
    var corner = document.createElement("div");
    corner.className = "coord";
    el.appendChild(corner);
    for (var c = 0; c < SIZE; c++) {
      var h = document.createElement("div");
      h.className = "coord";
      h.textContent = String(c + 1);
      el.appendChild(h);
    }
    for (var r = 0; r < SIZE; r++) {
      var lab = document.createElement("div");
      lab.className = "coord";
      lab.textContent = LETTERS[r];
      el.appendChild(lab);
      for (var cc = 0; cc < SIZE; cc++) {
        var cell = document.createElement("button");
        cell.type = "button";
        cell.className = "cell";
        cell.dataset.r = String(r);
        cell.dataset.c = String(cc);
        cell.setAttribute("aria-label", coordLabel(r, cc));
        el.appendChild(cell);
      }
    }
  }

  function cellEl(boardEl, r, c) {
    return boardEl.querySelector('.cell[data-r="' + r + '"][data-c="' + c + '"]');
  }

  function renderBoard(boardEl, board, showShips) {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var el = cellEl(boardEl, r, c);
        if (!el) continue;
        var i = idx(r, c);
        var shot = board.shots[i];
        var shipId = board.shipAt[i];
        var ship = shipId === null ? null : shipById(board, shipId);
        el.classList.remove("ship", "hit", "miss", "sunk", "resolved", "preview", "invalid");
        if (showShips && ship && shot !== "hit") el.classList.add("ship");
        if (shot === "miss") { el.classList.add("miss", "resolved"); }
        if (shot === "hit") {
          el.classList.add("hit", "resolved");
          if (ship && ship.sunk) el.classList.add("sunk");
        }
        el.disabled = false;
      }
    }
  }

  function flash(boardEl, cells) {
    cells.forEach(function (p) {
      var el = cellEl(boardEl, p.r, p.c);
      if (!el) return;
      el.classList.remove("last-blast");
      void el.offsetWidth;
      el.classList.add("last-blast");
    });
  }

  function renderFleetList(ul, board, revealNames) {
    ul.innerHTML = "";
    board.ships.forEach(function (s) {
      var li = document.createElement("li");
      if (s.sunk) li.classList.add("sunk-item");
      var pips = "";
      for (var i = 0; i < s.size; i++) pips += i < s.hits ? "●" : "○";
      li.innerHTML = "<span>" + escapeHtml(s.name) + "</span><span class='pips'>" + pips + "</span>";
      if (!revealNames && !s.sunk) li.title = "Still afloat";
      ul.appendChild(li);
    });
  }

  // ---------------------------------------------------------------- placement screen
  var placement = { drag: null, moved: false };

  function renderPlacement() {
    var boardEl = $("board-placement");
    renderBoard(boardEl, state.playerBoard, true);
    renderFleetList($("placement-fleet"), state.playerBoard, true);
  }

  function placementCellFromEvent(e) {
    var target = e.target.closest ? e.target.closest(".cell") : null;
    if (!target) return null;
    return { r: Number(target.dataset.r), c: Number(target.dataset.c), el: target };
  }

  function clearPreview() {
    Array.prototype.forEach.call($("board-placement").querySelectorAll(".cell"), function (el) {
      el.classList.remove("preview", "invalid");
    });
  }

  function showPreview(ship, row, col, horizontal) {
    clearPreview();
    var ok = canPlace(state.playerBoard, ship, row, col, horizontal);
    for (var i = 0; i < ship.size; i++) {
      var r = horizontal ? row : row + i;
      var c = horizontal ? col + i : col;
      if (!inBounds(r, c)) continue;
      var el = cellEl($("board-placement"), r, c);
      if (el) el.classList.add(ok ? "preview" : "invalid");
    }
  }

  function initPlacementInteraction() {
    var boardEl = $("board-placement");

    boardEl.addEventListener("mousedown", function (e) {
      var hit = placementCellFromEvent(e);
      if (!hit) return;
      var shipId = state.playerBoard.shipAt[idx(hit.r, hit.c)];
      if (shipId === null) return;
      var ship = shipById(state.playerBoard, shipId);
      placement.drag = {
        ship: ship,
        offset: ship.horizontal ? hit.c - ship.col : hit.r - ship.row
      };
      placement.moved = false;
      e.preventDefault();
    });

    boardEl.addEventListener("mousemove", function (e) {
      if (!placement.drag) return;
      var hit = placementCellFromEvent(e);
      if (!hit) return;
      var ship = placement.drag.ship;
      var row = ship.horizontal ? hit.r : hit.r - placement.drag.offset;
      var col = ship.horizontal ? hit.c - placement.drag.offset : hit.c;
      if (row !== ship.row || col !== ship.col) placement.moved = true;
      showPreview(ship, row, col, ship.horizontal);
    });

    function endDrag(e) {
      if (!placement.drag) return;
      var ship = placement.drag.ship;
      var hit = placementCellFromEvent(e);
      clearPreview();
      if (hit) {
        if (placement.moved) {
          var row = ship.horizontal ? hit.r : hit.r - placement.drag.offset;
          var col = ship.horizontal ? hit.c - placement.drag.offset : hit.c;
          if (canPlace(state.playerBoard, ship, row, col, ship.horizontal)) {
            place(state.playerBoard, ship, row, col, ship.horizontal);
          }
        } else {
          // simple click → rotate around the current anchor if it fits
          var horizontal = !ship.horizontal;
          var r = ship.row, c = ship.col;
          if (canPlace(state.playerBoard, ship, r, c, horizontal)) {
            place(state.playerBoard, ship, r, c, horizontal);
          } else {
            // nudge back into the grid if rotation overflows
            var nr = Math.min(r, SIZE - (horizontal ? 1 : ship.size));
            var nc = Math.min(c, SIZE - (horizontal ? ship.size : 1));
            if (canPlace(state.playerBoard, ship, nr, nc, horizontal)) {
              place(state.playerBoard, ship, nr, nc, horizontal);
            }
          }
        }
      }
      placement.drag = null;
      placement.moved = false;
      renderPlacement();
    }

    boardEl.addEventListener("mouseup", endDrag);
    boardEl.addEventListener("mouseleave", function () {
      if (!placement.drag) return;
      clearPreview();
      placement.drag = null;
      placement.moved = false;
    });
  }

  // ---------------------------------------------------------------- logging & stats
  function log(text, kind) {
    var ul = $("log");
    var li = document.createElement("li");
    li.className = kind || "";
    li.textContent = text;
    ul.insertBefore(li, ul.firstChild);
    while (ul.children.length > 60) ul.removeChild(ul.lastChild);
  }

  function ratio(hits, misses) {
    if (hits === 0 && misses === 0) return "—";
    if (misses === 0) return hits + " : 0";
    var g = (function gcd(a, b) { return b ? gcd(b, a % b) : a; })(hits, misses) || 1;
    return (hits / g) + " : " + (misses / g);
  }

  function updateStats() {
    var ai = state.ai, you = state.you;
    $("ai-shots").textContent = ai.shots;
    $("ai-hits").textContent = ai.hits;
    $("ai-misses").textContent = ai.misses;
    $("ai-ratio").textContent = ratio(ai.hits, ai.misses);
    $("ai-accuracy").textContent = ai.shots ? Math.round((ai.hits / ai.shots) * 100) + "%" : "0%";
    $("ai-sunk").textContent = ai.sunk;
    $("ai-bombs").textContent = state.aiBombs;
    $("you-shots").textContent = you.shots;
    $("you-accuracy").textContent = you.shots ? Math.round((you.hits / you.shots) * 100) + "%" : "0%";
    $("you-sunk").textContent = you.sunk;

    $("chip-player-ships").textContent = state.playerBoard.ships.filter(function (s) { return !s.sunk; }).length;
    $("chip-ai-ships").textContent = state.aiBoard.ships.filter(function (s) { return !s.sunk; }).length;
    $("player-bombs").textContent = state.playerBombs;
  }

  function updateWeaponUI() {
    var bombsLeft = state.playerBombs;
    var bombBtn = $("weapon-bomb");
    var shotBtn = $("weapon-shot");
    bombBtn.disabled = bombsLeft <= 0 || state.over;
    if (bombsLeft <= 0 && state.weapon === "bomb") state.weapon = "shot";
    bombBtn.classList.toggle("active", state.weapon === "bomb");
    shotBtn.classList.toggle("active", state.weapon === "shot");
    $("player-bombs").textContent = bombsLeft;
  }

  function setTurnBanner() {
    var el = $("turn-banner");
    if (state.over) return;
    if (state.turn === "player") {
      el.textContent = state.playerName + ", take your shot";
      el.classList.remove("enemy");
    } else {
      el.textContent = state.aiName + " is aiming…";
      el.classList.add("enemy");
    }
  }

  function refreshGame() {
    renderBoard($("board-enemy"), state.aiBoard, false);
    renderBoard($("board-own"), state.playerBoard, true);
    renderFleetList($("enemy-fleet"), state.aiBoard, true);
    renderFleetList($("own-fleet"), state.playerBoard, true);
    updateStats();
    updateWeaponUI();
    setTurnBanner();
    $("board-enemy").classList.toggle("interactive", state.turn === "player" && !state.over && !state.busy);
  }

  // ---------------------------------------------------------------- player turn
  function onEnemyBoardClick(e) {
    var target = e.target.closest ? e.target.closest(".cell") : null;
    if (!target) return;
    if (state.over) { log("The regatta is over — press Play again for a rematch.", "big"); return; }
    if (state.busy || state.turn !== "player") { log("Hold on — " + state.aiName + " is still taking a turn.", "you"); return; }

    var r = Number(target.dataset.r), c = Number(target.dataset.c);
    var board = state.aiBoard;

    if (state.weapon === "bomb") {
      if (state.playerBombs <= 0) {
        log("No bombs left — switching to normal shots.", "you");
        state.weapon = "shot";
        refreshGame();
        return;
      }
      var area = plusCells(r, c);
      var fresh = area.filter(function (p) { return board.shots[idx(p.r, p.c)] === null; });
      if (fresh.length === 0) {
        log("Every cell in that blast zone has already been struck — pick another target.", "you");
        return;
      }
      state.playerBombs--;
      var results = [];
      fresh.forEach(function (p) {
        var res = fireAt(board, p.r, p.c);
        if (res) results.push(res);
      });
      state.you.turns++;
      tallyPlayerResults(results);
      flash($("board-enemy"), area);
      var hits = results.filter(function (x) { return x.result === "hit"; }).length;
      log("💣 You bombed " + coordLabel(r, c) + " — " + hits + " hit" + (hits === 1 ? "" : "s") +
          " across " + results.length + " cell" + (results.length === 1 ? "" : "s") + ".", "you");
      results.filter(function (x) { return x.sunk; }).forEach(function (x) {
        log("You sank " + state.aiName + "'s " + x.ship.name + "!", "big");
      });
      state.weapon = "shot";
      endPlayerTurn();
      return;
    }

    if (board.shots[idx(r, c)] !== null) {
      log("You already fired at " + coordLabel(r, c) + " — choose a fresh target.", "you");
      return;
    }
    var res2 = fireAt(board, r, c);
    state.you.turns++;
    tallyPlayerResults([res2]);
    flash($("board-enemy"), [{ r: r, c: c }]);
    log((res2.result === "hit" ? "🎯 Hit at " : "🌊 Splash at ") + coordLabel(r, c) + ".", "you");
    if (res2.sunk) log("You sank " + state.aiName + "'s " + res2.ship.name + "!", "big");
    endPlayerTurn();
  }

  function tallyPlayerResults(results) {
    results.forEach(function (res) {
      state.you.shots++;
      if (res.result === "hit") state.you.hits++; else state.you.misses++;
      if (res.sunk) state.you.sunk++;
    });
  }

  function endPlayerTurn() {
    if (allSunk(state.aiBoard)) { finish("player"); return; }
    state.turn = "ai";
    state.busy = true;
    refreshGame();
    setTimeout(aiTurn, 850);
  }

  // ---------------------------------------------------------------- AI
  function unknownCells(board) {
    var out = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (board.shots[idx(r, c)] === null) out.push({ r: r, c: c });
      }
    }
    return out;
  }

  function largestAfloat(board) {
    return board.ships.reduce(function (m, s) { return (!s.sunk && s.size > m) ? s.size : m; }, 2);
  }

  /* Hunt cell using a parity grid tuned to the smallest yacht still afloat. */
  function huntCell(board) {
    var free = unknownCells(board);
    if (free.length === 0) return null;
    var smallest = board.ships.reduce(function (m, s) { return (!s.sunk && s.size < m) ? s.size : m; }, SIZE);
    var parity = free.filter(function (p) { return (p.r + p.c) % smallest === 0; });
    var pool = parity.length ? parity : free;
    // prefer cells with more unknown room around them
    var best = null, bestScore = -1;
    shuffle(pool).forEach(function (p) {
      var score = 0;
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
        var rr = p.r + d[0], cc = p.c + d[1];
        if (inBounds(rr, cc) && board.shots[idx(rr, cc)] === null) score++;
      });
      if (score > bestScore) { bestScore = score; best = p; }
    });
    return best;
  }

  function pushTargetsAround(board, r, c) {
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) {
      var rr = r + d[0], cc = c + d[1];
      if (!inBounds(rr, cc)) return;
      if (board.shots[idx(rr, cc)] !== null) return;
      var exists = state.ai.targets.some(function (t) { return t.r === rr && t.c === cc; });
      if (!exists) state.ai.targets.push({ r: rr, c: cc });
    });
  }

  /* Once two hits line up, restrict the queue to that line. */
  function refineTargets(board) {
    var stack = state.ai.hitStack;
    if (stack.length < 2) return;
    var sameRow = stack.every(function (p) { return p.r === stack[0].r; });
    var sameCol = stack.every(function (p) { return p.c === stack[0].c; });
    if (!sameRow && !sameCol) return;
    var line = [];
    if (sameRow) {
      var r = stack[0].r;
      var cols = stack.map(function (p) { return p.c; });
      var minC = Math.min.apply(null, cols), maxC = Math.max.apply(null, cols);
      [[r, minC - 1], [r, maxC + 1]].forEach(function (p) { line.push({ r: p[0], c: p[1] }); });
    } else {
      var c2 = stack[0].c;
      var rows = stack.map(function (p) { return p.r; });
      var minR = Math.min.apply(null, rows), maxR = Math.max.apply(null, rows);
      [[minR - 1, c2], [maxR + 1, c2]].forEach(function (p) { line.push({ r: p[0], c: p[1] }); });
    }
    var valid = line.filter(function (p) {
      return inBounds(p.r, p.c) && board.shots[idx(p.r, p.c)] === null;
    });
    if (valid.length) state.ai.targets = valid;
  }

  function bombScore(board, r, c) {
    var cells = plusCells(r, c);
    var unknown = cells.filter(function (p) { return board.shots[idx(p.r, p.c)] === null; });
    if (unknown.length === 0) return -1;
    var score = unknown.length;
    // a blast next to an unresolved hit is far more valuable
    var adjacency = 0;
    unknown.forEach(function (p) {
      state.ai.hitStack.forEach(function (h) {
        if (Math.abs(h.r - p.r) + Math.abs(h.c - p.c) === 1) adjacency++;
      });
    });
    return score + adjacency * 3;
  }

  function bestBombTarget(board, candidates) {
    var best = null, bestScore = 0;
    shuffle(candidates.slice()).forEach(function (p) {
      var s = bombScore(board, p.r, p.c);
      if (s > bestScore) { bestScore = s; best = p; }
    });
    return best ? { cell: best, score: bestScore } : null;
  }

  /* Decide the AI's move: {type:"shot"|"bomb", r, c} */
  function aiDecide() {
    var board = state.playerBoard; // AI shoots at the player's board
    var bombsLeft = state.aiBombs;
    refineTargets(board);
    state.ai.targets = state.ai.targets.filter(function (p) {
      return inBounds(p.r, p.c) && board.shots[idx(p.r, p.c)] === null;
    });

    if (bombsLeft > 0 && state.ai.hitStack.length > 0) {
      // A yacht is wounded: a plus blast around the wound often finishes it.
      var around = [];
      state.ai.hitStack.forEach(function (h) {
        plusCells(h.r, h.c).forEach(function (p) {
          if (board.shots[idx(p.r, p.c)] === null) around.push(p);
        });
      });
      var pick = bestBombTarget(board, around);
      if (pick && pick.score >= 6) return { type: "bomb", r: pick.cell.r, c: pick.cell.c };
    }

    if (state.ai.targets.length > 0) {
      var t = state.ai.targets.shift();
      return { type: "shot", r: t.r, c: t.c };
    }

    // Hunting. Spend a bomb when hunting is dragging on and a big yacht is still out there.
    var free = unknownCells(board);
    if (bombsLeft > 0 && state.ai.turns >= 6 && largestAfloat(board) >= 3) {
      var interiorFree = free.filter(function (p) {
        return p.r > 0 && p.r < SIZE - 1 && p.c > 0 && p.c < SIZE - 1;
      });
      var pick2 = bestBombTarget(board, interiorFree.length ? interiorFree : free);
      if (pick2 && pick2.score >= 5) return { type: "bomb", r: pick2.cell.r, c: pick2.cell.c };
    }

    var h = huntCell(board);
    if (!h) return null;
    return { type: "shot", r: h.r, c: h.c };
  }

  function registerAiResult(board, res) {
    state.ai.shots++;
    if (res.result === "hit") {
      state.ai.hits++;
      state.ai.hitStack.push({ r: res.r, c: res.c });
      pushTargetsAround(board, res.r, res.c);
      if (res.sunk) {
        state.ai.sunk++;
        // drop the sunk yacht's cells from the unresolved stack
        state.ai.hitStack = state.ai.hitStack.filter(function (p) {
          return board.shipAt[idx(p.r, p.c)] !== res.ship.id;
        });
        if (state.ai.hitStack.length === 0) state.ai.targets = [];
      }
    } else {
      state.ai.misses++;
    }
  }

  function aiTurn() {
    if (state.over) return;
    var board = state.playerBoard;
    var move = aiDecide();
    if (!move) { finish("draw"); return; }
    state.ai.turns++;

    if (move.type === "bomb" && state.aiBombs > 0) {
      state.aiBombs--;
      var area = plusCells(move.r, move.c);
      var results = [];
      area.forEach(function (p) {
        var res = fireAt(board, p.r, p.c);
        if (res) { results.push(res); registerAiResult(board, res); }
      });
      flash($("board-own"), area);
      var hits = results.filter(function (x) { return x.result === "hit"; }).length;
      log("💣 " + state.aiName + " bombed " + coordLabel(move.r, move.c) + " — " + hits +
          " hit" + (hits === 1 ? "" : "s") + ".", "ai");
      results.filter(function (x) { return x.sunk; }).forEach(function (x) {
        log(state.aiName + " sank your " + x.ship.name + "!", "big");
      });
    } else {
      var res2 = fireAt(board, move.r, move.c);
      if (!res2) { // safety net: never waste a turn on a resolved cell
        var fallback = huntCell(board);
        if (!fallback) { finish("draw"); return; }
        res2 = fireAt(board, fallback.r, fallback.c);
        if (!res2) { finish("draw"); return; }
      }
      registerAiResult(board, res2);
      flash($("board-own"), [{ r: res2.r, c: res2.c }]);
      log(state.aiName + (res2.result === "hit" ? " hits your waters at " : " misses at ") +
          coordLabel(res2.r, res2.c) + ".", "ai");
      if (res2.sunk) log(state.aiName + " sank your " + res2.ship.name + "!", "big");
    }

    state.busy = false;
    if (allSunk(state.playerBoard)) { finish("ai"); return; }
    state.turn = "player";
    refreshGame();
  }

  // ---------------------------------------------------------------- end game
  function finish(winner) {
    state.over = true;
    state.busy = false;
    refreshGame();
    renderBoard($("board-enemy"), state.aiBoard, true);
    $("board-enemy").classList.remove("interactive");

    var youWon = winner === "player";
    $("overlay-title").textContent = youWon ? "Victory at sea!" : (winner === "ai" ? "Your fleet is sunk" : "Stalemate");
    $("overlay-avatar").src = youWon ? state.playerAvatar : state.aiAvatar;
    $("overlay-text").textContent = youWon
      ? state.playerName + " sank every one of " + state.aiName + "'s yachts."
      : (winner === "ai"
        ? state.aiName + " sank all of " + state.playerName + "'s yachts. Better luck next regatta."
        : "No targets remain on either side.");

    var stats = $("overlay-stats");
    stats.innerHTML = "";
    [
      ["Your shots", state.you.shots],
      ["Your accuracy", state.you.shots ? Math.round((state.you.hits / state.you.shots) * 100) + "%" : "0%"],
      [state.aiName + "'s shots", state.ai.shots],
      [state.aiName + "'s accuracy", state.ai.shots ? Math.round((state.ai.hits / state.ai.shots) * 100) + "%" : "0%"],
      ["Yachts you sank", state.you.sunk],
      ["Yachts you lost", state.ai.sunk]
    ].forEach(function (pair) {
      var wrap = document.createElement("div");
      var dt = document.createElement("dt"); dt.textContent = pair[0];
      var dd = document.createElement("dd"); dd.textContent = pair[1];
      wrap.appendChild(dt); wrap.appendChild(dd);
      stats.appendChild(wrap);
    });

    $("turn-banner").textContent = youWon ? "You win!" : (winner === "ai" ? state.aiName + " wins" : "Stalemate");
    $("overlay").hidden = false;
    log(youWon ? "🏆 You win the regatta!" : (winner === "ai" ? "☠️ " + state.aiName + " wins." : "Stalemate."), "big");
  }

  // ---------------------------------------------------------------- screens
  function showScreen(id) {
    ["screen-setup", "screen-placement", "screen-game"].forEach(function (s) {
      $(s).classList.toggle("active", s === id);
    });
    window.scrollTo(0, 0);
  }

  function startSetup() {
    state = freshState();
    var name = $("player-name").value.trim();
    state.playerName = name;
    state.playerAvatar = chosen.player;
    state.aiAvatar = chosen.ai;
    var avatarMeta = DEFAULT_AVATARS.filter(function (a) { return a.src === chosen.ai; })[0];
    state.aiName = avatarMeta ? avatarMeta.name : "Rival Skipper";

    randomizeBoard(state.playerBoard);
    randomizeBoard(state.aiBoard);

    $("placement-avatar").src = state.playerAvatar;
    $("placement-name").textContent = state.playerName + "'s waters";
    renderPlacement();
    showScreen("screen-placement");
  }

  function startGame() {
    $("chip-player-img").src = state.playerAvatar;
    $("chip-ai-img").src = state.aiAvatar;
    $("chip-player-name").textContent = state.playerName;
    $("chip-ai-name").textContent = state.aiName;
    $("log").innerHTML = "";
    $("overlay").hidden = true;
    state.turn = "player";
    log("The regatta begins — " + state.playerName + " fires first.", "big");
    showScreen("screen-game");
    refreshGame();
  }

  // ---------------------------------------------------------------- wiring
  function init() {
    state = freshState();

    buildAvatarOptions("player");
    buildAvatarOptions("ai");
    wireUpload("player");
    wireUpload("ai");

    buildBoardEl($("board-placement"));
    buildBoardEl($("board-enemy"));
    buildBoardEl($("board-own"));
    initPlacementInteraction();

    $("btn-start").addEventListener("click", function () {
      var name = $("player-name").value.trim();
      if (!name) {
        $("name-error").hidden = false;
        $("player-name").focus();
        return;
      }
      $("name-error").hidden = true;
      startSetup();
    });

    $("player-name").addEventListener("input", function () {
      if ($("player-name").value.trim()) $("name-error").hidden = true;
    });
    $("player-name").addEventListener("keydown", function (e) {
      if (e.key === "Enter") $("btn-start").click();
    });

    $("btn-randomize").addEventListener("click", function () {
      randomizeBoard(state.playerBoard);
      renderPlacement();
    });

    $("btn-confirm-placement").addEventListener("click", startGame);

    $("board-enemy").addEventListener("click", onEnemyBoardClick);

    $("weapon-shot").addEventListener("click", function () {
      state.weapon = "shot";
      updateWeaponUI();
    });
    $("weapon-bomb").addEventListener("click", function () {
      if (state.playerBombs <= 0) return;
      state.weapon = "bomb";
      updateWeaponUI();
    });

    $("btn-rematch").addEventListener("click", function () {
      var name = state.playerName, pa = state.playerAvatar, aa = state.aiAvatar, an = state.aiName;
      state = freshState();
      state.playerName = name; state.playerAvatar = pa; state.aiAvatar = aa; state.aiName = an;
      randomizeBoard(state.playerBoard);
      randomizeBoard(state.aiBoard);
      $("overlay").hidden = true;
      $("placement-avatar").src = pa;
      $("placement-name").textContent = name + "'s waters";
      renderPlacement();
      showScreen("screen-placement");
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
