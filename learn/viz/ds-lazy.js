/* DSA, chapter 44: lazy propagation.
   16 numbers, and jobs like "add 3 to every position from 2 to 13" mixed with range sums.
   The "why": a plain segment tree updates one position at a time, so a range update is r − l + 1
   point updates, O(n log n). Lazy propagation stops at the blocks that sit wholly inside the range,
   fixes their sums at once (sum += v × size) and leaves a note, "+v owed to everything below". The
   note is passed down only when a later job needs to look inside that block. Range update and range
   query both become O(log n). */
VIZ.register("ds-lazy", async (api) => {
  const W = await api.world3d();
  const START = [5, 3, 8, 6, 1, 4, 7, 2, 9, 5, 3, 8, 2, 6, 4, 1], N = 16, SP = 0.7;
  const JOBS = [["add", 2, 13, 3], ["add", 0, 15, 1], ["sum", 4, 11], ["add", 5, 8, 2], ["sum", 0, 15], ["add", 1, 14, -1], ["sum", 3, 12]];
  let mode = "naive", gen = null, ops = 0, a = [], s = [], lz = [], hot = new Set(), used = new Set(), rangeL = -1, rangeR = -1, answers = [], running = false, ran = {}, reached = false, line = "";
  function build(x, lo, hi) { lz[x] = 0; if (lo === hi) { s[x] = a[lo]; return; } const m = (lo + hi) >> 1; build(2 * x, lo, m); build(2 * x + 1, m + 1, hi); s[x] = s[2 * x] + s[2 * x + 1]; }
  function apply(x, lo, hi, v) { s[x] += v * (hi - lo + 1); lz[x] += v; }
  function push(x, lo, hi) { if (lz[x]) { const m = (lo + hi) >> 1; apply(2 * x, lo, m, lz[x]); apply(2 * x + 1, m + 1, hi, lz[x]); lz[x] = 0; hot.add(2 * x); hot.add(2 * x + 1); } }
  function add(x, lo, hi, l, r, v) {
    if (r < lo || hi < l) return; ops++;
    if (l <= lo && hi <= r) { apply(x, lo, hi, v); used.add(x); return; }
    push(x, lo, hi); const m = (lo + hi) >> 1; add(2 * x, lo, m, l, r, v); add(2 * x + 1, m + 1, hi, l, r, v); s[x] = s[2 * x] + s[2 * x + 1];
  }
  function query(x, lo, hi, l, r) {
    if (r < lo || hi < l) return 0; ops++;
    if (l <= lo && hi <= r) { used.add(x); return s[x]; }
    push(x, lo, hi); const m = (lo + hi) >> 1; return query(2 * x, lo, m, l, r) + query(2 * x + 1, m + 1, hi, l, r);
  }
  function* naive() {
    for (const [k, l, r, v] of JOBS) {
      used = new Set(); rangeL = l; rangeR = r;
      if (k === "add") { for (let i = l; i <= r; i++) { a[i] += v; ops++; used.add(N + i); } yield `add ${v} to ${l}..${r}: rewrite ${r - l + 1} cells one by one`; continue; }
      let t = 0; for (let i = l; i <= r; i++) { t += a[i]; ops++; used.add(N + i); }
      answers.push(t); yield `sum of ${l}..${r}: read ${r - l + 1} cells = ${t}`;
    }
    used = new Set(); rangeL = rangeR = -1;
    yield `${JOBS.length} jobs done with ${ops} cell reads and writes`;
  }
  function* lazy() {
    for (const [k, l, r, v] of JOBS) {
      used = new Set(); hot = new Set(); rangeL = l; rangeR = r;
      if (k === "add") { add(1, 0, N - 1, l, r, v); yield `add ${v} to ${l}..${r}: ${used.size} block${used.size === 1 ? "" : "s"} take the whole change and keep a "+${v}" note for later`; continue; }
      const t = query(1, 0, N - 1, l, r); answers.push(t);
      yield `sum of ${l}..${r} = ${t}${hot.size ? `: notes were passed down to ${hot.size} blocks on the way` : ""}`;
    }
    used = new Set(); hot = new Set(); rangeL = rangeR = -1;
    yield `${JOBS.length} jobs done with ${ops} block visits`;
  }
  function draw() {
    const lzy = mode === "lazy";
    for (let d = 0; d <= 4; d++) {
      const cnt = 1 << d, w = N / cnt;
      for (let j = 0; j < cnt; j++) {
        const x = cnt + j, lv = 4 - d, cx = (-N / 2 + j * w + w / 2) * SP, leaf = d === 4;
        const v = lzy ? s[x] : leaf ? a[j] : undefined, u = lzy ? used.has(x) : leaf && used.has(N + j), h = lzy && hot.has(x);
        const inR = leaf && rangeL >= 0 && j >= rangeL && j <= rangeR;
        W.box(`n${d}_${j}`, { x: cx, y: -2.4 + lv * 1.15, z: 0, sx: w * SP - 0.08, sy: 0.8, sz: 0.3, visible: leaf || lzy, color: u ? "c3" : h ? "c4" : inR ? "c2" : leaf ? "c5" : "c2", glow: u || h ? 0.3 : 0, opacity: u || h ? 0.95 : inR ? 0.75 : leaf ? 0.8 : 0.45,
          label: v !== undefined ? String(v) : "", labelSize: 0.24, labelUp: 0,
          info: { title: leaf ? `Position ${j}` : `Block ${j * w}..${j * w + w - 1}`, html: `<p>${leaf ? "One number." : `Sum of ${w} cells.`}${lzy && lz[x] ? ` It owes ${lz[x] > 0 ? "+" : ""}${lz[x]} to every cell below, not passed down yet.` : ""}</p>` } });
        W.label(`lz${d}_${j}`, lzy && lz[x] ? `${lz[x] > 0 ? "+" : ""}${lz[x]}` : "", [cx + (w * SP) / 2 - 0.22, -2.4 + lv * 1.15 + 0.5, 0.4], { color: "c1", size: 0.22 });
      }
    }
    for (let i = 0; i < N; i++) W.label("ix" + i, String(i), [(-N / 2 + i + 0.5) * SP, -3.15, 0.3], { color: "muted", size: 0.18 });
  }
  function show() { api.status(`${mode === "naive" ? "touch every cell" : "lazy segment tree"} · ${ops} ${mode === "naive" ? "cell reads and writes" : "block visits"}${answers.length ? ` · sums: ${answers.join(", ")}` : ""}\n${line}`); }
  function reset() { ops = 0; a = START.slice(); s = []; lz = []; hot = new Set(); used = new Set(); rangeL = rangeR = -1; answers = []; line = ""; build(1, 0, N - 1); gen = mode === "naive" ? naive() : lazy(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = ops;
    if (mode === "naive") api.explain(`${ops} reads and writes`, `<p>Range additions rewrote every cell in the range, and sums read every cell. Both O(n) per job.</p><p>Switch to <b>lazy segment tree</b> and run it.</p>`);
    else if (ran.naive && !reached) { reached = true; api.explain("Owe it, don't do it", `<p>Same sums with ${ops} block visits against ${ran.naive}. A block fully inside an update fixes its own sum (+v × its size) and writes a red note. The note moves down only when a later job looks inside.</p><p>Range update and range query are both O(log n).</p>`); api.done("You used lazy propagation"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(1400); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "touch every cell", value: "naive" }, { label: "lazy segment tree", value: "lazy" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, -0.1, 0], dist: 18.5, theta: 0, phi: 1.5, instant: true });
  api.hud("bottom row: 16 numbers · blue = the job's range · green = cells or blocks used · red +v = a note owed to everything below · amber = notes just passed down");
  reset();
  api.explain("How to read this", `<p>Seven jobs: add to a range, or sum a range. <b>Run all</b> with <b>touch every cell</b>, then with <b>lazy segment tree</b>.</p>`);
});
