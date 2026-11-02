/* DSA, chapter 5: recursion and the call stack.
   fib(n) = fib(n-1) + fib(n-2). Every call is a block in the tree; the column on the right is the
   call stack: the calls that have started but not finished yet, newest on top.
   The "why": plain recursion recomputes the same small answers again and again (fib(2) is worked
   out 5 times for fib(6)), so the tree has about 1.6ⁿ calls. Remembering each answer the first
   time (memoization) turns every repeat into a lookup, so only n + 1 calls do real work. The stack
   column shows why deep recursion can overflow: its height is the depth of the tree. */
VIZ.register("ds-recur", async (api) => {
  const W = await api.world3d();
  const N = 6;
  // Lay out the full call tree once; memo runs use a subset of the same positions.
  const pos = {};
  let leaf = 0;
  (function lay(path, n, d) {
    if (n < 2) { pos[path] = { x: leaf++, d, n }; return; }
    lay(path + "L", n - 1, d + 1); lay(path + "R", n - 2, d + 1);
    pos[path] = { x: (pos[path + "L"].x + pos[path + "R"].x) / 2, d, n };
  })("", N, 0);
  const SX = 0.9, OX = -(leaf - 1) * SX / 2 - 1.4;
  let mode = "plain", gen = null, calls = 0, work = 0, state = {}, stack = [], memo = {}, running = false, ran = {}, reached = false, line = "";
  function* fib(path, n) {
    calls++; stack.push(path);
    if (mode === "memo" && n in memo) { state[path] = "hit"; yield `fib(${n}): already known = ${memo[n]}, no work`; stack.pop(); return memo[n]; }
    work++; state[path] = "run"; yield `call fib(${n})`;
    let v;
    if (n < 2) v = n;
    else { const a = yield* fib(path + "L", n - 1); const b = yield* fib(path + "R", n - 2); v = a + b; }
    if (mode === "memo") memo[n] = v;
    state[path] = "done"; state[path + "v"] = v; stack.pop();
    yield `fib(${n}) returns ${v}`;
    return v;
  }
  function draw() {
    for (const [path, p] of Object.entries(pos)) {
      const s = state[path], onStack = stack.includes(path), top = stack[stack.length - 1] === path;
      W.box("c" + path, { x: OX + p.x * SX, y: 3.3 - p.d * 1.15, z: 0, s: s === "hit" ? 0.5 : 0.75, color: top ? "c4" : s === "hit" ? "c5" : s === "done" ? "c3" : onStack ? "c1" : "c5", glow: top ? 0.4 : 0,
        opacity: s ? 0.95 : 0.05, label: s ? `${p.n}${s === "done" ? "→" + state[path + "v"] : ""}` : "", labelSize: 0.32, labelUp: 0,
        info: { title: `fib(${p.n})`, html: s === "hit" ? "<p>This answer was already in the memo, so the call returned at once without making two more calls.</p>" : `<p>${p.n < 2 ? "A base case: returns n directly, so the recursion stops here." : `Makes two calls, fib(${p.n - 1}) and fib(${p.n - 2}), and adds their answers.`}</p>` } });
      if (path) W.line("e" + path, "c" + path.slice(0, -1), "c" + path, { color: "muted", opacity: s ? 0.7 : 0.05 });
    }
    for (let k = 0; k < N + 1; k++) {
      const f = stack[k];
      if (f === undefined) { W.remove("st" + k); continue; }
      W.box("st" + k, { x: 6.1, y: -2.8 + k * 0.7, z: 0, sx: 1.7, sy: 0.6, sz: 0.8, color: k === stack.length - 1 ? "c4" : "c1", label: `fib(${pos[f].n})`, labelSize: 0.28, labelUp: 0,
        info: { title: "A stack frame", html: "<p>Each call that has started but not finished keeps a frame here: its argument, local variables, and where to return to. Python allows about 1 000 frames, which is why very deep recursion raises <code>RecursionError</code>.</p>" } });
    }
  }
  function show() { api.status(`${mode === "plain" ? "plain recursion" : "with a memo"} · ${calls} calls, ${work} did real work · stack depth ${stack.length}\n${line}`); }
  function reset() { gen = fib("", N); calls = 0; work = 0; state = {}; stack = []; memo = {}; line = ""; for (let k = 0; k <= N; k++) W.remove("st" + k); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { line = `fib(${N}) = ${r.value}`; draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = calls;
    if (mode === "plain") api.explain(`${calls} calls for fib(${N})`, `<p>fib(2) alone was computed 5 times. The tree roughly multiplies by 1.6 for each step up in n: fib(40) makes over 300 million calls.</p><p>Switch to <b>with a memo</b> and run it.</p>`);
    else if (ran.plain && !reached) { reached = true; api.explain("Each answer computed once", `<p>${work} calls did work, one per value of n; the grey ones were answered from the memo. That's O(n) instead of O(1.6ⁿ). This is the seed of <b>dynamic programming</b> (Part 4).</p>`); api.done("You memoized a recursion"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "plain" ? 140 : 300); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "plain recursion", value: "plain" }, { label: "with a memo", value: "memo" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [-0.4, 0.4, 0], dist: 21.5, theta: 0, phi: 1.45, instant: true });
  api.hud("tree: every call · right: the call stack · yellow = running now · red = waiting · green = returned");
  reset();
  api.explain("How to read this", `<p>Each block is one call of fib. Press <b>Step</b> a few times to watch the stack grow and shrink, then <b>Run all</b>. Then switch to <b>with a memo</b>.</p>`);
});
