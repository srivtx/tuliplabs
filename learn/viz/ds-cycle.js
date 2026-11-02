/* DSA, chapter 20: cycle detection in a directed graph needs three colours.
   Eight tasks with "must come before" arrows, all pointing right. Is there a cycle?
   The "why": a tempting shortcut is "if DFS meets a node it has already visited, there's a cycle".
   That's true for undirected graphs, but in a directed graph two paths can lead to the same node
   (a diamond: 0→1→3 and 0→2→3) with no cycle at all. The fix colours nodes white (not seen), grey
   (on the current DFS path) and black (finished). Only an arrow back to a GREY node closes a loop. */
VIZ.register("ds-cycle", async (api) => {
  const W = await api.world3d();
  const P = { 0: [-6, 0], 1: [-3.5, 1.6], 2: [-3.5, -1.6], 3: [-1, 0], 4: [1.5, 1.6], 5: [1.5, -1.6], 6: [4, 0], 7: [6.5, 0] };
  const E = { 0: [1, 2], 1: [3], 2: [3, 5], 3: [4, 5], 4: [6], 5: [6], 6: [7], 7: [] };
  let mode = "visited", gen = null, col = {}, edge = null, verdict = "", running = false, ran = {}, reached = false, line = "", steps = 0;
  function* dfs(v) {
    col[v] = "grey"; steps++;
    yield mode === "visited" ? `visit ${v}` : `enter ${v}: grey, it's on the current path`;
    for (const w of E[v]) {
      edge = [v, w];
      if (mode === "visited") {
        if (col[w]) { verdict = "cycle"; yield `arrow ${v} → ${w}: ${w} was visited before, so… "cycle!" (wrong: ${w} isn't on the current path)`; return true; }
      } else if (col[w] === "grey") { verdict = "cycle"; yield `arrow ${v} → ${w}: ${w} is grey, on the current path: a real cycle`; return true; }
      else if (col[w] === "black") { yield `arrow ${v} → ${w}: ${w} is black, already finished. Reaching it twice is fine`; continue; }
      if (!col[w]) { yield `arrow ${v} → ${w}: new, go deeper`; if (yield* dfs(w)) return true; edge = null; }
    }
    if (mode === "three") { col[v] = "black"; yield `finish ${v}: black, every path from it is explored`; }
    else yield `done with ${v}`;
    return false;
  }
  function* run() {
    for (const v of Object.keys(P).map(Number)) if (!col[v]) if (yield* dfs(v)) return;
    edge = null; verdict = "none";
    yield "every node is black and no arrow pointed back into the current path: no cycle";
  }
  function draw() {
    for (const v of Object.keys(P)) {
      const c = col[v], isEdge = edge && (edge[0] == v || edge[1] == v);
      W.box("n" + v, { x: P[v][0], y: P[v][1], z: 0, sx: 0.8, sy: 0.8, sz: 0.8, color: c === "grey" ? (mode === "visited" ? "c2" : "c4") : c === "black" ? "ink" : "c5", glow: isEdge ? 0.4 : 0, opacity: 0.95,
        label: String(v), labelSize: 0.3, labelUp: 0,
        info: { title: `Task ${v}`, html: `<p>Arrows to: ${E[v].join(", ") || "none"}.</p><p>${mode === "three" ? (c === "grey" ? "Grey: on the current DFS path." : c === "black" ? "Black: finished." : "White: not seen yet.") : c ? "Visited." : "Not visited."}</p>` } });
      for (const w of E[v]) {
        const on = edge && edge[0] == v && edge[1] == w;
        W.line(`e${v}_${w}`, "n" + v, "n" + w, { color: on ? (verdict === "cycle" ? "bad" : "c1") : "line" });
      }
    }
  }
  function show() { api.status(`${mode === "visited" ? "visited set only" : "three colours"} · ${steps} node${steps === 1 ? "" : "s"} entered${verdict ? ` · verdict: ${verdict === "cycle" ? "CYCLE" : "no cycle"}` : ""}\n${line}`); }
  function reset() { col = {}; edge = null; verdict = ""; line = ""; steps = 0; gen = run(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = verdict;
    if (mode === "visited") api.explain("A false alarm", `<p>It said "cycle", but every arrow points right, so you can never get back to where you started. Node ${edge ? edge[1] : 5} was reached by a second route, not by going round a loop.</p><p>Switch to <b>three colours</b> and run it.</p>`);
    else if (ran.visited && !reached) { reached = true; api.explain("Grey means \"on my path\"", `<p>Three colours: no cycle, correctly. An arrow into a <b>grey</b> node returns to something on the current path: that's a loop. An arrow into a <b>black</b> node just reaches finished work by another route.</p><p>Undirected graphs are simpler: there, a visited neighbour that isn't your parent does mean a cycle.</p>`); api.done("You found cycles the right way"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(450); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "visited set only", value: "visited" }, { label: "three colours", value: "three" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0.2, 0, 0], dist: 21, theta: 0, phi: 1.5, instant: true });
  api.hud("every arrow points right · white = unseen · amber = grey, on the current path · dark = black, finished · red line = the arrow being checked");
  reset();
  api.explain("How to read this", `<p>Does this directed graph have a cycle? (Every arrow points to the right, so the true answer is no.) <b>Run all</b> with <b>visited set only</b>, then with <b>three colours</b>.</p>`);
});
