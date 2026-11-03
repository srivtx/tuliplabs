/* DSA, chapter 53: maximum flow.
   A small pipe network from s to t. Each pipe has a capacity; push as much as possible through.
   The "why": the obvious method (find any path with room, fill it, repeat) can choose badly and get
   stuck. Here it sends water through the middle pipe a → b and blocks both straight routes, so it
   stops at 3 when 5 is possible. Ford-Fulkerson adds an undo edge for every pipe: flow sent a → b can
   be pushed back b → a, rerouting it. With undo edges, "no path left" really means the maximum, and
   the full pipes at that point form a minimum cut. */
VIZ.register("ds-flow", async (api) => {
  const W = await api.world3d();
  const NAMES = ["s", "a", "b", "c", "t"], P = [[-4, 0], [-0.6, 1.8], [-0.6, -0.4], [-0.6, -2.4], [3.4, 0]];
  const E = [[0, 1, 2], [1, 2, 2], [1, 4, 2], [0, 2, 2], [2, 4, 2], [0, 3, 1], [3, 4, 1]];
  let mode = "greedy", gen = null, flow = [], total = 0, path = [], back = new Set(), paths = 0, running = false, ran = {}, reached = false, line = "";
  function find(undo) {
    // depth-first, trying pipes in the order listed (that's what makes the greedy one choose badly)
    const seen = new Set(), st = [[0, []]];
    while (st.length) {
      const [v, p] = st.pop();
      if (seen.has(v)) continue;
      seen.add(v);
      if (v === 4) return p;
      const opts = [];
      E.forEach(([a, b, c], i) => {
        if (a === v && flow[i] < c && !seen.has(b)) opts.push([b, [...p, [i, 1]]]);
        if (undo && b === v && flow[i] > 0 && !seen.has(a)) opts.push([a, [...p, [i, -1]]]);
      });
      for (const o of opts.reverse()) st.push(o);
    }
    return null;
  }
  function* run(undo) {
    while (true) {
      const p = find(undo);
      if (!p) break;
      const push = Math.min(...p.map(([i, d]) => (d > 0 ? E[i][2] - flow[i] : flow[i])));
      for (const [i, d] of p) flow[i] += d * push;
      total += push; paths++; path = p; back = new Set(p.filter(([, d]) => d < 0).map(([i]) => i));
      const nodes = [0, ...p.map(([i, d]) => (d > 0 ? E[i][1] : E[i][0]))].map((v) => NAMES[v]).join(" → ");
      yield `path ${paths}: ${nodes}, push ${push}${back.size ? ` (the ${[...back].map((i) => NAMES[E[i][1]] + "→" + NAMES[E[i][0]]).join(", ")} step undoes earlier flow)` : ""}. Total ${total}`;
    }
    path = []; back = new Set();
    yield undo ? `no path left, even with undo edges: ${total} is the maximum. The full pipes out of {s${reachable().map((v) => ", " + NAMES[v]).join("")}} form the minimum cut` : `no path with room left: stuck at ${total}`;
  }
  function reachable() {
    const seen = new Set([0]), st = [0];
    while (st.length) { const v = st.pop(); E.forEach(([a, b, c], i) => { if (a === v && flow[i] < c && !seen.has(b)) { seen.add(b); st.push(b); } if (b === v && flow[i] > 0 && !seen.has(a)) { seen.add(a); st.push(a); } }); }
    return [...seen].filter((v) => v !== 0);
  }
  function draw() {
    for (let v = 0; v < 5; v++) W.box("n" + v, { x: P[v][0], y: P[v][1], z: 0, sx: 0.6, sy: 0.6, sz: 0.6, color: v === 0 || v === 4 ? "c4" : "c5", opacity: 0.95, label: NAMES[v], labelSize: 0.3, labelUp: 0,
      info: { title: NAMES[v] === "s" ? "The source" : NAMES[v] === "t" ? "The sink" : `Junction ${NAMES[v]}`, html: `<p>${NAMES[v] === "s" ? "Everything flows out of here." : NAMES[v] === "t" ? "Everything flows into here." : "What comes in must go out: flow is conserved."}</p>` } });
    const onPath = new Set(path.map(([i]) => i));
    E.forEach(([a, b, c], i) => {
      const full = flow[i] === c, col = back.has(i) ? "c4" : onPath.has(i) ? "c1" : full ? "c3" : flow[i] ? "c2" : "line";
      W.line("e" + i, "n" + a, "n" + b, { color: col });
      const mx = P[a][0] + (P[b][0] - P[a][0]) * 0.5, my = P[a][1] + (P[b][1] - P[a][1]) * 0.5;
      W.box("m" + i, { x: mx, y: my, z: 0.1, sx: 0.62, sy: 0.32, sz: 0.1, color: col === "line" ? "c5" : col, opacity: 0.9, label: `${flow[i]}/${c}`, labelSize: 0.2, labelUp: 0,
        info: { title: `Pipe ${NAMES[a]} → ${NAMES[b]}`, html: `<p>Carrying ${flow[i]} of ${c}.</p><p>Its undo edge ${NAMES[b]} → ${NAMES[a]} has room ${flow[i]}: a later path may push flow back, which reroutes what came in.</p>` } });
      // a small block near the head shows the pipe's direction
      W.box("h" + i, { x: P[a][0] + (P[b][0] - P[a][0]) * 0.8, y: P[a][1] + (P[b][1] - P[a][1]) * 0.8, z: 0, sx: 0.14, sy: 0.14, sz: 0.14, color: col === "line" ? "c5" : col, opacity: 0.9 });
    });
  }
  function show() { api.status(`${mode === "greedy" ? "fill any path, no undo" : "with undo edges (Ford-Fulkerson)"} · flow ${total} · ${paths} path${paths === 1 ? "" : "s"}\n${line}`); }
  function reset() { flow = E.map(() => 0); total = 0; path = []; back = new Set(); paths = 0; line = ""; gen = run(mode === "undo"); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = total;
    if (mode === "greedy") api.explain(`Stuck at ${total}`, `<p>The first path took the middle pipe a → b, so both straight routes lost their room. No path has room left, but more water could flow.</p><p>Switch to <b>with undo edges</b> and run it.</p>`);
    else if (ran.greedy !== undefined && !reached) { reached = true; api.explain("Undo edges fix bad choices", `<p>${total} against ${ran.greedy}. The second path went s → b → a → t, pushing the earlier a → b flow back. In effect it rerouted it straight down a → t.</p><p>When no path is left, the flow is the maximum, and it equals the capacity of the smallest cut that separates s from t.</p>`); api.done("You found the maximum flow"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(1300); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "fill any path, no undo", value: "greedy" }, { label: "with undo edges", value: "undo" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [-0.3, -0.2, 0], dist: 11.5, theta: 0, phi: 1.5, instant: true });
  api.hud("pipes show flow/capacity · red = this step's path · amber = flow pushed back along an undo edge · green = full");
  reset();
  api.explain("How to read this", `<p>Send as much as possible from <b>s</b> to <b>t</b>. <b>Run all</b> with <b>fill any path, no undo</b>, then with <b>with undo edges</b>.</p>`);
});
