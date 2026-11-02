/* DSA, chapter 36: speeding up a DP transition with a running window sum.
   A frog crosses 20 stones, jumping 1 to 5 stones at a time; four stones are broken. How many ways
   can it reach each stone? ways[i] = ways[i − 1] + … + ways[i − 5] (0 on a broken stone).
   The "why": the recurrence is right, but adding up the window from scratch costs k reads per stone:
   O(n·k), which is 10¹⁰ for n = k = 10⁵. Neighbouring windows share all but two cells, so keep a
   running total: add the stone that enters, subtract the one that leaves. Two operations per stone,
   O(n). Same table, same numbers; the speed-up is in how each cell is computed. */
VIZ.register("ds-frog", async (api) => {
  const W = await api.world3d();
  const N = 20, K = 5, BROKEN = new Set([4, 9, 10, 15]);
  let mode = "naive", gen = null, ops = 0, ways = [], cur = -1, reads = [], win = 0, running = false, ran = {}, reached = false, line = "";
  function* naive() {
    ways[0] = 1; cur = 0; ops++; yield "stone 0: the frog starts here, 1 way";
    for (let i = 1; i < N; i++) {
      cur = i; reads = [];
      if (BROKEN.has(i)) { ways[i] = 0; ops++; yield `stone ${i} is broken: 0 ways`; continue; }
      let s = 0;
      for (let j = Math.max(0, i - K); j < i; j++) { ops++; s += ways[j]; reads.push(j); yield `stone ${i}: add stone ${j} (${ways[j]}), running total ${s}`; }
      ways[i] = s;
      yield `stone ${i}: ${s} ways`;
    }
    cur = -1; reads = [];
    yield `${ways[N - 1]} ways to reach the far bank, ${ops} operations`;
  }
  function* sliding() {
    ways[0] = 1; cur = 0; ops++; win = 0; yield "stone 0: the frog starts here, 1 way";
    for (let i = 1; i < N; i++) {
      cur = i;
      ops++; win += ways[i - 1]; reads = [i - 1];
      let msg = `stone ${i}: stone ${i - 1} enters the window (+${ways[i - 1]})`;
      if (i - K - 1 >= 0) { ops++; win -= ways[i - K - 1]; reads.push(i - K - 1); msg += `, stone ${i - K - 1} leaves (−${ways[i - K - 1]})`; }
      ways[i] = BROKEN.has(i) ? 0 : win;
      yield `${msg}. Window total ${win}${BROKEN.has(i) ? ", but this stone is broken: 0" : ""}`;
    }
    cur = -1; reads = [];
    yield `${ways[N - 1]} ways to reach the far bank, ${ops} operations`;
  }
  function draw() {
    for (let i = 0; i < N; i++) {
      const x = -5.7 + i * 0.6, hot = i === cur, rd = reads.includes(i), inWin = cur > 0 && i < cur && i >= cur - K;
      W.box("s" + i, { x, y: 0.6, z: 0, sx: 0.52, sy: 0.4, sz: 0.4, color: BROKEN.has(i) ? "bad" : hot ? "c1" : rd ? "c4" : inWin ? "c2" : ways[i] !== undefined ? "c3" : "c5", glow: hot || rd ? 0.35 : 0, opacity: BROKEN.has(i) ? 0.5 : 0.92,
        info: { title: `Stone ${i}`, html: `<p>${BROKEN.has(i) ? "Broken: the frog can't land here." : `Ways to land here: ${ways[i] ?? "not known yet"}.`}</p>` } });
      W.label("w" + i, ways[i] !== undefined ? String(ways[i]) : "", [x, 1.25 + (i % 2) * 0.35, 0.4], { color: hot ? "c1" : "ink", size: 0.2 });
      W.label("i" + i, String(i), [x, 0.05, 0.3], { color: "muted", size: 0.18 });
    }
    W.label("winl", mode === "slide" && cur > 0 ? `window total ${win}` : "", [0, -0.9, 0.3], { color: "c2", size: 0.28 });
  }
  function show() { api.status(`${mode === "naive" ? "re-add the window every time" : "running window total"} · ${ops} operation${ops === 1 ? "" : "s"}\n${line}`); }
  function reset() { ops = 0; ways = []; cur = -1; reads = []; win = 0; line = ""; gen = mode === "naive" ? naive() : sliding(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = ops;
    if (mode === "naive") api.explain(`${ops} operations`, `<p>Each stone re-added up to ${K} earlier stones, even though the previous stone had just added almost the same ones. O(n·k).</p><p>Switch to <b>running window total</b> and run it.</p>`);
    else if (ran.naive && !reached) { reached = true; api.explain("Reuse the last window", `<p>${ops} operations against ${ran.naive}, same answer. Moving one stone right, one stone enters the window and one leaves: add one, subtract one.</p><p>Many DP speed-ups are like this: the recurrence stays the same, and a prefix sum, a monotonic deque or a sorted structure makes each transition O(1) or O(log n).</p>`); api.done("You sped up a DP transition"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "naive" ? 110 : 450); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "re-add the window", value: "naive" }, { label: "running window total", value: "slide" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.4, 0], dist: 15, theta: 0, phi: 1.5, instant: true });
  api.hud(`jumps of 1 to ${K} stones · red stones are broken · number above = ways to land there · blue = the window of stones it can jump from · amber = being added or removed`);
  reset();
  api.explain("How to read this", `<p>Count the ways to reach every stone. <b>Run all</b> with <b>re-add the window</b>, then with <b>running window total</b>.</p>`);
});
