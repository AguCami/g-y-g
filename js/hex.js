/* ============================================================
   Genios y Gigantes — Tablero hexagonal (geometría + render SVG)
   Flat-top hexes en coordenadas axiales (q, r).
   ============================================================ */
window.GG = window.GG || {};

GG.Hex = (function () {
  const SIZE = 46;              // radio del hexágono en px
  const SQRT3 = Math.sqrt(3);

  const DIRS = [
    [ 1,  0], [ 1, -1], [ 0, -1],
    [-1,  0], [-1,  1], [ 0,  1],
  ];

  function axialToPixel(q, r) {
    const x = SIZE * 1.5 * q;
    const y = SIZE * SQRT3 * (r + q / 2);
    return { x, y };
  }

  function hexCorners(cx, cy) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 180) * (60 * i);
      pts.push([cx + SIZE * Math.cos(ang), cy + SIZE * Math.sin(ang)]);
    }
    return pts;
  }

  /* Genera la isla: hexágono de radio `radius`. */
  function generateBoard(radius, numCapitals, rng) {
    rng = rng || Math.random;
    const tiles = [];
    const index = {};
    for (let q = -radius; q <= radius; q++) {
      for (let r = -radius; r <= radius; r++) {
        if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > radius) continue;
        const { x, y } = axialToPixel(q, r);
        const id = q + "," + r;
        const t = {
          id, q, r, x, y,
          resource: null,
          isCapitalSlot: false,
          owner: null,      // índice de jugador o null
          capital: false,   // es capital de su dueño
          city: false,
          cohorts: 0,       // cohortes del dueño
          rebels: 0,        // cohortes rebeldes (neutrales hostiles)
          wonder: null,     // {playerIdx, wonderId, turnsLeft}
          siege: null,      // {attacker, cohorts, turnsLeft}
          cityBonusRes: null, // recurso extra por El Arquitecto
        };
        tiles.push(t);
        index[id] = t;
      }
    }

    // adyacencias
    const adjacency = {};
    for (const t of tiles) {
      adjacency[t.id] = [];
      for (const [dq, dr] of DIRS) {
        const nid = (t.q + dq) + "," + (t.r + dr);
        if (index[nid]) adjacency[t.id].push(nid);
      }
    }

    // elegir slots de capital: repartidos en el borde interior
    const maxR = SIZE * 1.5 * radius;
    const targets = [];
    const n = numCapitals;
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI / 180) * (45 + i * (360 / n));
      targets.push({ x: Math.cos(ang) * maxR * 0.72, y: Math.sin(ang) * maxR * 0.72 });
    }
    const usedCap = new Set();
    for (const tg of targets) {
      let best = null, bestD = Infinity;
      for (const t of tiles) {
        if (usedCap.has(t.id)) continue;
        const d = (t.x - tg.x) ** 2 + (t.y - tg.y) ** 2;
        if (d < bestD) { bestD = d; best = t; }
      }
      if (best) { best.isCapitalSlot = true; usedCap.add(best.id); }
    }

    // asignar recursos (distribución balanceada y barajada)
    const pool = [];
    const weights = { oro: 0.28, alimentos: 0.30, piedra: 0.21, armas: 0.21 };
    for (const t of tiles) {
      const rr = rng();
      let acc = 0, chosen = "alimentos";
      for (const k of ["oro", "alimentos", "piedra", "armas"]) {
        acc += weights[k];
        if (rr <= acc) { chosen = k; break; }
      }
      t.resource = chosen;
      pool.push(t);
    }

    // bounding box para el viewBox
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of tiles) {
      minX = Math.min(minX, t.x - SIZE);
      minY = Math.min(minY, t.y - SIZE);
      maxX = Math.max(maxX, t.x + SIZE);
      maxY = Math.max(maxY, t.y + SIZE);
    }
    const pad = 24;
    const viewBox = `${minX - pad} ${minY - pad} ${(maxX - minX) + pad * 2} ${(maxY - minY) + pad * 2}`;

    return { tiles, index, adjacency, viewBox, radius };
  }

  function distance(board, aId, bId) {
    // BFS por adyacencia
    if (aId === bId) return 0;
    const seen = { [aId]: 0 };
    let frontier = [aId];
    let d = 0;
    while (frontier.length) {
      d++;
      const next = [];
      for (const id of frontier) {
        for (const nb of board.adjacency[id]) {
          if (!(nb in seen)) { seen[nb] = d; if (nb === bId) return d; next.push(nb); }
        }
      }
      frontier = next;
    }
    return Infinity;
  }

  const NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* Renderiza el tablero en el <svg>. handlers.onTileClick(tile) */
  function render(svg, board, game, opts) {
    opts = opts || {};
    svg.setAttribute("viewBox", board.viewBox);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // fondo mar
    const bg = el("rect", { x: -5000, y: -5000, width: 10000, height: 10000, fill: "#2f6f95" });
    svg.appendChild(bg);

    const highlight = opts.highlight || {};   // id -> color de borde

    for (const t of board.tiles) {
      const g = el("g", { class: "tile", "data-id": t.id, style: "cursor:pointer" });
      const corners = hexCorners(t.x, t.y);
      const pointsStr = corners.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");

      let fill = "#6f9e4a";                 // provincia neutral (pasto)
      if (t.owner !== null && game && game.players[t.owner]) {
        fill = shade(game.players[t.owner].colorHex, t.capital ? -10 : (t.city ? 5 : 22));
      } else if (t.isCapitalSlot && (!game || game.phase === "setup")) {
        fill = "#c8b070";
      }

      let stroke = "#20321a", sw = 2;
      if (highlight[t.id]) { stroke = highlight[t.id]; sw = 5; }

      const poly = el("polygon", { points: pointsStr, fill, stroke, "stroke-width": sw, "stroke-linejoin": "round" });
      g.appendChild(poly);

      // icono de recurso
      const emoji = resEmoji(t.resource);
      const ico = el("text", { x: t.x, y: t.y - 8, "text-anchor": "middle", "font-size": 20, "dominant-baseline": "middle" });
      ico.textContent = emoji;
      g.appendChild(ico);

      // marcador de capital / ciudad / slot
      if (t.capital) {
        const c = el("text", { x: t.x, y: t.y + 16, "text-anchor": "middle", "font-size": 18 });
        c.textContent = "👑";
        g.appendChild(c);
      } else if (t.city) {
        const c = el("text", { x: t.x, y: t.y + 16, "text-anchor": "middle", "font-size": 16 });
        c.textContent = "🏛️";
        g.appendChild(c);
      } else if (t.isCapitalSlot && (!game || game.phase === "setup")) {
        const c = el("text", { x: t.x, y: t.y + 16, "text-anchor": "middle", "font-size": 14, fill: "#7a5c1a" });
        c.textContent = "★";
        g.appendChild(c);
      }

      // maravilla
      if (t.wonder) {
        const w = el("text", { x: t.x + 15, y: t.y - 15, "text-anchor": "middle", "font-size": 14 });
        w.textContent = "🏆";
        g.appendChild(w);
      }

      // asedio
      if (t.siege) {
        const s = el("text", { x: t.x - 15, y: t.y - 15, "text-anchor": "middle", "font-size": 14 });
        s.textContent = "🔥";
        g.appendChild(s);
      }

      // cohortes (badge)
      if (t.cohorts > 0) {
        const bx = t.x + 14, by = t.y + 12;
        const col = game && game.players[t.owner] ? game.players[t.owner].colorHex : "#333";
        g.appendChild(el("circle", { cx: bx, cy: by, r: 11, fill: col, stroke: "#fff", "stroke-width": 2 }));
        const num = el("text", { x: bx, y: by + 1, "text-anchor": "middle", "dominant-baseline": "middle", "font-size": 12, fill: "#fff", "font-weight": "bold" });
        num.textContent = t.cohorts;
        g.appendChild(num);
      }
      // rebeldes
      if (t.rebels > 0) {
        const bx = t.x - 14, by = t.y + 12;
        g.appendChild(el("circle", { cx: bx, cy: by, r: 11, fill: "#111", stroke: "#e0392b", "stroke-width": 2 }));
        const num = el("text", { x: bx, y: by + 1, "text-anchor": "middle", "dominant-baseline": "middle", "font-size": 12, fill: "#e0392b", "font-weight": "bold" });
        num.textContent = t.rebels;
        g.appendChild(num);
      }

      if (opts.onTileClick) {
        g.addEventListener("click", () => opts.onTileClick(t));
      }
      svg.appendChild(g);
    }
  }

  function resEmoji(res) {
    const map = { oro: "🪙", alimentos: "🍖", piedra: "🪨", armas: "⚔️" };
    return map[res] || "";
  }

  // aclara/oscurece un color hex
  function shade(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16);
    let r = (num >> 16) + Math.round(2.55 * percent);
    let g = ((num >> 8) & 0xff) + Math.round(2.55 * percent);
    let b = (num & 0xff) + Math.round(2.55 * percent);
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  return { generateBoard, render, distance, resEmoji, SIZE };
})();
