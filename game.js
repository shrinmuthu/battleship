/* Odyssey — a Battleship-style game set in Ancient Greece.
   Vessels are Greek ships, normal shots are arrows and bombs are catapult volleys.
   Single-file vanilla JS, no build tools. */
(function () {
  "use strict";

  var SIZE = 10;
  var CATAPULTS_PER_PLAYER = 2;
  var LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
  var STORAGE_KEY = "odyssey.captains.v1";

  var FLEET = [
    { id: "argo", name: "Argo", size: 5 },
    { id: "trireme", name: "War Trireme", size: 4 },
    { id: "bireme", name: "Bireme", size: 3 },
    { id: "galley", name: "Merchant Galley", size: 3 },
    { id: "skiff", name: "Fishing Skiff", size: 2 }
  ];

  var DEFAULT_AVATARS = [
    { id: "odysseus", name: "Odysseus", src: "assets/avatars/odysseus.svg" },
    { id: "athena", name: "Athena", src: "assets/avatars/athena.svg" },
    { id: "poseidon", name: "Poseidon", src: "assets/avatars/poseidon.svg" },
    { id: "circe", name: "Circe", src: "assets/avatars/circe.svg" },
    { id: "achilles", name: "Achilles", src: "assets/avatars/achilles.svg" },
    { id: "hermes", name: "Hermes", src: "assets/avatars/hermes.svg" }
  ];

  var MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

  /* How the rival thinks. hunt: how it searches, refine: whether it locks onto a vessel's
     axis, targetChance: how reliably it follows up a hit, catapult: how it spends volleys. */
  var DIFFICULTIES = {
    easy: {
      id: "easy", label: "Easy", title: "Deckhand",
      blurb: "Fires almost at random and often loses the trail after a hit.",
      hunt: "random", refine: false, targetChance: 0.45, catapult: "random"
    },
    medium: {
      id: "medium", label: "Medium", title: "Helmsman",
      blurb: "Searches at random but always hunts down a vessel it has struck.",
      hunt: "random", refine: false, targetChance: 1, catapult: "loose"
    },
    hard: {
      id: "hard", label: "Hard", title: "Strategos",
      blurb: "Searches a parity grid, locks onto a hull's axis and times its catapults.",
      hunt: "parity", refine: true, targetChance: 1, catapult: "smart"
    }
  };
  var DIFFICULTY_ORDER = ["easy", "medium", "hard"];

  /* An ancient galley drawn to span `size` cells: hull, ram, oars, sail and shields. */
  function shipSvg(size) {
    var w = size * 100;
    var oars = "";
    for (var x = 46; x < w - 40; x += 46) {
      oars += '<path d="M' + x + ' 58 l-16 30"/>';
    }
    var shields = "";
    for (var s = 60; s < w - 50; s += 52) {
      shields += '<circle cx="' + s + '" cy="44" r="9"/>';
    }
    var mastX = Math.round(w * 0.45);
    var sail = size >= 3
      ? '<g class="sail">' +
        '<path d="M' + mastX + ' 36 L' + mastX + ' 4" stroke="#7c5a34" stroke-width="5" stroke-linecap="round"/>' +
        '<path d="M' + (mastX - 34) + ' 8 H' + (mastX + 34) + '" stroke="#7c5a34" stroke-width="5" stroke-linecap="round"/>' +
        '<path d="M' + (mastX - 32) + ' 10 H' + (mastX + 32) + ' Q' + (mastX + 20) + ' 34 ' + mastX + ' 34 Q' +
          (mastX - 20) + ' 34 ' + (mastX - 32) + ' 10 Z" fill="#f0e2c6" opacity="0.92"/>' +
        '<path d="M' + mastX + ' 12 v20 M' + (mastX - 16) + ' 12 v16 M' + (mastX + 16) + ' 12 v16"' +
          ' stroke="#c8442c" stroke-width="3" opacity="0.65"/>' +
        '</g>'
      : "";
    return '<svg class="vessel" viewBox="0 0 ' + w + ' 100" preserveAspectRatio="none">' +
      '<g class="oars" stroke="#8a6742" stroke-width="5" stroke-linecap="round">' + oars + "</g>" +
      '<path class="hull" d="M14 40 H' + (w - 30) + ' L' + (w - 6) + ' 56 L' + (w - 30) + ' 74 ' +
        'C' + (w * 0.6) + ' 88, ' + (w * 0.25) + ' 88, 40 74 C 22 66, 14 54, 14 40 Z" ' +
        'fill="#b8946a" stroke="#6d4d2c" stroke-width="3"/>' +
      '<path d="M14 40 C 2 24, 12 8, 30 10 C 20 16, 18 28, 26 38 Z" fill="#8a6742"/>' +
      '<path d="M20 52 H' + (w - 34) + '" stroke="#8a6742" stroke-width="4" opacity="0.7"/>' +
      '<g fill="#c8442c" stroke="#e8c96a" stroke-width="2.5" opacity="0.9">' + shields + "</g>" +
      '<g fill="#f3ecdd"><ellipse cx="' + (w - 34) + '" cy="48" rx="9" ry="7"/></g>' +
      '<circle cx="' + (w - 32) + '" cy="48" r="3.5" fill="#1a1207"/>' +
      sail +
      "</svg>";
  }

  var SHIP_ICON =
    '<svg class="ship-icon" viewBox="0 0 60 34" aria-hidden="true">' +
    '<path d="M4 20 h52 l-8 11 h-36z" fill="#b8946a"/>' +
    '<path d="M30 2 l0 17" stroke="#8a6742" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M31 4 q14 6 0 13z" fill="#e8c96a"/>' +
    '<path d="M29 4 q-14 6 0 13z" fill="#f3ecdd" opacity="0.85"/>' +
    '<path d="M4 20 l-4 -5 6 1z" fill="#e8c96a"/>' +
    "</svg>";

  var ROTATE_ICON =
    '<svg class="rotate-icon" viewBox="0 0 24 24" aria-hidden="true">' +
    '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 4v7h-7"/>' +
    "</g></svg>";

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
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  // ---------------------------------------------------------------- captain records (localStorage)
  function loadRecords() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === "object") ? parsed : {};
    } catch (err) {
      return {}; // private mode / corrupted data — play on without persistence
    }
  }

  function saveRecords(records) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (err) {
      /* storage unavailable — stats simply won't persist */
    }
  }

  function recordKey(name) { return name.trim().toLowerCase(); }

  function getRecord(name) {
    var key = recordKey(name);
    if (!key) return null;
    var rec = loadRecords()[key];
    if (!rec) return null;
    return {
      name: rec.name || name,
      wins: rec.wins || 0,
      losses: rec.losses || 0,
      streak: rec.streak || 0,          // positive = win streak, negative = loss streak
      bestStreak: rec.bestStreak || 0,
      lastPlayed: rec.lastPlayed || null
    };
  }

  function updateRecord(name, won) {
    var key = recordKey(name);
    if (!key) return null;
    var records = loadRecords();
    var rec = records[key] || { name: name, wins: 0, losses: 0, streak: 0, bestStreak: 0 };
    rec.name = name;
    if (won) {
      rec.wins++;
      rec.streak = rec.streak > 0 ? rec.streak + 1 : 1;
      if (rec.streak > rec.bestStreak) rec.bestStreak = rec.streak;
    } else {
      rec.losses++;
      rec.streak = rec.streak < 0 ? rec.streak - 1 : -1;
    }
    rec.lastPlayed = new Date().toISOString();
    records[key] = rec;
    saveRecords(records);
    return rec;
  }

  function streakText(rec) {
    if (!rec || !rec.streak) return "No streak yet.";
    if (rec.streak > 0) return "Current streak: " + plural(rec.streak, "win", "wins") + " in a row.";
    return "Current streak: " + plural(-rec.streak, "loss", "losses") + " in a row.";
  }

  function recordSummary(rec) {
    return plural(rec.wins, "win", "wins") + " · " + plural(rec.losses, "loss", "losses") +
      (rec.bestStreak > 1 ? " · best streak " + rec.bestStreak : "");
  }

  function showWelcomeBack(name) {
    var box = $("welcome-back");
    var rec = getRecord(name);
    if (!rec || (rec.wins === 0 && rec.losses === 0)) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    box.hidden = false;
    box.innerHTML =
      "Welcome back, <strong>" + escapeHtml(rec.name) + "</strong> — the herald remembers you." +
      "<span class='record'>" + escapeHtml(recordSummary(rec)) + ". " + escapeHtml(streakText(rec)) + "</span>";
  }

  /* Every captain stored in this browser, best record first. */
  function allRecords() {
    var records = loadRecords();
    return Object.keys(records).map(function (k) { return records[k]; })
      .filter(function (rec) { return rec && (rec.wins || rec.losses); })
      .sort(function (a, b) {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return (a.losses || 0) - (b.losses || 0);
      });
  }

  function streakCell(rec) {
    var s = rec.streak || 0;
    if (s > 0) return { text: s + "W", cls: "win" };
    if (s < 0) return { text: (-s) + "L", cls: "loss" };
    return { text: "—", cls: "" };
  }

  function renderScoreboard() {
    var box = $("scoreboard");
    var body = $("scoreboard-body");
    var rows = allRecords();
    body.innerHTML = "";
    if (!rows.length) { box.hidden = true; return; }
    box.hidden = false;
    rows.forEach(function (rec) {
      var tr = document.createElement("tr");
      var st = streakCell(rec);
      tr.innerHTML =
        "<td>" + escapeHtml(rec.name || "") + "</td>" +
        "<td>" + (rec.wins || 0) + "</td>" +
        "<td>" + (rec.losses || 0) + "</td>" +
        '<td class="streak ' + st.cls + '">' + st.text + "</td>" +
        "<td>" + (rec.bestStreak || 0) + "</td>";
      body.appendChild(tr);
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

  /* Fire on a single cell. Returns null when the cell was already resolved. */
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
      playerName: "Captain",
      playerAvatar: DEFAULT_AVATARS[0].src,
      playerAvatarName: DEFAULT_AVATARS[0].name,
      aiAvatar: DEFAULT_AVATARS[1].src,
      aiName: "Rival",
      playerBoard: createBoard(),   // the player's fleet, attacked by the AI
      aiBoard: createBoard(),       // the AI's fleet, attacked by the player
      playerCatapults: CATAPULTS_PER_PLAYER,
      aiCatapults: CATAPULTS_PER_PLAYER,
      difficulty: currentDifficulty,
      turn: "player",
      busy: false,
      over: false,
      weapon: "shot",
      ai: {
        targets: [],        // queue of promising cells {r,c}
        hitStack: [],       // unresolved hits belonging to a live vessel
        shots: 0, hits: 0, misses: 0, sunk: 0, turns: 0
      },
      you: { shots: 0, hits: 0, misses: 0, sunk: 0, turns: 0 }
    };
  }

  // ---------------------------------------------------------------- difficulty
  var currentDifficulty = "medium";

  function diff() { return DIFFICULTIES[(state && state.difficulty) || currentDifficulty]; }

  function buildDifficultyOptions() {
    var box = $("difficulty-options");
    box.innerHTML = "";
    DIFFICULTY_ORDER.forEach(function (id) {
      var d = DIFFICULTIES[id];
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "difficulty-option";
      btn.setAttribute("role", "radio");
      btn.dataset.difficulty = id;
      btn.innerHTML = "<strong>" + d.label + "</strong><span>" + escapeHtml(d.blurb) + "</span>";
      btn.addEventListener("click", function () { selectDifficulty(id); });
      box.appendChild(btn);
    });
    selectDifficulty(currentDifficulty);
  }

  function selectDifficulty(id) {
    currentDifficulty = id;
    Array.prototype.forEach.call($("difficulty-options").children, function (btn) {
      var on = btn.dataset.difficulty === id;
      btn.classList.toggle("selected", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  // ---------------------------------------------------------------- avatars
  var chosen = { player: DEFAULT_AVATARS[0].src, ai: DEFAULT_AVATARS[1].src };

  function avatarMeta(src) {
    return DEFAULT_AVATARS.filter(function (a) { return a.src === src; })[0] || null;
  }

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
    var meta = avatarMeta(src);
    $("name-" + which).textContent = meta ? meta.name : "Your own image";
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
        err.textContent = "That file is not an image — please choose a PNG, JPG, GIF or SVG.";
        err.hidden = false;
        input.value = "";
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        err.textContent = "That image is too large (maximum 4 MB).";
        err.hidden = false;
        input.value = "";
        return;
      }
      var reader = new FileReader();
      reader.onload = function () { selectAvatar(which, reader.result); };
      reader.onerror = function () {
        err.textContent = "That file could not be read — please try another one.";
        err.hidden = false;
      };
      reader.readAsDataURL(file);
      input.value = "";
    });
  }

  // ---------------------------------------------------------------- board rendering
  function buildBoardEl(el) {
    el.innerHTML = "";
    var layer = document.createElement("div");
    layer.className = "ship-layer";
    layer.setAttribute("aria-hidden", "true");
    el.appendChild(layer);
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

  /* Lay each vessel's artwork over the cells it occupies. On the placement board each
     vessel also gets a turn handle on its bow and a name tag that shows on hover. */
  function renderShipLayer(boardEl, board, show, interactive) {
    var layer = boardEl.querySelector(".ship-layer");
    if (!layer) return;
    layer.innerHTML = "";
    if (!show) return;
    board.ships.forEach(function (ship) {
      if (!ship.cells.length) return;
      var first = cellEl(boardEl, ship.cells[0].r, ship.cells[0].c);
      var last = cellEl(boardEl, ship.cells[ship.cells.length - 1].r, ship.cells[ship.cells.length - 1].c);
      if (!first || !last) return;
      var boxW = last.offsetLeft + last.offsetWidth - first.offsetLeft;
      var boxH = last.offsetTop + last.offsetHeight - first.offsetTop;
      var el = document.createElement("div");
      el.className = "vessel-wrap" + (ship.sunk ? " sunk" : "");
      el.dataset.ship = String(ship.id);
      el.style.left = first.offsetLeft + "px";
      el.style.top = first.offsetTop + "px";
      el.style.width = (ship.horizontal ? boxW : boxH) + "px";
      el.style.height = (ship.horizontal ? boxH : boxW) + "px";
      if (!ship.horizontal) {
        el.style.transformOrigin = "0 0";
        el.style.transform = "rotate(90deg) translateY(-100%)";
      }
      el.innerHTML = shipSvg(ship.size);
      layer.appendChild(el);
      if (interactive) layer.appendChild(turnHandle(ship, first));
    });
  }

  /* The bow handle: a click target sitting on the vessel's leading cell that turns it. */
  function turnHandle(ship, bowCell) {
    var handle = document.createElement("button");
    handle.type = "button";
    handle.className = "turn-handle";
    handle.dataset.ship = String(ship.id);
    handle.dataset.r = String(ship.cells[0].r);
    handle.dataset.c = String(ship.cells[0].c);
    handle.style.left = (bowCell.offsetLeft + bowCell.offsetWidth / 2) + "px";
    handle.style.top = (bowCell.offsetTop + bowCell.offsetHeight / 2) + "px";
    handle.title = "Turn the " + ship.name;
    handle.setAttribute("aria-label", "Turn the " + ship.name +
      " (currently " + (ship.horizontal ? "across" : "down") + ")");
    handle.innerHTML = ROTATE_ICON +
      '<span class="handle-tag">' + escapeHtml(ship.name) + "</span>";
    // The handle covers the bow cell, so it has to resolve that cell's gestures itself:
    // its own mouseup stops propagation, and the board's endDrag never sees the release.
    handle.addEventListener("mousedown", function (e) {
      placement.drag = { ship: ship, offset: 0 };
      placement.moved = false;
      e.preventDefault();
    });
    handle.addEventListener("mouseup", function (e) {
      e.stopPropagation();
      if (!placement.drag) return;
      var dragged = placement.drag.ship;
      var moved = placement.moved;
      clearPreview();
      if (moved) resolveDrop(Number(handle.dataset.r), Number(handle.dataset.c));
      placement.drag = null;
      placement.moved = false;
      // rotateShip renders itself, and re-rendering would wipe its refusal flash
      if (moved) renderPlacement();
      else rotateShip(dragged);
    });
    // detail is 0 only for keyboard activation; mouse gestures are already resolved above
    handle.addEventListener("click", function (e) {
      e.stopPropagation();
      if (e.detail) return;
      rotateShip(ship);
    });
    handle.addEventListener("mouseenter", function () { highlightShip(ship.id); });
    handle.addEventListener("mouseleave", function () { highlightShip(null); });
    return handle;
  }

  /* Tie a vessel on the board to its row in the fleet list, so the two 3-cell
     vessels can be told apart at a glance. */
  function highlightShip(id) {
    var each = function (nodes, fn) { Array.prototype.forEach.call(nodes, fn); };
    var lit = function (el) { el.classList.toggle("lit", id !== null && el.dataset.ship === String(id)); };
    each($("board-placement").querySelectorAll(".vessel-wrap, .turn-handle"), lit);
    each($("placement-fleet").querySelectorAll("li"), lit);
  }

  /* Impact effects: blood/explosion on a hit, splash/smoke on a miss. */
  function spawnFx(boardEl, r, c, kind) {
    var cell = cellEl(boardEl, r, c);
    if (!cell) return;
    var fx = document.createElement("div");
    fx.className = "fx fx-" + kind;
    fx.style.left = (cell.offsetLeft + cell.offsetWidth / 2) + "px";
    fx.style.top = (cell.offsetTop + cell.offsetHeight / 2) + "px";
    var parts = "";
    for (var i = 0; i < 8; i++) parts += '<span class="p p' + i + '"></span>';
    fx.innerHTML = '<span class="core"></span>' + parts;
    boardEl.appendChild(fx);
    setTimeout(function () {
      if (fx.parentNode) fx.parentNode.removeChild(fx);
    }, kind === "smoke" ? 2200 : 1400);
  }

  function sound(name) {
    if (window.OdysseyAudio) window.OdysseyAudio.play(name);
  }

  function playImpacts(boardEl, results, weapon) {
    var loudest = null;
    results.forEach(function (res) {
      var kind = res.result === "hit"
        ? (weapon === "bomb" ? "boom" : "blood")
        : (weapon === "bomb" ? "smoke" : "splash");
      spawnFx(boardEl, res.r, res.c, kind);
      // one voice per volley: a hit outranks a miss
      if (!loudest || (res.result === "hit" && loudest !== "boom" && loudest !== "blood")) loudest = kind;
    });
    if (loudest) sound(loudest);
    if (results.some(function (res) { return res.sunk; })) {
      setTimeout(function () { sound("sink"); }, 260);
    }
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
        el.classList.remove("ship", "ship-bow", "hit", "miss", "sunk", "resolved", "preview", "invalid", "blast-preview");
        if (showShips && ship && shot !== "hit") {
          el.classList.add("ship");
          if (ship.cells.length && ship.cells[0].r === r && ship.cells[0].c === c) el.classList.add("ship-bow");
        }
        if (shot === "miss") el.classList.add("miss", "resolved");
        if (shot === "hit") {
          el.classList.add("hit", "resolved");
          if (ship && ship.sunk) el.classList.add("sunk");
        }
      }
    }
    renderShipLayer(boardEl, board, showShips, boardEl.id === "board-placement");
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

  function renderFleetList(ul, board, rotatable) {
    ul.innerHTML = "";
    board.ships.forEach(function (s) {
      var li = document.createElement("li");
      li.dataset.ship = s.id;
      if (s.sunk) li.classList.add("sunk-item");
      var pips = "";
      for (var i = 0; i < s.size; i++) pips += i < s.hits ? "●" : "○";
      li.innerHTML = "<span class='ship-label'>" + SHIP_ICON + escapeHtml(s.name) +
        " <span class='muted'>(" + s.size + ")</span></span>";

      if (rotatable) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "rotate-btn";
        btn.title = "Turn the " + s.name;
        btn.setAttribute("aria-label", "Turn the " + s.name +
          " (currently " + (s.horizontal ? "across" : "down") + ")");
        btn.innerHTML = ROTATE_ICON + "<span>" + (s.horizontal ? "Across" : "Down") + "</span>";
        btn.addEventListener("click", function () { rotateShip(s); });
        li.appendChild(btn);
        li.addEventListener("mouseenter", function () { highlightShip(s.id); });
        li.addEventListener("mouseleave", function () { highlightShip(null); });
      } else {
        var pipsEl = document.createElement("span");
        pipsEl.className = "pips";
        pipsEl.textContent = pips;
        li.appendChild(pipsEl);
      }

      ul.appendChild(li);
    });
  }

  // ---------------------------------------------------------------- placement screen
  var placement = { drag: null, moved: false };

  function renderPlacement() {
    renderBoard($("board-placement"), state.playerBoard, true);
    renderFleetList($("placement-fleet"), state.playerBoard, true);
  }

  /* Turn a vessel about its bow, sliding it back onto the sea if the turn would
     run it aground. Returns false when no orientation fits. */
  function rotateShip(ship) {
    var board = state.playerBoard;
    var horizontal = !ship.horizontal;
    var maxRow = horizontal ? SIZE - 1 : SIZE - ship.size;
    var maxCol = horizontal ? SIZE - ship.size : SIZE - 1;

    for (var back = 0; back < ship.size; back++) {
      var r = Math.min(ship.row, maxRow) - (horizontal ? 0 : back);
      var c = Math.min(ship.col, maxCol) - (horizontal ? back : 0);
      if (r < 0 || c < 0) break;
      if (canPlace(board, ship, r, c, horizontal)) {
        place(board, ship, r, c, horizontal);
        renderPlacement();
        return true;
      }
    }

    flashPlacement(ship);
    placementNote("The " + ship.name + " has no room to turn — move it first.");
    return false;
  }

  /* Commit the in-flight drag as if it had been dropped on cell (r, c). Shared by the
     board and by the bow handles, which sit on top of a cell and swallow its mouseup. */
  function resolveDrop(r, c) {
    var drag = placement.drag;
    if (!drag) return;
    var ship = drag.ship;
    var row = ship.horizontal ? r : r - drag.offset;
    var col = ship.horizontal ? c - drag.offset : c;
    if (canPlace(state.playerBoard, ship, row, col, ship.horizontal)) {
      place(state.playerBoard, ship, row, col, ship.horizontal);
    }
  }

  var noteTimer = null;

  function placementNote(text) {
    var el = $("placement-note");
    el.textContent = text;
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { el.textContent = ""; }, 3500);
  }

  function flashPlacement(ship) {
    ship.cells.forEach(function (p) {
      var el = cellEl($("board-placement"), p.r, p.c);
      if (!el) return;
      el.classList.remove("invalid");
      void el.offsetWidth;
      el.classList.add("invalid");
      setTimeout(function () { el.classList.remove("invalid"); }, 450);
    });
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
      var turned = false;
      clearPreview();
      if (hit) {
        if (placement.moved) {
          resolveDrop(hit.r, hit.c);
        } else {
          rotateShip(ship);
          turned = true;
        }
      }
      placement.drag = null;
      placement.moved = false;
      // rotateShip renders itself; re-rendering here would wipe the refusal flash
      if (!turned) renderPlacement();
    }

    boardEl.addEventListener("mouseup", endDrag);
    boardEl.addEventListener("mouseleave", function () {
      highlightShip(null);
      if (!placement.drag) return;
      clearPreview();
      placement.drag = null;
      placement.moved = false;
    });

    boardEl.addEventListener("mouseover", function (e) {
      if (placement.drag) return;
      var hit = placementCellFromEvent(e);
      highlightShip(hit ? state.playerBoard.shipAt[idx(hit.r, hit.c)] : null);
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
    $("ai-bombs").textContent = state.aiCatapults;
    $("you-shots").textContent = you.shots;
    $("you-accuracy").textContent = you.shots ? Math.round((you.hits / you.shots) * 100) + "%" : "0%";
    $("you-sunk").textContent = you.sunk;

    $("chip-player-ships").textContent = state.playerBoard.ships.filter(function (s) { return !s.sunk; }).length;
    $("chip-ai-ships").textContent = state.aiBoard.ships.filter(function (s) { return !s.sunk; }).length;
    $("player-bombs").textContent = state.playerCatapults;
  }

  function updateWeaponUI() {
    var left = state.playerCatapults;
    var bombBtn = $("weapon-bomb");
    var shotBtn = $("weapon-shot");
    bombBtn.disabled = left <= 0 || state.over;
    if (left <= 0 && state.weapon === "bomb") state.weapon = "shot";
    bombBtn.classList.toggle("active", state.weapon === "bomb");
    shotBtn.classList.toggle("active", state.weapon === "shot");
    $("player-bombs").textContent = left;
    $("board-enemy").classList.toggle("bomb-mode", state.weapon === "bomb");
  }

  function setTurnBanner() {
    var el = $("turn-banner");
    if (state.over) return;
    if (state.turn === "player") {
      el.textContent = state.playerName + ", loose your shot";
      el.classList.remove("enemy");
    } else {
      el.textContent = state.aiName + " takes aim…";
      el.classList.add("enemy");
    }
  }

  function refreshGame() {
    renderBoard($("board-enemy"), state.aiBoard, false);
    renderBoard($("board-own"), state.playerBoard, true);
    renderFleetList($("enemy-fleet"), state.aiBoard);
    renderFleetList($("own-fleet"), state.playerBoard);
    updateStats();
    updateWeaponUI();
    setTurnBanner();
    $("board-enemy").classList.toggle("interactive", state.turn === "player" && !state.over && !state.busy);
  }

  // ---------------------------------------------------------------- player turn
  function clearBlastPreview() {
    Array.prototype.forEach.call($("board-enemy").querySelectorAll(".blast-preview"), function (el) {
      el.classList.remove("blast-preview");
    });
  }

  function onEnemyBoardHover(e) {
    clearBlastPreview();
    if (state.weapon !== "bomb" || state.over || state.busy || state.turn !== "player") return;
    var target = e.target.closest ? e.target.closest(".cell") : null;
    if (!target) return;
    plusCells(Number(target.dataset.r), Number(target.dataset.c)).forEach(function (p) {
      var el = cellEl($("board-enemy"), p.r, p.c);
      if (el && !el.classList.contains("resolved")) el.classList.add("blast-preview");
    });
  }

  function onEnemyBoardClick(e) {
    var target = e.target.closest ? e.target.closest(".cell") : null;
    if (!target) return;
    if (state.over) { log("The battle is decided — choose Sail again for a new voyage.", "big"); return; }
    if (state.busy || state.turn !== "player") { log("Patience — " + state.aiName + " is still taking a turn.", "you"); return; }

    var r = Number(target.dataset.r), c = Number(target.dataset.c);
    var board = state.aiBoard;

    if (state.weapon === "bomb") {
      if (state.playerCatapults <= 0) {
        log("No catapult volleys remain — switching back to arrows.", "you");
        state.weapon = "shot";
        refreshGame();
        return;
      }
      var area = plusCells(r, c);
      var fresh = area.filter(function (p) { return board.shots[idx(p.r, p.c)] === null; });
      if (fresh.length === 0) {
        log("Every cell in that blast area has already been struck — choose another target.", "you");
        return;
      }
      state.playerCatapults--;
      var results = [];
      fresh.forEach(function (p) {
        var res = fireAt(board, p.r, p.c);
        if (res) results.push(res);
      });
      state.you.turns++;
      tallyPlayerResults(results);
      clearBlastPreview();
      flash($("board-enemy"), area);
      playImpacts($("board-enemy"), results, "bomb");
      var hits = results.filter(function (x) { return x.result === "hit"; }).length;
      log("Catapult volley on " + coordLabel(r, c) + " — " + plural(hits, "hit", "hits") +
          " across " + plural(results.length, "new cell", "new cells") + ".", "you");
      results.filter(function (x) { return x.sunk; }).forEach(function (x) {
        log("You sent " + state.aiName + "'s " + x.ship.name + " to the depths!", "big");
      });
      state.weapon = "shot";
      endPlayerTurn();
      return;
    }

    if (board.shots[idx(r, c)] !== null) {
      log("You have already struck " + coordLabel(r, c) + " — choose a fresh target.", "you");
      return;
    }
    var single = fireAt(board, r, c);
    state.you.turns++;
    tallyPlayerResults([single]);
    flash($("board-enemy"), [{ r: r, c: c }]);
    playImpacts($("board-enemy"), [single], "shot");
    log(single.result === "hit"
      ? "Your arrow strikes a hull at " + coordLabel(r, c) + "."
      : "Your arrow falls into open water at " + coordLabel(r, c) + ".", "you");
    if (single.sunk) log("You sent " + state.aiName + "'s " + single.ship.name + " to the depths!", "big");
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
    aiTimer = setTimeout(aiTurn, 850);
  }

  // ---------------------------------------------------------------- AI
  var aiTimer = null;

  function cancelAiTurn() {
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
  }

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

  function randomFreeCell(board) {
    var free = unknownCells(board);
    if (free.length === 0) return null;
    return free[Math.floor(Math.random() * free.length)];
  }

  /* Hunt on a parity grid tuned to the smallest vessel still afloat. */
  function huntCell(board) {
    if (diff().hunt === "random") return randomFreeCell(board);
    var free = unknownCells(board);
    if (free.length === 0) return null;
    var smallest = board.ships.reduce(function (m, s) { return (!s.sunk && s.size < m) ? s.size : m; }, SIZE);
    var parity = free.filter(function (p) { return (p.r + p.c) % smallest === 0; });
    var pool = parity.length ? parity : free;
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
    if (!diff().refine) return;
    var stack = state.ai.hitStack;
    if (stack.length < 2) return;
    var sameRow = stack.every(function (p) { return p.r === stack[0].r; });
    var sameCol = stack.every(function (p) { return p.c === stack[0].c; });
    if (!sameRow && !sameCol) return;
    var line = [];
    if (sameRow) {
      var r = stack[0].r;
      var cols = stack.map(function (p) { return p.c; });
      line.push({ r: r, c: Math.min.apply(null, cols) - 1 });
      line.push({ r: r, c: Math.max.apply(null, cols) + 1 });
    } else {
      var c2 = stack[0].c;
      var rows = stack.map(function (p) { return p.r; });
      line.push({ r: Math.min.apply(null, rows) - 1, c: c2 });
      line.push({ r: Math.max.apply(null, rows) + 1, c: c2 });
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
    var adjacency = 0;
    unknown.forEach(function (p) {
      state.ai.hitStack.forEach(function (h) {
        if (Math.abs(h.r - p.r) + Math.abs(h.c - p.c) === 1) adjacency++;
      });
    });
    return unknown.length + adjacency * 3;
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
    var board = state.playerBoard; // the AI attacks the player's board
    var left = state.aiCatapults;
    var mode = diff();
    refineTargets(board);
    state.ai.targets = state.ai.targets.filter(function (p) {
      return inBounds(p.r, p.c) && board.shots[idx(p.r, p.c)] === null;
    });

    if (mode.catapult === "random") {
      // A careless rival: fires its volleys on a whim, wherever it happens to look.
      if (left > 0 && state.ai.turns >= 4 && Math.random() < 0.2) {
        var loose = randomFreeCell(board);
        if (loose) return { type: "bomb", r: loose.r, c: loose.c };
      }
      if (state.ai.targets.length > 0 && Math.random() < mode.targetChance) {
        var easyTarget = state.ai.targets.shift();
        return { type: "shot", r: easyTarget.r, c: easyTarget.c };
      }
      var rnd = randomFreeCell(board);
      return rnd ? { type: "shot", r: rnd.r, c: rnd.c } : null;
    }

    if (left > 0 && state.ai.hitStack.length > 0) {
      // A vessel is wounded: a plus-shaped volley nearby often finishes it.
      var around = [];
      state.ai.hitStack.forEach(function (h) {
        plusCells(h.r, h.c).forEach(function (p) {
          if (board.shots[idx(p.r, p.c)] === null) around.push(p);
        });
      });
      var pick = bestBombTarget(board, around);
      var woundedThreshold = mode.catapult === "smart" ? 6 : 7;
      if (pick && pick.score >= woundedThreshold) return { type: "bomb", r: pick.cell.r, c: pick.cell.c };
    }

    if (state.ai.targets.length > 0) {
      var t = state.ai.targets.shift();
      return { type: "shot", r: t.r, c: t.c };
    }

    // Hunting: spend a volley when the search drags on and a large vessel is still out there.
    var free = unknownCells(board);
    if (left > 0 && mode.catapult === "smart" && state.ai.turns >= 6 && largestAfloat(board) >= 3) {
      var interior = free.filter(function (p) {
        return p.r > 0 && p.r < SIZE - 1 && p.c > 0 && p.c < SIZE - 1;
      });
      var pick2 = bestBombTarget(board, interior.length ? interior : free);
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

    if (move.type === "bomb" && state.aiCatapults > 0) {
      state.aiCatapults--;
      var area = plusCells(move.r, move.c);
      var results = [];
      area.forEach(function (p) {
        var res = fireAt(board, p.r, p.c);
        if (res) { results.push(res); registerAiResult(board, res); }
      });
      flash($("board-own"), area);
      playImpacts($("board-own"), results, "bomb");
      var hits = results.filter(function (x) { return x.result === "hit"; }).length;
      log(state.aiName + " launches a catapult volley on " + coordLabel(move.r, move.c) +
          " — " + plural(hits, "hit", "hits") + ".", "ai");
      results.filter(function (x) { return x.sunk; }).forEach(function (x) {
        log(state.aiName + " sank your " + x.ship.name + "!", "big");
      });
    } else {
      var single = fireAt(board, move.r, move.c);
      if (!single) { // safety net: never waste a turn on a resolved cell
        var fallback = huntCell(board);
        if (!fallback) { finish("draw"); return; }
        single = fireAt(board, fallback.r, fallback.c);
        if (!single) { finish("draw"); return; }
      }
      registerAiResult(board, single);
      flash($("board-own"), [{ r: single.r, c: single.c }]);
      playImpacts($("board-own"), [single], "shot");
      log(single.result === "hit"
        ? state.aiName + "'s arrow strikes your fleet at " + coordLabel(single.r, single.c) + "."
        : state.aiName + "'s arrow falls into open water at " + coordLabel(single.r, single.c) + ".", "ai");
      if (single.sunk) log(state.aiName + " sank your " + single.ship.name + "!", "big");
    }

    state.busy = false;
    if (allSunk(state.playerBoard)) { finish("ai"); return; }
    state.turn = "player";
    refreshGame();
  }

  // ---------------------------------------------------------------- end of battle
  function finish(winner) {
    state.over = true;
    state.busy = false;
    cancelAiTurn();
    refreshGame();
    renderBoard($("board-enemy"), state.aiBoard, true);
    $("board-enemy").classList.remove("interactive", "bomb-mode");

    var youWon = winner === "player";
    if (winner !== "draw") setTimeout(function () { sound(youWon ? "victory" : "defeat"); }, 500);
    $("overlay-title").textContent = youWon
      ? "The gods favour you!"
      : (winner === "ai" ? "Your fleet lies in ruins" : "The seas fall still");
    $("overlay-avatar").src = youWon ? state.playerAvatar : state.aiAvatar;
    $("overlay-text").textContent = youWon
      ? state.playerName + " sank every vessel of " + state.aiName + ". Bards will sing of this voyage."
      : (winner === "ai"
        ? state.aiName + " sank the whole fleet of " + state.playerName + ". Rebuild, and sail again."
        : "No targets remain on either sea.");

    var streakLine = $("overlay-streak");
    if (winner === "draw") {
      streakLine.textContent = "";
    } else {
      var rec = updateRecord(state.playerName, youWon);
      streakLine.textContent = rec ? (recordSummary(rec) + ". " + streakText(rec)) : "";
      renderScoreboard();
    }

    var stats = $("overlay-stats");
    stats.innerHTML = "";
    [
      ["Your shots", state.you.shots],
      ["Your accuracy", state.you.shots ? Math.round((state.you.hits / state.you.shots) * 100) + "%" : "0%"],
      [state.aiName + "'s shots", state.ai.shots],
      [state.aiName + "'s accuracy", state.ai.shots ? Math.round((state.ai.hits / state.ai.shots) * 100) + "%" : "0%"],
      ["Difficulty", diff().label],
      ["Vessels you sank", state.you.sunk],
      ["Vessels you lost", state.ai.sunk]
    ].forEach(function (pair) {
      var wrap = document.createElement("div");
      var dt = document.createElement("dt"); dt.textContent = pair[0];
      var dd = document.createElement("dd"); dd.textContent = pair[1];
      wrap.appendChild(dt); wrap.appendChild(dd);
      stats.appendChild(wrap);
    });

    $("turn-banner").textContent = youWon
      ? "Victory is yours"
      : (winner === "ai" ? state.aiName + " prevails" : "A still sea");
    updateChipRecord();
    $("overlay").hidden = false;
    log(youWon
      ? "Victory! The fleet of " + state.aiName + " is no more."
      : (winner === "ai" ? "Defeat. " + state.aiName + " rules these waters." : "The battle ends in a stalemate."), "big");
  }

  function updateChipRecord() {
    var rec = getRecord(state.playerName);
    $("chip-player-record").textContent = rec ? recordSummary(rec) : "";
  }

  // ---------------------------------------------------------------- screens
  /* Abandon any battle in progress and return to the setup screen. */
  function goHome() {
    if (state && !state.over && $("screen-game").classList.contains("active")) {
      var ok = window.confirm("Leave this battle? The current game will be lost and no record is kept.");
      if (!ok) return;
    }
    cancelAiTurn();
    if (state) { state.busy = true; state.over = true; }
    $("overlay").hidden = true;
    showScreen("screen-setup");
    showWelcomeBack($("player-name").value.trim());
    renderScoreboard();
  }

  function showScreen(id) {
    ["screen-setup", "screen-placement", "screen-game"].forEach(function (s) {
      $(s).classList.toggle("active", s === id);
    });
    document.body.dataset.screen = id.replace("screen-", "");
    window.scrollTo(0, 0);
  }

  function goToPlacement(name, playerAvatar, aiAvatar) {
    cancelAiTurn();
    state = freshState();
    state.playerName = name;
    state.playerAvatar = playerAvatar;
    state.aiAvatar = aiAvatar;
    var pMeta = avatarMeta(playerAvatar);
    var aMeta = avatarMeta(aiAvatar);
    state.playerAvatarName = pMeta ? pMeta.name : name;
    state.aiName = aMeta ? aMeta.name : "The Rival";

    randomizeBoard(state.playerBoard);
    randomizeBoard(state.aiBoard);

    // clear the previous battle's boards so nothing from it can paint on the way in
    renderBoard($("board-enemy"), state.aiBoard, false);
    renderBoard($("board-own"), state.playerBoard, true);

    $("placement-avatar").src = state.playerAvatar;
    $("placement-name").textContent = state.playerName + "'s waters";
    showScreen("screen-placement");
    renderPlacement();
  }

  function startGame() {
    $("chip-player-img").src = state.playerAvatar;
    $("chip-ai-img").src = state.aiAvatar;
    $("chip-player-name").textContent = state.playerName;
    $("chip-ai-name").textContent = state.aiName;
    $("chip-ai-difficulty").textContent = diff().label + " — " + diff().title;
    updateChipRecord();
    $("log").innerHTML = "";
    $("overlay").hidden = true;
    state.turn = "player";
    var rec = getRecord(state.playerName);
    log("The fleets meet at dawn — " + state.playerName + " strikes first.", "big");
    log(state.aiName + " sails as a " + diff().title + " (" + diff().label + ").", "ai");
    if (rec && (rec.wins || rec.losses)) log("Herald's record for " + state.playerName + ": " + recordSummary(rec) + ".", "you");
    showScreen("screen-game");
    refreshGame();
  }

  // ---------------------------------------------------------------- wiring
  function initAudioControls() {
    var audio = window.OdysseyAudio;
    if (!audio) return;

    var pairs = [
      { el: $("toggle-sfx"), on: audio.sfxEnabled(), set: audio.setSfx },
      { el: $("toggle-music"), on: audio.musicEnabled(), set: audio.setMusic }
    ];

    pairs.forEach(function (pair) {
      pair.el.setAttribute("aria-pressed", pair.on ? "true" : "false");
      pair.el.addEventListener("click", function () {
        var next = pair.el.getAttribute("aria-pressed") !== "true";
        pair.el.setAttribute("aria-pressed", next ? "true" : "false");
        pair.set(next);
      });
    });

    // browsers only allow audio to start from a gesture
    document.addEventListener("click", function () { audio.wake(); });
  }

  function init() {
    state = freshState();

    document.body.dataset.screen = "setup";
    initAudioControls();
    buildDifficultyOptions();
    renderScoreboard();
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
      goToPlacement(name, chosen.player, chosen.ai);
    });

    $("player-name").addEventListener("input", function () {
      var value = $("player-name").value.trim();
      if (value) $("name-error").hidden = true;
      showWelcomeBack(value);
    });
    $("player-name").addEventListener("keydown", function (e) {
      if (e.key === "Enter") $("btn-start").click();
    });

    $("btn-randomize").addEventListener("click", function () {
      randomizeBoard(state.playerBoard);
      renderPlacement();
    });

    $("btn-confirm-placement").addEventListener("click", startGame);

    // Vessel artwork is positioned in pixels, so it must be laid out again on resize.
    var resizeTimer = null;
    window.addEventListener("resize", function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (!state) return;
        if ($("screen-placement").classList.contains("active")) renderPlacement();
        else if ($("screen-game").classList.contains("active")) refreshGame();
      }, 120);
    });

    $("board-enemy").addEventListener("click", onEnemyBoardClick);
    $("board-enemy").addEventListener("mousemove", onEnemyBoardHover);
    $("board-enemy").addEventListener("mouseleave", clearBlastPreview);

    $("weapon-shot").addEventListener("click", function () {
      state.weapon = "shot";
      clearBlastPreview();
      updateWeaponUI();
    });
    $("weapon-bomb").addEventListener("click", function () {
      if (state.playerCatapults <= 0) return;
      state.weapon = "bomb";
      updateWeaponUI();
    });

    $("btn-rematch").addEventListener("click", function () {
      var name = state.playerName, pa = state.playerAvatar, aa = state.aiAvatar;
      $("overlay").hidden = true;
      goToPlacement(name, pa, aa);
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-home]"), function (btn) {
      btn.addEventListener("click", goHome);
    });

    $("btn-clear-scores").addEventListener("click", function () {
      if (!window.confirm("Erase every captain's record stored in this browser?")) return;
      saveRecords({});
      renderScoreboard();
      showWelcomeBack($("player-name").value.trim());
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
