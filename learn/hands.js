/* Tulip Labs: hands-on questions. The picture is the question, and you answer on it. Your moves become the
   answer text, so a board question is marked exactly like a typed one, and tools/mock-check.js proves that
   each board's own solution gives the answer real Python prints. Once it's marked, the board plays it out.

   A board is plain data, made by a generator in learn/mock-gen*.js:
     type   "array" (vals) | "graph" (nodes, edges [u, v, w?], directed, start; on: "edges" to tap the edges)
            | "tree" (heap: vals by index, or root, left, right) | "grid" (rows, cols, vals; "#" is a wall)
            | "intervals" (spans [s, e], lo, hi: a timeline, one row each) | "line" (lo, hi, step, pts: a dial)
            | "plot" (xs, lo, hi: a chart you draw on) | "bst" (keys: chips you insert into a search tree)
     mode   "seq"      tap items in order: the answer is their ids, or values (emit "value"); path: true walks a
                       grid from start to goal, and the answer is the number of moves
            "arrange"  tap two to swap them: the answer is the values in order
            "label"    write on items (blank: which ones, given: filled in already, out: which make the answer)
            "range"    drag across a stretch of an array: its sum, or its length (emit "len")
            "pick"     tap a set (emit: ids, value, count, sum, countvals, countids, countmax, countfrac, rows,
                       pairs); rule "noAdj" | "noOverlap" | "oneEach" (with group) turns clashes red
            "bins"     tap to cycle an item through colours, one per bin (emit: of, nbins, spans)
            "dial"     drag a pin to a value (peek: what each value does, shown as you drag)
            "sketch"   draw a line across the chart: the answer is its values
            "slip"     the run plays as a film with one wrong frame (slip); tap the frame where it goes wrong.
                       under: the mode the frames are drawn in
     judge  makes it a build: judge(state) is what the program prints with your input, and that's your answer
     more   [{label, solve, first}]: extra boxes for the rest of what it prints
     steps  the replay; each may have at (ids lit), span, sel, swap, set, on, put, val, path, pts, tint,
            more, edges [[u, v]], list (in a strip called listName), note, wait
   HANDS.mount(board, { state, onChange(state, answer), replay, autoplay, mine }) returns { el, play }. */
(function (root) {
  "use strict";
  const W = 680;
  const BINC = ["var(--c2)", "var(--c4)", "var(--c3)", "var(--pink)", "var(--c1)", "var(--ok)", "var(--bad)"];

  // ------------------------------------------------------------------- pure --
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const same = (a, b) => String(a) === String(b);
  const modeOf = (b) => (b.mode === "slip" ? b.under : b.mode);
  function treeIds(b) {
    const out = [];
    const walk = (u) => { if (u == null) return; out.push(u); walk(b.left[u]); walk(b.right[u]); };
    walk(b.root);
    return out;
  }
  function idsOf(b) {
    switch (b.type) {
      case "graph": return b.on === "edges" ? range(b.edges.length) : b.nodes.slice();
      case "tree": return b.heap ? range(b.vals.length) : treeIds(b);
      case "grid": return range(b.rows * b.cols);
      case "intervals": return range(b.spans.length);
      case "line": return ["pin"];
      case "plot": return range(b.xs.length);
      case "bst": return range(b.keys.length);
      default: return range(b.vals.length);
    }
  }
  function textOf(b, id) {
    switch (b.type) {
      case "graph": return b.on === "edges" ? (b.edges[id][2] == null ? "" : String(b.edges[id][2])) : String(id);
      case "tree": return String(b.heap ? b.vals[id] : id);
      case "intervals": return b.spans[id][2] != null ? String(b.spans[id][2]) : b.spans[id][0] + "–" + b.spans[id][1];
      case "line": case "plot": return "";
      case "bst": return String(b.keys[id]);
      default: { const v = b.vals[id]; return v == null || v === "#" ? "" : String(v); }
    }
  }
  function valOf(b, id) {
    if (b.type === "graph") return b.on === "edges" ? b.edges[id][2] : id;
    if (b.type === "tree" && !b.heap) return id;
    if (b.type === "intervals") return b.spans[id];
    if (b.type === "bst") return b.keys[id];
    return b.vals[id];
  }
  const blanks = (b) => b.blank || idsOf(b);
  function applySwaps(n, swaps) {
    const p = range(n);
    for (const [i, j] of swaps || []) [p[i], p[j]] = [p[j], p[i]];
    return p;
  }
  // what the picture starts as, in the mode it's drawn in
  function viewStart(b) {
    switch (modeOf(b)) {
      case "seq": return b.path ? [b.start] : [];
      case "arrange": return range(b.vals.length);
      case "label": return blanks(b).map(() => "");
      case "pick": return [];
      case "bins": return idsOf(b).map(() => -1);
      case "sketch": return b.xs.map(() => null);
      default: return null;
    }
  }
  const viewSolve = (b) => (modeOf(b) === "arrange" && !b.solve ? applySwaps(b.vals.length, b.swaps) : b.solve);
  // the answer state: a slip is the frame you pick; extra boxes ride along as { s, m }
  const startOf = (b) => (b.mode === "slip" ? null : b.more ? { s: viewStart(b), m: b.more.map(() => "") } : viewStart(b));
  const solveOf = (b) => (b.mode === "slip" ? b.slip : b.more ? { s: viewSolve(b), m: b.more.map((x) => String(x.solve)) } : viewSolve(b));
  const clean = (x) => String(x == null ? "" : x).trim().replace(/∞/g, "inf");
  const sumOf = (b, i, j) => b.vals.slice(i, j + 1).reduce((a, x) => a + x, 0);
  const gcd = (a, c) => (c ? gcd(c, a % c) : Math.abs(a));
  const frac = (p, q) => { const g = gcd(p, q) || 1; return q / g === 1 ? String(p / g) : `${p / g}/${q / g}`; };
  const inOrder = (b, st) => idsOf(b).filter((id) => st.some((x) => same(x, id)));
  function complete(b, st) {
    const M = modeOf(b);
    if (M === "seq") return st.length === idsOf(b).length;
    if (M === "pick") return b.limit ? st.length === b.limit : st.length > 0;
    return st != null;
  }
  function baseAnswer(b, st) {
    if (st == null) return null;
    switch (modeOf(b)) {
      case "seq":
        if (b.path) return same(st[st.length - 1], b.goal) ? String(st.length - 1) : null;
        return st.length ? st.map((id) => (b.emit === "value" ? valOf(b, id) : id)).join(" ") : null;
      case "arrange": return "[" + st.map((i) => b.vals[i]).join(", ") + "]";
      case "label": {
        if (!st.every((x) => clean(x))) return null;
        const bl = blanks(b), out = b.out ? b.out.map((id) => st[bl.findIndex((x) => same(x, id))]) : st;
        return "[" + out.map(clean).join(", ") + "]";
      }
      case "range": return String(b.emit === "len" ? st[1] - st[0] + 1 : sumOf(b, st[0], st[1]));
      case "pick": {
        if (!st.length && b.emit !== "rows") return null;
        const ch = inOrder(b, st), vs = ch.map((id) => valOf(b, id)), k = ch.length;
        switch (b.emit) {
          case "count": return String(k);
          case "sum": return String(vs.reduce((a, x) => a + x, 0));
          case "value": return vs.join(" ");
          case "countvals": return `${k} [${vs.join(", ")}]`;
          case "countids": return `${k} [${ch.join(", ")}]`;
          case "countmax": return `${k} ${Math.max(...vs)}`;
          case "countfrac": return `${k} ${frac(k, b.over)}`;
          case "pairs": return "[" + ch.map((i) => b.edges[i].slice(0, 2)).sort((x, y) => x[0] - y[0] || x[1] - y[1]).map(([u, v]) => `(${u}, ${v})`).join(", ") + "]";
          case "rows": {
            const on = new Set(ch.concat(b.fixed || []).map(String));
            return range(b.rows).filter((r) => r >= (b.fromRow || 0)).map((r) => range(b.cols).map((c) => (on.has(String(r * b.cols + c)) ? 1 : 0)).join("")).join("\n");
          }
          default: return ch.join(" ");
        }
      }
      case "bins": {
        if (st.some((k) => k < 0)) return null;
        if (b.emit === "nbins") return String(new Set(st).size);
        if (b.emit === "spans") {
          const g = {};
          st.forEach((k, i) => { const [s, e] = b.spans[i]; g[k] = g[k] ? [Math.min(g[k][0], s), Math.max(g[k][1], e)] : [s, e]; });
          return "[" + Object.values(g).sort((x, y) => x[0] - y[0]).map(([s, e]) => `[${s}, ${e}]`).join(", ") + "]";
        }
        let s = st.map((k) => b.bins[k]).join(b.join == null ? " " : b.join);
        if (b.countBin != null) s += " " + st.filter((k) => b.bins[k] === b.countBin).length;
        return s;
      }
      case "dial": return String(st);
      case "sketch": return st.every((v) => v != null) ? "[" + st.join(", ") + "]" : null;
    }
    return null;
  }
  // the answer text a state on the board gives, or null while it's unfinished
  function answerOf(b, x) {
    if (x == null) return null;
    if (b.mode === "slip") return typeof x === "number" ? String(x + 1) : null;
    const st = b.more ? x.s : x;
    const a = b.judge ? (st != null && complete(b, st) ? b.judge(st) : null) : baseAnswer(b, st);
    if (a == null || !b.more) return a;
    if (!x.m || !x.m.every((v) => clean(v))) return null;
    const pre = [], post = [];
    b.more.forEach((m, i) => (m.first ? pre : post).push(clean(x.m[i])));
    return pre.concat([a], post).join(" ");
  }
  // items that break the board's rule, drawn red: neighbours both taken, overlapping meetings, two in one group
  function conflicts(b, st) {
    const bad = new Set(), M = modeOf(b);
    if (!Array.isArray(st)) return bad;
    if (b.rule === "noAdj" && M === "pick") { const s = new Set(st.map(Number)); for (const i of s) if (s.has(i + 1)) { bad.add(i); bad.add(i + 1); } }
    if (b.rule === "oneEach" && M === "pick") {
      const by = {};
      for (const id of st) (by[b.group[id]] = by[b.group[id]] || []).push(id);
      for (const g in by) if (by[g].length > 1) by[g].forEach((id) => bad.add(id));
    }
    if (b.rule === "noOverlap") {
      const ov = (i, j) => b.spans[i][0] < b.spans[j][1] && b.spans[j][0] < b.spans[i][1];
      const groups = M === "pick" ? [st.map(Number)] : [...new Set(st.filter((k) => k >= 0))].map((k) => st.map((x, i) => (x === k ? i : -1)).filter((i) => i >= 0));
      for (const g of groups) for (let x = 0; x < g.length; x++) for (let y = x + 1; y < g.length; y++) if (ov(g[x], g[y])) { bad.add(g[x]); bad.add(g[y]); }
    }
    return bad;
  }
  // a search tree built by inserting keys in order: depth and children of each key
  function bstOf(keys) {
    const t = { root: null, left: {}, right: {}, depth: {} };
    for (const k of keys) {
      if (t.root == null) { t.root = k; t.depth[k] = 0; continue; }
      let u = t.root, d = 0;
      for (;;) {
        d++;
        const side = k < u ? t.left : t.right;
        if (side[u] == null) { side[u] = k; t.depth[k] = d; break; }
        u = side[u];
      }
    }
    return t;
  }
  const preorder = (t) => { const out = []; const go = (u) => { if (u == null) return; out.push(u); go(t.left[u]); go(t.right[u]); }; go(t.root); return out; };
  const near4 = (b, a, c) => { const ra = Math.floor(a / b.cols), rc = Math.floor(c / b.cols); return Math.abs(ra - rc) + Math.abs((a % b.cols) - (c % b.cols)) === 1; };

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
    const pos = {};
    if (b.type === "array") {
      const n = b.vals.length, cw = Math.min(58, (W - 40) / n);
      lay = { H: b.mode === "label" ? 156 : b.arcs ? 150 : 118, cw, pos, size: cw * 0.86, edges: [] };
      const y = b.arcs ? 90 : 58;
      b.vals.forEach((_, i) => (pos[i] = [W / 2 + (i - (n - 1) / 2) * cw, y]));
    } else if (b.type === "tree") {
      const edges = [];
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
    } else if (b.type === "grid") {
      const top = b.colNames ? 26 : 8, left = b.rowNames ? 64 : 0;
      const cw = Math.min(b.cell || 54, (W - 40 - left) / b.cols);
      const x0 = (W - (left + b.cols * cw)) / 2 + left;
      range(b.rows * b.cols).forEach((i) => (pos[i] = [x0 + ((i % b.cols) + 0.5) * cw, top + (Math.floor(i / b.cols) + 0.5) * cw]));
      lay = { H: top + b.rows * cw + 10, pos, cw, x0, y0: top, edges: [] };
    } else if (b.type === "intervals") {
      const n = b.spans.length, x0 = 34, x1 = W - 22, rowH = Math.min(36, 240 / n), top = 8;
      const X = (v) => x0 + ((v - b.lo) * (x1 - x0)) / (b.hi - b.lo);
      b.spans.forEach(([s], i) => (pos[i] = [X(s), top + (i + 0.5) * rowH]));
      lay = { H: top + n * rowH + 36, pos, X, x0, x1, rowH, top, axisY: top + n * rowH + 8, edges: [] };
    } else if (b.type === "line") {
      const x0 = 46, x1 = W - 46, y = b.pts ? 112 : 80;
      const X = (v) => x0 + ((v - b.lo) * (x1 - x0)) / (b.hi - b.lo);
      lay = { H: y + 48, pos: { pin: [x0, y - 40] }, X, x0, x1, y, edges: [] };
    } else if (b.type === "plot") {
      const n = b.xs.length, x0 = 62, x1 = W - 30, top = 18, bot = 232;
      const X = (k) => (n === 1 ? (x0 + x1) / 2 : x0 + (k * (x1 - x0)) / (n - 1));
      const Y = (v) => bot - ((v - b.lo) * (bot - top)) / (b.hi - b.lo);
      range(n).forEach((k) => (pos[k] = [X(k), bot]));
      lay = { H: 268, pos, X, Y, x0, x1, top, bot, edges: [] };
    } else if (b.type === "bst") {
      const n = b.keys.length, sorted = b.keys.slice().sort((x, y) => x - y), rank = {};
      sorted.forEach((k, i) => (rank[k] = i));
      const step = (W - 110) / Math.max(1, n - 1), dy = Math.min(60, 236 / Math.max(1, n - 1));
      const X = (k) => 55 + rank[k] * step, Y = (d) => 34 + d * dy;
      const chipY = Y(n - 1) + 62, cs = Math.min(64, (W - 40) / n);
      b.keys.forEach((_, i) => (pos[i] = [W / 2 + (i - (n - 1) / 2) * cs, chipY]));
      lay = { H: chipY + 36, pos, X, Y, edges: [] };
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
      const npos = bestAt, both = new Set(E.map(([u, v]) => u + ">" + v));
      const edges = E.map(([u, v, w]) => {
        const a = npos[u], z = npos[v], dx = z[0] - a[0], dy = z[1] - a[1], L = Math.hypot(dx, dy);
        const bend = b.directed && both.has(v + ">" + u) ? 26 : 0;
        const c = [(a[0] + z[0]) / 2 - (dy / L) * bend, (a[1] + z[1]) / 2 + (dx / L) * bend];
        // a one-way edge stops at the rim of the node it points to, so its arrow shows
        const tx = z[0] - c[0], ty = z[1] - c[1], tl = Math.hypot(tx, ty);
        const end = b.directed ? [z[0] - (tx / tl) * (R + 3), z[1] - (ty / tl) * (R + 3)] : z;
        return { u, v, w, a, c, end, bent: !!bend, mid: [(a[0] + 2 * c[0] + z[0]) / 4, (a[1] + 2 * c[1] + z[1]) / 4] };
      });
      lay = { H: b.mode === "label" ? 340 : 300, pos: npos, size: 54, edges, cost: best };
      if (b.on === "edges") {
        // each edge's button slides along its own edge until it's clear of the other buttons and of the nodes
        const at = (e, t) => [(1 - t) ** 2 * e.a[0] + 2 * (1 - t) * t * e.c[0] + t * t * npos[e.v][0], (1 - t) ** 2 * e.a[1] + 2 * (1 - t) * t * e.c[1] + t * t * npos[e.v][1]];
        const placed = [];
        lay.ipos = {};
        edges.forEach((e, i) => {
          let best = null, bestGap = -Infinity;
          for (const t of [0.5, 0.4, 0.6, 0.32, 0.68, 0.26, 0.74]) {
            const p = at(e, t), gap = Math.min(...placed.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) - 40), ...ns.map((x) => Math.hypot(p[0] - npos[x][0], p[1] - npos[x][1]) - R - 22));
            if (gap >= 0) { best = p; break; }
            if (gap > bestGap) { bestGap = gap; best = p; }
          }
          placed.push(best);
          lay.ipos[i] = best;
        });
      }
    }
    if (LAYOUTS) LAYOUTS.set(b, lay);
    return lay;
  }

  // what's wrong with a board, for the checker: an empty list when it's sound
  function lint(b) {
    const out = [], ids = idsOf(b), has = new Set(ids.map(String)), M = b.mode === "slip" ? "slip" : modeOf(b);
    if (has.size !== ids.length) out.push("repeated ids");
    const sol = viewSolve(b);
    const inBoard = (xs) => xs.every((id) => has.has(String(id)));
    if (M === "seq") {
      if (!sol || !sol.length || !inBoard(sol)) out.push("a solution item that isn't on the board");
      else if (new Set(sol.map(String)).size !== sol.length) out.push("the solution taps an item twice");
      if (b.path) {
        if (!same(sol[0], b.start) || !same(sol[sol.length - 1], b.goal)) out.push("the path doesn't run from start to goal");
        for (let k = 1; k < sol.length; k++) if (!near4(b, sol[k - 1], sol[k]) || b.vals[sol[k]] === "#") out.push("the path jumps or walks through a wall");
      }
    }
    if (M === "arrange" && (b.swaps || []).some(([i, j]) => !(i >= 0 && j >= 0 && i < b.vals.length && j < b.vals.length))) out.push("a swap off the board");
    if (M === "arrange" && b.solve && b.solve.slice().sort((x, y) => x - y).join() !== range(b.vals.length).join()) out.push("the arrangement isn't a shuffle of the tiles");
    if (M === "label") {
      const bl = blanks(b);
      if (sol.length !== bl.length) out.push("the solution doesn't fill every box");
      if (!inBoard(bl) || (b.out && !b.out.every((id) => bl.some((x) => same(x, id))))) out.push("a box that isn't on the board");
    }
    if (M === "range") {
      const [i, j] = sol;
      if (!(i >= 0 && i <= j && j < b.vals.length)) out.push("the solution's stretch is off the board");
      else if (b.unique && new Set(b.vals.slice(i, j + 1)).size !== j - i + 1) out.push("the solution's stretch repeats a letter");
    }
    if (M === "pick") {
      if ((!sol.length && b.emit !== "rows") || !inBoard(sol)) out.push("an empty pick, or one off the board");
      if (new Set(sol.map(String)).size !== sol.length) out.push("the solution picks an item twice");
      if ((b.lock || []).some((x) => sol.some((y) => same(x, y)))) out.push("the solution picks a locked item");
      if (b.limit && sol.length !== b.limit) out.push("the solution doesn't use its picks");
    }
    if (M === "bins" && (sol.length !== ids.length || sol.some((k) => !(k >= 0 && k < b.bins.length)))) out.push("the solution leaves an item out of the bins");
    if (M === "dial" && !(sol >= b.lo && sol <= b.hi && (sol - b.lo) % (b.step || 1) === 0)) out.push("the dial's answer is off its scale");
    if (M === "sketch" && (sol.length !== b.xs.length || sol.some((v) => !(v >= b.lo && v <= b.hi && Number.isInteger(v))))) out.push("the sketch's answer is off the chart");
    if (b.mode === "slip" && !(b.slip >= 0 && b.slip < (b.steps || []).length)) out.push("the slip isn't one of the frames");
    if (conflicts(b, sol).size) out.push("the solution breaks the board's own rule");
    if (b.type === "graph") {
      const nodes = new Set(b.nodes.map(String));
      for (const [u, v] of b.edges) if (!nodes.has(String(u)) || !nodes.has(String(v))) out.push(`edge ${u}-${v} to a missing node`);
      const lay = layout(b);
      for (const e of lay.edges) for (const x of b.nodes) if (x !== e.u && x !== e.v && !e.bent && segDist(lay.pos[x], e.a, lay.pos[e.v]) < R + 8) out.push(`edge ${e.u}-${e.v} runs through node ${x}`);
    }
    for (const s of b.steps || []) for (const id of [].concat(s.at == null ? [] : s.at)) if (!has.has(String(id))) out.push(`a step lights ${id}, which isn't on the board`);
    return out;
  }
  function defaultSteps(b) {
    const sol = viewSolve(b);
    switch (modeOf(b)) {
      case "seq": return b.path ? sol.map((id, k) => ({ path: sol.slice(0, k + 1), at: id, wait: 380 })) : sol.map((id) => ({ at: id }));
      case "arrange": return (b.swaps || []).map((s) => ({ swap: s }));
      case "label": return [{ set: Object.fromEntries(blanks(b).map((id, k) => [id, sol[k]])) }];
      case "pick": return [{ on: sol }];
      case "bins": return [{ put: Object.fromEntries(idsOf(b).map((id, k) => [id, sol[k]])) }];
      case "dial": return [{ val: sol }];
      case "sketch": return sol.map((v, k) => ({ pts: { [k]: v }, at: k, wait: 420 }));
      default: return [{ sel: sol }];
    }
  }

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
    const lay = layout(b), ids = idsOf(b), H = lay.H, replay = !!opts.replay, M = modeOf(b), slip = b.mode === "slip";
    const px = (x) => (100 * x) / W + "%", py = (y) => (100 * y) / H + "%";
    const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
    const idx = (id) => ids.findIndex((x) => same(x, id));
    const ipos = lay.ipos || lay.pos;
    const lockSet = new Set((b.lock || []).map(String)), fixSet = new Set((b.fixed || []).map(String));
    const steps = b.steps && b.steps.length ? b.steps : defaultSteps(b);

    // st is what the picture shows (in mode M); pick is a slip's answer; mv the extra boxes; tint colours cells
    let st = viewStart(b), mv = b.more ? b.more.map(() => "") : null, pick = null, picked = null, tint = {}, list = null;
    const init = replay ? null : clone(opts.state);
    if (init != null) {
      if (slip) pick = typeof init === "number" ? init : null;
      else {
        const s = b.more ? init.s : init, z = viewStart(b);
        const fits = Array.isArray(z) ? Array.isArray(s) && (M === "seq" || M === "pick" || s.length === z.length) : s !== undefined;
        if (fits) st = s;
        if (b.more && Array.isArray(init.m) && init.m.length === b.more.length) mv = init.m;
        if (M === "seq" && b.path && !(st.length && same(st[0], b.start))) st = viewStart(b);
      }
    }
    const cur = () => (slip ? pick : b.more ? { s: st, m: mv } : st);

    const root = el("div", `hb hb-${b.type} hb-${M}${slip ? " hb-slip" : ""}${b.judge ? " hb-build" : ""}${replay ? " hb-replay" : ""}`);
    if (b.ask && !replay) { const p = el("p", "hb-ask"); p.innerHTML = b.ask; root.append(p); }
    const stage = el("div", "hb-stage");
    stage.style.aspectRatio = `${W} / ${H}`;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" });
    const deco = svgEl("g", {}), live = svgEl("g", {});
    svg.append(deco, live);
    stage.append(svg);
    const put = (node, x, y) => { node.style.left = px(x); node.style.top = py(y); stage.append(node); return node; };
    const tag = (cls, text, x, y) => put(el("span", cls, text), x, y);
    const line = (g, x1, y1, x2, y2, cls) => g.append(svgEl("line", { x1, y1, x2, y2, class: cls }));

    // ------------------------------------------------------------ scenery --
    const mid = "hba" + ++uid, edgeEls = {};
    if (b.directed) {
      const defs = svgEl("defs", {}), mk = svgEl("marker", { id: mid, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 12, markerHeight: 12, orient: "auto-start-reverse", markerUnits: "userSpaceOnUse" });
      mk.append(svgEl("path", { d: "M0 0 L10 5 L0 10 z", class: "hb-ah" }));
      defs.append(mk);
      svg.prepend(defs);
    }
    lay.edges.forEach((e, i) => {
      const a = e.a || lay.pos[e.u], z = e.end || lay.pos[e.v];
      const d = e.c ? `M${a[0]} ${a[1]} Q${e.c[0]} ${e.c[1]} ${z[0]} ${z[1]}` : `M${a[0]} ${a[1]} L${z[0]} ${z[1]}`;
      const p = svgEl("path", { d, class: "hb-e" });
      if (b.directed) p.setAttribute("marker-end", `url(#${mid})`);
      deco.append(p);
      edgeEls[e.u + ">" + e.v] = p;
      edgeEls["#" + i] = p;
      if (!b.directed) edgeEls[e.v + ">" + e.u] = p;
      if (e.w != null && b.on !== "edges") tag("hb-w", String(e.w), e.mid[0], e.mid[1]);
    });
    if (b.type === "graph" && b.on === "edges") for (const n of b.nodes) tag("hb-nd", String(n), lay.pos[n][0], lay.pos[n][1]);
    if (b.type === "grid") {
      (b.colNames || []).forEach((t, c) => tag("hb-ix hb-hd", String(t), lay.x0 + (c + 0.5) * lay.cw, 6));
      (b.rowNames || []).forEach((t, r) => tag("hb-ix hb-hd hb-rh", String(t), lay.x0 - 10, lay.y0 + (r + 0.5) * lay.cw));

    }
    if (b.type === "intervals") {
      const every = b.hi - b.lo > 24 ? 5 : b.hi - b.lo > 12 ? 2 : 1;
      line(deco, lay.x0, lay.axisY, lay.x1, lay.axisY, "hb-axis");
      for (let v = b.lo; v <= b.hi; v++) {
        line(deco, lay.X(v), lay.top, lay.X(v), lay.axisY, v % every ? "hb-gl hb-faint" : "hb-gl");
        if (!(v % every)) tag("hb-ix", String(v), lay.X(v), lay.axisY + 6);
      }
    }
    if (b.type === "line") {
      const st0 = b.step || 1, every = b.labelEvery || st0 * Math.ceil((b.hi - b.lo) / st0 / 10);
      line(deco, lay.x0, lay.y, lay.x1, lay.y, "hb-axis");
      for (let v = b.lo; v <= b.hi; v += st0) {
        const big = !((v - b.lo) % every);
        line(deco, lay.X(v), lay.y - (big ? 7 : 4), lay.X(v), lay.y + (big ? 7 : 4), "hb-tick");
        if (big) tag("hb-ix", String(v), lay.X(v), lay.y + 12);
      }
      for (const [v, t] of b.pts || []) { deco.append(svgEl("circle", { cx: lay.X(v), cy: lay.y, r: 5, class: "hb-pt" })); if (t != null) tag("hb-ix hb-pl", String(t), lay.X(v), lay.y - 26); }
    }
    if (b.type === "plot") {
      const span = b.hi - b.lo, every = span > 20 ? 5 : span > 10 ? 2 : 1;
      for (let v = b.lo; v <= b.hi; v++) if (!((v - b.lo) % every)) { line(deco, lay.x0 - 6, lay.Y(v), lay.x1 + 8, lay.Y(v), v === b.lo ? "hb-axis" : "hb-gl"); tag("hb-ix hb-yl", String(v), lay.x0 - 16, lay.Y(v) - 7); }
      b.xs.forEach((t, k) => { line(deco, lay.X(k), lay.top, lay.X(k), lay.bot, "hb-gl hb-faint"); tag("hb-ix", String(t), lay.X(k), lay.bot + 8); });
      if (b.yName) tag("hb-ix hb-yn", b.yName, lay.x0 - 16, lay.top - 16);
      if (replay && Array.isArray(opts.mine) && opts.mine.length === b.xs.length && opts.mine.some((v) => v != null)) {
        const pts = opts.mine.map((v, k) => (v == null ? null : `${lay.X(k)},${lay.Y(v)}`)).filter(Boolean);
        deco.append(svgEl("polyline", { class: "hb-mine", points: pts.join(" ") }));
        tag("hb-ix hb-mn", "your sketch", lay.x1 - 40, lay.top - 16);
      }
    }
    const shape = b.type === "bst" ? bstOf(b.solve.map((i) => b.keys[i])) : null;
    if (shape) for (const k of b.keys) {
      const [x, y] = [lay.X(k), lay.Y(shape.depth[k])];
      deco.append(svgEl("circle", { cx: x, cy: y, r: 22, class: "hb-ghost" }));
      for (const c of [shape.left[k], shape.right[k]]) if (c != null) line(deco, x, y, lay.X(c), lay.Y(shape.depth[c]), "hb-ghost-e");
    }

    // -------------------------------------------------------------- items --
    const items = {}, inputs = {}, marks = {}, liveTags = [];
    const isWall = (id) => b.type === "grid" && b.vals && b.vals[id] === "#";
    ids.forEach((id) => {
      const it = el("button", "hb-it");
      it.type = "button";
      const tx = el("span", "hb-tx", textOf(b, id));
      it.append(tx);
      it.dataset.id = String(id);
      it.setAttribute("aria-label", b.type === "array" || b.type === "grid" ? `Cell ${id}${textOf(b, id) ? ", " + textOf(b, id) : ""}` : b.type === "plot" ? `Point ${b.xs[id]}` : b.type === "line" ? "The pin" : textOf(b, id) || `Edge ${id}`);
      const [x, y] = ipos[id];
      if (b.type === "array") it.style.width = px(lay.cw * 0.86);
      else if (b.type === "grid") it.style.width = px(lay.cw - 5);
      else if (b.type === "graph" && b.on === "edges") { it.classList.add("hb-eb"); it.style.width = `max(26px, ${px(34)})`; }
      else if (b.type === "intervals") { it.style.width = px(lay.X(b.spans[id][1]) - x); it.style.height = py(lay.rowH * 0.72); }
      else if (b.type === "line") it.style.width = `max(34px, ${px(46)})`;
      else if (b.type === "plot") it.style.width = `max(16px, ${px(18)})`;
      else if (b.type === "bst") it.style.width = `max(34px, ${px(46)})`;
      else it.style.width = `max(34px, ${px(lay.size)})`;
      if (replay || slip) it.tabIndex = -1;
      if (isWall(id)) { it.classList.add("wall"); it.disabled = true; }
      if ((b.voids || []).some((v) => same(v, id))) { it.classList.add("void"); it.disabled = true; }
      if (lockSet.has(String(id))) { it.classList.add("lock"); if (!replay) it.disabled = true; }
      if (fixSet.has(String(id))) it.classList.add("fix");
      if ((b.dots || []).some((v) => same(v, id))) it.classList.add("dot");
      if ((b.water || []).some((v) => same(v, id))) it.classList.add("water");
      if ((b.roots || []).some((v) => same(v, id))) it.classList.add("root");
      if (b.goal != null && same(b.goal, id)) it.classList.add("goal");
      if (b.type === "grid" && b.start != null && same(b.start, id)) it.classList.add("start");
      if (M === "label" && b.type === "grid" && (blanks(b).some((v) => same(v, id)) || (b.given && b.given[id] != null))) {
        if (tx.textContent) it.append(el("span", "hb-sub", tx.textContent));
        tx.textContent = b.given && b.given[id] != null ? String(b.given[id]) : "";
      }
      items[id] = it;
      put(it, x, y);
      if (b.type === "array") tag("hb-ix", String(id), x, y + lay.cw * 0.43 + 6);
      if (b.type === "array" || b.type === "graph" || b.type === "tree") marks[id] = tag("hb-mk", "", x, b.type === "array" ? y + lay.cw * 0.43 + 30 : y - R - 14);
    });
    if (M === "label") blanks(b).forEach((id) => {
      const [x, y] = ipos[id];
      const inp = el("input", "hb-in");
      inp.type = "text"; inp.autocomplete = "off"; inp.spellcheck = false; inp.placeholder = "?";
      inp.setAttribute("aria-label", `Your value for ${b.type === "graph" || b.type === "tree" ? textOf(b, id) : "cell " + id}`);
      if (b.type === "grid") { inp.classList.add("hb-in-cell"); inp.style.width = px(lay.cw * 0.66); }
      if (b.type === "array") inp.style.width = px(Math.max(30, lay.cw * 0.86));
      if (replay) { inp.readOnly = true; inp.tabIndex = -1; }
      inputs[id] = put(inp, x, b.type === "array" ? y + lay.cw * 0.43 + 34 : y);
    });
    const over = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true", class: "hb-over" });
    stage.append(over);
    root.append(stage);
    const moreRow = el("div", "hb-more"), moreIns = [];
    (b.more || []).forEach((m, i) => {
      const lab = el("label", "hb-mo");
      lab.append(el("span", "", m.label));
      const inp = el("input", "hb-in hb-in-more");
      inp.type = "text"; inp.autocomplete = "off"; inp.spellcheck = false; inp.placeholder = "?";
      if (replay) { inp.readOnly = true; inp.tabIndex = -1; }
      lab.append(inp);
      moreIns[i] = inp;
      moreRow.append(lab);
    });
    if (b.more) root.append(moreRow);
    const strip = el("div", "hb-strip"), note = el("p", "hb-note");
    root.append(strip, note);
    const film = el("div", "hb-film"), frames = [];
    if (slip) {
      film.append(el("span", "hb-sn", "frames"));
      steps.forEach((_, k) => {
        const f = el("button", "hb-fr", String(k + 1));
        f.type = "button";
        f.setAttribute("aria-label", `Frame ${k + 1}`);
        f.onclick = () => { if (playing) return; if (!replay) { pick = k; changed(); } jumpTo(k); };
        frames.push(f);
        film.append(f);
      });
      root.append(film);
    }
    const foot = el("div", "hb-foot"), readout = el("span", "hb-read");
    foot.append(readout);
    root.append(foot);

    // ------------------------------------------------------------ painting --
    function place() { st.forEach((orig, slot) => { const [x, y] = lay.pos[slot]; items[orig].style.left = px(x); items[orig].style.top = py(y); }); }
    function clearLooks() {
      for (const id of ids) {
        const it = items[id];
        it.classList.remove("on", "hot", "dim", "pick", "in", "dup", "sel", "bin", "off", "fits", "miss");
        delete it.dataset.n; delete it.dataset.b; it.style.removeProperty("--bc");
        if (marks[id]) marks[id].textContent = "";
      }
      for (const k in edgeEls) edgeEls[k].classList.remove("hot", "now", "sel");
      live.textContent = "";
      over.textContent = "";
      liveTags.splice(0).forEach((t) => t.remove());
    }
    const colour = (it, k, label) => { it.classList.add("bin"); it.style.setProperty("--bc", BINC[k % BINC.length]); if (label != null) it.dataset.b = label; };
    const poly = (pts, cls, g) => (g || live).append(svgEl("polyline", { class: cls, points: pts.map((p) => p.join(",")).join(" ") }));
    function paint() {
      clearLooks();
      if (M === "seq") {
        if (b.path) { st.forEach((id, k) => k && items[id].classList.add("on")); poly(st.map((id) => ipos[id]), "hb-route", over); }
        else st.forEach((id, k) => { const it = items[id]; if (!it) return; it.classList.add("on"); it.dataset.n = k + 1; });
      }
      if (M === "arrange") { place(); if (picked != null) items[picked].classList.add("pick"); }
      if (M === "range" && st) for (let k = st[0]; k <= st[1]; k++) items[k].classList.add("in");
      if (M === "range" && st && b.unique) { const seen = {}; for (let k = st[0]; k <= st[1]; k++) (seen[b.vals[k]] = seen[b.vals[k]] || []).push(k); for (const v in seen) if (seen[v].length > 1) seen[v].forEach((k) => items[k].classList.add("dup")); }
      if (M === "label") blanks(b).forEach((id, k) => { if (inputs[id].value !== st[k]) inputs[id].value = st[k]; });
      if (M === "pick") st.forEach((id) => items[id] && items[id].classList.add("sel"));
      if ((M === "pick" || M === "seq") && b.on === "edges") st.forEach((id) => edgeEls["#" + id] && edgeEls["#" + id].classList.add("sel"));
      if (M === "bins") st.forEach((k, i) => k >= 0 && colour(items[ids[i]], k, b.bins[k]));
      if (M === "dial") {
        const it = items.pin, v = st == null ? b.lo : st, x = lay.X(v);
        it.style.left = px(x);
        it.querySelector(".hb-tx").textContent = st == null ? "?" : String(st);
        it.classList.toggle("off", st == null);
        line(live, x, lay.y - 22, x, lay.y, "hb-stem");
        if (!replay && b.peek) note.innerHTML = st == null ? "" : b.peek[st] || "";
      }
      if (M === "sketch") {
        const pts = [];
        st.forEach((v, k) => { const it = items[k]; it.style.top = py(v == null ? lay.bot : lay.Y(v)); it.classList.toggle("off", v == null); if (v != null) pts.push([lay.X(k), lay.Y(v)]); });
        if (pts.length > 1) poly(pts, "hb-sk");
      }
      for (const id in tint) if (items[id]) colour(items[id], tint[id]);
      for (const id of conflicts(b, st)) items[id] && items[id].classList.add("dup");
      if (b.type === "bst") drawBuilt();
      if (b.arcs) drawArcs();
      if (b.poly) over.append(svgEl("polygon", { class: "hb-poly", points: b.poly.map(([x, y]) => `${lay.x0 + x * lay.cw},${lay.y0 + y * lay.cw}`).join(" ") }));
      if (b.route && Array.isArray(st)) { const r = b.route(st); if (r) poly(r.map((id) => ipos[id]), "hb-route", over); }
      if (mv) mv.forEach((v, i) => { if (moreIns[i].value !== v) moreIns[i].value = v; });
      if (!replay) readOut();
    }
    function drawBuilt() {
      const keys = st.map((i) => b.keys[i]), t = bstOf(keys);
      for (const k of keys) {
        const x = lay.X(k), y = lay.Y(t.depth[k]);
        for (const c of [t.left[k], t.right[k]]) if (c != null) line(live, x, y, lay.X(c), lay.Y(t.depth[c]), "hb-e hb-built");
        const fits = t.depth[k] === shape.depth[k];
        const n = tag("hb-nd hb-bn " + (fits ? "fits" : "miss"), String(k), x, y);
        liveTags.push(n);
      }
    }
    function drawArcs() {
      // every pair that's out of order, as an arc over the tiles: bubble sort swaps exactly once per arc
      const v = st.map((i) => b.vals[i]);
      for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (v[i] > v[j]) {
        const [x1, y] = lay.pos[i], [x2] = lay.pos[j], top = y - lay.cw * 0.5;
        live.append(svgEl("path", { class: "hb-arc", d: `M${x1} ${top} Q${(x1 + x2) / 2} ${top - 14 - (x2 - x1) * 0.28} ${x2} ${top}` }));
      }
    }
    function readOut() {
      readout.textContent = "";
      const ans = answerOf(b, cur());
      let say;
      if (slip) say = pick == null ? "Tap the frame where it goes wrong." : `You say frame ${pick + 1} is the slip. `;
      else if (b.judge) {
        const out = st != null && complete(b, st) ? b.judge(st) : null;
        if (out == null) say = b.need || "";
        else { say = "With yours it prints "; readout.append(say, el("code", "", out), out === String(b.target) ? el("span", "hb-yes", " ✓ that's the one") : ""); say = null; }
      } else if (M === "range" && st) say = `${b.emit === "len" ? "Your stretch is " + (st[1] - st[0] + 1) + " long" : "Your stretch adds up to " + sumOf(b, st[0], st[1])}${b.unique && root.querySelector(".dup") ? ", but a letter repeats in it" : ""}.`;
      else if (M === "label" && baseAnswer(b, st) == null) say = `${st.filter((x) => clean(x)).length} of ${st.length} written.`;
      else if (M === "bins" && baseAnswer(b, st) == null) say = `${st.filter((k) => k >= 0).length} of ${st.length} coloured. Tap one to change its colour.`;
      else if (M === "sketch" && baseAnswer(b, st) == null) say = `${st.filter((v) => v != null).length} of ${st.length} points drawn. Drag across the chart.`;
      else if (M === "seq" && b.path && !ans) say = "Walk to the ringed square.";
      else if (b.more && baseAnswer(b, st) != null && !ans) say = "Now fill in the box" + (b.more.length > 1 ? "es" : "") + " below.";
      else say = ans ? "Your answer: " : M === "seq" || M === "pick" ? "Nothing tapped yet." : M === "dial" ? "Drag the pin along the line." : "";
      if (say != null) readout.append(say);
      if (ans && !slip && !b.judge && M !== "range") readout.append(el("code", "", ans));
      if (JSON.stringify(cur()) !== JSON.stringify(startOf(b))) {
        const again = el("button", "hb-word", "start over");
        again.type = "button";
        again.onclick = () => { st = viewStart(b); if (mv) mv = b.more.map(() => ""); pick = null; picked = null; if (slip) jumpTo(0, true); else paint(); changed(); };
        readout.append(" ", again);
      }
    }
    const changed = () => { if (!replay) { readOut(); if (opts.onChange) opts.onChange(clone(cur()), answerOf(b, cur())); } };

    // ---------------------------------------------------------- answering --
    const hit = (e) => { const it = e.target.closest(".hb-it"); return it && !it.disabled ? ids[idx(it.dataset.id)] : undefined; };
    if (!replay && !slip) {
      if (M === "seq") stage.addEventListener("click", (e) => {
        const id = hit(e); if (id === undefined) return;
        const k = st.findIndex((x) => same(x, id));
        if (b.path) {
          if (k >= 0) st = st.slice(0, k + 1);
          else if (near4(b, st[st.length - 1], id)) st = st.concat([id]);
          else { items[id].classList.remove("nope"); void items[id].offsetWidth; items[id].classList.add("nope"); return; }
        } else st = k >= 0 ? st.slice(0, k) : st.concat([id]);
        paint(); changed();
      });
      if (M === "arrange") stage.addEventListener("click", (e) => {
        const orig = hit(e); if (orig === undefined) return;
        if (picked == null) picked = orig;
        else if (picked === orig) picked = null;
        else { const i = st.indexOf(picked), j = st.indexOf(orig); [st[i], st[j]] = [st[j], st[i]]; picked = null; changed(); }
        paint();
      });
      if (M === "pick") stage.addEventListener("click", (e) => {
        const id = hit(e); if (id === undefined) return;
        const k = st.findIndex((x) => same(x, id));
        if (k >= 0) st.splice(k, 1);
        else { st.push(id); if (b.limit && st.length > b.limit) st.shift(); }
        paint(); changed();
      });
      if (M === "bins") stage.addEventListener("click", (e) => {
        const id = hit(e); if (id === undefined) return;
        const i = idx(id);
        st[i] = st[i] + 1 >= b.bins.length ? -1 : st[i] + 1;
        paint(); changed();
      });
      if (M === "label") blanks(b).forEach((id, k) => {
        inputs[id].addEventListener("input", () => { st[k] = inputs[id].value; readOut(); changed(); });
        inputs[id].addEventListener("keydown", (e) => { if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) { e.preventDefault(); const nx = inputs[blanks(b)[k + 1]] || moreIns[0]; if (nx) nx.focus(); } });
      });
      if (M === "range") {
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
          if (e.key !== "Enter" && e.key !== " ") return;
          const it = e.target.closest(".hb-it"); if (!it) return;
          e.preventDefault();
          const k = +it.dataset.id;
          st = st && st[0] === st[1] && st[0] !== k ? [Math.min(st[0], k), Math.max(st[0], k)] : [k, k];
          paint(); changed();
        });
      }
      if (M === "dial" || M === "sketch") {
        // press anywhere on the chart and drag; the keyboard nudges with the arrows
        const at = (e) => { const r = stage.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };
        const snapV = (x) => { const s = b.step || 1, v = b.lo + Math.round(((x - lay.x0) / (lay.x1 - lay.x0)) * (b.hi - b.lo) / s) * s; return Math.max(b.lo, Math.min(b.hi, v)); };
        const colAt = (x) => Math.max(0, Math.min(b.xs.length - 1, Math.round(((x - lay.x0) / (lay.x1 - lay.x0)) * (b.xs.length - 1))));
        const valAt = (y) => Math.max(b.lo, Math.min(b.hi, Math.round(b.lo + ((lay.bot - y) / (lay.bot - lay.top)) * (b.hi - b.lo))));
        let down = false, last = null;
        const drawTo = (e) => {
          const [x, y] = at(e);
          if (M === "dial") { st = snapV(x); paint(); return; }
          // each column takes the height where your stroke crosses its centre line; standing still over a column sets it
          const k = colAt(x), gap = (lay.x1 - lay.x0) / Math.max(1, b.xs.length - 1);
          if (!last || Math.abs(x - lay.X(k)) < gap * 0.3) st[k] = valAt(y);
          if (last && x !== last[0]) for (let j = 0; j < b.xs.length; j++) {
            const cx = lay.X(j);
            if (cx >= Math.min(x, last[0]) && cx <= Math.max(x, last[0])) st[j] = valAt(last[1] + ((y - last[1]) * (cx - last[0])) / (x - last[0]));
          }
          last = [x, y];
          paint();
        };
        stage.addEventListener("pointerdown", (e) => { e.preventDefault(); down = true; last = null; stage.setPointerCapture && stage.setPointerCapture(e.pointerId); drawTo(e); });
        stage.addEventListener("pointermove", (e) => down && drawTo(e));
        const up = () => { if (!down) return; down = false; changed(); };
        stage.addEventListener("pointerup", up);
        stage.addEventListener("pointercancel", up);
        stage.addEventListener("keydown", (e) => {
          const d = e.key === "ArrowUp" || e.key === "ArrowRight" ? 1 : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          if (M === "dial") st = Math.max(b.lo, Math.min(b.hi, (st == null ? b.lo : st) + d * (b.step || 1)));
          else { const it = e.target.closest(".hb-it"); if (!it) return; const k = +it.dataset.id; st[k] = Math.max(b.lo, Math.min(b.hi, (st[k] == null ? b.lo : st[k]) + (e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0))); if (e.key === "ArrowLeft" || e.key === "ArrowRight") { const nx = items[k + d]; if (nx) nx.focus(); } }
          paint(); changed();
        });
      }
      moreIns.forEach((inp, i) => {
        inp.addEventListener("input", () => { mv[i] = inp.value; changed(); });
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) { e.preventDefault(); if (moreIns[i + 1]) moreIns[i + 1].focus(); } });
      });
    }

    // ------------------------------------------------------- the film --
    function applyState(s) {
      if (s.swap) { const [i, j] = s.swap; [st[i], st[j]] = [st[j], st[i]]; }
      if (s.set && M === "label") for (const id in s.set) { const k = blanks(b).findIndex((x) => same(x, id)); if (k >= 0) st[k] = String(s.set[id]); }
      if (s.on) st = s.on.slice();
      if (s.put) for (const id in s.put) st[idx(id)] = s.put[id];
      if (s.val != null) st = s.val;
      if (s.path) st = s.path.slice();
      if (s.pts) for (const k in s.pts) st[+k] = s.pts[k];
      if (s.tint) Object.assign(tint, s.tint);
      if (s.more) for (const k in s.more) mv[+k] = String(s.more[k]);
      if (s.list) list = s.list;
      if (M === "seq" && !b.path && s.at != null) for (const id of [].concat(s.at)) if (!st.some((x) => same(x, id))) st.push(id);
    }
    function showTransient(s, k) {
      for (const id of [].concat(s.at == null ? [] : s.at)) items[id] && items[id].classList.add("hot");
      if (s.span) {
        ids.forEach((id) => { if (id < s.span[0] || id > s.span[1]) items[id].classList.add("dim"); });
        if (s.span[0] <= s.span[1]) { marks[s.span[0]].textContent = "lo"; marks[s.span[1]].textContent = s.span[0] === s.span[1] ? "lo hi" : "hi"; }
      }
      if (s.sel) for (let j = s.sel[0]; j <= s.sel[1]; j++) items[j].classList.add("in");
      if (s.swap) for (const j of s.swap) items[st[j]].classList.add("hot");
      if (s.set && M === "label") for (const id in s.set) { const inp = inputs[id]; if (inp) { inp.classList.remove("set"); void inp.offsetWidth; inp.classList.add("set"); } }
      for (const [u, v] of s.edges || []) { const p = edgeEls[u + ">" + v]; if (p) p.classList.add("hot", "now"); }
      strip.textContent = "";
      if (list) {
        strip.append(el("span", "hb-sn", b.listName || "list"));
        if (!list.length) strip.append(el("span", "hb-chip empty", "empty"));
        for (const x of list) strip.append(el("span", "hb-chip", String(x)));
      }
      note.innerHTML = (s.note || "") + (replay && slip && k === b.slip && b.slipWhy ? ` <span class="hb-why">${b.slipWhy}</span>` : "");
      frames.forEach((f, j) => { f.classList.toggle("cur", j === k); f.classList.toggle("mine", j === pick); f.classList.toggle("bad", replay && j === b.slip); });
    }
    function reset() { st = viewStart(b); if (mv) mv = b.more.map(() => ""); tint = {}; picked = null; list = null; strip.textContent = ""; note.textContent = ""; }
    function jumpTo(k) {
      reset();
      for (let i = 0; i < k; i++) applyState(steps[i]);
      applyState(steps[k]);
      paint();
      showTransient(steps[k], k);
    }
    let playing = false, btn = null;
    async function play() {
      if (playing) return;
      playing = true;
      if (btn) btn.disabled = true;
      reset(); paint();
      await wait(350);
      for (let k = 0; k < steps.length; k++) {
        if (!root.isConnected) break;
        applyState(steps[k]); paint(); showTransient(steps[k], k);
        await wait(steps[k].wait || 1000);
      }
      if (root.isConnected) {
        if (slip) { if (pick != null && !replay) jumpTo(pick); }
        else {
          // the last picture: the right answer, left on the board
          st = clone(viewSolve(b));
          if (mv) mv = b.more.map((m) => String(m.solve));
          paint();
        }
      }
      playing = false;
      if (btn) { btn.disabled = false; btn.textContent = slip && !replay ? "▶ Play it again" : "▶ Watch it again"; }
    }
    if (replay || slip) {
      btn = el("button", "hb-word hb-play", slip && !replay ? "▶ Play the run" : "▶ Watch it run");
      btn.type = "button";
      btn.onclick = play;
      foot.append(btn);
      if (replay) { for (const id of ids) items[id].disabled = false; stage.classList.add("still"); }
      if (opts.autoplay) setTimeout(() => root.isConnected && play(), 500);
    }
    if (slip) jumpTo(pick == null ? 0 : pick);
    else paint();
    return { el: root, play };
  }

  const API = { W, idsOf, startOf, solveOf, answerOf, layout, lint, applySwaps, bstOf, preorder, conflicts };
  if (typeof document !== "undefined") API.mount = mount;
  if (typeof module === "object" && module.exports) module.exports = API;
  else root.HANDS = API;
})(this);
