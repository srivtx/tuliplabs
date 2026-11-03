/* Build your own X, chapter 32: an async runtime.
   Three jobs, each a mix of CPU work (blue, one tick each) and waiting on the network (amber).
   The "why": with blocking calls the program sits idle through every wait, so the total is the sum
   of everything. An event loop runs one job until it has to wait, parks it with a timer, and
   switches to whichever job is ready. Waits overlap; only the CPU work has to take turns. That's
   all asyncio and Node do: a queue of ready tasks, a heap of timers, and a loop. */
VIZ.register("bx-async", async (api) => {
  const W = await api.world3d();
  const JOBS = [{ name: "A", segs: [["w", 3], ["c", 1]] }, { name: "B", segs: [["c", 1], ["w", 2], ["c", 1], ["w", 2], ["c", 1]] }, { name: "C", segs: [["c", 1], ["w", 4], ["c", 1]] }];
  const TOTAL = 17;
  let mode = "block", gen = null, t = 0, grid = [], ready = [], timers = [], doneAt = [], running = false, ran = {}, reached = false, line = "";
  const mark = (j, tick, kind) => { grid[j][tick] = kind; };
  function* blocking() {
    for (let j = 0; j < JOBS.length; j++) {
      for (const [kind, n] of JOBS[j].segs) for (let k = 0; k < n; k++) {
        mark(j, t, kind); t++;
        yield `tick ${t}: job ${JOBS[j].name} ${kind === "c" ? "computes" : "waits for the network, and the whole program waits with it"}`;
      }
      doneAt[j] = t;
    }
  }
  function* loop() {
    const pos = JOBS.map(() => 0), left = JOBS.map(() => 0);
    ready = []; timers = [];
    // move job j onto its current segment: a wait parks it on a timer, CPU work queues it as ready
    const advance = (j, now) => {
      const seg = JOBS[j].segs[pos[j]];
      if (!seg) { doneAt[j] = now; return; }
      if (seg[0] === "w") { timers.push({ j, at: now + seg[1] }); timers.sort((a, b) => a.at - b.at); }
      else { left[j] = seg[1]; ready.push(j); }
    };
    JOBS.forEach((_, j) => advance(j, 0));
    while (ready.length || timers.length) {
      while (timers.length && timers[0].at <= t) { const { j } = timers.shift(); pos[j]++; advance(j, t); }
      for (const tm of timers) mark(tm.j, t, "w");
      let what;
      if (ready.length) {
        const j = ready[0]; mark(j, t, "c"); left[j]--;
        what = `job ${JOBS[j].name} computes`;
        if (left[j] === 0) { ready.shift(); pos[j]++; advance(j, t + 1); what += JOBS[j].segs[pos[j]] ? ", then awaits the network: parked on a timer" : ", and finishes"; }
      } else what = "nothing is ready, so the loop sleeps until the next timer";
      t++;
      yield `tick ${t}: ${what}${timers.length ? `. Waiting: ${timers.map((x) => JOBS[x.j].name).join(", ")}` : ""}`;
    }
  }
  function draw() {
    JOBS.forEach((job, j) => {
      W.label("jn" + j, `job ${job.name}`, [-3.75, 1.2 - j * 0.9, 0.2], { color: "ink", size: 0.2 });
      for (let k = 0; k < TOTAL; k++) {
        const g = grid[j] && grid[j][k];
        W.box(`g${j}_${k}`, { x: -3.0 + k * 0.38, y: 1.2 - j * 0.9, z: 0, sx: 0.34, sy: 0.6, sz: 0.3, color: g === "c" ? "c2" : g === "w" ? "c4" : "line", opacity: g ? 0.92 : 0.22,
          info: { title: `Job ${job.name}, tick ${k + 1}`, html: `<p>${g === "c" ? "Using the CPU." : g === "w" ? "Waiting on the network. The CPU is free for others." : "Nothing happening."}</p>` } });
      }
    });
    W.box("now", { x: -3.0 + Math.min(t, TOTAL) * 0.38 - 0.19, y: 0.3, z: 0.2, sx: 0.04, sy: 2.8, sz: 0.04, color: "c1", opacity: 0.9 });
    for (let k = 0; k <= TOTAL; k += 2) W.label("tk" + k, `${k}`, [-3.19 + k * 0.38, -1.45, 0.2], { color: "muted", size: 0.14 });
  }
  function show() { api.status(`${mode === "block" ? "blocking calls" : "event loop"} · ${t} ticks\n${line}`); }
  function reset() { t = 0; grid = JOBS.map(() => []); ready = []; timers = []; doneAt = []; line = ""; gen = mode === "block" ? blocking() : loop(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = t;
    if (mode === "block") api.explain(`${t} ticks`, `<p>Count the amber: 11 of the ticks were spent waiting on the network, with the CPU doing nothing.</p><p>Switch to <b>event loop</b> and run it.</p>`);
    else if (ran.block !== undefined && !reached) { reached = true; api.explain("Wait together, compute in turn", `<p>${t} ticks against ${ran.block}. The waits overlap; the blue blocks never do, because there's still one CPU and one thread.</p><p>That's why async helps with network and disk waits but not with heavy computation.</p>`); api.done("You ran an event loop"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(650); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "blocking calls", value: "block" }, { label: "event loop", value: "loop" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.1, 0], dist: 10.5, theta: 0, phi: 1.5, instant: true });
  api.hud("one row per job, one square per tick · blue = CPU work · amber = waiting on the network · red line = now");
  reset();
  api.explain("How to read this", `<p>Three jobs that compute and wait. <b>Run all</b> with <b>blocking calls</b>, then with <b>event loop</b>.</p>`);
});
