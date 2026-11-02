/* DSA, chapter 19: breadth-first search for the fewest steps.
   A maze: get from S (top left) to E (bottom right), moving up, down, left or right.
   The "why": depth-first search follows one corridor as far as it goes and returns the first path
   it stumbles on, which can be much longer than necessary. Breadth-first search spreads out like a
   wave: every cell at distance 1, then 2, then 3… so the first time it reaches E, it's by a
   shortest route. On an unweighted grid, BFS = shortest path, in O(rows × cols). */
VIZ.register("ds-grid", async (api) => {
  const W = await api.world3d();
  const G = ["S....#.......", ".###.#.#####.", "...#...#.....", "##.#####.###.", "...#.....#...", ".#.#.###.#.#.", ".#...#...#.#.", ".#####.###.#.", ".......#....E"];
  const R = G.length, C = G[0].length, D = [[1, 0], [0, 1], [0, -1], [-1, 0]];
  const X = (c) => -6 + c, Y = (r) => 4 - r, id = (r, c) => r * C + c;
  const open = (r, c) => r >= 0 && r < R && c >= 0 && c < C && G[r][c] !== "#";
  let mode = "dfs", gen = null, visits = 0, seen = new Map(), front = new Set(), cur = -1, path = [], running = false, ran = {}, reached = false, line = "";
  function* dfs() {
    const par = new Map();
    function* go(r, c, d) {
      seen.set(id(r, c), d); visits++; cur = id(r, c);
      if (r === R - 1 && c === C - 1) return true;
      yield `go to (${r}, ${c}): ${d} steps from S on this path`;
      for (const [dr, dc] of D) {
        const nr = r + dr, nc = c + dc;
        if (open(nr, nc) && !seen.has(id(nr, nc))) { par.set(id(nr, nc), id(r, c)); if (yield* go(nr, nc, d + 1)) return true; cur = id(r, c); yield `dead end: back up to (${r}, ${c})`; }
      }
      return false;
    }
    yield* go(0, 0, 0);
    for (let v = id(R - 1, C - 1); v !== undefined; v = par.get(v)) path.push(v);
    cur = -1;
    yield `reached E by a path of ${path.length - 1} steps. Is it the shortest? Depth-first can't tell`;
  }
  function* bfs() {
    const par = new Map(), q = [[0, 0]];
    seen.set(0, 0); front.add(0);
    while (q.length) {
      const [r, c] = q.shift(); front.delete(id(r, c)); cur = id(r, c); visits++;
      const d = seen.get(id(r, c));
      if (r === R - 1 && c === C - 1) break;
      for (const [dr, dc] of D) {
        const nr = r + dr, nc = c + dc;
        if (open(nr, nc) && !seen.has(id(nr, nc))) { seen.set(id(nr, nc), d + 1); par.set(id(nr, nc), id(r, c)); front.add(id(nr, nc)); q.push([nr, nc]); }
      }
      yield `take (${r}, ${c}) at distance ${d} from the queue; its new neighbours get distance ${d + 1}`;
    }
    for (let v = id(R - 1, C - 1); v !== undefined; v = par.get(v)) path.push(v);
    cur = -1; front.clear();
    yield `reached E at distance ${path.length - 1}: the wave got there first, so no path is shorter`;
  }
  function draw() {
    const onPath = new Set(path);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const k = id(r, c), ch = G[r][c];
      if (ch === "#") { W.box("g" + k, { x: X(c), y: Y(r), z: 0.1, sx: 0.96, sy: 0.96, sz: 0.4, color: "muted", opacity: 0.6, info: { title: "Wall", html: "<p>You can't walk through it.</p>" } }); continue; }
      const s = seen.get(k);
      const color = onPath.has(k) ? "c3" : k === cur ? "c1" : front.has(k) ? "c4" : s !== undefined ? "c2" : "c5";
      W.box("g" + k, { x: X(c), y: Y(r), z: 0, sx: 0.92, sy: 0.92, sz: 0.2, color, glow: k === cur ? 0.4 : 0, opacity: s !== undefined || ch !== "." ? 0.9 : 0.3,
        label: ch === "S" || ch === "E" ? ch : mode === "bfs" && s !== undefined ? String(s) : "", labelSize: 0.24, labelUp: 0,
        info: { title: `Cell (${r}, ${c})`, html: s !== undefined ? `<p>Reached ${s} steps from S${mode === "bfs" ? " (the fewest possible: BFS reaches cells in order of distance)" : " along depth-first's current route (not necessarily the fewest)"}.</p>` : "<p>Not reached yet.</p>" } });
    }
  }
  function show() { api.status(`${mode === "dfs" ? "depth-first" : "breadth-first"} · ${visits} cell${visits === 1 ? "" : "s"} visited${path.length ? ` · path found: ${path.length - 1} steps` : ""}\n${line}`); }
  function reset() { visits = 0; seen = new Map(); front = new Set(); cur = -1; path = []; line = ""; gen = mode === "dfs" ? dfs() : bfs(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = path.length - 1;
    if (mode === "dfs") api.explain(`A path of ${path.length - 1} steps`, `<p>Depth-first went down first, followed corridors to their ends and backed up from dead ends. It found <i>a</i> way out, but nothing tells it whether a shorter one exists.</p><p>Switch to <b>breadth-first</b> and run it: watch the distance numbers grow like a ripple.</p>`);
    else if (ran.dfs && !reached) { reached = true; api.explain("The wave is always shortest", `<p>Breadth-first: ${path.length - 1} steps. Depth-first: ${ran.dfs}. The queue hands out cells in order of distance, so every cell's number is its true shortest distance, and E is reached by a shortest route.</p><p>"Fewest moves", "minimum steps", "nearest exit" on an unweighted grid or graph: BFS.</p>`); api.done("You found a shortest path with BFS"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(110); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "depth-first", value: "dfs" }, { label: "breadth-first", value: "bfs" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0, 0], dist: 21.5, theta: 0, phi: 1.5, instant: true });
  api.hud("S to E · grey blocks = walls · red = current cell · amber = waiting in the queue · blue = visited · green = the path found");
  reset();
  api.explain("How to read this", `<p>Find a way from S to E. <b>Run all</b> with <b>depth-first</b>, then switch to <b>breadth-first</b> and compare the length of the path each one finds.</p>`);
});
