/* ============================================================
   Genios y Gigantes — Interfaz de usuario (hotseat)
   ============================================================ */
window.GG = window.GG || {};

GG.UI = (function () {
  const E = () => GG.Engine;
  let game = null;
  let mode = "idle";        // idle | recruit | move-src | move-dst | build-city | wonder-place
  let srcTile = null;
  let recruitCount = 1;
  let wonderToPlace = null;
  let highlight = {};

  const $ = id => document.getElementById(id);

  /* ---------------- Pantalla de inicio ---------------- */
  const startConfig = { count: 4, players: [] };

  function initStart() {
    // botones de cantidad
    $("player-count").querySelectorAll("button").forEach(b => {
      b.addEventListener("click", () => {
        $("player-count").querySelectorAll("button").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        startConfig.count = parseInt(b.dataset.n, 10);
        renderPlayerConfig();
      });
    });
    renderPlayerConfig();
    $("btn-start").addEventListener("click", startGame);
    $("btn-rules").addEventListener("click", showRules);
    $("btn-help").addEventListener("click", showRules);
    $("btn-newgame").addEventListener("click", () => location.reload());
    $("modal-close").addEventListener("click", closeModal);
  }

  function renderPlayerConfig() {
    const wrap = $("player-config");
    wrap.innerHTML = "";
    const defaults = ["Roma", "Cartago", "Atenas", "Persia"];
    startConfig.players = [];
    for (let i = 0; i < startConfig.count; i++) {
      const chosenColor = GG.PLAYER_COLORS[i].key;
      startConfig.players.push({ name: defaults[i], colorKey: chosenColor });
      const row = document.createElement("div");
      row.className = "pc-row";
      const input = document.createElement("input");
      input.value = defaults[i];
      input.addEventListener("input", () => { startConfig.players[i].name = input.value; });
      row.appendChild(input);
      const colors = document.createElement("div");
      colors.className = "pc-colors";
      GG.PLAYER_COLORS.forEach(c => {
        const sw = document.createElement("div");
        sw.className = "swatch" + (c.key === chosenColor ? " sel" : "");
        sw.style.background = c.hex;
        sw.title = c.name;
        sw.addEventListener("click", () => {
          startConfig.players[i].colorKey = c.key;
          colors.querySelectorAll(".swatch").forEach(s => s.classList.remove("sel"));
          sw.classList.add("sel");
        });
        colors.appendChild(sw);
      });
      row.appendChild(colors);
      wrap.appendChild(row);
    }
  }

  function startGame() {
    // colores únicos
    const used = new Set();
    for (const p of startConfig.players) {
      if (used.has(p.colorKey)) {
        const free = GG.PLAYER_COLORS.find(c => !used.has(c.key));
        p.colorKey = free.key;
      }
      used.add(p.colorKey);
    }
    game = E().newGame({ players: startConfig.players.slice(0, startConfig.count) });
    E().setupAuto(game);
    E().beginRound(game);           // producción ronda 1
    $("start-screen").classList.add("hidden");
    $("game-screen").classList.remove("hidden");
    enterTurn();
    render();
  }

  /* ---------------- Flujo de turno ---------------- */
  function enterTurn() {
    if (game.phase === "gameover") { showGameOver(); return; }
    const p = E().currentPlayer(game);
    if (p.eliminated) { E().endTurn(game); enterTurn(); return; }
    E().beginTurn(game, p);
    E().advanceWonders(game, p);
    if (game.phase === "gameover") { showGameOver(); return; }
    game.subPhase = "recruit";
    mode = "recruit"; srcTile = null; recruitCount = 1;
    clearHighlight();
  }

  function toSituation() {
    const p = E().currentPlayer(game);
    mode = "idle"; clearHighlight();
    const skip = p.activeGyG || p.skipSituationNext || game.globalFlags.noSituationAll;
    if (p.skipSituationNext) p.skipSituationNext = false;
    if (skip) {
      if (p.activeGyG) hint(`${p.name} tiene un Genio/Gigante activo: no roba carta de situación.`);
      game.subPhase = "action";
      render();
      return;
    }
    const card = E().drawSituation(game, p);
    E().applySituation(game, p, card);
    game.subPhase = "action";
    showSituationCard(card, () => { render(); });
  }

  function endTurn() {
    E().endTurn(game);
    if (game.phase === "gameover") { render(); showGameOver(); return; }
    enterTurn();
    render();
  }

  /* ---------------- Interacción con el tablero ---------------- */
  function onTileClick(t) {
    const p = E().currentPlayer(game);
    if (game.phase === "gameover") return;

    if (mode === "recruit") {
      if (t.owner !== p.idx) { hint("Coloca cohortes solo en provincias propias."); return; }
      placeRecruits(p, t, recruitCount);
      render();
      return;
    }
    if (mode === "build-city") {
      const r = E().buildCity(game, p, t.id);
      if (!r.ok) hint(r.msg); else { mode = "idle"; clearHighlight(); }
      render();
      return;
    }
    if (mode === "wonder-place") {
      const r = E().startWonder(game, p, t.id, wonderToPlace);
      if (!r.ok) hint(r.msg); else { mode = "idle"; wonderToPlace = null; clearHighlight(); }
      render();
      return;
    }
    if (mode === "move-src") {
      if (t.owner !== p.idx || t.cohorts < 1) { hint("Elige una provincia propia con cohortes."); return; }
      srcTile = t.id;
      mode = "move-dst";
      computeMoveHighlight(t);
      hint(`Origen: ${t.id} (${t.cohorts} cohortes). Elige destino limítrofe.`);
      render();
      return;
    }
    if (mode === "move-dst") {
      if (t.id === srcTile) { mode = "move-src"; srcTile = null; clearHighlight(); render(); return; }
      if (!E().adjacent(game, srcTile, t.id)) { hint("Debe ser una provincia limítrofe (por puente)."); return; }
      const src = game.board.index[srcTile];
      const max = src.cohorts;
      promptCount(`¿Cuántas cohortes mover/atacar de ${srcTile} a ${t.id}? (máx ${max})`, max, (n) => {
        const r = E().moveOrAttack(game, p, srcTile, t.id, n);
        if (!r.ok) { hint(r.msg); }
        else {
          mode = "move-src"; srcTile = null; clearHighlight();
          if (r.battle) showBattleResult(r.battle);
        }
        if (game.phase === "gameover") { render(); showGameOver(); return; }
        render();
      });
      return;
    }
  }

  function placeRecruits(p, t, n) {
    let placed = 0;
    // cohortes gratis primero
    while ((p.turnFlags.freeRecruits || 0) > 0 && placed < n) {
      E().recruitFree(game, p, t.id, 1);
      p.turnFlags.freeRecruits--; placed++;
    }
    const rest = n - placed;
    if (rest > 0) {
      const r = E().recruit(game, p, t.id, rest);
      if (!r.ok) hint(r.msg);
    }
  }

  function computeMoveHighlight(t) {
    clearHighlight();
    highlight[t.id] = "#ffd24a";
    for (const nb of game.board.adjacency[t.id]) {
      const nt = game.board.index[nb];
      const p = E().currentPlayer(game);
      highlight[nb] = (nt.owner === p.idx) ? "#7fd17f" : "#e0603b";
    }
  }
  function clearHighlight() { highlight = {}; }

  /* ---------------- Render principal ---------------- */
  function render() {
    if (!game) return;
    // topbar
    const phaseNames = { recruit: "Reclutamiento", situation: "Carta de situación", action: "Acciones" };
    $("phase-indicator").textContent = `Ronda ${game.round} · ${game.phase === "gameover" ? "Fin" : (phaseNames[game.subPhase] || "")}`;
    const cp = game.phase === "gameover" ? null : E().currentPlayer(game);
    if (cp) {
      $("turn-banner").innerHTML = `<span style="color:${cp.colorHex}">●</span> Turno de <strong>${cp.name}</strong>`;
    } else {
      $("turn-banner").textContent = "Partida finalizada";
    }

    // tablero
    GG.Hex.render($("board"), game.board, game, { onTileClick, highlight });

    renderPlayers();
    renderActiveCard();
    renderActionBar();
    renderLog();
  }

  function renderPlayers() {
    const left = $("left-panel");
    left.innerHTML = "<h3 style='color:var(--accent);margin:2px 0 8px'>Civilizaciones</h3>";
    for (const p of game.players) {
      left.appendChild(playerCard(p, false));
    }
  }

  function renderActiveCard() {
    const wrap = $("active-player-card");
    wrap.innerHTML = "";
    if (game.phase === "gameover") return;
    const p = E().currentPlayer(game);
    wrap.appendChild(playerCard(p, true));
  }

  function playerCard(p, detailed) {
    const perm = E().permanentPillars(p);
    const eff = E().effectivePillars(p);
    const div = document.createElement("div");
    const isActive = game.phase !== "gameover" && E().currentPlayer(game).idx === p.idx;
    div.className = "pcard" + (isActive ? " active" : "") + (p.eliminated ? " dead" : "");

    const h = GG.HERITAGES.find(x => x.id === p.heritageId);
    const g = GG.GOVERNMENTS.find(x => x.id === p.govId);
    const rel = GG.RELIGIONS.find(x => x.id === p.religionId);
    const score = E().computeScore(game, p);

    let html = `<div class="pcard-head">
        <span class="pcard-dot" style="background:${p.colorHex}"></span>
        <span class="pcard-name">${p.name}${p.vassalOf !== null ? " ⛓️" : ""}</span>
        <span class="pcard-score">${score}⭐</span>
      </div>
      <div class="pcard-sub">${h.pueblo} · ${g.name} · ${rel.name} ${rel.icon}${p.eliminated ? " · ELIMINADO" : ""}</div>`;

    // pilares
    html += `<div class="pillars">`;
    for (const pil of GG.PILLARS) {
      const boost = eff[pil.key] - perm[pil.key];
      html += `<div class="pillar" title="${pil.name}">
          <div class="pn">${pil.icon}</div>
          <div class="pv">${perm[pil.key]}${boost ? `<span class="boost">${boost > 0 ? "+" + boost : boost}</span>` : ""}</div>
        </div>`;
    }
    html += `</div>`;

    // recursos
    const cap = E().storageCap(game, p);
    html += `<div class="res-row">`;
    for (const r of GG.RESOURCES) {
      html += `<span class="res-chip" title="${r.name} (máx ${cap})"><img src="${r.img}" alt="">${p.resources[r.key]}</span>`;
    }
    html += `</div>`;

    if (p.activeGyG) {
      const a = GG.ARCHETYPES.find(x => x.id === p.activeGyG.id);
      html += `<div class="gyg-tag">✨ ${a.character} «${a.name}» · ${p.activeGyG.turnsLeft} turno(s)<br><em>${a.influencia}</em></div>`;
    }
    if (detailed && p.pantheon.length) {
      const names = p.pantheon.map(id => GG.ARCHETYPES.find(x => x.id === id).character).join(", ");
      html += `<div class="pcard-sub">Panteón: ${names}</div>`;
    }
    div.innerHTML = html;
    return div;
  }

  /* ---------------- Barra de acciones ---------------- */
  function renderActionBar() {
    const bar = $("action-bar");
    bar.innerHTML = "";
    if (game.phase === "gameover") {
      addBtn(bar, "🏁 Ver resultado", "primary", showGameOver);
      return;
    }
    const p = E().currentPlayer(game);

    if (game.subPhase === "recruit") {
      const cost = E().recruitCost(game, p);
      const free = p.turnFlags.freeRecruits || 0;
      const info = document.createElement("span");
      info.style.fontSize = "13px"; info.style.color = "var(--muted)";
      info.innerHTML = `Reclutar (clic en provincia propia) — costo ${cost.oro} 🪙 + ${cost.armas} ⚔️ c/u${free ? ` · <b>${free} gratis</b>` : ""}. Cantidad:`;
      bar.appendChild(info);
      const inp = document.createElement("input");
      inp.type = "number"; inp.min = 1; inp.value = recruitCount; inp.className = "inline-num";
      inp.addEventListener("input", () => { recruitCount = Math.max(1, parseInt(inp.value || "1", 10)); });
      bar.appendChild(inp);
      addBtn(bar, "➡️ Terminar reclutamiento", "primary", () => { toSituation(); render(); });
      return;
    }

    if (game.subPhase === "action") {
      addBtn(bar, "⚔️ Mover / Atacar", "", () => { mode = "move-src"; srcTile = null; clearHighlight(); hint("Elige una provincia propia con cohortes."); render(); });
      addBtn(bar, "🏛️ Construir ciudad", "", () => { mode = "build-city"; clearHighlight(); highlightOwn(p); hint("Elige una provincia propia (no capital) para construir ciudad."); render(); });
      addBtn(bar, "📈 Subir pilar", "", () => showPillarUpgrade(p));
      addBtn(bar, "💱 Comerciar", "", () => showTrade(p));
      addBtn(bar, "🔄 Reformar gobierno", "", () => {
        const r = E().reformGovernment(game, p);
        if (!r.ok) hint(r.msg);
        render();
      });
      // maravilla
      const perm = E().permanentPillars(p);
      const wopts = E().wonderFor(perm).filter(w => !game.wondersLocked[w.id]);
      if (wopts.length) addBtn(bar, "🏆 Iniciar maravilla", "", () => showWonderChoice(p, wopts));
      addBtn(bar, "🤝 Diplomacia", "", () => showDiplomacy(p));
      if (mode !== "idle") addBtn(bar, "✖ Cancelar", "", () => { mode = "idle"; srcTile = null; clearHighlight(); hint(""); render(); });
      addBtn(bar, "✔️ Terminar turno", "primary", () => { endTurn(); });
      return;
    }
  }

  function highlightOwn(p) {
    for (const t of game.board.tiles) if (t.owner === p.idx && !t.capital && !t.city) highlight[t.id] = "#7fd17f";
  }

  function addBtn(bar, label, cls, cb) {
    const b = document.createElement("button");
    b.className = "act-btn " + cls;
    b.textContent = label;
    b.addEventListener("click", cb);
    bar.appendChild(b);
    return b;
  }

  function hint(msg) { $("hint").textContent = msg || ""; }

  /* ---------------- Modales de acción ---------------- */
  function showPillarUpgrade(p) {
    let html = `<h2>Subir un pilar</h2><p>Paga 7 de un recurso para subir el pilar asociado (+1).</p>`;
    for (const res of GG.RESOURCES) {
      const pk = GG.PILLAR_BY_PAYMENT[res.key];
      const pil = GG.PILLARS.find(x => x.key === pk);
      html += `<div class="card-choice" data-res="${res.key}">
        <div class="cc-title">${pil.icon} +1 ${pil.name}</div>
        <div class="cc-sub">Pagando 7 ${res.name} · tienes ${p.resources[res.key]}</div></div>`;
    }
    openModal(html);
    $("modal-content").querySelectorAll(".card-choice").forEach(el => {
      el.addEventListener("click", () => {
        const r = E().upgradePillarByPayment(game, p, el.dataset.res);
        if (!r.ok) { hint(r.msg); } else closeModal();
        render();
      });
    });
  }

  function showTrade(p) {
    const perm = E().permanentPillars(p);
    const inf = E().activeInfluence(p);
    const ratio = (perm.cultura >= GG.RULES.cultureFreeTradeLevel || inf.merchant1to1) ? 1 : 2;
    let html = `<h2>Comerciar con el mercader</h2>
      <p>Relación actual <b>${ratio}:1</b> ${ratio === 1 ? "(Cultura ≥ 8 o carta activa)" : "(a favor del mercader)"}.</p>
      <p>Entregas: <select id="tr-give">${resOptions()}</select>
         Recibes: <select id="tr-get">${resOptions()}</select>
         Cantidad a recibir: <input id="tr-amt" class="inline-num" type="number" min="1" value="1"></p>
      <button class="act-btn primary" id="tr-do">Comerciar</button>`;
    openModal(html);
    $("tr-get").selectedIndex = 1;
    $("tr-do").addEventListener("click", () => {
      const give = $("tr-give").value, get = $("tr-get").value;
      const amt = Math.max(1, parseInt($("tr-amt").value || "1", 10));
      if (give === get) { hint("Elige recursos distintos."); return; }
      const r = E().merchantTrade(game, p, give, get, amt);
      if (!r.ok) hint(r.msg); else closeModal();
      render();
    });
  }
  function resOptions() {
    return GG.RESOURCES.map(r => `<option value="${r.key}">${r.name}</option>`).join("");
  }

  function showWonderChoice(p, wopts) {
    let html = `<h2>Iniciar una Maravilla</h2><p>Costo: 15 🪨 + 12 🪙 y mantener la provincia 6 turnos. Elige:</p>`;
    for (const w of wopts) {
      const names = w.pillars.map(k => GG.PILLARS.find(x => x.key === k).name).join(" + ");
      html += `<div class="card-choice" data-w="${w.id}"><div class="cc-title">🏆 ${w.name}</div><div class="cc-sub">${names}</div></div>`;
    }
    openModal(html);
    $("modal-content").querySelectorAll(".card-choice").forEach(el => {
      el.addEventListener("click", () => {
        wonderToPlace = el.dataset.w;
        mode = "wonder-place"; clearHighlight(); highlightOwn(p);
        closeModal();
        hint("Elige una provincia propia para levantar la maravilla.");
        render();
      });
    });
  }

  function showDiplomacy(p) {
    let html = `<h2>Diplomacia</h2>`;
    // subyugar: convertir a un rival en vasallo (acuerdo)
    html += `<h3>Subyugar / Vasallaje</h3><p>Por acuerdo, un jugador puede volverse vasallo de otro para evitar la eliminación.</p>`;
    const others = game.players.filter(q => !q.eliminated && q.idx !== p.idx && q.vassalOf === null);
    if (others.length) {
      html += `<p>Convertir en vasallo de ${p.name}: `;
      html += others.map(q => `<button class="act-btn" data-sub="${q.idx}">${q.name}</button>`).join(" ");
      html += `</p>`;
    }
    // liberar vasallos propios
    if (p.vassals.length) {
      html += `<h3>Liberar vasallo</h3>` + p.vassals.map(v => `<button class="act-btn" data-lib="${v}">${game.players[v].name}</button>`).join(" ");
    }
    if (p.vassalOf !== null) {
      html += `<p>Eres vasallo de <b>${game.players[p.vassalOf].name}</b>. Para liberarte, supera su nivel de Libertad o usa una carta.</p>`;
    }
    openModal(html);
    $("modal-content").querySelectorAll("[data-sub]").forEach(b => b.addEventListener("click", () => {
      E().subjugate(game, p.idx, parseInt(b.dataset.sub, 10)); closeModal(); render();
      if (game.phase === "gameover") showGameOver();
    }));
    $("modal-content").querySelectorAll("[data-lib]").forEach(b => b.addEventListener("click", () => {
      E().liberate(game, parseInt(b.dataset.lib, 10)); closeModal(); render();
    }));
  }

  /* ---------------- Modales de carta / batalla ---------------- */
  function showSituationCard(card, cb) {
    const rar = GG.RARITY_LABEL[card.rarity] || "";
    let html = `<h2>Carta de Situación</h2>
      <div class="card-choice" style="cursor:default">
        <div class="cc-title">${card.name}</div>
        <div class="cc-sub">${rar}</div>
        <p style="margin:8px 0 0">${card.text}</p>
      </div>
      <button class="act-btn primary" id="sit-ok">Continuar</button>`;
    openModal(html);
    $("sit-ok").addEventListener("click", () => { closeModal(); cb && cb(); });
  }

  function showBattleResult(b) {
    const atk = game.players[b.attacker];
    const def = b.defender !== null ? game.players[b.defender].name : "Rebeldes";
    const win = b.outcome === "ataque" ? atk.name : def;
    let html = `<h2 class="big-result">⚔️ Resultado de batalla</h2>
      <p class="big-result">${atk.name} <b>${b.atk}</b> vs ${def} <b>${b.def}</b></p>
      <p class="big-result" style="font-size:20px">Gana: <b style="color:var(--gold)">${win}</b></p>
      <p class="big-result">${b.outcome === "ataque"
        ? `El defensor pierde ${b.defenderCohorts} cohorte(s); el atacante pierde ${b.attackerLost}.`
        : `El atacante pierde ${b.attackerLost} cohorte(s).`}</p>
      <button class="act-btn primary" id="bt-ok" style="display:block;margin:10px auto">Continuar</button>`;
    openModal(html);
    $("bt-ok").addEventListener("click", closeModal);
  }

  function promptCount(question, max, cb) {
    let html = `<h2>${question}</h2>
      <input id="pc-num" class="inline-num" type="number" min="1" max="${max}" value="${max}">
      <button class="act-btn primary" id="pc-ok">Aceptar</button>`;
    openModal(html);
    $("pc-num").focus();
    $("pc-ok").addEventListener("click", () => {
      let n = Math.max(1, Math.min(max, parseInt($("pc-num").value || "1", 10)));
      closeModal();
      cb(n);
    });
  }

  /* ---------------- Fin de partida ---------------- */
  function showGameOver() {
    const scored = game.players.filter(p => !p.eliminated)
      .map(p => ({ p, s: E().computeScore(game, p) }))
      .sort((a, b) => b.s - a.s);
    let html = `<h2 class="big-result">🏁 Fin de la partida</h2>`;
    if (game.winner !== null) html += `<p class="big-result" style="font-size:22px">🏆 Ganador: <b style="color:var(--gold)">${game.players[game.winner].name}</b></p>`;
    html += `<div class="big-result"><div class="score-list">`;
    scored.forEach((row, i) => {
      html += `<div>${i + 1}. <span style="color:${row.p.colorHex}">●</span> <b>${row.p.name}</b> — ${row.s} pts</div>`;
    });
    game.players.filter(p => p.eliminated).forEach(p => {
      html += `<div style="opacity:.5">☠️ ${p.name} — eliminado</div>`;
    });
    html += `</div><br><button class="act-btn primary" onclick="location.reload()">Nueva partida</button></div>`;
    openModal(html);
  }

  /* ---------------- Reglas ---------------- */
  function showRules() {
    const html = `<h2>Reglas rápidas</h2>
      <p><b>Objetivo:</b> mayor puntaje al terminar la partida (por Conquista, Dominio o Maravilla).</p>
      <h3>Pilares (1–12)</h3>
      <p>🧪 Ciencia, 📖 Cultura, 🕊️ Libertad, 👑 Poder. Influyen en combate, costos y maravillas.</p>
      <h3>Recursos</h3>
      <p>🪙 Oro, 🍖 Alimentos, 🪨 Piedra, ⚔️ Armas. La comida se consume cada turno.</p>
      <h3>Turno</h3>
      <p>1) Producción (inicio de ronda) · 2) Reclutar cohortes (1🪙+1⚔️ c/u) · 3) Carta de situación · 4) Construir / subir pilares / comerciar · 5) Mover y atacar.</p>
      <h3>Combate</h3>
      <p>Nº cohortes + Poder + Ciencia + dado(1-6). Mayor gana. Capital +3 def, Ciudad +2 def.</p>
      <table class="rules"><tr><th>Diferencia</th><th>Resultado</th></tr>
        <tr><td>1</td><td>Pírrica (ganador pierde ¾)</td></tr>
        <tr><td>2–4</td><td>Menor (ganador pierde ½)</td></tr>
        <tr><td>5–7</td><td>Clara (ganador pierde ¼)</td></tr>
        <tr><td>+7</td><td>Masacre (ganador no pierde)</td></tr></table>
      <h3>Puntaje</h3>
      <p>Fin de partida +10 · Maravilla +8 · Capital +8 · Ciudad +3 · Provincia +1 · cada 2 cohortes +1 · cada punto de pilar +1 · panteón según carta.</p>
      <p style="color:var(--muted);font-size:12px">Nota: algunos efectos raros/épicos y multi-movimientos se marcan en la Crónica para resolverse en la mesa.</p>`;
    openModal(html);
  }

  /* ---------------- Log ---------------- */
  function renderLog() {
    const box = $("log");
    box.innerHTML = "";
    let lastRound = null;
    for (let i = game.log.length - 1; i >= 0 && i > game.log.length - 60; i--) {
      const l = game.log[i];
      const line = document.createElement("div");
      line.className = "log-line";
      line.textContent = l.text;
      box.appendChild(line);
    }
  }

  /* ---------------- Modal helpers ---------------- */
  function openModal(html) {
    $("modal-content").innerHTML = html;
    $("modal").classList.remove("hidden");
  }
  function closeModal() { $("modal").classList.add("hidden"); }

  return { initStart };
})();
