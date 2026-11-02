/* DSA, chapter 27: backtracking prunes a search tree.
   Place 6 queens on a 6 × 6 board so no two attack each other (same column or diagonal).
   The "why": brute force builds complete arrangements, one queen per row, and only then checks
   them: 6⁶ = 46,656 boards, 12,760 of them before the first valid one. Backtracking places one queen
   at a time and abandons a partial board the moment it's broken, so a bad first two queens rule
   out 1,296 full boards at once. Same answer, a tiny fraction of the work: that's pruning. */
VIZ.register("ds-queens", async (api) => {
  const W = await api.world3d();
  const N = 6;
  let mode = "brute", gen = null, steps = 0, cols = [], bad = [], tryCell = null, solved = false, running = false, ran = {}, reached = false, line = "";
  const clash = (r1, c1, r2, c2) => c1 === c2 || Math.abs(c1 - c2) === Math.abs(r1 - r2);
  function* brute() {
    for (let idx = 0; idx < N ** N; idx++) {
      let x = idx; cols = []; for (let r = N - 1; r >= 0; r--) { cols[r] = x % N; x = Math.floor(x / N); }
      steps++; bad = [];
      for (let a = 0; a < N && !bad.length; a++) for (let b = a + 1; b < N; b++) if (clash(a, cols[a], b, cols[b])) { bad = [a, b]; break; }
      if (!bad.length) { solved = true; yield `board #${steps}: no two queens attack. Found it`; return; }
      yield `board #${steps} [${cols.join(" ")}]: rows ${bad[0]} and ${bad[1]} attack each other`;
    }
  }
  function* back(r) {
    if (r === N) { solved = true; tryCell = null; yield `all ${N} queens placed safely`; return true; }
    for (let c = 0; c < N; c++) {
      steps++; tryCell = [r, c];
      const hit = cols.findIndex((cc, rr) => clash(rr, cc, r, c));
      if (hit >= 0) { bad = [hit, r]; yield `row ${r}, column ${c}: attacked by the queen in row ${hit}. Skip`; bad = []; continue; }
      cols[r] = c; tryCell = null;
      yield `row ${r}, column ${c}: safe. Place it and go to row ${r + 1}`;
      if (yield* back(r + 1)) return true;
      cols.length = r; tryCell = null;
      yield `row ${r + 1} had no safe square: take the row ${r} queen back off`;
    }
    return false;
  }
  function draw() {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const q = cols[r] === c, t = tryCell && tryCell[0] === r && tryCell[1] === c, b = q && bad.includes(r);
      W.box(`s${r}_${c}`, { x: -3 + c * 1.2, y: 3 - r * 1.2, z: 0, sx: 1.1, sy: 1.1, sz: 0.15, color: (r + c) % 2 ? "muted" : "c5", opacity: 0.5 });
      W.box(`q${r}_${c}`, { x: -3 + c * 1.2, y: 3 - r * 1.2, z: 0.4, sx: 0.6, sy: 0.6, sz: 0.7, visible: q || !!t, color: t ? (bad.length ? "bad" : "c4") : b ? "bad" : solved ? "c3" : "c1", glow: t || b ? 0.4 : 0, opacity: t ? 0.6 : 0.95,
        label: q ? "Q" : "?", labelSize: 0.3, labelUp: 0, info: { title: `Row ${r}, column ${c}`, html: q ? "<p>A queen.</p>" : "<p>Being tried.</p>" } });
    }
  }
  function show() { api.status(`${mode === "brute" ? "brute force: whole boards" : "backtracking: one queen at a time"} · ${steps} ${mode === "brute" ? "board" : "square"}${steps === 1 ? "" : "s"} tried${solved ? " · solved" : ""}\n${line}`); }
  function reset() { steps = 0; cols = []; bad = []; tryCell = null; solved = false; line = ""; gen = mode === "brute" ? brute() : back(0); draw(); show(); }
  function step(quiet) {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; if (!quiet || solved) { draw(); show(); } return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = steps;
    if (mode === "brute") api.explain(`${steps.toLocaleString("en")} whole boards`, `<p>Brute force built ${steps} complete boards and checked each one. Most were doomed by their first two queens, but it couldn't know until the board was full. For 8 queens it's 16.7 million boards.</p><p>Switch to <b>backtracking</b> and step through it.</p>`);
    else if (ran.brute && !reached) { reached = true; api.explain("Give up early", `<p>Backtracking: ${steps} squares tried, against ${ran.brute.toLocaleString("en")} whole boards. As soon as a queen is attacked, it skips that square; when a row has no safe square, it undoes the previous choice and tries the next one.</p><p>Choose, explore, un-choose. Every subset, permutation and puzzle search in this chapter has that shape.</p>`); api.done("You solved a puzzle by backtracking"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; let k = 0;
    if (mode === "brute") while (step(++k % 40 !== 0)) { if (k % 40 === 0) await api.sleep(16); }
    else while (step()) await api.sleep(160);
    running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "brute force", value: "brute" }, { label: "backtracking", value: "back" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0, 0], dist: 15, theta: 0, phi: 1.5, instant: true });
  api.hud("Q = a queen · red = two queens that attack each other · amber ? = the square being tried · green = solved");
  reset();
  api.explain("How to read this", `<p>Put 6 queens on the board so none can attack another along a row, column or diagonal. <b>Run all</b> with <b>brute force</b>, then with <b>backtracking</b>.</p>`);
});
