/* DSA, chapter 25: minimum spanning trees with Kruskal's algorithm.
   Eight villages, sixteen possible fibre cables with costs. Connect every village as cheaply as possible.
   The "why": "lay the cheapest cables until everyone is connected" sounds right, but without a check
   it pays for cables between villages that are already connected, which only make loops. Kruskal
   takes cables cheapest first and asks union-find (chapter 22) whether the two ends are already
   joined; if so, it skips the cable. The result is a tree: exactly n − 1 cables, minimum total. */
VIZ.register("ds-mst", async (api) => {
  const W = await api.world3d();
  const P = [[-6, 1.4], [-3.6, 2.6], [-4, -1.6], [-1, 0.2], [1.6, 2.6], [1.4, -2.2], [4.3, 1.4], [6.2, -1.6]];
  const C = [[0, 1, 3], [0, 2, 4], [1, 2, 2], [1, 3, 5], [2, 3, 3], [3, 4, 6], [1, 4, 7], [3, 5, 2], [2, 5, 3], [4, 6, 3], [5, 6, 7], [4, 5, 6], [6, 7, 2], [4, 7, 3], [0, 3, 4], [5, 7, 8]];
  const S = [...C].sort((a, b) => a[2] - b[2]);
  let mode = "greedy", gen = null, cost = 0, laid = new Map(), cur = null, par = [], groups = 8, running = false, ran = {}, reached = false, line = "";
  const find = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  function* run() {
    for (const c of S) {
      if (groups === 1) break;
      const [a, b, w] = c, ra = find(a), rb = find(b); cur = c;
      if (ra === rb) {
        if (mode === "greedy") { laid.set(c, "waste"); cost += w; yield `cable ${a}–${b} (${w}): cheapest left, lay it. But ${a} and ${b} were already connected: wasted`; }
        else { laid.set(c, "skip"); yield `cable ${a}–${b} (${w}): find(${a}) = find(${b}), already connected. Skip it`; }
        continue;
      }
      par[ra] = rb; groups--; cost += w; laid.set(c, "tree");
      yield `cable ${a}–${b} (${w}): joins two separate groups, lay it. ${groups} group${groups === 1 ? "" : "s"} left`;
    }
    cur = null;
    yield `every village is connected: ${[...laid.values()].filter((t) => t !== "skip").length} cables, total ${cost}`;
  }
  function draw() {
    const root = (v) => find(v);
    P.forEach(([x, y], v) => W.box("v" + v, { x, y, z: 0, sx: 0.8, sy: 0.8, sz: 0.6, color: cur && (cur[0] === v || cur[1] === v) ? "c1" : groups === 1 ? "c3" : ["c2", "c4", "c5", "c2", "c4", "c5", "c2", "c4"][root(v)], glow: cur && (cur[0] === v || cur[1] === v) ? 0.4 : 0, opacity: 0.95,
      label: String(v), labelSize: 0.3, labelUp: 0,
      info: { title: `Village ${v}`, html: `<p>Possible cables: ${C.filter(([a, b]) => a === v || b === v).map(([a, b, w]) => `to ${a === v ? b : a} (${w})`).join(", ")}.</p>` } }));
    for (const c of C) {
      const [a, b, w] = c, k = `c${a}_${b}`, t = laid.get(c);
      W.line(k, "v" + a, "v" + b, { color: c === cur ? "c1" : t === "tree" ? "c3" : t === "waste" ? "bad" : t === "skip" ? "muted" : "line" });
      W.label("w" + k, String(w), [(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2 + 0.25, 0.4], { color: t === "tree" ? "c3" : t === "waste" ? "bad" : "muted", size: t === "tree" || t === "waste" ? 0.32 : 0.24 });
    }
  }
  function show() { api.status(`${mode === "greedy" ? "cheapest first, no check" : "Kruskal + union-find"} · ${[...laid.values()].filter((t) => t !== "skip").length} cables laid · cost ${cost} · ${groups} group${groups === 1 ? "" : "s"}\n${line}`); }
  function reset() { cost = 0; laid = new Map(); cur = null; par = [...Array(8).keys()]; groups = 8; line = ""; gen = run(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = cost;
    if (mode === "greedy") api.explain(`Cost ${cost}`, `<p>Cheapest first was a good instinct, but the red cables joined villages that were already linked. They formed loops and added nothing.</p><p>Switch to <b>Kruskal + union-find</b> and run it.</p>`);
    else if (ran.greedy && !reached) { reached = true; api.explain("Skip cables that close a loop", `<p>Kruskal: cost ${cost} with 7 cables, against ${ran.greedy}. Union-find answers "already connected?" in almost O(1), so the whole thing is O(E log E) for the sort.</p><p>The result is a <b>minimum spanning tree</b>: n − 1 edges, no cycles, smallest total. Taking the cheapest safe edge is always right: that's the <b>cut property</b>.</p>`); api.done("You built a minimum spanning tree"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(550); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "cheapest first, no check", value: "greedy" }, { label: "Kruskal + union-find", value: "kruskal" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.3, 0], dist: 19, theta: 0, phi: 1.5, instant: true });
  api.hud("numbers = cable costs · box colour = which group a village is in · green cable = laid and useful · red = laid but wasted · faint = skipped");
  reset();
  api.explain("How to read this", `<p>Connect all eight villages with fibre for the least money. <b>Run all</b> with <b>cheapest first, no check</b>, then with <b>Kruskal + union-find</b>.</p>`);
});
