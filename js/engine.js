/* ============================================================
   Genios y Gigantes — Motor de reglas
   Estado, setup, fases de turno, economía, combate, cartas,
   maravillas, vasallaje, puntaje y condiciones de victoria.
   ============================================================ */
window.GG = window.GG || {};

GG.Engine = (function () {
  const R = GG.RULES;
  const PILLAR_KEYS = GG.PILLARS.map(p => p.key);
  const RES_KEYS = GG.RESOURCES.map(r => r.key);

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function d6() { return 1 + Math.floor(Math.random() * 6); }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ---------------- Creación de partida ---------------- */
  function newGame(config) {
    // config: { players: [{name, colorKey}], radius }
    const numPlayers = config.players.length;
    const radius = config.radius || (numPlayers <= 2 ? 3 : 3);
    const board = GG.Hex.generateBoard(radius, numPlayers);

    const heritages = shuffle(GG.HERITAGES.slice());
    const game = {
      board, radius, numPlayers,
      players: [],
      order: [],
      roundStartPointer: 0,
      turnPointer: 0,     // índice dentro de order del jugador activo
      round: 1,
      phase: "setup",
      subPhase: null,     // 'recruit' | 'situation' | 'action'
      log: [],
      situationDeck: [], situationDiscard: [],
      gygDeck: [], gygDiscard: [],
      wondersBuilt: {},   // wonderId -> playerIdx (construida)
      wondersLocked: {},  // wonderId -> playerIdx (en construcción o hecha)
      globalFlags: {},    // efectos de ronda globales
      pendingManual: null,
      winner: null,
    };

    for (let i = 0; i < numPlayers; i++) {
      const c = config.players[i];
      const colorDef = GG.PLAYER_COLORS.find(x => x.key === c.colorKey) || GG.PLAYER_COLORS[i];
      const heritage = heritages[i];
      const government = pick(GG.GOVERNMENTS);
      const religion = pick(GG.RELIGIONS);
      const p = {
        idx: i,
        name: c.name || ("Jugador " + (i + 1)),
        colorKey: colorDef.key,
        colorHex: colorDef.hex,
        heritageId: heritage.id,
        govId: government.id,
        religionId: religion.id,
        basePillars: Object.assign({}, heritage.pillars),
        resources: Object.assign({}, R.startResources),
        citiesBuilt: 0,
        alive: true,
        eliminated: false,
        vassalOf: null,
        vassals: [],
        activeGyG: null,      // {id, turnsLeft, chosenEnemy?}
        pantheon: [],         // [archetypeId]
        turnFlags: {},        // se limpian al terminar su turno
        roundFlags: {},       // se limpian al inicio de su próximo turno
        skipSituationNext: false,
      };
      game.players.push(p);
    }

    // barajar mazos
    const sit = [];
    for (const c of GG.SITUATIONS) for (let k = 0; k < c.copies; k++) sit.push(c.id);
    game.situationDeck = shuffle(sit);
    game.gygDeck = shuffle(GG.ARCHETYPES.map(a => a.id));

    return game;
  }

  /* ---------------- Setup automático ---------------- */
  function setupAuto(game) {
    const slots = game.board.tiles.filter(t => t.isCapitalSlot);
    for (let i = 0; i < game.numPlayers; i++) {
      const cap = slots[i];
      cap.owner = i; cap.capital = true; cap.cohorts = 0; cap.isCapitalSlot = true;
      // 2 provincias adyacentes neutrales
      let taken = 0;
      const provs = [];
      for (const nb of game.board.adjacency[cap.id]) {
        const t = game.board.index[nb];
        if (t.owner === null && !t.isCapitalSlot && taken < R.startProvinces) {
          t.owner = i; taken++; provs.push(t);
        }
      }
      // colocar 4 cohortes: 2 en capital + 1 en cada provincia (o todas en capital)
      cap.cohorts = R.startCohorts - provs.length;
      for (const pr of provs) pr.cohorts = 1;
      if (cap.cohorts < 0) { cap.cohorts = R.startCohorts; }
    }
    game.order = game.players.map(p => p.idx);
    // orden inicial aleatorio (tirada de dado)
    shuffle(game.order);
    game.roundStartPointer = 0;
    game.phase = "production";
    log(game, `Partida iniciada con ${game.numPlayers} civilizaciones. Orden: ${game.order.map(i => game.players[i].name).join(" → ")}.`);
    for (const p of game.players) {
      const h = GG.HERITAGES.find(x => x.id === p.heritageId);
      const g = GG.GOVERNMENTS.find(x => x.id === p.govId);
      const rel = GG.RELIGIONS.find(x => x.id === p.religionId);
      log(game, `${p.name}: herencia ${h.pueblo}, gobierno ${g.name}, religión ${rel.name}.`);
    }
    return game;
  }

  /* ---------------- Pilares ---------------- */
  function govMods(p) {
    const g = GG.GOVERNMENTS.find(x => x.id === p.govId);
    return g ? g.mods : { ciencia: 0, cultura: 0, libertad: 0, poder: 0 };
  }
  function relMods(p) {
    const r = GG.RELIGIONS.find(x => x.id === p.religionId);
    return r ? r.mods : { ciencia: 0, cultura: 0, libertad: 0, poder: 0 };
  }
  // pilares permanentes visibles (0..12)
  function permanentPillars(p) {
    const gm = govMods(p), rm = relMods(p);
    const out = {};
    for (const k of PILLAR_KEYS) {
      out[k] = clamp((p.basePillars[k] || 0) + gm[k] + rm[k], 0, GG.MAX_PILLAR);
    }
    return out;
  }
  // pilares efectivos (incluye influencia de GyG activo y gov duplicado)
  function effectivePillars(p) {
    const perm = permanentPillars(p);
    const inf = activeInfluence(p);
    const out = {};
    for (const k of PILLAR_KEYS) {
      let v = perm[k];
      if (inf.pillars && inf.pillars[k]) v += inf.pillars[k];
      if (inf.govDoubled) v += govMods(p)[k];
      out[k] = Math.max(0, v);
    }
    return out;
  }
  function activeInfluence(p) {
    if (!p.activeGyG) return {};
    const a = GG.ARCHETYPES.find(x => x.id === p.activeGyG.id);
    return (a && a.fx && a.fx.influence) ? a.fx.influence : {};
  }

  function addBasePillars(game, p, deltas, reason) {
    if (!deltas) return;
    for (const k in deltas) {
      p.basePillars[k] = (p.basePillars[k] || 0) + deltas[k];
      // permitir negativo interno pero permanente se clampa al mostrar
    }
    if (reason) log(game, `${p.name}: ${fmtPillars(deltas)} (${reason}).`);
  }

  function fmtPillars(d) {
    return Object.keys(d).map(k => {
      const pil = GG.PILLARS.find(x => x.key === k);
      const v = d[k];
      return `${v >= 0 ? "+" : ""}${v} ${pil ? pil.name : k}`;
    }).join(", ");
  }

  /* ---------------- Recursos ---------------- */
  function storageCap(game, p) {
    const caps = game.board.tiles.filter(t => t.owner === p.idx && t.capital).length;
    const cities = game.board.tiles.filter(t => t.owner === p.idx && t.city).length;
    return Math.min(R.maxStorage, caps * R.capitalStorage + cities * R.cityStorage);
  }
  function addResources(game, p, deltas, clampStore) {
    for (const k in deltas) {
      p.resources[k] = (p.resources[k] || 0) + deltas[k];
      if (p.resources[k] < 0) p.resources[k] = 0;
    }
    if (clampStore) {
      const cap = storageCap(game, p);
      for (const k of RES_KEYS) if (p.resources[k] > cap) p.resources[k] = cap;
    }
  }
  function canPay(p, cost) {
    for (const k in cost) if ((p.resources[k] || 0) < cost[k]) return false;
    return true;
  }
  function pay(p, cost) { for (const k in cost) p.resources[k] -= cost[k]; }

  /* ---------------- Producción de inicio de ronda ---------------- */
  function doProduction(game) {
    for (const p of game.players) {
      if (p.eliminated) continue;
      const tiles = game.board.tiles.filter(t => t.owner === p.idx);
      const gains = { oro: 0, alimentos: 0, piedra: 0, armas: 0 };
      let foodConsume = 0, provinces = 0;
      for (const t of tiles) {
        let mult = 1;
        if (t.capital) mult = R.capitalProdMult;
        else if (t.city) mult = R.cityProdMult;
        gains[t.resource] += mult;
        // bonos GyG a ciudades
        if (t.city) {
          const inf = activeInfluence(p);
          if (inf.cityProdBonus) gains[t.resource] += inf.cityProdBonus;
          if (t.cityBonusRes) gains[t.cityBonusRes] += 1;
        }
        // consumo de comida
        if (t.capital) foodConsume += R.capitalFood;
        else if (t.city) foodConsume += R.cityFood;
        else provinces++;
      }
      foodConsume += Math.floor(provinces / R.provincesPerFood);
      // GyG económicos
      const inf = activeInfluence(p);
      if (inf.goldPerTurn) gains.oro += inf.goldPerTurn;
      if (inf.goldPerCityPerTurn) {
        const cities = tiles.filter(t => t.city).length;
        gains.oro += inf.goldPerCityPerTurn * cities;
      }

      // aplicar producción (menos comida consumida)
      for (const k of RES_KEYS) p.resources[k] += gains[k];
      p.resources.alimentos -= foodConsume;

      let msg = `${p.name} produce: ${RES_KEYS.map(k => `${gains[k]} ${resName(k)}`).join(", ")}; consume ${foodConsume} alimentos.`;
      // rebelión por hambre
      if (p.resources.alimentos < 0) {
        p.resources.alimentos = 0;
        const rebel = farthestProvince(game, p);
        if (rebel) {
          rebel.owner = null; rebel.cohorts = 0; rebel.control = false;
          msg += ` ¡HAMBRE! Se rebela ${rebel.id} (${resName(rebel.resource)}).`;
        }
      }
      // clamp almacenamiento
      const cap = storageCap(game, p);
      for (const k of RES_KEYS) {
        if (p.resources[k] < 0) p.resources[k] = 0;
        if (p.resources[k] > cap) p.resources[k] = cap;
      }
      log(game, msg);
    }
  }

  function farthestProvince(game, p) {
    const cap = game.board.tiles.find(t => t.owner === p.idx && t.capital);
    const provs = game.board.tiles.filter(t => t.owner === p.idx && !t.capital && !t.city);
    if (!provs.length) return null;
    let best = null, bestKey = -1;
    for (const t of provs) {
      const dist = cap ? GG.Hex.distance(game.board, cap.id, t.id) : 0;
      const goldPref = t.resource === "oro" ? 0.5 : 0;
      const key = dist + goldPref;
      if (key > bestKey) { bestKey = key; best = t; }
    }
    return best;
  }

  function resName(k) { const r = GG.RESOURCES.find(x => x.key === k); return r ? r.name : k; }

  /* ---------------- Reclutamiento ---------------- */
  function recruitCost(game, p) {
    const cost = Object.assign({}, R.cohortCost);
    if (p.turnFlags.recruitNoGold) cost.oro = 0;
    if (p.turnFlags.recruitDouble) { cost.oro *= 2; cost.armas *= 2; }
    return cost;
  }
  function recruit(game, p, tileId, count) {
    const tile = game.board.index[tileId];
    if (!tile || tile.owner !== p.idx) return { ok: false, msg: "Debes colocar cohortes en una provincia propia." };
    const cost = recruitCost(game, p);
    const total = { oro: cost.oro * count, armas: cost.armas * count };
    if (!canPay(p, total)) return { ok: false, msg: "Recursos insuficientes para reclutar." };
    pay(p, total);
    tile.cohorts += count;
    log(game, `${p.name} recluta ${count} cohorte(s) en ${tileId} (${total.oro} oro, ${total.armas} armas).`);
    return { ok: true };
  }
  function recruitFree(game, p, tileId, count) {
    const tile = game.board.index[tileId];
    if (!tile || tile.owner !== p.idx) return { ok: false, msg: "Provincia inválida." };
    tile.cohorts += count;
    log(game, `${p.name} recibe ${count} cohorte(s) gratis en ${tileId}.`);
    return { ok: true };
  }

  /* ---------------- Cartas de situación ---------------- */
  function drawSituation(game, p) {
    if (game.situationDeck.length === 0) {
      game.situationDeck = shuffle(game.situationDiscard);
      game.situationDiscard = [];
    }
    const id = game.situationDeck.pop();
    return GG.SITUATIONS.find(c => c.id === id);
  }

  function applySituation(game, p, card) {
    const fx = card.fx || {};
    let returnToDeck = false;
    if (fx.noEffect) { /* nada */ }
    if (fx.res) addResources(game, p, fx.res, true);
    if (fx.pillars) addBasePillars(game, p, fx.pillars, "carta de situación");
    if (fx.cohorts) {
      if (fx.cohorts > 0) placeCohortsAuto(game, p, fx.cohorts);
      else removeCohortsAuto(game, p, -fx.cohorts);
    }
    if (fx.drawGyG) drawGyGFor(game, p);
    if (fx.self) Object.assign(p.turnFlags, normalizeSelfFlags(fx.self));
    if (fx.self && fx.self.changeGovRandom) changeGov(game, p, null);
    if (fx.self && typeof fx.self.changeGov === "string") changeGov(game, p, fx.self.changeGov);
    if (fx.self && fx.self.changeReligionRandom) changeReligion(game, p, null);
    if (fx.self && typeof fx.self.changeReligion === "string") changeReligion(game, p, fx.self.changeReligion);
    if (fx.global) Object.assign(game.globalFlags, fx.global);
    if (fx.sieges) applySiegeEffect(game, fx.sieges);
    if (fx.vassals) {
      for (const q of game.players) if (q.vassalOf !== null) addBasePillars(game, q, fx.vassals.pillars, "carta (vasallos)");
    }
    if (fx.manual) {
      game.pendingManual = { card, playerIdx: p.idx };
      log(game, `${p.name} — ${card.name}: ${card.text} (resuélvelo manualmente).`);
    } else {
      log(game, `${p.name} roba situación: ${card.name} — ${card.text}`);
    }
    game.situationDiscard.push(card.id);
    return returnToDeck;
  }

  function normalizeSelfFlags(self) {
    // copia directa de flags a turnFlags/roundFlags
    const out = {};
    for (const k in self) if (typeof self[k] !== "object") out[k] = self[k];
    return out;
  }

  function applySiegeEffect(game, s) {
    for (const t of game.board.tiles) {
      if (!t.siege) continue;
      if (s.delta) t.siege.turnsLeft += s.delta;
      if (s.reinforce) t.siege.cohorts += s.reinforce;
      if (s.resolve) t.siege.turnsLeft = 0;
    }
    if (s.resolve) resolveExpiredSieges(game);
  }

  function placeCohortsAuto(game, p, n) {
    const cap = game.board.tiles.find(t => t.owner === p.idx && t.capital);
    if (cap) { cap.cohorts += n; log(game, `${p.name} recibe ${n} cohorte(s) en su capital.`); }
  }
  function removeCohortsAuto(game, p, n) {
    let left = n;
    const tiles = game.board.tiles.filter(t => t.owner === p.idx && t.cohorts > 0)
      .sort((a, b) => a.cohorts - b.cohorts);
    for (const t of tiles) {
      const take = Math.min(t.cohorts, left);
      t.cohorts -= take; left -= take;
      if (left <= 0) break;
    }
    log(game, `${p.name} pierde ${n - left} cohorte(s).`);
  }

  /* ---------------- Genios y Gigantes ---------------- */
  function drawGyGFor(game, p) {
    if (p.activeGyG) { log(game, `${p.name} ya tiene un Genio/Gigante activo.`); return null; }
    if (game.gygDeck.length === 0) { log(game, "El mazo de Genios y Gigantes está agotado."); return null; }
    const id = game.gygDeck.pop();
    const a = GG.ARCHETYPES.find(x => x.id === id);
    p.activeGyG = { id, turnsLeft: a.duration };
    log(game, `✨ ${p.name} recibe un Genio/Gigante: ${a.character} — «${a.name}» (${a.block}). Dura ${a.duration} turnos.`);
    // Ascenso (instantáneo)
    const asc = a.fx && a.fx.ascension;
    if (asc) {
      if (asc.resources) { addResources(game, p, asc.resources, true); log(game, `Ascenso: ${fmtRes(asc.resources)}.`); }
      if (asc.pillars) addBasePillars(game, p, asc.pillars, "ascenso GyG");
      if (asc.recruit) placeCohortsAuto(game, p, asc.recruit);
      if (asc.changeReligion) changeReligion(game, p, null);
      if (asc.freeGov) { changeGov(game, p, null); log(game, `${p.name} reforma su gobierno gratis (${a.name}).`); }
      if (asc.liberationWar) log(game, `${p.name} puede iniciar una Guerra de Liberación (resuélvelo en la mesa).`);
      if (asc.occupyFreeAdjacent) { p.turnFlags.occupyFreeAdjacentOnce = true; log(game, `${p.name} puede ocupar una provincia adyacente (sin ciudad) gratis.`); }
    }
    if (a.influencia && a.influencia !== "Ninguna.") log(game, `Influencia: ${a.influencia}`);
    return a;
  }

  function expireGyGIfNeeded(game, p) {
    if (!p.activeGyG) return;
    p.activeGyG.turnsLeft--;
    if (p.activeGyG.turnsLeft <= 0) {
      const a = GG.ARCHETYPES.find(x => x.id === p.activeGyG.id);
      // Herencia permanente
      if (a.fx && a.fx.legacy && a.fx.legacy.pillars) addBasePillars(game, p, a.fx.legacy.pillars, `herencia de ${a.character}`);
      p.pantheon.push(a.id);
      log(game, `${a.character} pasa al panteón de ${p.name} (${a.points} pts).`);
      p.activeGyG = null;
    }
  }

  function fmtRes(d) { return Object.keys(d).map(k => `${d[k] >= 0 ? "+" : ""}${d[k]} ${resName(k)}`).join(", "); }

  /* ---------------- Cambios de gobierno / religión ---------------- */
  function changeGov(game, p, targetId) {
    let g;
    if (targetId) g = GG.GOVERNMENTS.find(x => x.id === targetId);
    if (!g) g = pick(GG.GOVERNMENTS.filter(x => x.id !== p.govId));
    p.govId = g.id;
    log(game, `${p.name} adopta el gobierno: ${g.name}.`);
  }
  function reformGovernment(game, p) {
    const perm = permanentPillars(p);
    if (perm.poder < R.reformGovCost.poder) return { ok: false, msg: "Necesitas al menos 3 de Poder." };
    if (!canPay(p, { oro: R.reformGovCost.oro, armas: R.reformGovCost.armas })) return { ok: false, msg: "Necesitas 8 oro y 8 armas." };
    pay(p, { oro: R.reformGovCost.oro, armas: R.reformGovCost.armas });
    addBasePillars(game, p, { poder: -R.reformGovCost.poder }, "reforma de gobierno");
    changeGov(game, p, null);
    return { ok: true };
  }
  function changeReligion(game, p, targetId) {
    let r;
    if (targetId) r = GG.RELIGIONS.find(x => x.id === targetId);
    if (!r) r = pick(GG.RELIGIONS.filter(x => x.id !== p.religionId));
    p.religionId = r.id;
    log(game, `${p.name} adopta la religión: ${r.name} ${r.icon}.`);
  }

  /* ---------------- Subir pilar por pago ---------------- */
  function upgradePillarByPayment(game, p, resource) {
    const pillarKey = GG.PILLAR_BY_PAYMENT[resource];
    if (!pillarKey) return { ok: false, msg: "Recurso inválido." };
    let cost = R.pillarPaymentCost;
    const inf = activeInfluence(p);
    if (inf.pillarPayDiscount) cost -= inf.pillarPayDiscount;
    if (resource === "alimentos" && inf.libertadPayFood) cost = inf.libertadPayFood;
    if (p.turnFlags.oncePillarDiscountUsed !== true && inf.oncePillarDiscount) {
      cost -= inf.oncePillarDiscount; p.turnFlags.oncePillarDiscountUsed = true;
    }
    cost = Math.max(1, cost);
    if ((p.resources[resource] || 0) < cost) return { ok: false, msg: `Necesitas ${cost} ${resName(resource)}.` };
    p.resources[resource] -= cost;
    addBasePillars(game, p, { [pillarKey]: 1 }, `pago de ${cost} ${resName(resource)}`);
    return { ok: true };
  }

  /* ---------------- Construcción de ciudad ---------------- */
  function cityCost(game, p) {
    const cost = Object.assign({}, R.cityCost);
    const perm = permanentPillars(p);
    if (perm.ciencia >= R.cityDiscountPillarLevel && perm.cultura >= R.cityDiscountPillarLevel) {
      cost.oro -= 1; cost.piedra -= 1;
    }
    const inf = activeInfluence(p);
    if (inf.cityCostReduce) { cost.oro -= inf.cityCostReduce.oro || 0; cost.piedra -= inf.cityCostReduce.piedra || 0; }
    if (inf.allBuildReduce) { cost.oro -= inf.allBuildReduce; }
    if (p.turnFlags.cityDiscountThird) { cost.oro = Math.ceil(cost.oro * 2 / 3); cost.piedra = Math.ceil(cost.piedra * 2 / 3); }
    cost.oro = Math.max(0, cost.oro); cost.piedra = Math.max(0, cost.piedra);
    return cost;
  }
  function buildCity(game, p, tileId) {
    if (game.globalFlags.noBuildAll) return { ok: false, msg: "Nadie puede construir esta ronda." };
    const t = game.board.index[tileId];
    if (!t || t.owner !== p.idx) return { ok: false, msg: "Debe ser una provincia propia." };
    if (t.capital || t.city) return { ok: false, msg: "Ya es capital o ciudad." };
    if (p.citiesBuilt >= R.maxCitiesPerPlayer) return { ok: false, msg: "Máximo 2 ciudades por partida." };
    const cost = cityCost(game, p);
    if (!canPay(p, cost)) return { ok: false, msg: `Necesitas ${cost.oro} oro y ${cost.piedra} piedra.` };
    pay(p, cost);
    t.city = true; p.citiesBuilt++;
    addBasePillars(game, p, { ciencia: 1, libertad: 1 }, "construir ciudad");
    log(game, `${p.name} construye una CIUDAD en ${tileId} (${cost.oro} oro, ${cost.piedra} piedra).`);
    drawGyGFor(game, p); // hito: construir ciudad => aparece un GyG
    return { ok: true };
  }

  /* ---------------- Maravillas ---------------- */
  function wonderFor(pillars) {
    // devuelve la maravilla cuya pareja de pilares esté al máximo
    const atMax = PILLAR_KEYS.filter(k => pillars[k] >= R.wonderPillarLevel);
    if (atMax.length < 2) return [];
    return GG.WONDERS.filter(w => w.pillars.every(pk => atMax.includes(pk)));
  }
  function startWonder(game, p, tileId, wonderId) {
    const t = game.board.index[tileId];
    if (!t || t.owner !== p.idx) return { ok: false, msg: "Provincia propia requerida." };
    if (t.wonder) return { ok: false, msg: "Ya hay una maravilla aquí." };
    const perm = permanentPillars(p);
    const options = wonderFor(perm);
    const w = options.find(x => x.id === wonderId);
    if (!w) return { ok: false, msg: "No cumples 2 pilares a nivel 12 para esa maravilla." };
    if (game.wondersLocked[wonderId]) return { ok: false, msg: "Esa maravilla ya está bloqueada por otro jugador." };
    if (!canPay(p, R.wonderCost)) return { ok: false, msg: `Necesitas ${R.wonderCost.piedra} piedra y ${R.wonderCost.oro} oro.` };
    pay(p, R.wonderCost);
    t.wonder = { playerIdx: p.idx, wonderId, turnsLeft: R.wonderBuildTurns };
    game.wondersLocked[wonderId] = p.idx;
    log(game, `🏆 ${p.name} inicia la construcción de «${w.name}» en ${tileId} (${R.wonderBuildTurns} turnos).`);
    drawGyGFor(game, p); // hito
    return { ok: true };
  }

  /* ---------------- Movimiento y combate ---------------- */
  function maxMove(game, p) {
    let m = 1;
    const inf = activeInfluence(p);
    if (inf.moveMax) m = Math.max(m, inf.moveMax);
    if (p.turnFlags.moveMax) m = Math.max(m, p.turnFlags.moveMax);
    return m;
  }
  function adjacent(game, aId, bId) { return game.board.adjacency[aId].includes(bId); }

  // mover/atacar: from -> to con `count` cohortes (adyacente)
  function moveOrAttack(game, p, fromId, toId, count) {
    const from = game.board.index[fromId], to = game.board.index[toId];
    if (!from || !to) return { ok: false, msg: "Casilla inválida." };
    if (from.owner !== p.idx) return { ok: false, msg: "No controlas el origen." };
    if (from.cohorts < count || count < 1) return { ok: false, msg: "Cohortes insuficientes." };
    if (!adjacent(game, fromId, toId)) return { ok: false, msg: "Solo a provincias limítrofes (por puente)." };

    // Paz de El Pacificador
    if (activeInfluence(p).noAttackPeace && to.owner !== p.idx && (to.cohorts > 0 || to.rebels > 0 || to.owner !== null)) {
      // permitir mover a propia, bloquear ataques
    }

    // Movimiento a provincia propia
    if (to.owner === p.idx) {
      if (game.globalFlags.onlyInvasion) return { ok: false, msg: "Esta ronda solo se permiten movimientos de invasión." };
      from.cohorts -= count; to.cohorts += count;
      log(game, `${p.name} mueve ${count} cohorte(s) ${fromId} → ${toId}.`);
      return { ok: true };
    }

    // Objetivo enemigo o neutral
    const defenderIdx = to.owner;
    // vasallaje: no atacar a tu señor / a tu vasallo
    if (defenderIdx !== null) {
      const dp = game.players[defenderIdx];
      if (p.vassalOf === defenderIdx) return { ok: false, msg: "No puedes atacar a tu señor." };
      if (dp.vassalOf === p.idx) return { ok: false, msg: "No puedes atacar a tu vasallo." };
      if (activeInfluence(dp).noAttackPeace) return { ok: false, msg: `${dp.name} está en paz (El Pacificador).` };
    }
    if (activeInfluence(p).noAttackPeace) return { ok: false, msg: "Tu Pacificador te impide atacar." };

    const hasDefenders = to.cohorts > 0 || to.rebels > 0;
    const isStronghold = to.city || to.capital;

    if (!hasDefenders && !isStronghold) {
      // ocupación directa de provincia vacía (neutral o enemiga sin tropas)
      return occupy(game, p, from, to, count);
    }

    if (!hasDefenders && isStronghold) {
      // ciudad/capital sin tropas => asedio
      from.cohorts -= count;
      startSiege(game, p, to, count);
      return { ok: true, battle: null };
    }

    // Batalla
    return battle(game, p, from, to, count);
  }

  function occupy(game, p, from, to, count) {
    let cost = Object.assign({}, R.occupyCost);
    if (p.turnFlags.freeOccupy) cost = {};
    if (p.turnFlags.occupyFreeAdjacentOnce) { cost = {}; p.turnFlags.occupyFreeAdjacentOnce = false; }
    if (!canPay(p, cost)) return { ok: false, msg: "Necesitas 1 piedra para ocupar." };
    pay(p, cost);
    const prevOwner = to.owner;
    from.cohorts -= count;
    to.owner = p.idx; to.cohorts = count;
    // si tenía ciudad se conserva
    log(game, `${p.name} ocupa ${to.id}${prevOwner !== null ? " (arrebatada a " + game.players[prevOwner].name + ")" : ""} con ${count} cohorte(s).`);
    if (activeInfluence(p).produceConqueredImmediately) {
      addResources(game, p, { [to.resource]: 1 }, true);
      log(game, `Producción inmediata: +1 ${resName(to.resource)}.`);
    }
    afterCapture(game, p, to, prevOwner);
    return { ok: true };
  }

  function battleValue(game, p, cohorts, isAttacker, targetHasMore) {
    const eff = effectivePillars(p);
    let science = eff.ciencia;
    const inf = activeInfluence(p);
    if (inf.scienceDoubleBattle) science *= 2;
    let val = cohorts + eff.poder + science + d6();
    // combatMods de cartas de situación
    if (p.turnFlags.combatMod) val += p.turnFlags.combatMod;
    // GyG de combate
    if (inf.allBattle) val += inf.allBattle;
    if (isAttacker && inf.attack) val += inf.attack;
    if (!isAttacker && inf.defense) val += inf.defense;
    if (inf.battleVsLarger && targetHasMore) val += inf.battleVsLarger;
    return val;
  }

  function battle(game, p, from, to, count) {
    const defenderIdx = to.owner;
    const defender = defenderIdx !== null ? game.players[defenderIdx] : null;
    const defCohorts = to.cohorts + to.rebels;
    const attackerHasFewer = count < defCohorts;

    let atk = battleValue(game, p, count, true, attackerHasFewer);
    let def;
    if (defender) {
      const defenderHasFewer = defCohorts < count;
      def = battleValue(game, defender, defCohorts, false, defenderHasFewer);
    } else {
      // rebeldes: solo cohortes + dado
      def = defCohorts + d6();
    }
    // bonos de terreno
    if (to.capital) def += R.capitalDefBonus;
    else if (to.city) def += R.cityDefBonus;
    // milicias locales (provincia sin cohortes se defiende como 2) — ya cubierto por rebeldes/cohortes; aplica flag defensor
    if (defender && defender.turnFlags.provDefGhost && to.cohorts === 0) def += defender.turnFlags.provDefGhost;

    const diff = atk - def;
    const res = { atk, def, diff, attacker: p.idx, defender: defenderIdx, tile: to.id, attackerCohorts: count, defenderCohorts: defCohorts };

    if (diff <= 0) {
      // gana el defensor: atacante pierde según tabla desde su perspectiva
      const lossFrac = lossFraction(-diff);
      const lost = applyLossFraction(count, lossFrac);
      from.cohorts -= lost;
      res.outcome = "defensa";
      res.attackerLost = lost;
      log(game, `⚔️ Batalla en ${to.id}: ${p.name} (${atk}) vs ${defender ? defender.name : "rebeldes"} (${def}). Gana la DEFENSA. ${p.name} pierde ${lost} cohorte(s).`);
      return { ok: true, battle: res };
    }

    // gana el atacante
    const lossFrac = lossFraction(diff);
    const attackerLost = applyLossFraction(count, lossFrac);
    const survivors = count - attackerLost;
    res.outcome = "ataque";
    res.attackerLost = attackerLost;
    res.defenderLost = defCohorts;
    // defensor pierde todo
    if (defender) to.cohorts = 0;
    to.rebels = 0;

    // victoria en inferioridad numérica => +1 Poder, +1 Ciencia
    if (attackerHasFewer) addBasePillars(game, p, { poder: 1, ciencia: 1 }, "victoria en inferioridad");

    log(game, `⚔️ Batalla en ${to.id}: ${p.name} (${atk}) vs ${defender ? defender.name : "rebeldes"} (${def}). Gana el ATAQUE (dif ${diff}). ${p.name} pierde ${attackerLost}.`);

    from.cohorts -= count; // el ejército sale del origen
    if (to.city || to.capital) {
      // iniciar asedio con supervivientes
      if (survivors > 0) startSiege(game, p, to, survivors);
      else log(game, `${p.name} no tiene supervivientes para asediar.`);
    } else {
      // ocupar la provincia con supervivientes
      let cost = Object.assign({}, R.occupyCost);
      if (p.turnFlags.freeOccupy) cost = {};
      if (canPay(p, cost)) pay(p, cost);
      const prevOwner = to.owner;
      to.owner = p.idx; to.cohorts = survivors;
      log(game, `${p.name} toma ${to.id} con ${survivors} cohorte(s).`);
      if (activeInfluence(p).produceConqueredImmediately) addResources(game, p, { [to.resource]: 1 }, true);
      afterCapture(game, p, to, prevOwner);
    }
    return { ok: true, battle: res };
  }

  function lossFraction(diff) {
    if (diff <= 1) return 3 / 4;       // pírrica
    if (diff <= 4) return 1 / 2;       // menor
    if (diff <= 7) return 1 / 4;       // clara
    return 0;                          // masacre
  }
  function applyLossFraction(count, frac) {
    return Math.min(count, Math.round(count * frac));
  }

  /* ---------------- Asedios ---------------- */
  function startSiege(game, p, tile, cohorts) {
    const turns = tile.capital ? R.siegeCapitalTurns : R.siegeCityTurns;
    if (tile.siege && tile.siege.attacker === p.idx) {
      tile.siege.cohorts += cohorts;
      log(game, `${p.name} refuerza el asedio de ${tile.id} (${tile.siege.cohorts} cohortes).`);
    } else {
      tile.siege = { attacker: p.idx, cohorts, turnsLeft: turns };
      log(game, `🔥 ${p.name} inicia asedio de ${tile.id} (${turns} turno(s)).`);
    }
  }
  // al inicio del turno del asaltante, avanza el asedio
  function advanceSieges(game, p) {
    for (const t of game.board.tiles) {
      if (t.siege && t.siege.attacker === p.idx) {
        t.siege.turnsLeft--;
        if (t.siege.turnsLeft <= 0) captureSieged(game, t);
      }
    }
  }
  function resolveExpiredSieges(game) {
    for (const t of game.board.tiles) if (t.siege && t.siege.turnsLeft <= 0) captureSieged(game, t);
  }
  function captureSieged(game, t) {
    const p = game.players[t.siege.attacker];
    const prevOwner = t.owner;
    let cost = Object.assign({}, R.occupyCost);
    if (canPay(p, cost)) pay(p, cost);
    t.owner = p.idx;
    t.cohorts = t.siege.cohorts;
    const wasCapital = t.capital;
    t.siege = null;
    log(game, `${p.name} conquista ${t.id}${t.city ? " (con ciudad)" : ""}${wasCapital ? " ¡CAPITAL!" : ""}.`);
    if (wasCapital) t.capital = false; // deja de ser capital del anterior dueño
    afterCapture(game, p, t, prevOwner, wasCapital);
  }

  // efectos tras capturar una casilla
  function afterCapture(game, p, tile, prevOwner, wasCapital) {
    if (tile.city && !tile.capital) {
      addBasePillars(game, p, { poder: 1, cultura: 1 }, "conquistar ciudad");
      drawGyGFor(game, p);
    }
    if (wasCapital && prevOwner !== null) {
      const victim = game.players[prevOwner];
      const stillHasCapital = game.board.tiles.some(t => t.owner === prevOwner && t.capital);
      if (!stillHasCapital) {
        // eliminación
        addBasePillars(game, p, { poder: 3, ciencia: 3 }, "destruir a un jugador");
        eliminatePlayer(game, prevOwner);
        drawGyGFor(game, p);
      } else {
        addBasePillars(game, p, { poder: 2, cultura: 2 }, "conquistar capital");
        drawGyGFor(game, p);
      }
    }
    checkVictory(game);
  }

  function eliminatePlayer(game, idx) {
    const victim = game.players[idx];
    victim.eliminated = true; victim.alive = false;
    for (const t of game.board.tiles) {
      if (t.owner === idx) { t.owner = null; t.cohorts = 0; t.city = false; t.capital = false; t.wonder = null; }
    }
    log(game, `☠️ ${victim.name} ha sido ELIMINADO. Sus territorios quedan neutrales.`);
  }

  /* ---------------- Vasallaje ---------------- */
  function subjugate(game, lordIdx, vassalIdx) {
    const lord = game.players[lordIdx], vassal = game.players[vassalIdx];
    vassal.vassalOf = lordIdx;
    if (!lord.vassals.includes(vassalIdx)) lord.vassals.push(vassalIdx);
    // libertad -> 0, poder -> mitad (redondeo arriba) en permanentes (ajuste sobre base)
    const perm = permanentPillars(vassal);
    addBasePillars(game, vassal, { libertad: -perm.libertad }, "vasallaje (libertad a 0)");
    addBasePillars(game, vassal, { poder: -Math.floor(perm.poder / 2) }, "vasallaje (poder a la mitad)");
    addBasePillars(game, lord, { poder: 2, libertad: 2 }, "subyugar a un jugador");
    log(game, `${vassal.name} se convierte en VASALLO de ${lord.name}.`);
    checkVictory(game);
  }
  function liberate(game, vassalIdx) {
    const vassal = game.players[vassalIdx];
    const lordIdx = vassal.vassalOf;
    if (lordIdx === null) return;
    const lord = game.players[lordIdx];
    lord.vassals = lord.vassals.filter(v => v !== vassalIdx);
    vassal.vassalOf = null;
    addBasePillars(game, lord, { poder: -2 }, "fin del vasallaje");
    log(game, `${vassal.name} se libera del yugo de ${lord.name}.`);
  }

  /* ---------------- Comercio con el mercader ---------------- */
  function merchantTrade(game, p, giveRes, getRes, getAmount) {
    if (p.turnFlags.noTrade || game.globalFlags.noTradeAll) return { ok: false, msg: "No puedes comerciar ahora." };
    const perm = permanentPillars(p);
    const inf = activeInfluence(p);
    let ratio = R.merchantRatio;
    if (perm.cultura >= R.cultureFreeTradeLevel || inf.merchant1to1) ratio = 1;
    // getAmount unidades de getRes cuestan getAmount*ratio de giveRes
    const give = getAmount * ratio;
    if ((p.resources[giveRes] || 0) < give) return { ok: false, msg: `Necesitas ${give} ${resName(giveRes)}.` };
    p.resources[giveRes] -= give;
    addResources(game, p, { [getRes]: getAmount }, true);
    log(game, `${p.name} comercia con el mercader: -${give} ${resName(giveRes)} / +${getAmount} ${resName(getRes)} (${ratio}:1).`);
    return { ok: true };
  }

  /* ---------------- Flujo de turnos ---------------- */
  function beginRound(game) {
    // limpiar flags globales de ronda salvo persistentes
    game.globalFlags = {};
    doProduction(game);
    game.phase = "recruit";
    game.turnPointer = 0;
    log(game, `— Ronda ${game.round} —`);
  }

  function currentPlayer(game) {
    return game.players[game.order[game.turnPointer]];
  }

  // inicia el turno del jugador actual (avanza asedios, GyG, limpia flags de ronda)
  function beginTurn(game, p) {
    p.turnFlags = {};
    // reclutamiento gratis por turno (Cayo Mario)
    const inf = activeInfluence(p);
    if (inf.freeRecruitPerTurn) {
      // se aplicará al colocar; guardamos crédito
      p.turnFlags.freeRecruits = inf.freeRecruitPerTurn;
    }
    advanceSieges(game, p);
  }

  function endTurn(game) {
    const p = currentPlayer(game);
    expireGyGIfNeeded(game, p);
    p.turnFlags = {};
    game.pendingManual = null;
    game.turnPointer++;
    if (game.turnPointer >= game.order.length) {
      // fin de ronda: rotar mano salvo flag
      game.round++;
      if (!game.globalFlags.noRotation) {
        game.roundStartPointer = (game.roundStartPointer + 1) % game.numPlayers;
      }
      // reconstruir orden empezando por roundStartPointer, saltando eliminados
      const base = game.players.map(x => x.idx).filter(i => !game.players[i].eliminated);
      const start = game.roundStartPointer % base.length;
      game.order = base.slice(start).concat(base.slice(0, start));
      beginRound(game);
    } else {
      game.phase = "recruit";
    }
    checkVictory(game);
  }

  /* ---------------- Puntaje y victoria ---------------- */
  function computeScore(game, p) {
    if (p.eliminated) return 0;
    let s = 0;
    const tiles = game.board.tiles.filter(t => t.owner === p.idx);
    for (const t of tiles) {
      if (t.capital) s += 8;
      else if (t.city) s += 3;
      else s += 1;
      if (t.wonder && t.wonder.turnsLeft <= 0) s += 8;
    }
    const cohorts = tiles.reduce((a, t) => a + t.cohorts, 0);
    s += Math.floor(cohorts / 2);
    const perm = permanentPillars(p);
    s += PILLAR_KEYS.reduce((a, k) => a + perm[k], 0);
    for (const aid of p.pantheon) {
      const a = GG.ARCHETYPES.find(x => x.id === aid);
      if (a) s += a.points;
    }
    if (p.endedGame) s += 10;
    return s;
  }

  function checkVictory(game) {
    if (game.phase === "gameover") return;
    const alive = game.players.filter(p => !p.eliminated);
    const free = alive.filter(p => p.vassalOf === null);
    // maravilla completada
    for (const t of game.board.tiles) {
      if (t.wonder && t.wonder.turnsLeft <= 0 && !game.wondersBuilt[t.wonder.wonderId]) {
        game.wondersBuilt[t.wonder.wonderId] = t.wonder.playerIdx;
      }
    }
    if (alive.length <= 1) {
      finishGame(game, alive[0] ? alive[0].idx : null, "Conquista");
    } else if (free.length <= 1) {
      finishGame(game, free[0] ? free[0].idx : null, "Dominio");
    }
  }

  function finishGame(game, enderIdx, reason) {
    if (game.phase === "gameover") return;
    if (enderIdx !== null) game.players[enderIdx].endedGame = true;
    game.phase = "gameover";
    // ganador por puntaje
    let best = null, bestScore = -Infinity;
    for (const p of game.players) {
      if (p.eliminated) continue;
      const sc = computeScore(game, p);
      p.finalScore = sc;
      if (sc > bestScore) { bestScore = sc; best = p; }
    }
    game.winner = best ? best.idx : null;
    log(game, `🏁 Fin de la partida por ${reason}. Ganador por puntaje: ${best ? best.name : "—"} (${bestScore} pts).`);
  }

  // avance de maravillas: se descuenta al inicio del turno del dueño
  function advanceWonders(game, p) {
    for (const t of game.board.tiles) {
      if (t.wonder && t.wonder.playerIdx === p.idx && t.wonder.turnsLeft > 0) {
        t.wonder.turnsLeft--;
        if (t.wonder.turnsLeft <= 0) {
          const w = GG.WONDERS.find(x => x.id === t.wonder.wonderId);
          game.wondersBuilt[t.wonder.wonderId] = p.idx;
          log(game, `🏆 ${p.name} COMPLETA la maravilla «${w.name}» en ${t.id}.`);
          checkVictory(game);
        }
      }
    }
  }

  /* ---------------- Log ---------------- */
  function log(game, msg) {
    game.log.push({ round: game.round, text: msg });
    if (game.log.length > 400) game.log.shift();
  }

  return {
    newGame, setupAuto,
    permanentPillars, effectivePillars, activeInfluence, storageCap,
    doProduction, beginRound, beginTurn, endTurn, currentPlayer,
    recruit, recruitFree, recruitCost,
    drawSituation, applySituation,
    drawGyGFor, expireGyGIfNeeded,
    buildCity, cityCost, upgradePillarByPayment, reformGovernment,
    startWonder, wonderFor,
    moveOrAttack, maxMove, adjacent,
    subjugate, liberate, merchantTrade,
    advanceWonders, advanceSieges,
    computeScore, checkVictory, finishGame,
    clamp, resName, fmtPillars,
  };
})();
