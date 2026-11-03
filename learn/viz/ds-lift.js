/* DSA, chapter 47: lowest common ancestor with binary lifting.
   A tall tree: a spine of 20 nodes and two long branches. Questions: "where do the paths from these
   two nodes up to the root first meet?".
   The "why": walking up one parent at a time costs the depth, which can be n on a path-like tree.
   Binary lifting stores each node's 1st, 2nd, 4th, 8th… ancestor. Lift the deeper node to the same
   depth with one jump per set bit of the difference, then jump both together from the biggest power
   down, only when the jump lands on different nodes. Both phases are O(log n) jumps. */
VIZ.register("ds-lift", async (api) => {
  const W = await api.world3d();
  const par = [-1], pos = [];
  for (let i = 1; i < 20; i++) par.push(i - 1);                       // spine 0..19
  for (let j = 1; j <= 9; j++) par.push(j === 1 ? 4 : 19 + j - 1);    // branch A: 20..28 hangs off 4
  for (let j = 1; j <= 9; j++) par.push(j === 1 ? 9 : 28 + j - 1);    // branch B: 29..37 hangs off 9
  const N = par.length, LOG = 6, dep = [0];
  for (let v = 1; v < N; v++) dep[v] = dep[par[v]] + 1;
  for (let i = 0; i < 20; i++) pos[i] = [0, 4.3 - i * 0.45];
  for (let j = 1; j <= 9; j++) { pos[19 + j] = [-j * 0.48, pos[4][1] - j * 0.45]; pos[28 + j] = [j * 0.48, pos[9][1] - j * 0.45]; }
  const up = [par.map((p) => (p < 0 ? 0 : p))];
  for (let k = 1; k < LOG; k++) up[k] = up[k - 1].map((x) => up[k - 1][x]);
  const QS = [[19, 28], [37, 17], [28, 37], [15, 33], [26, 21]];
  let mode = "walk", gen = null, ops = 0, mark = {}, jump = null, answers = [], running = false, ran = {}, reached = false, line = "";
  function* walk() {
    for (let [u, v] of QS) {
      const q = `${u} and ${v}`; mark = { [u]: "c4", [v]: "c4" }; jump = null; yield `question: ${q}`;
      while (u !== v) {
        if (dep[u] < dep[v]) [u, v] = [v, u];
        const f = u; u = par[u]; ops++; mark[u] = "c1"; jump = [f, u]; yield `${q}: step ${f} up to its parent ${u}`;
      }
      answers.push(u); mark[u] = "c3"; jump = null; yield `${q} meet at ${u}`;
    }
    mark = {}; yield `${QS.length} questions with ${ops} single steps`;
  }
  function* lift() {
    for (let [u, v] of QS) {
      const q = `${u} and ${v}`; mark = { [u]: "c4", [v]: "c4" }; jump = null; yield `question: ${q} (depths ${dep[u]} and ${dep[v]})`;
      if (dep[u] < dep[v]) [u, v] = [v, u];
      const d = dep[u] - dep[v];
      for (let k = LOG - 1; k >= 0; k--) if ((d >> k) & 1) { const f = u; u = up[k][u]; ops++; mark[u] = "c1"; jump = [f, u]; yield `${q}: depth gap ${d}, so jump ${f} up 2^${k} = ${1 << k} to ${u}`; }
      if (u !== v) {
        for (let k = LOG - 1; k >= 0; k--) {
          ops++;
          if (up[k][u] !== up[k][v]) { const f = [u, v]; u = up[k][u]; v = up[k][v]; mark[u] = mark[v] = "c1"; jump = [f[0], u, f[1], v]; yield `${q}: 2^${k} up lands on different nodes, so both jump: ${f[0]}→${u}, ${f[1]}→${v}`; }
        }
        u = par[u];
      }
      answers.push(u); mark[u] = "c3"; jump = null; yield `${q} meet at ${u}`;
    }
    mark = {}; yield `${QS.length} questions with ${ops} jumps and checks`;
  }
  function draw() {
    for (let v = 0; v < N; v++) {
      const c = mark[v];
      W.box("n" + v, { x: pos[v][0], y: pos[v][1], z: 0, sx: 0.36, sy: 0.36, sz: 0.36, color: c || "c5", glow: c ? 0.35 : 0, opacity: c ? 0.95 : 0.75,
        label: String(v), labelSize: 0.2, labelUp: 0,
        info: { title: `Node ${v}`, html: `<p>Depth ${dep[v]}. Its ancestors 1, 2, 4, 8, 16 and 32 levels up: ${up.map((r) => r[v]).join(", ")}${dep[v] < 32 ? " (past the root, we stay at 0)" : ""}.</p><p>Six numbers per node is enough to reach any ancestor in at most six jumps, one per set bit of the distance.</p>` } });
      if (par[v] >= 0) W.line("e" + v, "n" + v, "n" + par[v], { color: "line" });
    }
    W.unline("j0"); W.unline("j1");
    if (jump) { W.line("j0", "n" + jump[0], "n" + jump[1], { color: "c1" }); if (jump.length > 2) W.line("j1", "n" + jump[2], "n" + jump[3], { color: "c1" }); }
  }
  function show() { api.status(`${mode === "walk" ? "walk up one step at a time" : "binary lifting"} · ${ops} ${mode === "walk" ? "steps" : "jumps and checks"}${answers.length ? ` · meeting points: ${answers.join(", ")}` : ""}\n${line}`); }
  function reset() { ops = 0; mark = {}; jump = null; answers = []; line = ""; gen = mode === "walk" ? walk() : lift(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = ops;
    if (mode === "walk") api.explain(`${ops} steps`, `<p>Each question climbed one parent at a time, as many steps as the nodes are deep. On a tree shaped like a long path that's O(n) per question.</p><p>Switch to <b>binary lifting</b> and run it.</p>`);
    else if (ran.walk && !reached) { reached = true; api.explain("Jump by powers of two", `<p>${ops} jumps and checks against ${ran.walk} steps. Each node keeps its ancestors 1, 2, 4, 8… levels up. Close the depth gap one set bit at a time, then try the biggest jump first and only take it if the two nodes would still differ.</p><p>O(log n) per question, after an O(n log n) table.</p>`); api.done("You used binary lifting"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(700); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "walk up one step at a time", value: "walk" }, { label: "binary lifting", value: "lift" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.9, 0], dist: 17.5, theta: 0, phi: 1.5, instant: true });
  api.hud("node 0 is the root at the top · amber = the two nodes asked about · red = where a step or jump landed (red line = the jump) · green = where the paths meet");
  reset();
  api.explain("How to read this", `<p>Five questions: where do two nodes' paths to the root first meet? <b>Run all</b> with <b>walk up one step at a time</b>, then with <b>binary lifting</b>.</p>`);
});
