/* DSA, chapter 2: arrays in one pass (Kadane's algorithm).
   A row of numbers: bars up for positive, down for negative. The task is the stretch of neighbours
   with the largest total (the "maximum subarray").
   The "why": the obvious way tries every start and every end: n(n+1)/2 stretches. Kadane notices
   that a stretch whose running total has gone negative can only drag down whatever comes after it,
   so it throws it away and starts fresh. One walk, n steps. */
VIZ.register("ds-kadane", async (api) => {
  const W = await api.world3d();
  const A = [-2, 1, -3, 4, -1, 2, 1, -5, 4, 3, -6, 2];
  const N = A.length, X = (i) => -6.6 + i * 1.2;
  let mode = "naive", gen = null, steps = 0, best = null, win = null, cur = 0, running = false, ran = { naive: false, kadane: false }, reached = false, line = "";
  function* naive() {
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let j = i; j < N; j++) {
        s += A[j];
        yield { win: [i, j], sum: s, msg: `start ${i}, end ${j}: total ${s}` };
      }
    }
  }
  function* kadane() {
    let s = 0, start = 0;
    for (let j = 0; j < N; j++) {
      if (s < 0) { yield { win: [j, j - 1], sum: 0, reset: true, msg: `the run so far totals ${s} < 0: drop it, start fresh at ${j}` }; s = 0; start = j; }
      s += A[j];
      yield { win: [start, j], sum: s, msg: `add ${A[j]}: run ${start}..${j} totals ${s}` };
    }
  }
  function draw() {
    A.forEach((v, i) => {
      const h = Math.max(0.15, Math.abs(v) * 0.42), inWin = win && i >= win[0] && i <= win[1], inBest = best && i >= best.win[0] && i <= best.win[1];
      W.box("a" + i, { x: X(i), y: v >= 0 ? h / 2 : -h / 2, z: 0, sx: 0.9, sy: h, sz: 0.9, color: inWin ? "c4" : v >= 0 ? "c2" : "c1", glow: inWin ? 0.4 : 0,
        label: String(v), labelSize: 0.34, labelUp: v >= 0 ? 0.5 + 0.3 / h : -0.5 - 0.3 / h,
        info: { title: `a[${i}] = ${v}`, html: `<p>${v >= 0 ? "A positive number: any stretch is better off including it if it can reach it." : "A negative number: worth crossing only if what's on the other side makes up for it."}</p>` } });
      W.box("best" + i, { x: X(i), y: -2.6, z: 0, sx: 1.1, sy: 0.25, sz: 0.9, color: "c3", opacity: inBest ? 0.9 : 0.08, glow: inBest ? 0.3 : 0,
        info: { title: "Best stretch so far", html: "<p>The green strip marks the stretch with the largest total found so far.</p>" } });
    });
  }
  function show() {
    api.status(`${mode === "naive" ? "try every stretch" : "Kadane: one walk"} · ${steps} stretch${steps === 1 ? "" : "es"} looked at\n` +
      (line ? line + "\n" : "") + (best ? `best so far: ${best.sum} (positions ${best.win[0]}..${best.win[1]})` : ""));
  }
  function reset() { gen = mode === "naive" ? naive() : kadane(); steps = 0; best = null; win = null; line = ""; draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { finish(); return false; }
    const e = r.value;
    if (!e.reset) { steps++; if (!best || e.sum > best.sum) best = { sum: e.sum, win: e.win.slice() }; }
    win = e.reset ? null : e.win; line = e.msg;
    draw(); show();
    return true;
  }
  function finish() {
    win = null; draw();
    if (ran[mode]) return;
    ran[mode] = true;
    line = `done: ${steps} looked at for n = ${N}`; show();
    if (mode === "naive") api.explain("Every stretch: 78 of them", `<p>12 numbers have 12·13/2 = <b>78</b> stretches, and this tried them all. At n = 100 000 that's 5·10⁹: far too slow.</p><p>Switch to <b>Kadane</b> and run it.</p>`);
    else if (ran.naive && !reached) { reached = true; api.explain("Same answer, one walk", `<p>Kadane looked at only <b>${steps}</b> stretches and found the same best total, ${best.sum}. The trick: a run whose total has fallen below 0 can't help anything after it, so it's dropped. Each number is visited once: O(n).</p>`); api.done("You found the maximum subarray in one pass"); }
    else api.explain("One walk", "<p>Now try <b>try every stretch</b> to see how much more work the obvious way does.</p>");
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "naive" ? 70 : 380); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "try every stretch", value: "naive" }, { label: "Kadane", value: "kadane" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, -0.4, 0], dist: 19.5, theta: 0, phi: 1.4, instant: true });
  api.hud("yellow = stretch being added up · green strip = best stretch so far · click a number");
  reset();
  api.explain("How to read this", "<p>Find the stretch of neighbouring numbers with the biggest total. Press <b>Run all</b> to try every stretch, then switch to <b>Kadane</b> and run it.</p>");
});
