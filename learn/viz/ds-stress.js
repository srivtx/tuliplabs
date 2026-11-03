/* DSA, chapter 60: stress testing.
   A fast "best sum of a run of neighbours" (Kadane) that starts best at 0. It passes three tests
   written by hand. Is it right?
   The "why": hand-written tests check the cases you thought of, and bugs live in the ones you didn't.
   A stress test generates many small random inputs, runs the fast solution and a slow obviously
   correct one, and stops at the first disagreement. Then shrinking removes one element at a time
   while the two still disagree, leaving the smallest input that shows the bug. */
VIZ.register("ds-stress", async (api) => {
  const W = await api.world3d();
  const HAND = [[1, -2, 3, 4], [5], [2, -1, 2]];
  const fast = (a) => { let best = 0, cur = 0; for (const x of a) { cur = Math.max(x, cur + x); best = Math.max(best, cur); } return best; };
  const slow = (a) => { let best = -Infinity; for (let i = 0; i < a.length; i++) { let s = 0; for (let j = i; j < a.length; j++) { s += a[j]; best = Math.max(best, s); } } return best; };
  let seed = 20;
  const rnd = (k) => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor((seed / 2147483648) * k); };
  let mode = "hand", gen = null, trials = [], arr = [], f = 0, s = 0, bad = null, shrinking = false, running = false, ran = {}, reached = false, line = "";
  function* hand() {
    for (const a of HAND) { arr = a; f = fast(a); s = slow(a); trials.push(f === s); yield `hand test [${a.join(", ")}]: fast says ${f}, expected ${s}. ${f === s ? "Pass" : "FAIL"}`; }
    yield `all ${HAND.length} hand-written tests pass. Ship it?`;
  }
  function* stress() {
    seed = 20;
    for (let t = 1; t <= 60; t++) {
      const n = 2 + rnd(4); arr = Array.from({ length: n }, () => rnd(12) - 7);
      f = fast(arr); s = slow(arr); trials.push(f === s);
      if (f !== s) { bad = arr.slice(); yield `trial ${t}: [${arr.join(", ")}] fast says ${f}, slow says ${s}. Found a difference`; break; }
      yield `trial ${t}: [${arr.join(", ")}] both say ${f}`;
    }
    shrinking = true;
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < bad.length; i++) {
        const c = bad.slice(0, i).concat(bad.slice(i + 1));
        if (c.length && fast(c) !== slow(c)) { bad = c; arr = c; f = fast(c); s = slow(c); changed = true; yield `shrink: drop one number, still wrong: [${c.join(", ")}] fast ${f}, slow ${s}`; break; }
      }
    }
    yield `smallest failing input: [${bad.join(", ")}]. With only negative numbers the best is the least negative, but best started at 0`;
  }
  function draw() {
    const show = arr.slice(0, 6);
    for (let i = 0; i < 6; i++) {
      const v = show[i], on = v !== undefined;
      W.box("v" + i, { x: -3.1 + i * 0.7, y: 1.1 + (on ? v : 0) * 0.12, z: 0, sx: 0.55, sy: on ? Math.max(0.06, Math.abs(v) * 0.24) : 0.06, sz: 0.4, visible: on,
        color: on && v < 0 ? "c1" : "c2", opacity: 0.9, label: on ? `${v}` : "", labelSize: 0.2, labelUp: on && v < 0 ? -0.35 : 0.2,
        info: { title: `Value ${v}`, html: `<p>One number in the current test input.</p>` } });
    }
    W.label("fs", arr.length ? `fast ${f}   slow ${s}` : "", [-1.35, -1.0, 0.2], { color: f === s ? "c3" : "c1", size: 0.24 });
    for (let k = 0; k < 60; k++) {
      const t = trials[k];
      W.box("t" + k, { x: 1.3 + (k % 6) * 0.3, y: 1.9 - Math.floor(k / 6) * 0.3, z: 0, sx: 0.22, sy: 0.22, sz: 0.1, visible: true,
        color: t === undefined ? "line" : t ? "c3" : "c1", opacity: t === undefined ? 0.3 : 0.9, info: { title: `Test ${k + 1}`, html: `<p>${t === undefined ? "Not run." : t ? "Fast and slow agree." : "Fast and slow disagree."}</p>` } });
    }
    W.label("tl", "tests run", [2.05, 2.25, 0.2], { color: "muted", size: 0.15 });
  }
  function status() { api.status(`${mode === "hand" ? "hand-written tests" : shrinking ? "stress test · shrinking" : "stress test"} · ${trials.length} tests\n${line}`); }
  function reset() { trials = []; arr = []; f = s = 0; bad = null; shrinking = false; line = ""; gen = mode === "hand" ? hand() : stress(); draw(); status(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); status(); finish(); return false; }
    line = r.value; draw(); status(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = trials.length;
    if (mode === "hand") api.explain("All green", `<p>Every hand-written test has a positive number in it, so they never reach the bug.</p><p>Switch to <b>stress test</b> and run it.</p>`);
    else if (ran.hand !== undefined && !reached) { reached = true; api.explain("Random beats imagination", `<p>${trials.length} random tests found an input the hand tests missed, and shrinking cut it to one number. Fix: start best at the first element (or −∞).</p><p>Small random inputs, a slow trusted answer, and a loop: ten lines that find bugs before the judge does.</p>`); api.done("You caught a bug with a stress test"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(700); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "hand-written tests", value: "hand" }, { label: "stress test", value: "stress" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.6, 0], dist: 9.5, theta: 0, phi: 1.5, instant: true });
  api.hud("left: the current input, red bars negative · right: one square per test, green = agree, red = disagree");
  reset();
  api.explain("How to read this", `<p>The fast solution finds the best sum of neighbouring numbers. <b>Run all</b> with <b>hand-written tests</b>, then with <b>stress test</b>.</p>`);
});
