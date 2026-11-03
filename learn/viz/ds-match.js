/* DSA, chapter 54: bipartite matching.
   Six workers, six jobs, and lines for who can do what. Give as many workers a job as possible,
   one job each.
   The "why": handing out the first free job to each worker in turn gets stuck (worker 1 can only do
   job 0, and worker 0 took it). An augmenting path fixes that without starting over: from a free
   worker, alternate "a job they could do" and "the worker holding it, who moves on to another job",
   until a free job turns up. Flipping every line on the path gives one more match. When no free
   worker has such a path, the matching is as big as it can be (Berge's theorem). */
VIZ.register("ds-match", async (api) => {
  const W = await api.world3d();
  const ADJ = [[0, 1], [0], [1, 2], [2, 3], [3, 5], [4, 5]], N = 6;
  let mode = "greedy", gen = null, mw = [], mj = [], path = [], size = 0, looks = 0, running = false, ran = {}, reached = false, line = "";
  function* greedy() {
    for (let w = 0; w < N; w++) {
      const j = ADJ[w].find((x) => mj[x] === -1); looks += ADJ[w].length;
      if (j === undefined) { path = []; yield `worker ${w} can do job ${ADJ[w].join(", ")}, but ${ADJ[w].length > 1 ? "they're" : "it's"} taken: no job`; continue; }
      mw[w] = j; mj[j] = w; size++; path = [];
      yield `worker ${w} takes the first free job: ${j}`;
    }
  }
  function* naive() { yield* greedy(); yield `stuck at ${size}: worker ${mw.indexOf(-1)} has no job, and handing out first-free jobs never looks back`; }
  function* kuhn() {
    yield* greedy();
    for (let w = 0; w < N; w++) {
      if (mw[w] !== -1) continue;
      // search for an augmenting path from free worker w: alternate a job w could do and the worker who holds it
      const seen = new Set(), prev = new Map(), st = [w];
      let end = -1;
      while (st.length && end < 0) {
        const x = st.pop();
        for (const j of ADJ[x]) {
          looks++;
          if (seen.has(j)) continue;
          seen.add(j); prev.set(j, x);
          if (mj[j] === -1) { end = j; break; }
          st.push(mj[j]);
        }
      }
      if (end < 0) { yield `worker ${w}: no augmenting path`; continue; }
      path = []; let j = end;
      while (true) { const x = prev.get(j); path.push([x, j]); if (x === w) break; j = mw[x]; }
      path.reverse();
      const words = path.map(([x, jj], i) => (i === 0 ? `${x} → job ${jj}` : `(its holder ${x} moves on) → job ${jj}`)).join(", ");
      yield `augmenting path from worker ${w}: ${words}, which is free`;
      for (const [x, jj] of path) { mw[x] = jj; mj[jj] = x; }
      size++;
      yield `flip every line on the path: ${size} matched, and nobody lost their job`;
    }
    path = [];
    yield `no free worker left with an augmenting path: ${size} is the maximum`;
  }
  function draw() {
    const onPath = new Set(path.map(([x, j]) => x + "-" + j));
    for (let i = 0; i < N; i++) {
      W.box("w" + i, { x: -2.6, y: 2.4 - i * 0.95, z: 0, sx: 0.7, sy: 0.6, sz: 0.4, color: mw[i] === -1 ? "c1" : "c2", opacity: 0.92, label: `W${i}`, labelSize: 0.22, labelUp: 0,
        info: { title: `Worker ${i}`, html: `<p>Can do job ${ADJ[i].join(" or ")}.${mw[i] >= 0 ? ` Has job ${mw[i]}.` : " Has no job yet."}</p>` } });
      W.box("j" + i, { x: 2.6, y: 2.4 - i * 0.95, z: 0, sx: 0.7, sy: 0.6, sz: 0.4, color: mj[i] === -1 ? "c5" : "c3", opacity: 0.92, label: `J${i}`, labelSize: 0.22, labelUp: 0,
        info: { title: `Job ${i}`, html: `<p>${mj[i] >= 0 ? `Done by worker ${mj[i]}.` : "Nobody has it yet."}</p>` } });
    }
    ADJ.forEach((js, w) => js.forEach((j) => {
      const k = w + "-" + j;
      W.line("e" + k, "w" + w, "j" + j, { color: onPath.has(k) ? "c1" : mw[w] === j ? "c3" : "line" });
    }));
  }
  function show() { api.status(`${mode === "greedy" ? "first free job" : "augmenting paths"} · ${size} of ${N} matched · ${looks} lines looked at\n${line}`); }
  function reset() { mw = new Array(N).fill(-1); mj = new Array(N).fill(-1); path = []; size = 0; looks = 0; line = ""; gen = mode === "greedy" ? naive() : kuhn(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = size;
    if (mode === "greedy") api.explain(`Stuck at ${size}`, `<p>Worker 1 can only do job 0, which worker 0 grabbed first, even though worker 0 had another option.</p><p>Switch to <b>augmenting paths</b> and run it.</p>`);
    else if (ran.greedy !== undefined && !reached) { reached = true; api.explain("Shuffle along a path", `<p>${size} of ${N}, against ${ran.greedy}. One path from the free worker moved five people along by one job each, and the last one landed on a free job.</p><p>Kuhn's algorithm tries this from every worker: O(V · E). Hopcroft-Karp finds many short paths at once: O(E √V).</p>`); api.done("You found a maximum matching"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(1100); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "first free job", value: "greedy" }, { label: "augmenting paths", value: "kuhn" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.1, 0], dist: 10.5, theta: 0, phi: 1.5, instant: true });
  api.hud("workers left, jobs right, lines = who can do what · green = matched · red = the augmenting path · red worker = no job");
  reset();
  api.explain("How to read this", `<p>Give every worker a different job they can do. <b>Run all</b> with <b>first free job</b>, then with <b>augmenting paths</b>.</p>`);
});
