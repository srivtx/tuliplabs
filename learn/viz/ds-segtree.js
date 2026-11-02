/* DSA, chapter 43: segment trees.
   16 numbers, and a stream of jobs: "sum of positions l..r" and "change position i".
   The "why": adding up the range cell by cell costs up to n reads per query. Prefix sums (chapter 4)
   answer in O(1) but every update rewrites up to n of them. A segment tree stores the sum of every
   aligned block: pairs, fours, eights, the whole array. A range is covered by at most ~2 log n of
   those blocks, and an update only changes the log n blocks above one cell. Both O(log n). */
VIZ.register("ds-segtree", async (api) => {
  const W = await api.world3d();
  const START = [5, 3, 8, 6, 1, 4, 7, 2, 9, 5, 3, 8, 2, 6, 4, 1], N = 16, LV = 5, SP = 0.7;
  const JOBS = [["sum", 1, 14], ["set", 5, 11], ["sum", 0, 15], ["sum", 2, 13], ["set", 10, 0], ["sum", 1, 15], ["sum", 3, 12], ["sum", 0, 14]];
  let mode = "naive", gen = null, ops = 0, a = [], t = [], hot = new Set(), used = new Set(), rangeL = -1, rangeR = -1, answers = [], running = false, ran = {}, reached = false, line = "";
  const node = (lv, j) => (N >> lv) + j;
  function build() { t = Array(2 * N).fill(0); for (let i = 0; i < N; i++) t[N + i] = a[i]; for (let i = N - 1; i > 0; i--) t[i] = t[2 * i] + t[2 * i + 1]; }
  function* naive() {
    for (const [k, x, y] of JOBS) {
      hot = new Set(); used = new Set(); rangeL = rangeR = -1;
      if (k === "set") { ops++; a[x] = y; used.add(N + x); yield `set position ${x} to ${y}: one write`; continue; }
      rangeL = x; rangeR = y; let s = 0;
      for (let i = x; i <= y; i++) { ops++; s += a[i]; used.add(N + i); }
      answers.push(s);
      yield `sum of ${x}..${y}: read ${y - x + 1} cells one by one = ${s}`;
    }
    hot = new Set(); used = new Set(); rangeL = rangeR = -1;
    yield `${JOBS.length} jobs done with ${ops} cell reads and writes`;
  }
  function* tree() {
    build();
    for (const [k, x, y] of JOBS) {
      hot = new Set(); used = new Set(); rangeL = rangeR = -1;
      if (k === "set") {
        let i = N + x; a[x] = y; t[i] = y; ops++; used.add(i);
        while (i > 1) { i >>= 1; t[i] = t[2 * i] + t[2 * i + 1]; ops++; hot.add(i); }
        yield `set position ${x} to ${y}: fix the ${hot.size} blocks above it, up to the root`;
        continue;
      }
      rangeL = x; rangeR = y; let s = 0, l = x + N, r = y + N + 1;
      while (l < r) {
        if (l & 1) { s += t[l]; used.add(l); ops++; l++; }
        if (r & 1) { r--; s += t[r]; used.add(r); ops++; }
        l >>= 1; r >>= 1;
      }
      answers.push(s);
      yield `sum of ${x}..${y}: ${used.size} whole block${used.size === 1 ? " covers" : "s cover"} it = ${s}`;
    }
    hot = new Set(); used = new Set(); rangeL = rangeR = -1;
    yield `${JOBS.length} jobs done with ${ops} block reads and writes`;
  }
  function draw() {
    const tr = mode === "tree";
    for (let lv = 0; lv < LV; lv++) {
      const cnt = N >> lv;
      for (let j = 0; j < cnt; j++) {
        const id = node(lv, j), w = (1 << lv), cx = (-N / 2 + j * w + w / 2) * SP, v = lv === 0 ? a[j] : t[id], h = hot.has(id), u = used.has(id);
        const inR = lv === 0 && rangeL >= 0 && j >= rangeL && j <= rangeR;
        W.box(`n${lv}_${j}`, { x: cx, y: -2.4 + lv * 1.15, z: 0, sx: w * SP - 0.08, sy: 0.8, sz: 0.3, visible: lv === 0 || tr, color: h ? "c4" : u ? (lv === 0 && !tr && rangeL < 0 ? "c1" : "c3") : inR ? "c2" : lv === 0 ? "c5" : "c2", glow: h || u ? 0.3 : 0, opacity: u || h ? 0.95 : inR ? 0.75 : lv === 0 ? 0.8 : 0.45,
          label: v !== undefined ? String(v) : "", labelSize: 0.24, labelUp: 0,
          info: { title: lv === 0 ? `Position ${j}` : `Block ${j * w}..${j * w + w - 1}`, html: `<p>${lv === 0 ? `Value ${v}.` : `Sum of ${w} cells: ${v}.`}</p>` } });
      }
    }
    for (let i = 0; i < N; i++) W.label("ix" + i, String(i), [(-N / 2 + i + 0.5) * SP, -3.15, 0.3], { color: "muted", size: 0.18 });
  }
  function show() { api.status(`${mode === "naive" ? "read the range cell by cell" : "segment tree"} · ${ops} reads and writes${answers.length ? ` · sums so far: ${answers.join(", ")}` : ""}\n${line}`); }
  function reset() { ops = 0; a = START.slice(); t = []; hot = new Set(); used = new Set(); rangeL = rangeR = -1; answers = []; line = ""; if (mode === "tree") build(); gen = mode === "naive" ? naive() : tree(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = ops;
    if (mode === "naive") api.explain(`${ops} reads and writes`, `<p>Updates were cheap, but each sum walked the whole range. With 10⁵ numbers and 10⁵ queries, that's 10¹⁰.</p><p>Switch to <b>segment tree</b> and run it.</p>`);
    else if (ran.naive && !reached) { reached = true; api.explain("Pre-added blocks", `<p>Same sums with ${ops} against ${ran.naive}. Every block of 2, 4, 8 and 16 aligned cells keeps its sum. A query takes the few big blocks that fit inside the range; an update fixes one block per level.</p><p>Both O(log n): about 34 steps for 10⁵ numbers. It works for min, max or gcd as well.</p>`); api.done("You answered range queries with a segment tree"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(1300); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "cell by cell", value: "naive" }, { label: "segment tree", value: "tree" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, -0.1, 0], dist: 18.5, theta: 0, phi: 1.5, instant: true });
  api.hud("bottom row: 16 numbers · blue = the range being summed · green = cells or blocks read · amber = blocks fixed by an update · each block above holds the sum of the cells under it");
  reset();
  api.explain("How to read this", `<p>Eight jobs: range sums and single updates. <b>Run all</b> with <b>cell by cell</b>, then with <b>segment tree</b>.</p>`);
});
