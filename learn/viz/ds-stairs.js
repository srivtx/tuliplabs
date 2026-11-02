/* DSA, chapter 28: 1D dynamic programming, from plain recursion to a table.
   How many ways can you climb 10 stairs taking 1 or 2 steps at a time? ways(n) = ways(n − 1) + ways(n − 2).
   The "why": the recursion is correct but asks the same questions again and again: ways(1) is
   worked out 55 times, and the total grows like the answer itself (exponential). Every call with
   the same n returns the same thing, so remember it: fill a table from the bottom, dp[i] from
   dp[i − 1] and dp[i − 2], and each subproblem is solved exactly once. That's dynamic programming. */
VIZ.register("ds-stairs", async (api) => {
  const W = await api.world3d();
  const N = 10;
  let mode = "rec", gen = null, steps = 0, calls = [], val = [], cur = -1, running = false, ran = {}, reached = false, line = "";
  function* rec(k) {
    steps++; calls[k]++; cur = k;
    yield `ways(${k}) asked${calls[k] > 1 ? `: time number ${calls[k]}, same answer as before` : ""}`;
    if (k < 2) { val[k] = 1; return 1; }
    const a = yield* rec(k - 1), b = yield* rec(k - 2);
    val[k] = a + b; cur = k;
    return a + b;
  }
  function* recAll() {
    yield* rec(N); cur = -1;
    yield `ways(${N}) = ${val[N]}, after ${steps} calls`;
  }
  function* table() {
    for (let i = 0; i <= N; i++) {
      steps++; calls[i]++; cur = i; val[i] = i < 2 ? 1 : val[i - 1] + val[i - 2];
      yield i < 2 ? `dp[${i}] = 1 (base case)` : `dp[${i}] = dp[${i - 1}] + dp[${i - 2}] = ${val[i - 1]} + ${val[i - 2]} = ${val[i]}`;
    }
    cur = -1;
    yield `dp[${N}] = ${val[N]}, after ${steps} steps`;
  }
  function draw() {
    for (let i = 0; i <= N; i++) {
      const x = -5 + i * 1.0, h = Math.max(0.05, calls[i] * 0.08), hot = i === cur;
      W.box("b" + i, { x, y: -1.9 + h / 2, z: 0, sx: 0.7, sy: h, sz: 0.5, color: hot ? "c1" : calls[i] > 1 ? "bad" : calls[i] ? "c3" : "c5", glow: hot ? 0.4 : 0, opacity: calls[i] ? 0.9 : 0.3,
        info: { title: `ways(${i})`, html: `<p>Worked out ${calls[i]} time${calls[i] === 1 ? "" : "s"}.${calls[i] > 1 ? " Every time after the first was wasted." : ""}</p>` } });
      W.label("n" + i, calls[i] ? String(calls[i]) : "", [x, -1.6 + h, 0.4], { color: calls[i] > 1 ? "bad" : "muted", size: 0.26 });
      W.box("v" + i, { x, y: -2.8, z: 0, sx: 0.9, sy: 0.7, sz: 0.4, color: hot ? "c1" : val[i] !== undefined ? "c4" : "c5", glow: hot ? 0.3 : 0, opacity: 0.95,
        label: val[i] !== undefined ? String(val[i]) : "", labelSize: 0.26, labelUp: 0, info: { title: `Stair ${i}`, html: `<p>Ways to reach stair ${i}: ${val[i] ?? "not known yet"}.</p>` } });
      W.label("i" + i, String(i), [x, -3.5, 0.3], { color: "muted", size: 0.24 });
    }
  }
  function show() { api.status(`${mode === "rec" ? "plain recursion" : "table, bottom up"} · ${steps} ${mode === "rec" ? "call" : "step"}${steps === 1 ? "" : "s"}\n${line}`); }
  function reset() { steps = 0; calls = Array(N + 1).fill(0); val = []; cur = -1; line = ""; gen = mode === "rec" ? recAll() : table(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = steps;
    if (mode === "rec") api.explain(`${steps} calls`, `<p>The red bars are repeated work: ways(1) was worked out ${calls[1]} times, ways(2) ${calls[2]} times. The bars grow like the answers themselves, so ways(40) would take hundreds of millions of calls.</p><p>Switch to <b>table, bottom up</b> and run it.</p>`);
    else if (ran.rec && !reached) { reached = true; api.explain("Solve each subproblem once", `<p>${steps} steps against ${ran.rec} calls. Every bar is height 1: each answer was computed once and then read from the table.</p><p>That's dynamic programming: same recurrence, but answers are stored. Memoised recursion does it top down; a table does it bottom up. Both are O(n) here.</p>`); api.done("You turned a recursion into a DP table"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "rec" ? 55 : 500); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "plain recursion", value: "rec" }, { label: "table, bottom up", value: "table" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.1, 0], dist: 18.5, theta: 0, phi: 1.5, instant: true });
  api.hud("bar height = how many times ways(i) was worked out · red = worked out more than once · bottom row = the answers so far · bottom numbers = stair i");
  reset();
  api.explain("How to read this", `<p>Count the ways to climb ${N} stairs, 1 or 2 at a time. <b>Run all</b> with <b>plain recursion</b>, then with <b>table, bottom up</b>.</p>`);
});
