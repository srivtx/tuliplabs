/* Tulip Labs: hands-on questions. The picture is the question, and you answer on it: tap the cells or nodes in
   the order the program reaches them, swap tiles into place, write a number on each one, or drag across a
   stretch. Your moves become the answer text, so a board question is marked exactly like a typed one, and
   tools/mock-check.js proves that each board's own solution gives the answer real Python prints.
   Once it's marked, the same board plays the program out step by step.

   A board is plain data, made by a generator in learn/mock-gen.js:
     type   "array" (vals) | "graph" (nodes, edges [u, v, w?], directed, start) | "tree" (heap: vals by index,
            or root, left, right)
     mode   "seq": tap items in order; the answer is their ids, or their values with emit: "value"
            "arrange": tap two to swap them; the answer is the values in order (solve or swaps give the right one)
            "label": write on each item; the answer is the list
            "range": drag across a stretch of an array; the answer is its sum, or its length with emit: "len"
            (unique: true marks letters that repeat inside the stretch)
     ask    what to do (HTML); solve: the right state; steps: the replay, each step with any of
            at (ids lit up), span [lo, hi] (dims the rest), sel [i, j], swap [slot, slot], set {id: text},
            edges [[u, v]], list (shown in a strip named listName) and note (HTML)
   HANDS.mount(board, { state, onChange(state, answer), replay, autoplay }) returns { el, play }. */
(function (root) {
  "use strict";
  const W = 680;

  // ------------------------------------------------------------------- pure --
  function treeIds(b) {
    const out = [];
    const walk = (u) => { if (u == null) return; out.push(u); walk(b.left[u]); walk(b.right[u]); };
    walk(b.root);
    return out;
  }
  function idsOf(b) {
    if (b.type === "graph") return b.nodes.slice();
    if (b.type === "tree" && !b.heap) return treeIds(b);
    return b.vals.map((_, i) => i);
  }
  const named = (b) => b.type === "graph" || (b.type === "tree" && !b.heap);
  const textOf = (b, id) => String(named(b) ? id : b.vals[id]);
  function applySwaps(n, swaps) {
    const p = Array.from({ length: n }, (_, i) => i);
    for (const [i, j] of swaps || []) [p[i], p[j]] = [p[j], p[i]];
    return p;
  }
  function startOf(b) {
    if (b.mode === "seq") return [];
    if (b.mode === "arrange") return b.vals.map((_, i) => i);
    if (b.mode === "label") return idsOf(b).map(() => "");
    return null;
  }
  const solveOf = (b) => (b.mode === "arrange" && !b.solve ? applySwaps(b.vals.length, b.swaps) : b.solve);
  const clean = (x) => String(x == null ? "" : x).trim().replace(/∞/g, "inf");
  const sumOf = (b, i, j) => b.vals.slice(i, j + 1).reduce((a, x) => a + x, 0);
  // the answer text a state on the board gives, or null while it's unfinished
  function answerOf(b, st) {
    if (st == null) return null;
    if (b.mode === "seq") return st.length ? st.map((id) => (b.emit === "value" ? b.vals[id] : id)).join(" ") : null;
    if (b.mode === "arrange") return "[" + st.map((i) => b.vals[i]).join(", ") + "]";
    if (b.mode === "label") return st.every((x) => clean(x)) ? "[" + st.map(clean).join(", ") + "]" : null;
    if (b.mode === "range") return String(b.emit === "len" ? st[1] - st[0] + 1 : sumOf(b, st[0], st[1]));
    return null;
  }

  // where everything sits, in a W-wide box; graphs try every way of putting their nodes on seven spots
  const SLOTS = [[0, 1], [1, 0], [1, 2], [2, 1], [3, 0], [3, 2], [4, 1]].map(([c, r]) => [90 + c * 125, 52 + r * 98]);
  const R = 30; // a node's radius, near enough, at every width
  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function crosses(a, b, c, d) {
    if (a === c || a === d || b === c || b === d) return false;
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  }
  const LAYOUTS = typeof WeakMap === "function" ? new WeakMap() : null;
  function layout(b) {
    if (LAYOUTS && LAYOUTS.has(b)) return LAYOUTS.get(b);
    let lay;
    if (b.type === "array") {
      const n = b.vals.length, cw = Math.min(58, (W - 40) / n);
      lay = { H: b.mode === "label" ? 156 : 118, cw, pos: {}, size: cw * 0.86, edges: [] };
      b.vals.forEach((_, i) => (lay.pos[i] = [W / 2 + (i - (n - 1) / 2) * cw, 58]));
    } else if (b.type === "tree") {
      const pos = {}, edges = [];
      let H;
      if (b.heap) {
        const n = b.vals.length, top = Math.floor(Math.log2(n));
        for (let i = 0; i < n; i++) {
          const L = Math.floor(Math.log2(i + 1)), k = i - (2 ** L - 1);
          pos[i] = [W * (k + 0.5) / 2 ** L, 44 + L * 80];
          if (i) edges.push({ u: (i - 1) >> 1, v: i });
        }
        H = 88 + top * 80;
      } else {
        const order = [], dep = {};
        const walk = (u, d) => { if (u == null) return; walk(b.left[u], d + 1); order.push(u); dep[u] = d; walk(b.right[u], d + 1); };
        walk(b.root, 0);
        const step = (W - 120) / Math.max(1, order.length - 1), maxD = Math.max(...Object.values(dep));
        order.forEach((u, k) => (pos[u] = [60 + k * step, 40 + dep[u] * 66]));
        for (const u of order) for (const c of [b.left[u], b.right[u]]) if (c != null) edges.push({ u, v: c });
        H = 82 + maxD * 66;
      }
      lay = { H, pos, size: 44, edges };
    } else {
      const ns = b.nodes, E = b.edges, used = SLOTS.map(() => false), at = {};
      let best = Infinity, bestAt = null;
      const cost = (lim) => {
        let c = 0;
        for (const [u, v] of E) for (const x of ns) if (x !== u && x !== v && segDist(at[x], at[u], at[v]) < R + 8) { c += 60; if (c >= lim) return c; }
        for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) if (crosses(at[E[i][0]], at[E[i][1]], at[E[j][0]], at[E[j][1]])) { c += 10; if (c >= lim) return c; }
        if (b.directed) for (const [u, v] of E) if (at[v][0] < at[u][0] - 1) c += 1;
        if (b.start != null && at[b.start] !== SLOTS[0]) c += 3;
        return c;
      };
      const go = (k) => {
        if (k === ns.length) { const c = cost(best); if (c < best) { best = c; bestAt = Object.assign({}, at); } return; }
        for (let s = 0; s < SLOTS.length && best > 0; s++) if (!used[s]) { used[s] = true; at[ns[k]] = SLOTS[s]; go(k + 1); used[s] = false; }
      };
      go(0);
      const pos = bestAt, both = new Set(E.map(([u, v]) => u + ">" + v));
      const edges = E.map(([u, v, w]) => {
        const a = pos[u], z = pos[v], dx = z[0] - a[0], dy = z[1] - a[1], L = Math.hypot(dx, dy);
        const bend = b.directed && both.has(v + ">" + u) ? 26 : 0;
        const c = [(a[0] + z[0]) / 2 - (dy / L) * bend, (a[1] + z[1]) / 2 + (dx / L) * bend];
        // a one-way edge stops at the rim of the node it points to, so its arrow shows
        const tx = z[0] - c[0], ty = z[1] - c[1], tl = Math.hypot(tx, ty);
        const end = b.directed ? [z[0] - (tx / tl) * (R + 3), z[1] - (ty / tl) * (R + 3)] : z;
        return { u, v, w, a, c, end, bent: !!bend, mid: [(a[0] + 2 * c[0] + z[0]) / 4, (a[1] + 2 * c[1] + z[1]) / 4] };
      });
      lay = { H: b.mode === "label" ? 340 : 300, pos, size: 54, edges, cost: best };
    }
    if (LAYOUTS) LAYOUTS.set(b, lay);
    return lay;
  }

  // what's wrong with a board, for the checker: an empty list when it's sound
  function lint(b) {
    const out = [], ids = idsOf(b), has = new Set(ids.map(String));
    if (has.size !== ids.length) out.push("repeated ids");
    const sol = solveOf(b);
    if (b.mode === "seq") {
      if (!sol || !sol.length || sol.some((id) => !has.has(String(id)))) out.push("a solution item that isn't on the board");
      if (new Set(sol.map(String)).size !== sol.length) out.push("the solution taps an item twice");
    }
    if (b.mode === "arrange" && (b.swaps || []).some(([i, j]) => !(i >= 0 && j >= 0 && i < b.vals.length && j < b.vals.length))) out.push("a swap off the board");
    if (b.mode === "label" && sol.length !== ids.length) out.push("the solution doesn't label every item");
    if (b.mode === "range") {
      const [i, j] = sol;
      if (!(i >= 0 && i <= j && j < b.vals.length)) out.push("the solution's stretch is off the board");
      else if (b.unique && new Set(b.vals.slice(i, j + 1)).size !== j - i + 1) out.push("the solution's stretch repeats a letter");
    }
    if (b.type === "graph") {
      for (const [u, v] of b.edges) if (!has.has(String(u)) || !has.has(String(v))) out.push(`edge ${u}-${v} to a missing node`);
      const lay = layout(b);
      for (const e of lay.edges) for (const x of b.nodes) if (x !== e.u && x !== e.v && !e.bent && segDist(lay.pos[x], e.a, lay.pos[e.v]) < R + 8) out.push(`edge ${e.u}-${e.v} runs through node ${x}`);
    }
    for (const s of b.steps || []) for (const id of [].concat(s.at == null ? [] : s.at)) if (!has.has(String(id))) out.push(`a step lights ${id}, which isn't on the board`);
    return out;
  }
  const defaultSteps = (b) => {
    const sol = solveOf(b);
    if (b.mode === "seq") return sol.map((id) => ({ at: id }));
    if (b.mode === "arrange") return (b.swaps || []).map((s) => ({ swap: s }));
    if (b.mode === "label") return [{ set: Object.fromEntries(idsOf(b).map((id, k) => [id, sol[k]])) }];
    return [{ sel: sol }];
  };

  // -------------------------------------------------------------------- DOM --
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const SVGNS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let uid = 0;

  function mount(b, opts) {
    opts = opts || {};
    const lay = layout(b), ids = idsOf(b), H = lay.H, replay = !!opts.replay;
    const px = (x) => (100 * x) / W + "%", py = (y) => (100 * y) / H + "%";
    let st = !replay && opts.state != null ? JSON.parse(JSON.stringify(opts.state)) : startOf(b);
    if (b.mode === "arrange" && (!Array.isArray(st) || st.length !== b.vals.length)) st = startOf(b);
    if (b.mode === "label" && (!Array.isArray(st) || st.length !== ids.length)) st = startOf(b);
    let picked = null;

    const root = el("div", `hb hb-${b.type} hb-${b.mode}${replay ? " hb-replay" : ""}`);
    if (b.ask && !replay) { const p = el("p", "hb-ask"); p.innerHTML = b.ask; root.append(p); }
    const stage = el("div", "hb-stage");
    stage.style.aspectRatio = `${W} / ${H}`;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" });
    const mid = "hba" + ++uid;
    if (b.type === "graph" && b.directed) {
      const defs = svgEl("defs", {}), mk = svgEl("marker", { id: mid, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 12, markerHeight: 12, orient: "auto-start-reverse", markerUnits: "userSpaceOnUse" });
      mk.append(svgEl("path", { d: "M0 0 L10 5 L0 10 z", class: "hb-ah" }));
      defs.append(mk);
      svg.append(defs);
    }
    const edgeEls = {};
    for (const e of lay.edges) {
      const a = e.a || lay.pos[e.u], z = e.end || lay.pos[e.v];
      const d = e.c ? `M${a[0]} ${a[1]} Q${e.c[0]} ${e.c[1]} ${z[0]} ${z[1]}` : `M${a[0]} ${a[1]} L${z[0]} ${z[1]}`;
      const p = svgEl("path", { d, class: "hb-e" });
      if (b.directed) p.setAttribute("marker-end", `url(#${mid})`);
      svg.append(p);
      edgeEls[e.u + ">" + e.v] = p;
      if (!b.directed) edgeEls[e.v + ">" + e.u] = p;
    }
    stage.append(svg);
    for (const e of lay.edges) if (e.w != null) {
      const w = el("span", "hb-w", String(e.w));
      w.style.left = px(e.mid[0]); w.style.top = py(e.mid[1]);
      stage.append(w);
    }

    // the items: buttons, so a keyboard can answer too; for arrange, keyed by the value's starting slot
    const items = {}, inputs = {}, marks = {};
    const sizeCss = b.type === "array" ? px(lay.cw * 0.86) : `max(34px, ${px(lay.size)})`;
    ids.forEach((id) => {
      const it = el("button", "hb-it");
      it.type = "button";
      it.append(el("span", "hb-tx", textOf(b, id)));
      it.style.width = sizeCss;
      it.dataset.id = String(id);
      it.setAttribute("aria-label", (b.type === "array" ? `Cell ${id}, ` : "") + textOf(b, id));
      if (replay) it.tabIndex = -1;
      items[id] = it;
      stage.append(it);
      const [x, y] = lay.pos[id];
      it.style.left = px(x); it.style.top = py(y);
      if (b.type === "array") {
        const ix = el("span", "hb-ix", String(id));
        ix.style.left = px(x); ix.style.top = py(y + lay.cw * 0.43 + 6);
        stage.append(ix);
      }
      const mk = el("span", "hb-mk");
      mk.style.left = px(x); mk.style.top = py(b.type === "array" ? y + lay.cw * 0.43 + 30 : y - R - 14);
      marks[id] = mk;
      stage.append(mk);
      if (b.mode === "label") {
        const inp = el("input", "hb-in");
        inp.type = "text"; inp.autocomplete = "off"; inp.spellcheck = false; inp.placeholder = "?";
        inp.setAttribute("aria-label", `Your value for ${b.type === "array" ? "cell " + id : textOf(b, id)}`);
        inp.style.left = px(x);
        inp.style.top = py(b.type === "array" ? y + lay.cw * 0.43 + 34 : y);
        if (b.type === "array") inp.style.width = px(Math.max(30, lay.cw * 0.86));
        if (replay) { inp.readOnly = true; inp.tabIndex = -1; }
        inputs[id] = inp;
        stage.append(inp);
      }
    });
    root.append(stage);
    const strip = el("div", "hb-strip"), note = el("p", "hb-note");
    root.append(strip, note);
    const foot = el("div", "hb-foot");
    const readout = el("span", "hb-read");
    foot.append(readout);
    root.append(foot);

    // ------------------------------------------------------------ painting --
    const slotPos = (slot) => lay.pos[slot];
    function place() {
      if (b.mode !== "arrange") return;
      st.forEach((orig, slot) => { const [x, y] = slotPos(slot); items[orig].style.left = px(x); items[orig].style.top = py(y); });
    }
    function clearLooks() {
      for (const id of ids) { const it = items[id]; it.classList.remove("on", "hot", "dim", "pick", "in", "dup"); delete it.dataset.n; marks[id].textContent = ""; }
      for (const k in edgeEls) edgeEls[k].classList.remove("hot");
    }
    function paint() {
      clearLooks();
      if (b.mode === "seq") st.forEach((id, k) => { const it = items[id]; if (it) { it.classList.add("on"); it.dataset.n = k + 1; } });
      if (b.mode === "arrange") { place(); if (picked != null) items[picked].classList.add("pick"); }
      if (b.mode === "range" && st) {
        for (let k = st[0]; k <= st[1]; k++) items[k].classList.add("in");
        if (b.unique) { const seen = {}; for (let k = st[0]; k <= st[1]; k++) (seen[b.vals[k]] = seen[b.vals[k]] || []).push(k); for (const v in seen) if (seen[v].length > 1) seen[v].forEach((k) => items[k].classList.add("dup")); }
      }
      if (b.mode === "label") ids.forEach((id, k) => { if (inputs[id].value !== st[k]) inputs[id].value = st[k]; });
      if (!replay) readOut();
    }
    function readOut() {
      readout.textContent = "";
      const ans = answerOf(b, st);
      let say;
      if (b.mode === "range" && st) say = `${b.emit === "len" ? "Your stretch is " + (st[1] - st[0] + 1) + " long" : "Your stretch adds up to " + sumOf(b, st[0], st[1])}${b.unique && root.querySelector(".dup") ? ", but a letter repeats in it" : ""}.`;
      else if (b.mode === "label" && !ans) say = `${st.filter((x) => clean(x)).length} of ${ids.length} written.`;
      else say = ans ? "Your answer: " : b.mode === "seq" ? "Nothing tapped yet." : "";
      readout.append(say);
      if (ans && b.mode !== "range") readout.append(el("code", "", ans));
      if (JSON.stringify(st) !== JSON.stringify(startOf(b))) {
        const again = el("button", "hb-word", "start over");
        again.type = "button";
        again.onclick = () => { st = startOf(b); picked = null; paint(); changed(); };
        readout.append(" ", again);
      }
    }
    const changed = () => opts.onChange && opts.onChange(JSON.parse(JSON.stringify(st)), answerOf(b, st));

    // ---------------------------------------------------------- answering --
    if (!replay) {
      if (b.mode === "seq") stage.addEventListener("click", (e) => {
        const it = e.target.closest(".hb-it"); if (!it) return;
        const id = ids.find((x) => String(x) === it.dataset.id), k = st.findIndex((x) => String(x) === it.dataset.id);
        st = k >= 0 ? st.slice(0, k) : st.concat([id]);
        paint(); changed();
      });
      if (b.mode === "arrange") stage.addEventListener("click", (e) => {
        const it = e.target.closest(".hb-it"); if (!it) return;
        const orig = +it.dataset.id;
        if (picked == null) picked = orig;
        else if (picked === orig) picked = null;
        else { const i = st.indexOf(picked), j = st.indexOf(orig); [st[i], st[j]] = [st[j], st[i]]; picked = null; changed(); }
        paint();
      });
      if (b.mode === "label") ids.forEach((id, k) => {
        inputs[id].addEventListener("input", () => { st[k] = inputs[id].value; readOut(); changed(); });
        inputs[id].addEventListener("keydown", (e) => { if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) { e.preventDefault(); const nx = inputs[ids[k + 1]]; if (nx) nx.focus(); } });
      });
      if (b.mode === "range") {
        // press and drag across the cells; or tap one end, then the other
        let down = null, prev = null, moved = false;
        const cellAt = (cx) => {
          const r = stage.getBoundingClientRect(), x = ((cx - r.left) / r.width) * W, n = b.vals.length;
          return Math.max(0, Math.min(n - 1, Math.round((x - W / 2) / lay.cw + (n - 1) / 2)));
        };
        stage.addEventListener("pointerdown", (e) => {
          const it = e.target.closest(".hb-it"); if (!it) return;
          e.preventDefault();
          down = +it.dataset.id; prev = st; moved = false; st = [down, down];
          stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
          paint();
        });
        stage.addEventListener("pointermove", (e) => {
          if (down == null) return;
          const k = cellAt(e.clientX);
          if (k !== down) moved = true;
          const nx = [Math.min(down, k), Math.max(down, k)];
          if (nx[0] !== st[0] || nx[1] !== st[1]) { st = nx; paint(); }
        });
        const up = () => {
          if (down == null) return;
          if (!moved && prev && prev[0] === prev[1] && prev[0] !== down) st = [Math.min(prev[0], down), Math.max(prev[0], down)];
          down = null; paint(); changed();
        };
        stage.addEventListener("pointerup", up);
        stage.addEventListener("pointercancel", up);
        stage.addEventListener("keydown", (e) => {
          // the keyboard: Enter on a cell taps it
          if (e.key !== "Enter" && e.key !== " ") return;
          const it = e.target.closest(".hb-it"); if (!it) return;
          e.preventDefault();
          const k = +it.dataset.id;
          st = st && st[0] === st[1] && st[0] !== k ? [Math.min(st[0], k), Math.max(st[0], k)] : [k, k];
          paint(); changed();
        });
      }
    }

    // ------------------------------------------------------------- replay --
    let playing = false, btn = null;
    async function play() {
      if (playing) return;
      playing = true;
      if (btn) btn.disabled = true;
      st = startOf(b); picked = null;
      if (b.mode === "label") ids.forEach((id) => { inputs[id].value = ""; inputs[id].classList.remove("set"); });
      paint();
      strip.textContent = ""; note.textContent = "";
      const steps = b.steps && b.steps.length ? b.steps : defaultSteps(b);
      let n = 0;
      await wait(350);
      for (const s of steps) {
        if (!root.isConnected) break;
        for (const id of ids) { items[id].classList.remove("hot", "dim", "in"); marks[id].textContent = ""; }
        for (const k in edgeEls) edgeEls[k].classList.remove("now");
        if (s.at != null) for (const id of [].concat(s.at)) {
          const it = items[id]; if (!it) continue;
          it.classList.add("hot");
          if (b.mode === "seq") { it.classList.add("on"); it.dataset.n = ++n; }
        }
        if (s.span) {
          ids.forEach((id) => { if (id < s.span[0] || id > s.span[1]) items[id].classList.add("dim"); });
          if (s.span[0] <= s.span[1]) { marks[s.span[0]].textContent = "lo"; marks[s.span[1]].textContent = s.span[0] === s.span[1] ? "lo hi" : "hi"; }
        }
        if (s.sel) for (let k = s.sel[0]; k <= s.sel[1]; k++) items[k].classList.add("in");
        if (s.swap) { const [i, j] = s.swap; [st[i], st[j]] = [st[j], st[i]]; place(); items[st[i]].classList.add("hot"); items[st[j]].classList.add("hot"); }
        if (s.set) for (const id in s.set) { const k = ids.findIndex((x) => String(x) === id); if (k < 0) continue; st[k] = String(s.set[id]); const inp = inputs[ids[k]]; if (inp) { inp.value = st[k]; inp.classList.remove("set"); void inp.offsetWidth; inp.classList.add("set"); } }
        for (const [u, v] of s.edges || []) { const p = edgeEls[u + ">" + v]; if (p) p.classList.add("hot", "now"); }
        if (s.list) {
          strip.textContent = "";
          strip.append(el("span", "hb-sn", b.listName || "list"));
          if (!s.list.length) strip.append(el("span", "hb-chip empty", "empty"));
          for (const x of s.list) strip.append(el("span", "hb-chip", String(x)));
        }
        note.innerHTML = s.note || "";
        await wait(s.wait || 1000);
      }
      if (root.isConnected) {
        // the last picture: the right answer, left on the board
        for (const id of ids) items[id].classList.remove("hot", "dim");
        if (b.mode === "range") { const [i, j] = solveOf(b); for (let k = i; k <= j; k++) items[k].classList.add("in"); }
        if (b.mode === "label") { const sol = solveOf(b); ids.forEach((id, k) => (inputs[id].value = sol[k])); }
      }
      playing = false;
      if (btn) { btn.disabled = false; btn.textContent = "▶ Watch it again"; }
    }
    if (replay) {
      btn = el("button", "hb-word hb-play", "▶ Watch it run");
      btn.type = "button";
      btn.onclick = play;
      foot.append(btn);
      for (const id of ids) items[id].disabled = false;
      stage.classList.add("still");
      if (opts.autoplay) setTimeout(() => root.isConnected && play(), 500);
    }
    paint();
    return { el: root, play };
  }

  const API = { W, idsOf, startOf, solveOf, answerOf, layout, lint, applySwaps };
  if (typeof document !== "undefined") API.mount = mount;
  if (typeof module === "object" && module.exports) module.exports = API;
  else root.HANDS = API;
})(this);
