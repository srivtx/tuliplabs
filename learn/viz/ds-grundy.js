/* DSA, chapter 58: game theory.
   A pile of stones; players take turns removing 1, 3 or 4; whoever can't move loses. Who wins from 0..15?
   The "why": asking "can I move to a spot where my opponent loses?" by plain recursion re-solves the
   same pile sizes again and again (the tree grows exponentially). Filling a table from 0 upwards asks
   it once per size: a size wins when some move reaches a losing size. Grundy numbers go further:
   each size gets the smallest number not reached by its moves (the mex), 0 means losing, and the
   Grundy number of several piles played side by side is the XOR of each pile's number. */
VIZ.register("ds-grundy", async (api) => {
  const W = await api.world3d();
  const N = 16, MOVES = [1, 3, 4];
  let mode = "rec", gen = null, visits = [], g = [], calls = 0, cur = -1, look = [], running = false, ran = {}, reached = false, line = "";
  function* recursion() {
    const stack = [];
    function wins(n) {
      calls++; visits[n]++; stack.push(n);
      let r = false;
      for (const m of MOVES) if (m <= n && !wins(n - m)) { r = true; break; }
      stack.pop();
      return r;
    }
    // run the recursion for each target size, yielding after each so the counts climb visibly
    for (let n = 0; n < N; n++) {
      const before = calls; cur = n;
      const r = wins(n);
      yield `does ${n} win? recursion says ${r ? "yes" : "no"}, after ${calls - before} calls (${calls} in all). Pile 0 has now been solved ${visits[0]} times`;
    }
  }
  function* table() {
    for (let n = 0; n < N; n++) {
      cur = n; look = MOVES.filter((m) => m <= n).map((m) => n - m); calls += look.length + 1;
      const seen = new Set(look.map((x) => g[x]));
      let mex = 0; while (seen.has(mex)) mex++;
      g[n] = mex;
      yield look.length ? `${n}: moves reach ${look.join(", ")} with numbers ${look.map((x) => g[x]).join(", ")}. Smallest missing: ${mex}, so ${mex ? "the player to move wins" : "the player to move loses"}` : `0 stones: no move, so the player to move loses. Number 0`;
    }
    look = []; cur = -1;
    yield `losing sizes: ${g.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0).join(", ")}, a pattern that repeats every 7. ${calls} steps in all`;
  }
  function draw() {
    for (let n = 0; n < N; n++) {
      const x = -3.0 + n * 0.4, known = g[n] !== undefined, hot = visits[n] || 0;
      const h = mode === "rec" ? 0.3 + Math.min(2.2, Math.log2(1 + hot) * 0.24) : 0.5;
      W.box("p" + n, { x, y: -1.4 + h / 2, z: 0, sx: 0.32, sy: h, sz: 0.4, color: mode === "rec" ? (n === cur ? "c1" : hot ? "c4" : "c5") : known ? (g[n] ? "c3" : "c1") : "c5",
        glow: n === cur ? 0.4 : look.includes(n) ? 0.25 : 0, opacity: 0.92,
        label: mode === "rec" ? (hot ? `${hot}` : "") : known ? `${g[n]}` : "", labelSize: 0.16, labelUp: 0.2,
        info: { title: `${n} stones`, html: mode === "rec" ? `<p>Solved ${hot} time${hot === 1 ? "" : "s"} by the recursion. The answer is the same every time.</p>` : known ? `<p>Grundy number ${g[n]}: ${g[n] ? "the player to move can win" : "whoever moves from here loses"}.</p>` : `<p>Not filled in yet.</p>` } });
      W.label("n" + n, `${n}`, [x, -1.8, 0.2], { color: "muted", size: 0.14 });
    }
  }
  function show() { api.status(`${mode === "rec" ? "plain recursion" : "table + mex"} · ${calls} steps\n${line}`); }
  function reset() { visits = new Array(N).fill(0); g = []; calls = 0; cur = -1; look = []; line = ""; gen = mode === "rec" ? recursion() : table(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = calls;
    if (mode === "rec") api.explain(`${calls} calls`, `<p>Small piles were solved hundreds of times (the tall bars). The work grows exponentially with the pile size.</p><p>Switch to <b>table + mex</b> and run it.</p>`);
    else if (ran.rec !== undefined && !reached) { reached = true; api.explain("Solve each size once", `<p>${calls} steps against ${ran.rec}. Each size wins if some move reaches a 0; its number is the smallest value its moves don't reach.</p><p>For several piles at once, XOR their numbers: 0 means the player to move loses (Sprague-Grundy).</p>`); api.done("You solved a game"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(700); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "plain recursion", value: "rec" }, { label: "table + mex", value: "table" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0, 0], dist: 9.5, theta: 0, phi: 1.5, instant: true });
  api.hud("take 1, 3 or 4 stones; whoever can't move loses · one bar per pile size 0–15 · recursion: bar height = times solved · table: green = win, red = lose, label = Grundy number");
  reset();
  api.explain("How to read this", `<p>For each pile size, does the player to move win? <b>Run all</b> with <b>plain recursion</b>, then with <b>table + mex</b>.</p>`);
});
