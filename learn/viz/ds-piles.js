/* DSA, chapter 32: interval DP (merging piles).
   Six files sit in a row; merging two neighbouring files costs their combined size, and you keep
   merging until one file is left. Find the cheapest order.
   The "why": greedy merges the cheapest neighbouring pair each time (101), but an early cheap merge
   can create a big file that gets paid for again in every later merge. Interval DP asks, for every
   stretch i..j, "cheapest way to merge just these into one?", trying each last split k:
   cost(i..k) + cost(k+1..j) + size(i..j). Shorter stretches first, so the answer for 0..5 is 93. */
VIZ.register("ds-piles", async (api) => {
  const W = await api.world3d();
  const S = [7, 3, 7, 2, 9, 9], N = S.length;
  const pre = [0]; S.forEach((x) => pre.push(pre.at(-1) + x));
  const size = (i, j) => pre[j + 1] - pre[i];
  let mode = "greedy", gen = null, steps = 0, cost = 0, piles = [], dp = [], split = [], cur = null, reads = [], hot = null, running = false, ran = {}, reached = false, line = "";
  function merge(k) {
    const a = piles[k], b = piles[k + 1], m = { lo: a.lo, hi: b.hi, size: a.size + b.size };
    piles.splice(k, 2, m); cost += m.size; hot = m;
    return m;
  }
  function* greedy() {
    while (piles.length > 1) {
      steps++;
      let k = 0;
      for (let t = 1; t < piles.length - 1; t++) if (piles[t].size + piles[t + 1].size < piles[k].size + piles[k + 1].size) k = t;
      const m = merge(k);
      yield `cheapest neighbours right now: merge into a file of ${m.size}. Cost so far ${cost}`;
    }
    hot = null;
    yield `greedy total: ${cost}`;
  }
  function* table() {
    dp = Array.from({ length: N }, () => Array(N).fill(undefined)); split = Array.from({ length: N }, () => Array(N).fill(-1));
    for (let i = 0; i < N; i++) { dp[i][i] = 0; }
    steps++; cur = null; yield "a single file costs nothing to merge: the diagonal is all 0";
    for (let len = 2; len <= N; len++) for (let i = 0; i + len - 1 < N; i++) {
      const j = i + len - 1; steps++; cur = [i, j];
      let best = Infinity, bk = -1;
      for (let k = i; k < j; k++) { const c = dp[i][k] + dp[k + 1][j]; if (c < best) { best = c; bk = k; } }
      dp[i][j] = best + size(i, j); split[i][j] = bk;
      reads = [[i, bk], [bk + 1, j]];
      yield `files ${i}..${j}: best last split after file ${bk}: ${dp[i][bk]} + ${dp[bk + 1][j]} + size ${size(i, j)} = ${dp[i][j]}`;
    }
    reads = []; cur = null;
    function* play(i, j) {
      if (i === j) return;
      const k = split[i][j];
      yield* play(i, k); yield* play(k + 1, j);
      steps++; cur = [i, j];
      const at = piles.findIndex((p) => p.lo === i);
      const m = merge(at);
      yield `play the plan: merge files ${i}..${k} with ${k + 1}..${j} (size ${m.size}). Cost so far ${cost}`;
    }
    yield* play(0, N - 1);
    hot = null; cur = null;
    yield `DP total: ${cost}`;
  }
  function draw() {
    for (let lo = 0; lo < N; lo++) for (let hi = lo; hi < N; hi++) {
      const p = piles.find((q) => q.lo === lo && q.hi === hi), sz = size(lo, hi), h = sz * 0.11;
      W.box(`p${lo}_${hi}`, { x: -6 + ((lo + hi) / 2) * 1.0, y: -2.6 + h / 2, z: 0, sx: (hi - lo + 1) * 1.0 - 0.15, sy: h, sz: 0.6, visible: !!p, color: p && p === hot ? "c1" : lo === hi ? "c5" : "c2", glow: p && p === hot ? 0.4 : 0, opacity: 0.92,
        label: String(sz), labelSize: 0.28, labelUp: 0, info: { title: lo === hi ? `File ${lo}` : `Files ${lo}..${hi} merged`, html: `<p>Size ${sz}.</p>` } });
    }
    for (let i = 0; i < N; i++) W.label("fi" + i, String(i), [-6 + i, -3.05, 0.3], { color: "muted", size: 0.22 });
    const tb = mode === "dp";
    for (let i = 0; i < N; i++) for (let j = i; j < N; j++) {
      const v = dp[i] && dp[i][j], h = cur && cur[0] === i && cur[1] === j, rd = reads.some(([a, b]) => a === i && b === j);
      W.box(`t${i}_${j}`, { x: 1 + j * 0.85, y: 1.9 - i * 0.8, z: 0, sx: 0.78, sy: 0.72, sz: 0.25, color: h ? "c1" : rd ? "c4" : v !== undefined ? "c5" : "muted", glow: h || rd ? 0.35 : 0, opacity: tb ? 0.95 : 0.12,
        label: tb && v !== undefined ? String(v) : "", labelSize: 0.22, labelUp: 0,
        info: { title: `Files ${i}..${j}`, html: `<p>Cheapest cost to merge them into one: ${v ?? "not filled yet"}.${split[i] && split[i][j] >= 0 ? ` Best last split: after file ${split[i][j]}.` : ""}</p>` } });
    }
    for (let j = 0; j < N; j++) W.label("tj" + j, `j=${j}`, [1 + j * 0.85, 2.6, 0.3], { color: tb ? "muted" : "line", size: 0.2 });
    for (let i = 0; i < N; i++) W.label("ti" + i, `i=${i}`, [0.2 + i * 0.85, 1.9 - i * 0.8, 0.3], { color: tb ? "muted" : "line", size: 0.2 });
  }
  function show() { api.status(`${mode === "greedy" ? "greedy: cheapest neighbours first" : "interval DP"} · ${steps} step${steps === 1 ? "" : "s"} · cost so far ${cost}\n${line}`); }
  function reset() { steps = 0; cost = 0; piles = S.map((s, i) => ({ lo: i, hi: i, size: s })); dp = []; split = []; cur = null; reads = []; hot = null; line = ""; gen = mode === "greedy" ? greedy() : table(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = cost;
    if (mode === "greedy") api.explain(`Cost ${cost}`, `<p>Each merge was the cheapest one available at the time, but every later merge pays again for the whole file it touches, so what you build early matters.</p><p>Switch to <b>interval DP</b> and run it.</p>`);
    else if (ran.greedy && !reached) { reached = true; api.explain("Shortest stretches first", `<p>Cost ${cost} against greedy's ${ran.greedy}. Cell (i, j) is the cheapest way to merge files i..j into one: try every last split k, add the two halves and the size of the whole stretch.</p><p>Cells are filled by stretch length, so the halves are always ready. O(n²) cells × O(n) splits = O(n³).</p>`); api.done("You planned merges with interval DP"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "greedy" ? 900 : 520); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "greedy: cheapest neighbours", value: "greedy" }, { label: "interval DP", value: "dp" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [-0.4, -0.2, 0], dist: 17.5, theta: 0, phi: 1.5, instant: true });
  api.hud("left: the files (height = size; merging two neighbours costs their total) · right: cell (i, j) = cheapest way to merge files i..j · amber = the two halves of the best split");
  reset();
  api.explain("How to read this", `<p>Merge six files into one. Merging two neighbours costs their combined size. <b>Run all</b> with <b>greedy</b>, then with <b>interval DP</b>.</p>`);
});
