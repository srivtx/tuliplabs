/* DSA, chapter 30: DP on a grid (minimum path sum).
   Walk from the top-left to the bottom-right of a 5 × 6 map, moving only right or down. Each square
   costs its number in effort. Find the cheapest route.
   The "why": greedy takes the cheaper of the two next squares, and its very first move (down, 1
   instead of right, 3) walks it into an expensive corner: 15. DP says the cheapest way to reach a
   square is its cost plus the cheaper of the ways to reach the square above or to the left. Fill
   row by row, then walk back from the goal: 13. R × C cells, O(1) each. */
VIZ.register("ds-pathsum", async (api) => {
  const W = await api.world3d();
  const G = [[1, 3, 1, 8, 9, 2], [1, 9, 1, 9, 1, 1], [4, 2, 1, 9, 1, 9], [9, 9, 1, 1, 1, 3], [9, 9, 9, 9, 2, 1]];
  const R = G.length, C = G[0].length;
  let mode = "greedy", gen = null, steps = 0, dp = [], cur = null, reads = [], path = new Set(), total = 0, running = false, ran = {}, reached = false, line = "";
  function* greedy() {
    let r = 0, c = 0; total = G[0][0]; path.add("0_0"); cur = [0, 0]; steps++;
    yield `start: effort ${total}`;
    while (r < R - 1 || c < C - 1) {
      steps++;
      const down = r < R - 1 ? G[r + 1][c] : Infinity, right = c < C - 1 ? G[r][c + 1] : Infinity;
      if (down <= right) r++; else c++;
      total += G[r][c]; path.add(`${r}_${c}`); cur = [r, c];
      yield `${down <= right ? "down" : "right"} is cheaper right now (${Math.min(down, right)} against ${Math.max(down, right) === Infinity ? "the edge" : Math.max(down, right)}). Effort so far ${total}`;
    }
    cur = null;
    yield `greedy reached the goal with effort ${total}`;
  }
  function* table() {
    dp = G.map((row) => row.map(() => undefined));
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      steps++; cur = [r, c];
      const up = r ? dp[r - 1][c] : Infinity, left = c ? dp[r][c - 1] : Infinity;
      reads = [r ? [r - 1, c] : null, c ? [r, c - 1] : null].filter(Boolean);
      dp[r][c] = G[r][c] + (r || c ? Math.min(up, left) : 0);
      yield !r && !c ? `start square: ${dp[0][0]}` : `square (${r}, ${c}): ${G[r][c]} + min(${up === Infinity ? "–" : up} above, ${left === Infinity ? "–" : left} left) = ${dp[r][c]}`;
    }
    reads = [];
    let r = R - 1, c = C - 1; path.add(`${r}_${c}`); total = dp[r][c];
    while (r || c) {
      steps++;
      const up = r ? dp[r - 1][c] : Infinity, left = c ? dp[r][c - 1] : Infinity;
      if (up <= left) r--; else c--;
      path.add(`${r}_${c}`); cur = [r, c];
      yield `walk back: came from the ${up <= left ? "square above" : "left"} (${Math.min(up, left)})`;
    }
    cur = null;
    yield `cheapest route: effort ${total}`;
  }
  function draw() {
    const tb = mode === "table";
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const k = `${r}_${c}`, hot = cur && cur[0] === r && cur[1] === c, rd = reads.some(([a, b]) => a === r && b === c), d = dp[r] && dp[r][c];
      const x = -3 + c * 1.2, y = 2.4 - r * 1.2;
      W.box("g" + k, { x, y, z: 0, sx: 1.1, sy: 1.1, sz: 0.2 + G[r][c] * 0.06, color: hot ? "c1" : rd ? "c4" : path.has(k) ? (tb ? "c3" : "c2") : G[r][c] >= 8 ? "muted" : "c5", glow: hot || rd ? 0.35 : 0, opacity: 0.92,
        label: String(G[r][c]), labelSize: 0.3, labelUp: 0,
        info: { title: `Square (${r}, ${c})`, html: `<p>Costs ${G[r][c]}.${d !== undefined ? ` Cheapest way to get here: ${d}.` : ""}</p>` } });
      W.label("d" + k, tb && d !== undefined ? `Σ${d}` : "", [x + 0.28, y - 0.36, 0.5], { color: "c4", size: 0.2 });
    }
    W.label("start", "start", [-3, 3.3, 0.3], { color: "muted", size: 0.24 });
    W.label("goal", "goal", [-3 + (C - 1) * 1.2, 2.4 - R * 1.2 + 0.3, 0.3], { color: "muted", size: 0.24 });
  }
  function show() { api.status(`${mode === "greedy" ? "greedy: cheaper next square" : "DP: cheapest way to every square"} · ${steps} step${steps === 1 ? "" : "s"}${total ? ` · effort ${total}` : ""}\n${line}`); }
  function reset() { steps = 0; dp = []; cur = null; reads = []; path = new Set(); total = 0; line = ""; gen = mode === "greedy" ? greedy() : table(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = total;
    if (mode === "greedy") api.explain(`Effort ${total}`, `<p>The first move looked smart (1 instead of 3), but it led down the left side where every square is expensive. Greedy never looks back.</p><p>Switch to <b>DP</b> and run it.</p>`);
    else if (ran.greedy && !reached) { reached = true; api.explain("Every square, once", `<p>DP found effort ${total} against greedy's ${ran.greedy}. Each square only needs the best totals of the square above and the square to its left, so filling row by row works.</p><p>${R} × ${C} squares, O(1) each. Walking back from the goal, always to the smaller neighbour, recovers the route.</p>`); api.done("You found a cheapest path with grid DP"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "greedy" ? 600 : 260); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "greedy: cheaper next square", value: "greedy" }, { label: "DP", value: "table" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0, 0], dist: 15, theta: 0, phi: 1.5, instant: true });
  api.hud("number = effort for that square · move only right or down · grey = 8 or more · Σ = cheapest total to reach it · amber = cells being read · coloured = the route");
  reset();
  api.explain("How to read this", `<p>Get from the top-left to the bottom-right, only moving right or down, with the least total effort. <b>Run all</b> with <b>greedy</b>, then with <b>DP</b>.</p>`);
});
