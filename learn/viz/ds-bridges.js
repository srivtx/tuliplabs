/* DSA, chapter 52: bridges and articulation points.
   12 towns and 15 two-way roads. A bridge is a road whose closure splits the map; an articulation
   point is a town whose closure does.
   The "why": the obvious test closes each road in turn and searches the whole map again: m searches,
   O(m · (n + m)). Tarjan's low-link does it in one DFS. Each town gets disc, the time the search
   first reached it, and low, the earliest disc it can get back to using tree roads downwards and
   one back road. A tree road parent → child is a bridge exactly when low[child] > disc[parent]: from
   below there's no other way back up. */
VIZ.register("ds-bridges", async (api) => {
  const W = await api.world3d();
  const N = 12;
  const E = [[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 5], [5, 3], [5, 6], [6, 7], [7, 8], [8, 9], [9, 7], [4, 10], [10, 11], [1, 3]];
  const P = [[-4.6, 1.2], [-3.4, 2.0], [-3.2, 0.4], [-1.6, 0.9], [-0.6, 2.0], [0.2, 0.4], [1.6, 0.9], [3.0, 0.3], [4.4, 1.0], [4.0, -0.8], [0.2, -1.2], [1.4, -2.2]];
  const adj = [...Array(N)].map(() => []);
  E.forEach(([a, b], i) => { adj[a].push([b, i]); adj[b].push([a, i]); });
  let mode = "naive", gen = null, ops = 0, br = new Set(), cut = new Set(), off = -1, hot = new Set(), disc = [], low = [], running = false, ran = {}, reached = false, line = "";
  function* naive() {
    for (let e = 0; e < E.length; e++) {
      off = e; const seen = new Set([0]), q = [0];
      while (q.length) { const x = q.shift(); for (const [y, id] of adj[x]) { if (id === e) continue; ops++; if (!seen.has(y)) { seen.add(y); q.push(y); } } }
      hot = seen;
      if (seen.size < N) br.add(e);
      yield `close road ${E[e][0]}–${E[e][1]} and search again: ${seen.size} of ${N} towns reachable${seen.size < N ? ", so it's a bridge" : ", still connected"}`;
    }
    off = -1; hot = new Set();
    yield `${br.size} bridges, after ${E.length} full searches and ${ops} roads walked`;
  }
  function* tarjan() {
    let t = 0; disc = new Array(N).fill(-1); low = new Array(N).fill(-1);
    disc[0] = low[0] = t++; let rootKids = 0;
    const st = [[0, -1, 0]]; hot = new Set([0]);
    yield `start at town 0: disc = low = 0`;
    while (st.length) {
      const top = st[st.length - 1], [v, pe, i] = top;
      if (i < adj[v].length) {
        top[2]++; const [w, id] = adj[v][i];
        if (id === pe) continue;
        ops++;
        if (disc[w] === -1) { disc[w] = low[w] = t++; if (v === 0) rootKids++; st.push([w, id, 0]); hot.add(w); yield `go down ${v} → ${w}: disc[${w}] = ${disc[w]}`; }
        else if (disc[w] < low[v]) { low[v] = disc[w]; yield `back road ${v} – ${w}: ${v} can get back up to time ${disc[w]}, so low[${v}] = ${low[v]}`; }
      } else {
        st.pop();
        if (st.length) {
          const p = st[st.length - 1][0];
          low[p] = Math.min(low[p], low[v]);
          const isB = low[v] > disc[p];
          if (isB) br.add(pe);
          if (p !== 0 && low[v] >= disc[p]) cut.add(p);
          yield `back up ${v} → ${p}: low[${v}] = ${low[v]}${isB ? ` > disc[${p}] = ${disc[p]}, so road ${p}–${v} is a bridge` : ` ≤ disc[${p}] = ${disc[p]}, there's another way up`}`;
        }
      }
    }
    if (rootKids > 1) cut.add(0);
    hot = new Set();
    yield `one search, ${ops} road looks: ${br.size} bridges and ${cut.size} towns that split the map`;
  }
  function draw() {
    const tj = mode === "tarjan";
    for (let v = 0; v < N; v++) {
      const h = hot.has(v), c = cut.has(v);
      W.box("n" + v, { x: P[v][0], y: P[v][1], z: 0, sx: 0.5, sy: 0.5, sz: 0.5, color: c ? "c4" : h ? "c2" : "c5", glow: c ? 0.3 : 0, opacity: h || c ? 0.95 : 0.6,
        label: tj && disc[v] >= 0 ? `${v} · ${disc[v]}/${low[v]}` : String(v), labelSize: 0.22, labelUp: 0,
        info: { title: `Town ${v}`, html: tj && disc[v] >= 0 ? `<p>disc ${disc[v]}: when the search first got here. low ${low[v]}: the earliest time reachable from here by going down tree roads and then one back road.</p>${c ? "<p>An articulation point: some child below can't get back above it any other way.</p>" : ""}` : `<p>Roads to ${adj[v].map(([w]) => w).join(", ")}.</p>` } });
    }
    E.forEach(([a, b], i) => W.line("e" + i, "n" + a, "n" + b, { color: i === off ? "c5" : br.has(i) ? "c1" : "line", opacity: i === off ? 0.15 : 0.9 }));
  }
  function show() { api.status(`${mode === "naive" ? "close each road and re-search" : "Tarjan's low-link, one search"} · ${ops} road looks${br.size ? ` · bridges: ${[...br].map((e) => E[e].join("–")).join(", ")}` : ""}\n${line}`); }
  function reset() { ops = 0; br = new Set(); cut = new Set(); off = -1; hot = new Set(); disc = []; low = []; line = ""; gen = mode === "naive" ? naive() : tarjan(); for (let i = 0; i < E.length; i++) W.unline("e" + i); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = ops;
    if (mode === "naive") api.explain(`${ops} road looks`, `<p>Every road was closed in turn and the whole map searched again: m searches, O(m · (n + m)).</p><p>Switch to <b>Tarjan's low-link</b> and run it.</p>`);
    else if (ran.naive && !reached) { reached = true; api.explain("One search, two numbers", `<p>The same bridges with ${ops} road looks against ${ran.naive}. Labels read <b>town · disc/low</b>. A road down to a child is a bridge when the child's low is later than the parent's disc: nothing below can climb back past it.</p><p>Amber towns are articulation points: some child has low ≥ the town's disc. O(n + m).</p>`); api.done("You found bridges with low-link"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(650); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "close each road", value: "naive" }, { label: "Tarjan's low-link", value: "tarjan" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.1, 0], dist: 14, theta: 0, phi: 1.5, instant: true });
  api.hud("red roads = bridges · amber towns = articulation points · blue = reached by the search · Tarjan labels: town · disc/low");
  reset();
  api.explain("How to read this", `<p>Which roads, if closed, cut the map in two? <b>Run all</b> with <b>close each road</b>, then with <b>Tarjan's low-link</b>.</p>`);
});
