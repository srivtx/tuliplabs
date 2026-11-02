/* DSA, chapter 21: topological sort with Kahn's algorithm.
   Ten build steps with "must happen before" arrows. In what order can they run?
   The "why": the obvious way rescans every remaining step and checks all its prerequisites, just
   to find one that's ready, then starts over: O(V·(V + E)). Kahn's algorithm keeps a count of
   unfinished prerequisites per step (its in-degree) and a queue of steps whose count is 0.
   Finishing a step decrements its followers' counts, and any that hit 0 join the queue: O(V + E).
   If the queue empties before every step is done, there's a cycle. */
VIZ.register("ds-topo", async (api) => {
  const W = await api.world3d();
  const N = ["fetch", "config", "compile A", "compile B", "link", "test", "docs", "package", "sign", "ship"];
  const E = [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4], [4, 5], [1, 6], [5, 7], [6, 7], [7, 8], [8, 9]];
  const L = [0, 1, 2, 2, 3, 4, 2, 5, 6, 7], Yv = [0, 0, 1.7, 0, 0.8, 0.8, -1.8, 0, 0, 0];
  const SCAN = [9, 8, 7, 5, 6, 4, 3, 2, 1, 0];
  const pre = N.map((_, v) => E.filter(([, b]) => b === v).map(([a]) => a)), nxt = N.map((_, v) => E.filter(([a]) => a === v).map(([, b]) => b));
  let mode = "scan", gen = null, steps = 0, done = [], indeg = [], queue = [], look = -1, running = false, ran = {}, reached = false, line = "";
  function* scan() {
    while (done.length < N.length) {
      for (const v of SCAN) {
        if (done.includes(v)) continue;
        look = v; let ok = true;
        for (const p of pre[v]) { steps++; if (!done.includes(p)) { ok = false; break; } }
        if (!pre[v].length) steps++;
        if (ok) { done.push(v); yield `scan: "${N[v]}" has every prerequisite done, run it, then start the scan again`; break; }
        yield `scan: "${N[v]}" is still waiting`;
      }
    }
    look = -1;
  }
  function* kahn() {
    indeg = pre.map((p) => p.length);
    queue = N.map((_, v) => v).filter((v) => !indeg[v]);
    yield `count prerequisites; queue every step with 0: ${queue.map((v) => N[v]).join(", ")}`;
    while (queue.length) {
      const v = queue.shift(); look = v; done.push(v); steps++;
      yield `run "${N[v]}"`;
      for (const w of nxt[v]) {
        indeg[w]--; steps++;
        if (!indeg[w]) queue.push(w);
        yield `"${N[w]}" has ${indeg[w]} prerequisite${indeg[w] === 1 ? "" : "s"} left${indeg[w] ? "" : ": ready, join the queue"}`;
      }
    }
    look = -1;
  }
  function draw() {
    N.forEach((name, v) => {
      const d = done.indexOf(v);
      W.box("n" + v, { x: -7 + L[v] * 2, y: Yv[v], z: 0, sx: 1.5, sy: 0.7, sz: 0.6, color: v === look ? "c1" : d >= 0 ? "c3" : mode === "kahn" && queue.includes(v) ? "c4" : "c5", glow: v === look ? 0.4 : 0, opacity: 0.95,
        label: mode === "kahn" && indeg.length && d < 0 ? `${name}\nwaits on ${indeg[v]}` : d >= 0 ? `${d + 1}. ${name}` : name, labelSize: 0.22, labelUp: 0,
        info: { title: name, html: `<p>Needs: ${pre[v].map((p) => N[p]).join(", ") || "nothing"}.</p><p>Unlocks: ${nxt[v].map((w) => N[w]).join(", ") || "nothing"}.</p>` } });
    });
    E.forEach(([a, b]) => W.line(`e${a}_${b}`, "n" + a, "n" + b, { color: done.includes(a) ? "c3" : "line" }));
  }
  function show() { api.status(`${mode === "scan" ? "rescan for a ready step" : "Kahn's algorithm"} · ${steps} step${steps === 1 ? "" : "s"} · order: ${done.map((v) => N[v]).join(" → ") || "–"}\n${line}`); }
  function reset() { steps = 0; done = []; indeg = []; queue = []; look = -1; line = ""; gen = mode === "scan" ? scan() : kahn(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = steps;
    if (mode === "scan") api.explain(`${steps} checks`, `<p>Every time a step finished, the scan began again from the top, re-checking steps it already knew were waiting. With 10⁵ steps that's 10¹⁰ checks.</p><p>Switch to <b>Kahn's algorithm</b> and step through it.</p>`);
    else if (ran.scan && !reached) { reached = true; api.explain("Count down, don't rescan", `<p>${steps} steps instead of ${ran.scan}: each step is queued once and each arrow is crossed once, O(V + E).</p><p>If the queue runs dry while some steps still wait, they wait on each other: a cycle, so no valid order exists.</p>`); api.done("You sorted a dependency graph"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "scan" ? 160 : 380); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "rescan for a ready step", value: "scan" }, { label: "Kahn's algorithm", value: "kahn" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0, 0], dist: 23, theta: 0, phi: 1.5, instant: true });
  api.hud("arrows point right: left must happen first · red = now · amber = in the ready queue · green = done, numbered in order");
  reset();
  api.explain("How to read this", `<p>Find an order to run the build steps so every step comes after the ones it needs. <b>Run all</b> with <b>rescan</b>, then switch to <b>Kahn's algorithm</b>.</p>`);
});
