/* DSA, chapter 23: Dijkstra's algorithm for weighted shortest paths.
   A small road map; each road shows its travel time. Get from A to H as fast as possible.
   The "why": breadth-first search finds the route with the fewest roads, which is the fastest
   only when every road takes the same time. Here the two-road route takes 17 minutes and a
   five-road route takes 8. Dijkstra always settles the closest unsettled place next (a heap gives
   it), and because times are never negative, nothing found later can beat a settled distance. */
VIZ.register("ds-dijkstra", async (api) => {
  const W = await api.world3d();
  const P = { A: [-6, 0], B: [-3.8, -1.9], C: [-1.3, -2.7], D: [1.2, -1.9], E: [0, 2.6], F: [3.7, -2.3], G: [1, 0.3], H: [6, 0] };
  const R = [["A", "E", 9], ["E", "H", 8], ["A", "B", 2], ["B", "C", 1], ["C", "D", 2], ["D", "F", 1], ["F", "H", 2], ["B", "G", 5], ["G", "E", 3], ["G", "H", 6], ["D", "G", 2]];
  const adj = {}; for (const v in P) adj[v] = [];
  for (const [a, b, w] of R) { adj[a].push([b, w]); adj[b].push([a, w]); }
  const ek = (a, b) => "r" + [a, b].sort().join("");
  let mode = "bfs", gen = null, steps = 0, dist = {}, par = {}, settled = new Set(), cur = null, edge = null, path = [], running = false, ran = {}, reached = false, line = "";
  const cost = () => path.slice(1).reduce((s, v, i) => s + R.find(([a, b]) => (a === v && b === path[i]) || (b === v && a === path[i]))[2], 0);
  function trace() { path = []; for (let v = "H"; v; v = par[v]) path.unshift(v); }
  function* bfs() {
    const q = ["A"]; dist.A = 0;
    while (q.length) {
      const v = q.shift(); cur = v; settled.add(v); steps++;
      if (v === "H") break;
      for (const [w] of adj[v]) if (!(w in dist)) { dist[w] = dist[v] + 1; par[w] = v; q.push(w); }
      yield `take ${v} (${dist[v]} road${dist[v] === 1 ? "" : "s"} from A); queue its new neighbours`;
    }
    cur = null; trace();
    yield `reached H in ${path.length - 1} roads: ${path.join(" → ")}, taking ${cost()} minutes`;
  }
  function* dijkstra() {
    const heap = [[0, "A"]]; dist.A = 0;
    while (heap.length) {
      heap.sort((x, y) => x[0] - y[0]);
      const [d, v] = heap.shift(); steps++;
      if (settled.has(v)) { yield `pop ${v} at ${d}: stale, ${v} is already settled at ${dist[v]}`; continue; }
      settled.add(v); cur = v; edge = null;
      if (v === "H") break;
      yield `pop ${v}: the closest unsettled place, ${d} minutes. Nothing later can beat it: settle it`;
      for (const [w, t] of adj[v]) {
        if (settled.has(w)) continue;
        edge = [v, w];
        if (!(w in dist) || d + t < dist[w]) { dist[w] = d + t; par[w] = v; heap.push([d + t, w]); yield `road ${v}–${w} (${t}): ${w} improves to ${d + t}`; }
        else yield `road ${v}–${w} (${t}): ${d + t} is no better than ${w}'s ${dist[w]}`;
      }
    }
    cur = null; edge = null; trace();
    yield `settled H at ${dist.H} minutes: ${path.join(" → ")}`;
  }
  function draw() {
    const onPath = new Set(path.slice(1).map((v, i) => ek(v, path[i])));
    for (const v in P) W.box("n" + v, { x: P[v][0], y: P[v][1], z: 0, sx: 0.9, sy: 0.9, sz: 0.6, color: path.includes(v) ? "c3" : v === cur ? "c1" : settled.has(v) ? "c2" : v in dist ? "c4" : "c5", glow: v === cur ? 0.4 : 0, opacity: 0.95,
      label: v in dist ? `${v}\n${dist[v]}${mode === "bfs" ? " hop" + (dist[v] === 1 ? "" : "s") : ""}` : v, labelSize: 0.24, labelUp: 0,
      info: { title: `Place ${v}`, html: `<p>Roads: ${adj[v].map(([w, t]) => `${w} (${t} min)`).join(", ")}.</p>${v in dist ? `<p>${mode === "bfs" ? `Reached after ${dist[v]} roads.` : `Best time found so far: ${dist[v]} min${settled.has(v) ? ", final" : ""}.`}</p>` : ""}` } });
    for (const [a, b, w] of R) {
      const k = ek(a, b), on = edge && ek(edge[0], edge[1]) === k;
      W.line(k, "n" + a, "n" + b, { color: onPath.has(k) ? "c3" : on ? "c1" : "line" });
      W.label("w" + k, String(w), [(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2 + 0.25, 0.4], { color: "muted", size: 0.26 });
    }
  }
  function show() { api.status(`${mode === "bfs" ? "breadth-first (fewest roads)" : "Dijkstra (least time)"} · ${steps} pop${steps === 1 ? "" : "s"}${path.length ? ` · route: ${path.length - 1} roads, ${cost()} minutes` : ""}\n${line}`); }
  function reset() { steps = 0; dist = {}; par = {}; settled = new Set(); cur = null; edge = null; path = []; line = ""; gen = mode === "bfs" ? bfs() : dijkstra(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = cost();
    if (mode === "bfs") api.explain(`Two roads, ${cost()} minutes`, `<p>Breadth-first found the route with the fewest roads. But roads aren't equal here: some take 9 minutes, some take 1.</p><p>Switch to <b>Dijkstra</b> and step through it: watch each place's best time drop.</p>`);
    else if (ran.bfs && !reached) { reached = true; api.explain("Settle the closest place next", `<p>Dijkstra: ${cost()} minutes over ${path.length - 1} roads, against ${ran.bfs} for the fewest-roads route.</p><p>It always settles the unsettled place with the smallest time. Since no road takes negative time, any other route to it would have to pass through a place that's even further away, so it can't be shorter. With a heap it runs in O((V + E) log V).</p>`); api.done("You found the fastest route with Dijkstra"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "bfs" ? 600 : 420); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "breadth-first (fewest roads)", value: "bfs" }, { label: "Dijkstra (least time)", value: "dij" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0, 0], dist: 19, theta: 0, phi: 1.5, instant: true });
  api.hud("numbers on roads = minutes · red = place being processed · amber = has a tentative time · blue = settled · green = the route found");
  reset();
  api.explain("How to read this", `<p>Get from <b>A</b> to <b>H</b> as fast as possible. <b>Run all</b> with <b>breadth-first</b>, then with <b>Dijkstra</b>, and compare the minutes.</p>`);
});
