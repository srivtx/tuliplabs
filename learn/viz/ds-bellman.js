/* DSA, chapter 24: Bellman-Ford handles negative edges; Dijkstra doesn't.
   One-way roads with costs; one road B → A pays you 5 (a rebate), a negative weight. Cheapest S to T?
   The "why": Dijkstra settles A at cost 2 before it ever looks at B, then refuses to revisit A when
   the rebate road would bring it down to 1, so it reports T = 7 when 6 is possible. Bellman-Ford
   makes no promises early: it relaxes EVERY edge, round after round. After round i, every route
   of at most i edges is accounted for, so V − 1 rounds always suffice: O(V · E). A change in round
   V means a negative cycle. */
VIZ.register("ds-bellman", async (api) => {
  const W = await api.world3d();
  const P = { S: [-6, 0], A: [-2, 1.9], B: [-2, -1.9], C: [2, 1.9], D: [2, -1.9], T: [6, 0] };
  const E = [["S", "A", 2], ["S", "B", 6], ["B", "A", -5], ["A", "C", 3], ["C", "T", 2], ["B", "D", 4], ["D", "T", 3], ["A", "D", 6]];
  let mode = "dij", gen = null, relax = 0, dist = {}, settled = new Set(), cur = null, edge = null, round = 0, running = false, ran = {}, reached = false, line = "";
  function* dijkstra() {
    dist = { S: 0 }; const heap = [[0, "S"]];
    while (heap.length) {
      heap.sort((x, y) => x[0] - y[0]);
      const [d, v] = heap.shift();
      if (settled.has(v)) continue;
      settled.add(v); cur = v; edge = null;
      yield `settle ${v} at ${d}: it's the cheapest unsettled place, so Dijkstra calls it final`;
      for (const [a, b, w] of E) if (a === v) {
        edge = [a, b]; relax++;
        if (settled.has(b)) { yield `road ${a} → ${b} (${w}): would make ${b} ${d + w}, but ${b} is already settled. Ignored!`; continue; }
        if (!(b in dist) || d + w < dist[b]) { dist[b] = d + w; heap.push([d + w, b]); yield `road ${a} → ${b} (${w}): ${b} improves to ${d + w}`; }
        else yield `road ${a} → ${b} (${w}): ${d + w} is no better than ${dist[b]}`;
      }
    }
    cur = null; edge = null;
    yield `done: T = ${dist.T}`;
  }
  function* bellman() {
    dist = { S: 0 };
    for (round = 1; round < Object.keys(P).length; round++) {
      let changed = false;
      for (const [a, b, w] of E) {
        edge = [a, b]; relax++; cur = b;
        if (a in dist && (!(b in dist) || dist[a] + w < dist[b])) { dist[b] = dist[a] + w; changed = true; yield `round ${round}, road ${a} → ${b} (${w}): ${b} improves to ${dist[b]}`; }
        else yield `round ${round}, road ${a} → ${b} (${w}): ${a in dist ? "no improvement" : `${a} not reached yet`}`;
      }
      if (!changed) { cur = null; edge = null; yield `round ${round}: nothing changed, so nothing ever will. Stop early`; break; }
    }
    cur = null; edge = null;
    yield `done: T = ${dist.T}`;
  }
  function draw() {
    for (const v in P) W.box("n" + v, { x: P[v][0], y: P[v][1], z: 0, sx: 0.9, sy: 0.9, sz: 0.6, color: v === cur ? "c1" : settled.has(v) ? "c2" : v in dist ? "c4" : "c5", glow: v === cur ? 0.4 : 0, opacity: 0.95,
      label: v in dist ? `${v}\n${dist[v]}` : v, labelSize: 0.26, labelUp: 0,
      info: { title: `Place ${v}`, html: `<p>Roads out: ${E.filter(([a]) => a === v).map(([, b, w]) => `${b} (${w})`).join(", ") || "none"}.</p>${v in dist ? `<p>Cheapest found so far: ${dist[v]}.</p>` : ""}` } });
    for (const [a, b, w] of E) {
      const k = `e${a}${b}`, on = edge && edge[0] === a && edge[1] === b;
      W.line(k, "n" + a, "n" + b, { color: on ? "c1" : w < 0 ? "bad" : "line" });
      const mx = (P[a][0] * 0.4 + P[b][0] * 0.6), my = (P[a][1] * 0.4 + P[b][1] * 0.6);
      W.label("w" + k, `${w} ${a === "B" && b === "A" ? "↑" : "›"}`, [mx + (a === "B" && b === "A" ? 0.45 : 0), my + 0.25, 0.4], { color: w < 0 ? "bad" : "muted", size: 0.26 });
    }
  }
  function show() { api.status(`${mode === "dij" ? "Dijkstra (settle once)" : "Bellman-Ford" + (round ? ` · round ${round}` : "")} · ${relax} relaxation${relax === 1 ? "" : "s"}${"T" in dist ? ` · T = ${dist.T}` : ""}\n${line}`); }
  function reset() { relax = 0; round = 0; dist = {}; settled = new Set(); cur = null; edge = null; line = ""; gen = mode === "dij" ? dijkstra() : bellman(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = dist.T;
    if (mode === "dij") api.explain(`T = ${dist.T}, and it's wrong`, `<p>Dijkstra settled A at 2 before it saw the rebate road B → A (−5). When the road could have made A cost 1, A was already "final", so the cheaper route S → B → A → C → T was never found.</p><p>Switch to <b>Bellman-Ford</b> and run it.</p>`);
    else if (ran.dij !== undefined && !reached) { reached = true; api.explain("Relax every road, every round", `<p>Bellman-Ford: T = ${dist.T}, against Dijkstra's ${ran.dij}. It never declares anything final early; it just relaxes all the roads again and again. After round i, every route of up to i roads is counted, so V − 1 rounds always suffice.</p><p>If round V still improves something, a loop of total negative cost exists and "cheapest" doesn't exist at all.</p>`); api.done("You handled a negative edge with Bellman-Ford"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(520); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "Dijkstra (settle once)", value: "dij" }, { label: "Bellman-Ford", value: "bf" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0, 0], dist: 18.5, theta: 0, phi: 1.5, instant: true });
  api.hud("one-way roads go left to right, except B → A (up) · the red road is a −5 rebate · red box = being updated · blue = settled by Dijkstra");
  reset();
  api.explain("How to read this", `<p>Find the cheapest way from <b>S</b> to <b>T</b>. One road has a negative cost. <b>Run all</b> with <b>Dijkstra</b>, then with <b>Bellman-Ford</b>.</p>`);
});
