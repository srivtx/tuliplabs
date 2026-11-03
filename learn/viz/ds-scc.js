/* DSA, chapter 51: strongly connected components.
   12 places joined by one-way roads. A strongly connected component is a group where everyone can
   reach everyone else and get back.
   The "why": the obvious test, "do u and v reach each other?", needs a search from every node:
   O(n · (n + m)). Kosaraju does it in two searches over the whole graph. Pass 1 records the order in
   which nodes finish. Pass 2 walks the roads backwards, starting from the last node to finish; each
   walk can't leak out of its group, because every road that leaves the group points the wrong way
   now (or into a group already taken). O(n + m). */
VIZ.register("ds-scc", async (api) => {
  const W = await api.world3d();
  const N = 12;
  const E = [[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3], [5, 7], [7, 8], [8, 9], [9, 10], [10, 8], [6, 11], [11, 10], [1, 11]];
  const P = [[-4.2, 1.6], [-3.2, 0.2], [-4.6, -1.0], [-1.8, 1.4], [-0.4, 2.2], [0.4, 0.6], [-1.2, -0.4], [2.0, 1.6], [3.4, 0.4], [4.6, 1.4], [4.2, -1.0], [1.2, -1.6]];
  const COL = ["c3", "c2", "c4", "c1", "ink", "muted"];
  const out = [...Array(N)].map(() => []), inn = [...Array(N)].map(() => []);
  for (const [a, b] of E) { out[a].push(b); inn[b].push(a); }
  let mode = "naive", gen = null, ops = 0, comp = [], hot = new Set(), hotE = new Set(), ord = [], running = false, ran = {}, reached = false, line = "";
  function* naive() {
    const reach = [];
    for (let u = 0; u < N; u++) {
      const seen = new Set([u]), q = [u]; hot = new Set([u]); hotE = new Set();
      while (q.length) { const x = q.shift(); for (const y of out[x]) { ops++; hotE.add(x + "-" + y); if (!seen.has(y)) { seen.add(y); q.push(y); } } }
      reach[u] = seen; hot = seen;
      yield `search from ${u}: it reaches ${seen.size} places (${ops} roads walked so far)`;
    }
    hot = new Set(); hotE = new Set(); let c = 0;
    for (let u = 0; u < N; u++) if (comp[u] === undefined) { for (let v = 0; v < N; v++) if (reach[u].has(v) && reach[v].has(u)) comp[v] = c; c++; }
    yield `pair up everyone who reaches each other: ${c} groups, after ${N} full searches and ${ops} roads walked`;
  }
  function* kosaraju() {
    const seen = new Array(N).fill(false);
    for (let s = 0; s < N; s++) {
      if (seen[s]) continue;
      hot = new Set(); hotE = new Set();
      const st = [[s, 0]]; seen[s] = true; hot.add(s);
      while (st.length) {
        const top = st[st.length - 1], [x, i] = top;
        if (i < out[x].length) { top[1]++; const y = out[x][i]; ops++; hotE.add(x + "-" + y); if (!seen[y]) { seen[y] = true; hot.add(y); st.push([y, 0]); } }
        else { st.pop(); ord.push(x); }
      }
      yield `pass 1: search from ${s}, writing nodes down as they finish: ${ord.join(", ")}`;
    }
    let c = 0;
    for (let t = N - 1; t >= 0; t--) {
      const s = ord[t];
      if (comp[s] !== undefined) continue;
      hot = new Set(); hotE = new Set();
      const st = [s]; comp[s] = c; hot.add(s);
      while (st.length) { const x = st.pop(); for (const y of inn[x]) { ops++; hotE.add(y + "-" + x); if (comp[y] === undefined) { comp[y] = c; hot.add(y); st.push(y); } } }
      yield `pass 2: from ${s} (latest to finish), walk roads backwards: group ${c} = {${[...hot].sort((a, b) => a - b).join(", ")}}`;
      c++;
    }
    hot = new Set(); hotE = new Set();
    yield `${c} groups with ${ops} roads walked: each road twice, once per pass`;
  }
  function draw() {
    for (let v = 0; v < N; v++) {
      const c = comp[v], h = hot.has(v);
      W.box("n" + v, { x: P[v][0], y: P[v][1], z: 0, sx: 0.55, sy: 0.55, sz: 0.55, color: c !== undefined ? COL[c % COL.length] : h ? "c1" : "c5", glow: h ? 0.35 : 0, opacity: 0.92,
        label: String(v), labelSize: 0.26, labelUp: 0,
        info: { title: `Place ${v}`, html: `<p>Roads out to ${out[v].join(", ") || "nowhere"}; roads in from ${inn[v].join(", ") || "nowhere"}.</p>${c !== undefined ? `<p>In group ${c}: everyone in it can reach everyone else in it.</p>` : ""}` } });
    }
    E.forEach(([a, b], i) => {
      const k = a + "-" + b, on = hotE.has(k);
      W.line("e" + i, "n" + a, "n" + b, { color: on ? "c1" : "line" });
      // a small block near the far end shows which way the road runs
      const t = 0.72, x = P[a][0] + (P[b][0] - P[a][0]) * t, y = P[a][1] + (P[b][1] - P[a][1]) * t;
      W.box("h" + i, { x, y, z: 0, sx: 0.16, sy: 0.16, sz: 0.16, color: on ? "c1" : "c5", opacity: 0.9 });
    });
  }
  function show() { api.status(`${mode === "naive" ? "search from every place" : "Kosaraju, two passes"} · ${ops} roads walked\n${line}`); }
  function reset() { ops = 0; comp = []; hot = new Set(); hotE = new Set(); ord = []; line = ""; gen = mode === "naive" ? naive() : kosaraju(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = ops;
    if (mode === "naive") api.explain(`${ops} roads walked`, `<p>One full search per place, then pairing up everyone who reaches each other. That's n searches: O(n · (n + m)).</p><p>Switch to <b>Kosaraju, two passes</b> and run it.</p>`);
    else if (ran.naive && !reached) { reached = true; api.explain("Two passes are enough", `<p>Same groups with ${ops} roads walked against ${ran.naive}. Pass 1 finds an order; pass 2 walks backwards from the last place to finish, and each backward walk stays inside one group.</p><p>O(n + m). The groups come out in the order of the roads between them.</p>`); api.done("You found the strongly connected components"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(900); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "search from every place", value: "naive" }, { label: "Kosaraju, two passes", value: "kosaraju" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.4, 0], dist: 14.5, theta: 0, phi: 1.5, instant: true });
  api.hud("one-way roads: the small block sits near the end a road points to · red = walked in this step · colours = finished groups");
  reset();
  api.explain("How to read this", `<p>Which places can all reach each other? <b>Run all</b> with <b>search from every place</b>, then with <b>Kosaraju, two passes</b>.</p>`);
});
