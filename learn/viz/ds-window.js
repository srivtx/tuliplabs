/* DSA, chapter 8: sliding window.
   Longest stretch of a string with no repeated letter.
   The "why": restarting from every position and scanning forward re-reads the same letters over
   and over: O(n²). A window [L, R] that only ever moves right fixes that: R takes in a new letter;
   if it's already inside, L moves right (dropping letters) until it isn't. Each letter enters
   once and leaves at most once, so the whole thing is O(n). */
VIZ.register("ds-window", async (api) => {
  const W = await api.world3d();
  const S = "abcbdaefcgbhd".split("");
  const N = S.length, X = (i) => -6.6 + i * 1.1;
  let mode = "naive", gen = null, steps = 0, L = 0, R = -1, best = [0, -1], scan = -1, running = false, ran = {}, reached = false, line = "";
  function* naive() {
    for (let i = 0; i < N; i++) {
      const seen = new Set(); L = i;
      for (let j = i; j < N; j++) {
        steps++; R = j; scan = j;
        if (seen.has(S[j])) { R = j - 1; yield `start ${i}: '${S[j]}' repeats, stop`; break; }
        seen.add(S[j]);
        if (j - i > best[1] - best[0]) best = [i, j];
        yield `start ${i}: '${S.slice(i, j + 1).join("")}' has no repeats`;
      }
    }
    scan = -1;
  }
  function* window_() {
    const inside = new Set(); L = 0;
    for (let r = 0; r < N; r++) {
      scan = r;
      while (inside.has(S[r])) { steps++; inside.delete(S[L]); yield `'${S[r]}' is already in the window: drop '${S[L]}', L moves right`; L++; }
      steps++; inside.add(S[r]); R = r;
      if (R - L > best[1] - best[0]) best = [L, R];
      yield `take in '${S[r]}': window '${S.slice(L, R + 1).join("")}' (length ${R - L + 1})`;
    }
    scan = -1;
  }
  function draw() {
    S.forEach((c, i) => {
      const inW = i >= L && i <= R, isBest = i >= best[0] && i <= best[1], cur = i === scan;
      W.box("c" + i, { x: X(i), y: 0, z: 0, s: 0.9, color: cur ? "c4" : inW ? "c2" : "c5", glow: cur ? 0.4 : 0, opacity: inW || cur ? 0.95 : 0.35,
        label: c, labelSize: 0.38, labelUp: 0,
        info: { title: `'${c}' at position ${i}`, html: mode === "win" ? "<p>Blue letters are inside the window. R only moves right, L only moves right, so every letter is looked at a constant number of times.</p>" : "<p>The naive way starts again from every position, re-reading letters it has already seen.</p>" } });
      W.box("best" + i, { x: X(i), y: -0.85, z: 0, sx: 1.05, sy: 0.16, sz: 0.9, color: "c3", opacity: isBest ? 0.9 : 0.04 });
    });
    W.label("L", R >= L ? "L" : null, [X(L), 0.95, 0.5], { color: "c1", size: 0.4 });
    W.label("R", R >= L ? "R" : null, [X(Math.max(R, 0)), 0.95, 0.5], { color: "c1", size: 0.4 });
  }
  function show() { api.status(`${mode === "naive" ? "restart from every letter" : "sliding window"} · ${steps} step${steps === 1 ? "" : "s"} · best so far '${S.slice(best[0], best[1] + 1).join("")}' (${best[1] - best[0] + 1})\n${line}`); }
  function reset() { steps = 0; L = 0; R = -1; best = [0, -1]; scan = -1; line = ""; gen = mode === "naive" ? naive() : window_(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { line = "done"; draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = steps;
    if (mode === "naive") api.explain(`${steps} steps`, `<p>Every start re-read letters the previous start had already checked. For a string of n different-ish letters that's up to n²/2.</p><p>Switch to <b>sliding window</b> and run it.</p>`);
    else if (ran.naive && !reached) { reached = true; api.explain("Each letter in once, out once", `<p>${steps} steps instead of ${ran.naive}. R never goes back and L never goes back, so there are at most 2n moves in total: O(n), even though there's a loop inside a loop.</p>`); api.done("You slid a window"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "naive" ? 110 : 450); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "restart from every letter", value: "naive" }, { label: "sliding window", value: "win" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0, 0], dist: 19.5, theta: 0, phi: 1.35, instant: true });
  api.hud("longest stretch with no repeated letter · blue = window · yellow = letter being read · green bar = best so far");
  reset();
  api.explain("How to read this", `<p>Find the longest stretch with no repeated letter. <b>Run all</b> the naive way first, then switch to <b>sliding window</b> and step through it.</p>`);
});
