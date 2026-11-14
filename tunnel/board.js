/* The whiteboard (tunnel/board.html#snip/1, #redis/4, …): system design units, each in two modes. Whiteboard: scope
   it, size it, sketch it and have the sketch graded. Simulate: the design runs (tunnel/net.js, tunnel/kv.js).
   The board is an SVG on a 960 × 540 sheet. Parts are hand-drawn boxes; wires are arrows; a run of tunnel/net.js
   paints each part by how busy it was and sends dots along each wire at its real rate.
   Gestures: drag a part to move it · drag from a part's + to another part to wire them (or tap +, then the part) ·
   tap a wire to cut it · tap a part to change its size · tap or drag a part in from the tray.
   Kinds with their own page (scope, and the Redis labs) live in tunnel/board-kinds.js as SD.UI[kind]: the board
   hands them its SVG layer, the brief and the tools, and they hand back what to draw.
   Progress lives in vnl-code-v1: done[question id], and sd: {id: {stars, design}}. */
(function () {
  "use strict";
  const N = window.NET, SDX = window.SD, BOARDS = SDX.BOARDS, UNITS = SDX.UNITS, PARTS = SDX.PARTS, K = N.KINDS;
  const UI = SDX.UI || {};
  const ICON = Object.fromEntries(Object.entries(PARTS).map(([k, v]) => [k, v.icon]));
  const nameOf = (kind) => (PARTS[kind] || K[kind]).name;
  const labelOf = (nd) => nd.label || nameOf(nd.kind);
  const theOf = (nd) => nd.label || "the " + nameOf(nd.kind);
  const $ = (q, r = document) => r.querySelector(q);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const NS = "http://www.w3.org/2000/svg";
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "html") el.innerHTML = v;
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const num = (n) => Math.round(n).toLocaleString("en-US");
  const tm = (x) => (x >= 2 ? "over 2 s" : x >= 1 ? x.toFixed(1) + " s" : Math.round(x * 1000) + " ms");
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches, TOUCH = matchMedia("(hover: none)").matches;

  // ------------------------------------------------------------ progress --
  const KEY = "vnl-code-v1";
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } };
  let S = Object.assign({ done: {} }, load());
  S.sd = S.sd || {};
  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const now = Object.assign({ done: {} }, load());
      now.done = Object.assign(now.done || {}, S.done);
      now.sd = Object.assign(now.sd || {}, S.sd);
      const day = new Date().toISOString().slice(0, 10);
      now.days = [...new Set([...(now.days || []), ...(S.days || []), day])];
      S = now;
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ }
    }, 150);
  }
  const mine = (id) => (S.sd[id] = S.sd[id] || {});
  const starsOf = (id) => (S.sd[id] || {}).stars || 0;

  // --------------------------------------------------------------- sheet --
  const W = 960, H = 540, PW = 160, PH = 66;
  const KIND_WORD = { scope: "Scope it", napkin: "Napkin math", sketch: "Sketch it", follow: "Follow it", bottleneck: "Find the bottleneck", draw: "Draw it", evict: "Eviction lab", persist: "Crash lab", shard: "Cluster lab", conns: "Capacity lab", offline: "Delivery lab", order: "Ordering lab", nearby: "Geo lab", batch: "Matching lab", dispatch: "Race lab" };
  const KIND_GLYPH = { scope: "▤", napkin: "✎", sketch: "✐", follow: "⤳", bottleneck: "◔", draw: "▭", evict: "⇄", persist: "⏻", shard: "◫", conns: "⌁", offline: "✉", order: "⇅", nearby: "⌖", batch: "⋈", dispatch: "⇆" };
  const MODE_WORD = { w: "Whiteboard", s: "Simulate" };
  const SIZES = { cache: Object.keys(K.cache.sizes), db: Object.keys(K.db.sizes) };

  // --------------------------------------------------------------- state --
  const main = $("#sd");
  let U = null, L = [], qi = 0, B = null, D = null;   // the unit, its questions (whiteboard then simulate), the question, the design on the board
  let ctx = null; // a kind with its own page: the handle it draws through
  let sel = null, selW = -1, res = null, runs = 0, solvedNow = false, problems = [], busy = false;
  let F = {}; // per kind: follow {round, got, tries}; napkin {vals, marks, tries}; bottleneck {guess, steps, at, playing}
  let flows = {}, heat = {}, waits = {}, label = {}; // what the board shows from the latest run
  let wiring = null; // {from, x, y, tap}

  const els = {};
  function shell() {
    main.textContent = "";
    els.strip = h("nav", { class: "sd-strip", "aria-label": "Whiteboard questions" });
    els.brief = h("section", { class: "sd-brief" });
    els.tools = h("section", { class: "sd-tools", "aria-label": "Tools" });
    els.svg = s("svg", { class: "sd-board", viewBox: `0 0 ${W} ${H}`, role: "application", "aria-label": "The whiteboard" });
    els.svg.append(s("defs", { html: `
      <filter id="sd-sk" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="2.6"/></filter>
      <marker id="sd-ar" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1.5 9 5 1 8.5" fill="none" stroke="context-stroke" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker>` }));
    els.gw = s("g", { class: "sd-wires" });
    els.gp = s("g", { class: "sd-parts" });
    els.gd = s("g", { class: "sd-dots", "aria-hidden": "true" });
    els.go = s("g", { class: "sd-over" });
    els.gx = s("g", { class: "sd-x" });
    els.svg.append(els.gw, els.gd, els.gp, els.go, els.gx);
    els.mode = h("div", { class: "sd-modechip", "aria-hidden": "true" });
    els.score = h("div", { class: "sd-score", "aria-live": "polite" });
    els.stage = h("div", { class: "sd-stage" }, els.svg, els.score, els.mode);
    main.append(els.strip, h("div", { class: "sd-grid" }, els.brief, els.stage, els.tools));
    main.removeAttribute("aria-busy");
    els.svg.addEventListener("pointerdown", down);
    els.svg.addEventListener("pointermove", move);
    els.svg.addEventListener("pointerup", up);
    els.svg.addEventListener("pointercancel", () => { drag = null; wiring = null; drawOver(); });
    document.addEventListener("keydown", (e) => {
      if (!editable() || /input|textarea/i.test(e.target.tagName)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && sel && !PARTS[part(sel).kind].fixed) { removePart(sel); e.preventDefault(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selW >= 0) { cutWire(selW); e.preventDefault(); }
      if (e.key === "Escape") { sel = null; selW = -1; wiring = null; drawAll(); }
    });
  }

  function open(unit, i) {
    U = unit;
    L = [...U.w, ...U.s];
    qi = Math.max(0, Math.min(L.length - 1, i));
    B = L[qi];
    const m = mine(B.id);
    D = clone(m.design && editable() ? m.design : B.design || { nodes: [], wires: [] });
    sel = null; selW = -1; res = null; runs = 0; solvedNow = false; problems = []; flows = {}; heat = {}; waits = {}; label = {}; wiring = null;
    F = B.kind === "follow" ? { round: 0, got: [], tries: 0 } : B.kind === "napkin" ? { vals: {}, marks: {}, tries: 0 } : B.kind === "bottleneck" ? { guess: null, steps: null, at: 0 } : B.kind === "sketch" ? { tries: 0, hints: 0, G: null } : {};
    ctx = UI[B.kind] ? makeCtx() : null;
    els.gx.replaceChildren();
    if (ctx) UI[B.kind].init(ctx);
    els.stage.className = "sd-stage m-" + B.mode + (ctx ? " own k-" + B.kind : "");
    els.mode.textContent = B.mode === "s" ? "Simulation · it runs" : "Whiteboard · draw and explain";
    document.title = `${B.title} · ${U.name} · Whiteboard · Tulip Labs`;
    drawStrip();
    drawAll();
    drawBrief();
    if (B.kind === "bottleneck") calm();
  }
  // what a kind with its own page gets to work with
  function makeCtx() {
    const c = {
      B, F, h, s, num, tm, REDUCED, TOUCH, svg: els.svg, layer: els.gx, score: els.score, stage: els.stage,
      pt: (e) => pt(e), flash: (t) => flash(t), solved: (n) => solved(n), stars: (n) => stars(n),
      redraw: () => drawAll(), rebrief: () => drawBrief(), done: () => !!S.done[B.id], isNow: () => ctx === c,
    };
    return c;
  }
  const part = (id) => D.nodes.find((n) => n.id === id);
  const editable = () => B.kind === "draw" || B.kind === "sketch";
  const loc = (b) => `#${b.unit}/${(b.mode === "s" ? UNITS.find((u) => u.id === b.unit).w.length : 0) + b.n}`;

  // ---------------------------------------------------------------- strip --
  function drawStrip() {
    const group = (m) => {
      const qs = U[m], first = qs.find((b) => !S.done[b.id]) || qs[0];
      return h("div", { class: "sd-mg" + (B.mode === m ? " on" : "") },
        h("a", { class: "sd-mode", href: loc(first), "aria-current": B.mode === m ? "true" : null }, m === "s" ? h("i", { class: "sd-lamp" }) : null, MODE_WORD[m]),
        h("ol", {}, qs.map((b) => h("li", { class: (b === B ? "on " : "") + (S.done[b.id] ? "done" : "") },
          h("a", { href: loc(b), title: `${b.n}. ${b.title} · ${KIND_WORD[b.kind]}`, "aria-current": b === B ? "step" : null },
            h("i", {}, KIND_GLYPH[b.kind]), h("span", {}, b.n), stars(starsOf(b.id)))))));
    };
    els.strip.replaceChildren(
      h("a", { class: "sd-back", href: "./#ladder" }, "← Wind Tunnel"),
      h("span", { class: "sd-sh" }, h("b", {}, U.name), ` · ${U.sub}`),
      h("div", { class: "sd-modes" }, group("w"), group("s")));
  }
  function stars(n) { return h("span", { class: "sd-stars", "aria-label": `${n} of 3 stars` }, [1, 2, 3].map((k) => h("i", { class: k <= n ? "on" : "" }))); }

  // ---------------------------------------------------------------- board --
  function drawAll() {
    if (ctx) { els.gw.replaceChildren(); els.gp.replaceChildren(); els.go.replaceChildren(); els.gd.replaceChildren(); UI[B.kind].draw(ctx); drawScore(); return; }
    drawWires(); drawParts(); drawOver(); drawScore();
  }
  function sub(nd) {
    if (!K[nd.kind] || B.kind === "sketch") return PARTS[nd.kind].tag || PARTS[nd.kind].say;
    if (nd.kind === "users") { const r = B.rate || (F.steps && F.steps[F.at] ? F.steps[F.at].rate : B.ramp ? B.ramp[0] : 0); return r ? `${num(r)} clicks/s` : "clicking links"; }
    if (label[nd.id]) return label[nd.id];
    const k = K[nd.kind];
    if (nd.kind === "db") return `${nd.size || "small"} · ${N.workersOf(nd)} workers`;
    if (nd.kind === "cache") return `${nd.size || k.size} · ${Math.round(N.hitRate(nd, B.q) * 100)}% hits`;
    if (nd.kind === "worker") return `×${nd.n || 1} · ${nd.batch || 1} at once`;
    if (k.many) return `×${nd.n || 1} · ${N.workersOf(nd)} workers`;
    return "";
  }
  function drawParts() {
    els.gp.replaceChildren(...D.nodes.map((nd) => {
      const u = heat[nd.id], hot = u == null ? "" : u < 0.6 ? " h0" : u < 0.85 ? " h1" : u < 0.97 ? " h2" : " h3";
      const follow = B.kind === "follow" ? F.got.indexOf(nd.id) : -1;
      const g = s("g", {
        class: `sd-part k-${nd.kind}${sel === nd.id ? " sel" : ""}${hot}${problems.some((p) => p.node === nd.id) ? " bad" : ""}${B.kind === "bottleneck" && F.guess === nd.id ? " guess" : ""}${follow >= 0 ? " on" : ""}`,
        transform: `translate(${nd.x - PW / 2} ${nd.y - PH / 2})`, "data-id": nd.id, tabindex: 0, role: "button",
        "aria-label": `${labelOf(nd)}${sub(nd) ? ", " + sub(nd) : ""}${u != null ? `, ${Math.round(u * 100)}% busy` : ""}`,
        onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tap(nd.id); } },
      });
      g.append(
        s("rect", { class: "sd-fill", width: PW, height: PH, rx: 13 }),
        s("rect", { class: "sd-ink", x: 1, y: 1, width: PW - 2, height: PH - 2, rx: 13, filter: "url(#sd-sk)" }),
        s("g", { class: "sd-ic", transform: "translate(13 20)", html: ICON[nd.kind] }),
        s("text", { class: "sd-name", x: 48, y: 29 }, labelOf(nd)),
        s("text", { class: "sd-sub", x: 48, y: 47 }, sub(nd)));
      if (u != null && nd.kind !== "users") g.append(s("rect", { class: "sd-meter-bg", x: 12, y: PH - 9, width: PW - 24, height: 3, rx: 1.5 }), s("rect", { class: "sd-meter", x: 12, y: PH - 9, width: Math.max(2, (PW - 24) * Math.min(1, u)), height: 3, rx: 1.5 }));
      if (follow >= 0) g.append(s("circle", { class: "sd-badge", cx: PW - 6, cy: 6, r: 11 }), s("text", { class: "sd-badge-t", x: PW - 6, y: 10.5, "text-anchor": "middle" }, follow + 1));
      // a queue that built up: a little tower of waiting requests on top of the part
      const w = waits[nd.id] || 0;
      if (w > 2) {
        const n = Math.min(7, Math.ceil(Math.log2(w)));
        for (let k = 0; k < n; k++) g.append(s("rect", { class: "sd-tower", x: PW - 34 - (k % 2) * 3, y: -9 - k * 8, width: 22, height: 6, rx: 1.5 }));
        g.append(s("text", { class: "sd-tw-t", x: PW - 40, y: -12, "text-anchor": "end" }, `${w > 999 ? num(w / 1000) + "k" : num(w)} waiting`));
      }
      if (editable()) g.append(s("g", { class: "sd-nib", transform: `translate(${PW} ${PH / 2})`, "data-nib": nd.id }, s("circle", { r: 10 }), s("path", { d: "M-4 0h8M0-4v8" })));
      return g;
    }));
  }
  // where a wire leaves one part and enters another: the facing sides, curved like a marker stroke
  function geom(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, horiz = Math.abs(dx) > Math.abs(dy) * 1.25;
    let p1, p2, c1, c2;
    if (horiz) {
      const sx = Math.sign(dx) || 1;
      p1 = [a.x + sx * PW / 2, a.y]; p2 = [b.x - sx * (PW / 2 + 3), b.y];
      const k = Math.max(30, Math.abs(p2[0] - p1[0]) * 0.45);
      c1 = [p1[0] + sx * k, p1[1]]; c2 = [p2[0] - sx * k, p2[1]];
    } else {
      const sy = Math.sign(dy) || 1;
      p1 = [a.x, a.y + sy * PH / 2]; p2 = [b.x, b.y - sy * (PH / 2 + 3)];
      const k = Math.max(26, Math.abs(p2[1] - p1[1]) * 0.45);
      c1 = [p1[0], p1[1] + sy * k]; c2 = [p2[0], p2[1] - sy * k];
    }
    return `M${p1[0].toFixed(1)} ${p1[1].toFixed(1)} C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const wirePaths = new Map();
  function drawWires() {
    wirePaths.clear();
    els.gw.replaceChildren(...D.wires.map(([a, b], i) => {
      const A = part(a), Bn = part(b);
      if (!A || !Bn) return null;
      const d = geom(A, Bn), f = flows[a + ">" + b] || 0;
      const good = B.kind === "sketch" && F.G && F.G.items.some((it) => it.ok && it.link.some(([x, y]) => (x === A.kind && y === Bn.kind) || (x === Bn.kind && y === A.kind)));
      const p = s("path", { class: "sd-wire" + (selW === i ? " sel" : "") + (f ? " live" : "") + (good ? " good" : ""), d, "marker-end": "url(#sd-ar)" });
      wirePaths.set(a + ">" + b, p);
      const g = s("g", { "data-wire": i, "data-k": a + ">" + b }, s("path", { class: "sd-hit", d }), p);
      if (f >= 1 && !REDUCED) { const mid = p; requestAnimationFrame(() => { try { const L = mid.getTotalLength(), pt = mid.getPointAtLength(L / 2); if (L >= 110) g.append(s("text", { class: "sd-flow", x: pt.x, y: pt.y - 8, "text-anchor": "middle" }, `${num(f)}/s`)); } catch (e) { /* not laid out */ } }); }
      return g;
    }).filter(Boolean));
  }
  // overlays: the wire being drawn, the cut button, problems pinned to their parts, napkin notes
  function drawOver() {
    const kids = [];
    if (wiring && wiring.x != null) {
      const a = part(wiring.from);
      kids.push(s("path", { class: "sd-wire temp", d: `M${a.x + PW / 2} ${a.y} Q${(a.x + PW / 2 + wiring.x) / 2} ${a.y} ${wiring.x} ${wiring.y}` }));
    }
    if (wiring && wiring.tap) { const a = part(wiring.from); kids.push(s("text", { class: "sd-tip", x: a.x, y: a.y - PH / 2 - 12, "text-anchor": "middle" }, "now tap the part to wire it to")); }
    if (selW >= 0 && D.wires[selW]) {
      const [a, b] = D.wires[selW], p = wirePaths.get(a + ">" + b);
      if (p) { try { const L = p.getTotalLength(), pt = p.getPointAtLength(L / 2); kids.push(s("g", { class: "sd-cut", transform: `translate(${pt.x} ${pt.y})`, "data-cut": selW, role: "button", "aria-label": "Cut this wire" }, s("circle", { r: 13 }), s("path", { d: "M-4.5-4.5l9 9M4.5-4.5l-9 9" }))); } catch (e) { /* hidden */ } }
    }
    // two lines fit on the board; the whole sentence is in the list beside it
    const short = (t) => (t.length <= 84 ? t : t.slice(0, t.lastIndexOf(" ", 80)).replace(/[,.:;]$/, "") + "…");
    problems.forEach((p, k) => {
      const nd = p.node && part(p.node);
      const x = nd ? Math.min(W - 130, Math.max(130, nd.x)) : W / 2, y = nd ? (nd.y > H / 2 ? nd.y - PH / 2 - 54 : nd.y + PH / 2 + 12) : 40 + k * 50;
      kids.push(s("foreignObject", { x: x - 125, y, width: 250, height: 46, class: "sd-prob-fo" }, h("div", { class: "sd-prob", xmlns: "http://www.w3.org/1999/xhtml" }, short(p.text))));
    });
    if (B.kind === "napkin") for (const n of B.notes) {
      const nd = part(n.on), x = nd.x + n.dx - 85, y = nd.y + n.dy;
      const mark = F.marks[n.id];
      const inp = h("input", { type: "text", inputmode: "decimal", value: F.vals[n.id] || "", "aria-label": n.label, placeholder: "?", oninput: (e) => { F.vals[n.id] = e.target.value; delete F.marks[n.id]; e.target.closest(".sd-note").className = "sd-note"; } , onkeydown: (e) => { if (e.key === "Enter") checkNapkin(); } });
      kids.push(s("line", { class: "sd-string", x1: x + 85, y1: n.dy < 0 ? y + 80 : y, x2: nd.x, y2: n.dy < 0 ? nd.y - PH / 2 : nd.y + PH / 2 }));
      kids.push(s("foreignObject", { x, y, width: 170, height: 100 }, h("div", { class: "sd-note" + (mark ? " " + mark.cls : ""), xmlns: "http://www.w3.org/1999/xhtml" },
        h("label", {}, n.label), h("span", { class: "sd-nin" }, inp, h("small", {}, n.unit)), mark ? h("em", {}, mark.say) : null)));
    }
    els.go.replaceChildren(...kids);
  }

  // ---------------------------------------------------------------- score --
  // the board's corner: for a design, each goal with what the last run measured (the bill is always live)
  function drawScore() {
    const rows = [];
    if (B.kind === "draw") {
      const cost = N.costOf(D);
      for (const [k, op, v, say] of B.goals) {
        const x = k === "cost" ? cost : res ? res[k] : null;
        const pass = x == null ? null : op === "<" ? x < v : op === "<=" ? x <= v : x > v;
        const shown = x == null ? "run it" : k === "cost" ? `$${num(x)}` : k === "errors" ? `${(x * 100).toFixed(x > 0 && x < 0.01 ? 2 : 0)}%` : k === "lag" ? (x < 0.05 ? "on time" : tm(x).replace("ms", "ms late").replace(/ s$/, " s late")) : tm(x);
        rows.push(h("li", { class: pass == null ? "" : pass ? "ok" : "no" }, h("i", {}, pass == null ? "·" : pass ? "✓" : "✗"), h("span", {}, say), h("b", {}, shown)));
      }
    } else if (B.kind === "bottleneck" && F.steps && F.steps[F.at]) {
      const st = F.steps[F.at];
      rows.push(h("li", {}, h("i", {}, "▸"), h("span", {}, "traffic"), h("b", {}, `${num(st.rate)}/s`)));
      rows.push(h("li", { class: st.r.p99 < 0.3 ? "ok" : "no" }, h("i", {}, st.r.p99 < 0.3 ? "✓" : "✗"), h("span", {}, "p99"), h("b", {}, tm(st.r.p99))));
    } else if (ctx && UI[B.kind].score) {
      for (const [say, pass, shown] of UI[B.kind].score(ctx)) rows.push(h("li", { class: pass == null ? "" : pass ? "ok" : "no" }, h("i", {}, pass == null ? "·" : pass ? "✓" : "✗"), h("span", {}, say), h("b", {}, shown)));
    } else { els.score.hidden = true; return; }
    els.score.hidden = false;
    els.score.replaceChildren(h("ul", {}, rows));
  }

  // ----------------------------------------------------------------- dots --
  // each wire carries dots at a rate that grows with its real rate (log, so 20/s and 2,000/s both read)
  const dots = [];
  let acc = {}, lastT = 0;
  function frame(t) {
    const dt = Math.min(0.1, (t - lastT) / 1000 || 0);
    lastT = t;
    if (ctx && UI[B.kind].frame && !document.hidden) UI[B.kind].frame(ctx, dt, t);
    if (!REDUCED && !document.hidden && !ctx) {
      for (const [k, f] of Object.entries(flows)) {
        let p = wirePaths.get(k), rev = false;
        if (!p) { p = wirePaths.get(k.split(">").reverse().join(">")); rev = true; }
        if (!p || f <= 0) continue;
        const v = Math.min(14, 0.8 + 2.4 * Math.log10(1 + f));
        acc[k] = (acc[k] || Math.random()) + v * dt;
        while (acc[k] >= 1) { acc[k] -= 1; dots.push({ k, p, rev, t: 0, kind: part(k.split(">")[0])?.kind }); }
      }
      for (let i = dots.length - 1; i >= 0; i--) { dots[i].t += dt / 0.9; if (dots[i].t >= 1 || !dots[i].p.isConnected) dots.splice(i, 1); }
      if (dots.length > 400) dots.splice(0, dots.length - 400);
      const cs = els.gd.children;
      while (cs.length < dots.length) els.gd.append(s("circle", { r: 3.2 }));
      for (let i = 0; i < cs.length; i++) {
        const d = dots[i];
        if (!d) { cs[i].setAttribute("r", 0); continue; }
        try {
          const L = d.p.getTotalLength(), pt = d.p.getPointAtLength(L * (d.rev ? 1 - d.t : d.t));
          cs[i].setAttribute("cx", pt.x.toFixed(1)); cs[i].setAttribute("cy", pt.y.toFixed(1));
          cs[i].setAttribute("r", d.kind === "worker" ? 5 : d.kind === "queue" ? 2.6 : 3.2);
          cs[i].setAttribute("class", d.kind === "queue" || d.kind === "worker" ? "job" : "");
        } catch (e) { cs[i].setAttribute("r", 0); }
      }
    }
    requestAnimationFrame(frame);
  }
  function show(r) {
    res = r;
    flows = r ? r.flow : {};
    heat = r ? r.util : {};
    waits = r ? r.queue : {};
    acc = {};
  }

  // ------------------------------------------------------------- gestures --
  let drag = null;
  const pt = (e) => { const p = els.svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const m = els.svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; };
  function down(e) {
    if (ctx) return;
    const t = e.target;
    const cut = t.closest("[data-cut]");
    if (cut) { cutWire(+cut.dataset.cut); return; }
    const nib = t.closest("[data-nib]");
    if (nib && editable()) { const p = pt(e); wiring = { from: nib.dataset.nib, x: p.x, y: p.y, sx: e.clientX, sy: e.clientY }; els.svg.setPointerCapture(e.pointerId); drawOver(); return; }
    const g = t.closest(".sd-part");
    if (g) { const p = pt(e), nd = part(g.dataset.id); drag = { id: nd.id, ox: p.x - nd.x, oy: p.y - nd.y, sx: e.clientX, sy: e.clientY, moved: false }; els.svg.setPointerCapture(e.pointerId); return; }
    const w = t.closest("[data-wire]");
    if (w && editable()) { selW = +w.dataset.wire; sel = null; drawAll(); drawBrief(); return; }
    if (wiring) { wiring = null; drawOver(); }
    if (sel || selW >= 0) { sel = null; selW = -1; drawAll(); drawBrief(); }
  }
  function move(e) {
    if (ctx) return;
    if (wiring && !wiring.tap) { const p = pt(e); wiring.x = p.x; wiring.y = p.y; drawOver(); return; }
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
    if (!editable() && B.kind !== "napkin") return;
    drag.moved = true;
    const p = pt(e), nd = part(drag.id);
    nd.x = Math.round(Math.max(PW / 2 + 4, Math.min(W - PW / 2 - 4, p.x - drag.ox)));
    nd.y = Math.round(Math.max(PH / 2 + 22, Math.min(H - PH / 2 - 4, p.y - drag.oy)));
    drawWires(); drawParts(); drawOver();
  }
  function up(e) {
    if (ctx) return;
    if (wiring && !wiring.tap) {
      const moved = Math.hypot(e.clientX - wiring.sx, e.clientY - wiring.sy) > 6;
      const over = document.elementFromPoint(e.clientX, e.clientY);
      const g = over && over.closest && over.closest(".sd-part");
      if (g && g.dataset.id !== wiring.from) { addWire(wiring.from, g.dataset.id); wiring = null; }
      else if (!moved) wiring = { from: wiring.from, tap: true };
      else wiring = null;
      drawOver();
      return;
    }
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.moved) { persist(); return; }
    tap(d.id);
  }
  function tap(id) {
    if (wiring && wiring.tap) { if (id !== wiring.from) addWire(wiring.from, id); wiring = null; drawOver(); return; }
    if (editable()) { sel = sel === id ? null : id; selW = -1; drawAll(); drawBrief(); }
    else if (B.kind === "follow") followTap(id);
    else if (B.kind === "bottleneck") guess(id);
  }

  // ---------------------------------------------------------------- edits --
  function persist() { if (editable()) { mine(B.id).design = clone(D); save(); } }
  function changed() { res = null; flows = {}; heat = {}; waits = {}; problems = []; if (F.G) F.G = null; persist(); drawAll(); drawBrief(); }
  function addWire(a, b) {
    if (D.wires.some(([x, y]) => x === a && y === b)) return;
    D.wires = D.wires.filter(([x, y]) => !(x === b && y === a));
    D.wires.push([a, b]);
    changed();
  }
  function cutWire(i) { D.wires.splice(i, 1); selW = -1; changed(); }
  function removePart(id) { D.nodes = D.nodes.filter((n) => n.id !== id); D.wires = D.wires.filter(([a, b]) => a !== id && b !== id); sel = null; changed(); }
  function freeSpot() {
    for (const y of [140, 420, 270, 480, 70]) for (const x of [665, 475, 860, 285, 95]) {
      if (D.nodes.every((n) => Math.abs(n.x - x) > PW + 6 || Math.abs(n.y - y) > PH + 10)) return [x, y];
    }
    return [W / 2 + (Math.random() * 80 - 40), H - 60];
  }
  function addPart(kind, at) {
    let k = 1;
    while (D.nodes.some((n) => n.id === kind + k)) k++;
    const [x, y] = at || freeSpot();
    const nd = { id: kind + k, kind, x: Math.round(x), y: Math.round(y), n: 1 };
    if (kind === "cache") nd.size = "1 GB";
    if (kind === "db") nd.size = "small";
    if (kind === "worker") nd.batch = 1;
    D.nodes.push(nd);
    sel = nd.id;
    changed();
  }
  // the tray: tap a part to drop it in a free spot, or drag it to where you want it
  function trayButton(kind) {
    const k = K[kind], price = B.kind === "sketch" ? PARTS[kind].say : kind === "db" ? `from $${K.db.sizes.small[1]} a month` : kind === "cache" ? `from $${K.cache.sizes["1 GB"][1]} a month` : `$${k.price}${k.many ? " each" : ""} a month`;
    const b = h("button", { class: "sd-tray-b k-" + kind, type: "button" },
      h("span", { class: "sd-ti", html: `<svg viewBox="0 0 26 26" width="22" height="22" aria-hidden="true">${ICON[kind]}</svg>` }), h("b", {}, nameOf(kind)), h("small", {}, price));
    let ghost = null, st = null;
    b.addEventListener("pointerdown", (e) => { st = { x: e.clientX, y: e.clientY }; b.setPointerCapture(e.pointerId); });
    b.addEventListener("pointermove", (e) => {
      if (!st) return;
      if (!ghost && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) { ghost = h("div", { class: "sd-ghost k-" + kind }, nameOf(kind)); document.body.append(ghost); }
      if (ghost) { ghost.style.left = e.clientX + "px"; ghost.style.top = e.clientY + "px"; }
    });
    b.addEventListener("pointerup", (e) => {
      if (!st) return;
      st = null;
      if (ghost) {
        ghost.remove(); ghost = null;
        const r = els.svg.getBoundingClientRect();
        if (e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom) { const p = pt(e); addPart(kind, [Math.max(PW / 2 + 4, Math.min(W - PW / 2 - 4, p.x)), Math.max(PH / 2 + 22, Math.min(H - PH / 2 - 4, p.y))]); }
        return;
      }
      addPart(kind);
    });
    b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addPart(kind); } });
    return b;
  }
  // the inspector: the selected part's size as words you click
  function inspector() {
    const nd = sel && part(sel);
    if (!nd && B.kind === "sketch") return h("p", { class: "sd-quiet" }, "Tap a part to see what it does. ", TOUCH ? "Tap a part's " : "Drag from a part's ", h("b", {}, "+"), TOUCH ? ", then the part to wire it to" : " to another part to wire them", "; tap a wire to cut it.");
    if (!nd) return h("p", { class: "sd-quiet" }, "Tap a part on the board to change its size. ", TOUCH ? "Tap a part's " : "Drag from a part's ", h("b", {}, "+"), TOUCH ? ", then the part to wire it to" : " to another part to wire them", "; tap a wire to cut it.");
    if (B.kind === "sketch") return h("div", { class: "sd-insp" }, h("div", { class: "sd-ih" }, h("span", { class: "sd-ti", html: `<svg viewBox="0 0 26 26" width="20" height="20" aria-hidden="true">${ICON[nd.kind]}</svg>` }), h("b", {}, nameOf(nd.kind))),
      h("p", { class: "sd-quiet" }, PARTS[nd.kind].say + "."), PARTS[nd.kind].fixed ? null : h("p", {}, h("button", { class: "sd-word sd-rm", onclick: () => removePart(nd.id) }, "remove it from the board")));
    const k = K[nd.kind], rows = [];
    const step = (d) => { nd.n = Math.max(1, Math.min(12, (nd.n || 1) + d)); changed(); };
    const cyc = (key, list) => { const i = list.indexOf(String(nd[key] ?? list[0])); nd[key] = typeof list[0] === "number" ? list[(i + 1) % list.length] : list[(i + 1) % list.length]; changed(); };
    if (k.many) rows.push(h("p", {}, h("button", { class: "sd-step", "aria-label": "One fewer", onclick: () => step(-1) }, "−"), h("b", {}, nd.n || 1), ` machine${(nd.n || 1) > 1 ? "s" : ""}`, h("button", { class: "sd-step", "aria-label": "One more", onclick: () => step(1) }, "+"), h("small", {}, ` · ${N.workersOf(nd)} workers`)));
    if (SIZES[nd.kind]) rows.push(h("p", {}, "size ", h("button", { class: "sd-word", onclick: () => cyc("size", SIZES[nd.kind]) }, nd.size || k.size), h("small", {}, nd.kind === "cache" ? ` · holds the ${num(k.sizes[nd.size || k.size][0])} hottest links` : ` · ${N.workersOf(nd)} workers`)));
    if (nd.kind === "worker") rows.push(h("p", {}, "writes ", h("button", { class: "sd-word", onclick: () => { const L = K.worker.batches, i = L.indexOf(nd.batch || 1); nd.batch = L[(i + 1) % L.length]; changed(); } }, `${nd.batch || 1} count${(nd.batch || 1) > 1 ? "s" : ""}`), " at a time"));
    const each = nd.kind === "db" ? k.sizes[nd.size || "small"][1] : nd.kind === "cache" ? k.sizes[nd.size || k.size][1] : (k.price || 0) * (k.many ? nd.n || 1 : 1);
    return h("div", { class: "sd-insp" }, h("div", { class: "sd-ih" }, h("span", { class: "sd-ti", html: `<svg viewBox="0 0 26 26" width="20" height="20" aria-hidden="true">${ICON[nd.kind]}</svg>` }), h("b", {}, k.name), h("small", {}, nd.kind === "users" ? "" : `$${num(each)} a month`)),
      rows, nd.kind === "users" ? h("p", { class: "sd-quiet" }, "The users are the traffic. Wire them to the front of your system.") : h("p", {}, h("button", { class: "sd-word sd-rm", onclick: () => removePart(nd.id) }, "remove it from the board")));
  }

  // ---------------------------------------------------------------- brief --
  function drawBrief() {
    const done = S.done[B.id], kids = [
      h("div", { class: "sd-eye" }, `${MODE_WORD[B.mode]} ${B.n} of ${U[B.mode].length} · ${KIND_WORD[B.kind]}`),
      h("h1", {}, B.title),
      h("p", { class: "sd-lede", html: B.lede }),
    ];
    if (B.kind === "follow") {
      const r = B.rounds[Math.min(F.round, B.rounds.length - 1)];
      if (F.round < B.rounds.length) kids.push(h("div", { class: "sd-ask" }, h("small", {}, `${B.item || "click"} ${F.round + 1} of ${B.rounds.length}`), h("p", { html: r.say }),
        h("p", { class: "sd-path" }, F.got.length ? F.got.flatMap((id, i) => [i ? h("i", {}, "→") : null, h("span", {}, labelOf(part(id)))]) : h("span", { class: "sd-quiet" }, `Tap ${theOf(part(r.path[0]))} first.`))));
    }
    const tools = [];
    if (B.kind === "napkin") tools.push(h("p", { class: "sd-quiet" }, "Type your guesses into the notes on the board."), h("div", { class: "sd-btns" }, h("button", { class: "btn primary", onclick: checkNapkin }, "Check the notes")));
    if (B.kind === "bottleneck") {
      if (!F.guess) kids.push(h("div", { class: "sd-ask" }, h("p", {}, "Tap a part on the board."), h("p", { class: "sd-quiet" }, `It's running at ${num(B.ramp[0])} clicks a second now, and every part is calm.`)));
      else if (F.steps) kids.push(rampControls());
      else kids.push(h("p", { class: "sd-quiet" }, "Turning the traffic up…"));
    }
    if (ctx) { kids.push(...(UI[B.kind].brief(ctx) || [])); tools.push(...(UI[B.kind].tools(ctx) || [])); }
    if (B.kind === "sketch") {
      const G = F.G, left = G ? G.items.filter((i) => !i.ok) : [];
      tools.push(h("div", { class: "sd-btns" }, h("button", { class: "btn primary", onclick: checkSketch }, "Check the drawing"), h("span", { class: "sd-runs" }, F.tries ? `${F.tries} check${F.tries > 1 ? "s" : ""}` : "")));
      if (G) tools.push(h("ul", { class: "sd-rub" }, G.items.filter((i) => i.ok).map((i) => h("li", { class: "ok" }, h("i", {}, "✓"), i.say)),
        left.slice(0, F.hints).map((i) => h("li", { class: "hint" }, h("i", {}, "?"), i.say)),
        G.bad.map((b) => h("li", { class: "no" }, h("i", {}, "✗"), b.text)),
        left.length > F.hints ? h("li", { class: "more" }, h("i", {}, "·"), `${left.length - F.hints} more link${left.length - F.hints > 1 ? "s" : ""} to find. `, h("button", { class: "sd-word", onclick: () => { F.hints++; drawBrief(); } }, "show a hint")) : null));
      tools.push(h("div", { class: "sd-tray" }, h("div", { class: "sd-h" }, "Parts"), h("div", { class: "sd-tray-g" }, B.tray.map(trayButton))), h("div", { class: "sd-h" }, "Selected"), inspector(),
        h("p", {}, h("button", { class: "sd-word", onclick: () => { D = clone(B.design); delete mine(B.id).design; save(); sel = null; changed(); } }, "start over")));
    }
    if (B.kind === "draw") {
      tools.push(h("div", { class: "sd-btns" }, h("button", { class: "btn primary", disabled: busy, onclick: runIt }, busy ? "Running…" : `Run 30 s of traffic`),
        h("span", { class: "sd-runs" }, runs ? `${runs} run${runs > 1 ? "s" : ""}` : "")));
      if (problems.length) tools.push(h("ul", { class: "sd-probs" }, problems.map((p) => h("li", {}, p.text))));
      tools.push(h("div", { class: "sd-tray" }, h("div", { class: "sd-h" }, "Parts"), h("div", { class: "sd-tray-g" }, B.tray.map(trayButton))), h("div", { class: "sd-h" }, "Selected"), inspector(),
        h("p", {}, h("button", { class: "sd-word", onclick: () => { D = clone(B.design); delete mine(B.id).design; save(); sel = null; changed(); } }, "start over from the brief")));
    }
    const nx = L[qi + 1], nu = UNITS[UNITS.indexOf(U) + 1];
    const next = nx ? h("a", { class: "btn primary", href: loc(nx) }, nx.mode !== B.mode ? `Now run it: ${nx.title} →` : `Next: ${nx.title} →`)
      : nu ? h("a", { class: "btn primary", href: loc(nu.w[0]) }, `Next unit: ${nu.name} →`) : h("a", { class: "btn", href: "./#ladder" }, "Back to the ladder →");
    if (solvedNow || done) kids.splice(3, 0, h("div", { class: "sd-why" + (solvedNow ? " fresh" : "") }, h("div", { class: "sd-wh" }, stars(starsOf(B.id)), h("b", {}, solvedNow ? "Solved" : "Solved before")), h("p", {}, B.why), next));
    els.brief.replaceChildren(...kids);
    els.tools.replaceChildren(...tools);
    els.tools.hidden = !tools.length;
  }
  function solved(n) {
    const prev = starsOf(B.id);
    mine(B.id).stars = Math.max(prev, n);
    S.done[B.id] = true;
    save();
    solvedNow = true;
    drawStrip();
    drawBrief();
  }

  // --------------------------------------------------------------- follow --
  function followTap(id) {
    if (F.round >= B.rounds.length) return;
    const r = B.rounds[F.round], want = r.path[F.got.length];
    if (id === want) {
      F.got.push(id);
      if (F.got.length === r.path.length) {
        // the click runs the path it just traced, as a stream of dots
        flows = {}; for (let k = 1; k < r.path.length; k++) flows[r.path[k - 1] + ">" + r.path[k]] = 30;
        drawAll();
        setTimeout(() => {
          F.round++; F.got = []; flows = {};
          if (F.round >= B.rounds.length) solved(F.tries === 0 ? 3 : F.tries <= 2 ? 2 : 1);
          drawAll(); drawBrief();
        }, 1600);
      }
      drawParts(); drawBrief();
    } else {
      F.tries++;
      const g = els.gp.querySelector(`[data-id="${id}"]`);
      if (g) { g.classList.remove("nope"); void g.getBoundingClientRect(); g.classList.add("nope"); }
      const nd = part(id), at = F.got.length ? theOf(part(F.got[F.got.length - 1])) : null, item = B.item || "click";
      flash(F.got.length === 0 ? `This ${item} starts at ${theOf(part(r.path[0]))}.` : nd.kind === "db" && r.hit ? "Not this time: the cache already has it." : `Not yet. Where does ${at} hand the ${item} next?`);
    }
  }
  function flash(t) { const p = h("p", { class: "sd-flash", role: "status" }, t); els.brief.append(p); setTimeout(() => p.remove(), 2400); }

  // --------------------------------------------------------------- napkin --
  // a napkin number: "40", "3,900", "3.9k", "4e3"
  function parse(v) {
    const m = String(v || "").trim().toLowerCase().replace(/,/g, "").match(/^(-?[\d.]+(?:e[+-]?\d+)?)\s*([kmb])?/);
    if (!m) return NaN;
    return parseFloat(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1);
  }
  function checkNapkin() {
    let all = true;
    for (const n of B.notes) {
      const want = Function(`return (${n.calc});`)(), got = parse(F.vals[n.id]);
      const good = got > 0 && got / want < 1.5 && want / got < 1.5;
      const nice = want >= 100 ? num(want) : want >= 10 ? want.toFixed(1) : String(+want.toFixed(2));
      F.marks[n.id] = good ? { cls: "ok", say: `✓ ≈ ${nice}` } : { cls: "no", say: isNaN(got) ? "a number, please" : `${got > want ? "too high" : "too low"} · ${n.hint}` };
      if (!good) all = false;
    }
    if (!all) F.tries++;
    drawOver();
    if (all) solved(F.tries === 0 ? 3 : F.tries <= 2 ? 2 : 1);
  }

  // ----------------------------------------------------------- bottleneck --
  function calm() { show(N.run(D, B.q, { rate: B.ramp[0], settle: 3, win: 6, seed: 1 })); heat = {}; waits = {}; drawAll(); }
  function guess(id) {
    if (F.guess) return;
    if (part(id).kind === "users") { flash("The users are the traffic. Which part of the system gives out?"); return; }
    F.guess = id;
    drawParts(); drawBrief();
    // the ramp: each load run on its own, a step at a time so the page stays live, then played back
    const steps = [];
    const next = () => {
      if (steps.length === B.ramp.length) { F.steps = steps; play(); return; }
      const rate = B.ramp[steps.length];
      steps.push({ rate, r: N.run(D, B.q, { rate, settle: 5, win: 10, seed: 1 }) });
      setTimeout(next, 0);
    };
    setTimeout(next, 30);
  }
  // the first part past 85% busy, and the load where it got there
  const firstOut = () => { for (const st of F.steps) { const e = Object.entries(st.r.util).sort((a, b) => b[1] - a[1])[0]; if (e[1] > 0.85) return { id: e[0], rate: st.rate }; } return null; };
  function setStep(i) {
    F.at = i;
    const st = F.steps[i];
    show(st.r);
    label = {};
    for (const [id, u] of Object.entries(st.r.util)) if (part(id).kind !== "lb") label[id] = `${Math.round(Math.min(1, u) * 100)}% busy`;
    drawAll();
    const r = els.brief.querySelector(".sd-ramp input");
    if (r) { r.value = i; r.nextSibling.textContent = `${num(st.rate)} clicks/s`; }
  }
  function play() {
    let i = 0;
    const tick = () => {
      setStep(i);
      if (i < F.steps.length - 1) { i++; setTimeout(tick, REDUCED ? 60 : 900); return; }
      const out = firstOut();
      if (!S.done[B.id] || !solvedNow) solved(F.guess === B.answer ? 3 : 1);
      els.brief.querySelector(".sd-verdict")?.replaceWith(verdict(out));
    };
    drawBrief();
    tick();
  }
  function verdict(out) {
    const right = F.guess === B.answer;
    return h("p", { class: "sd-verdict " + (right ? "ok" : "no") }, right ? "✓ Right: " : "✗ Not that one: ",
      out ? `the ${nameOf(part(out.id).kind)} passed 85% busy first, at ${num(out.rate)} clicks a second.` : "");
  }
  function rampControls() {
    const r = h("input", { type: "range", min: 0, max: F.steps.length - 1, step: 1, value: F.at, "aria-label": "Traffic", oninput: (e) => setStep(+e.target.value) });
    return h("div", { class: "sd-ask" }, h("p", {}, "You picked the ", h("b", {}, nameOf(part(F.guess).kind)), "."),
      h("label", { class: "sd-ramp" }, h("span", {}, "traffic"), r, h("output", {}, `${num(F.steps[F.at].rate)} clicks/s`)),
      h("p", { class: "sd-verdict" }, "Turning the traffic up…"));
  }

  // --------------------------------------------------------------- sketch --
  function checkSketch() {
    F.tries++;
    const G = SDX.grade(D, B.rubric, B.wrong);
    F.G = G;
    problems = G.bad;
    drawAll();
    if (G.pass) solved(Math.max(1, 3 - F.hints - (F.tries > 2 ? 1 : 0)));
    else drawBrief();
  }

  // ----------------------------------------------------------------- draw --
  function runIt() {
    const c = N.compile(D, B.q);
    problems = c.problems;
    if (problems.length) { res = null; flows = {}; heat = {}; waits = {}; drawAll(); drawBrief(); return; }
    busy = true; drawBrief();
    setTimeout(() => {
      const r = N.run(D, B.q, { rate: B.rate, seed: (runs % 5) + 1 });
      runs++; busy = false;
      show(r); label = {};
      drawAll();
      const pass = B.goals.every(([k, op, v]) => { const x = r[k]; return op === "<" ? x < v : op === "<=" ? x <= v : x > v; });
      if (pass) solved(runs <= 3 ? 3 : runs <= 6 ? 2 : 1); else drawBrief();
    }, 40);
  }

  // ---------------------------------------------------------------- start --
  shell();
  function route() {
    const hs = decodeURIComponent(location.hash.slice(1)), m = hs.match(/^([a-z]+)\/(\d+)$/);
    let u = m && UNITS.find((x) => x.id === m[1]), i = m ? +m[2] - 1 : 0;
    if (!u && /^\d+$/.test(hs)) { const b = BOARDS.find((x) => x.id === SDX.OLD[+hs - 1]); if (b) { u = UNITS.find((x) => x.id === b.unit); i = [...u.w, ...u.s].indexOf(b); } }
    if (!u) { const id = /^[a-z]+$/.test(hs) ? hs : "snip"; u = UNITS.find((x) => x.id === id) || UNITS[0]; i = 0; }
    open(u, i);
  }
  addEventListener("hashchange", route);
  route();
  requestAnimationFrame(frame);
})();
