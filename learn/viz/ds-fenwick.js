/* DSA, chapter 45: Fenwick trees.
   16 numbers, and jobs mixing "add v at position i" with "sum of the first i numbers".
   The "why": a plain array updates in one step but a prefix sum reads up to n cells. A prefix-sum
   array reads in one step but an update rewrites up to n cells. A Fenwick tree keeps 16 partial
   sums, where box i covers the lowbit(i) cells ending at i. A prefix sum hops down by i -= i & -i,
   an update hops up by i += i & -i, and both take at most log2(16) + 1 = 5 hops. */
VIZ.register("ds-fenwick", async (api) => {
  const W = await api.world3d();
  const START = [5, 3, 8, 6, 1, 4, 7, 2, 9, 5, 3, 8, 2, 6, 4, 1], N = 16, SP = 0.72;
  const JOBS = [["sum", 13], ["add", 3, 4], ["sum", 16], ["add", 10, -2], ["sum", 11], ["add", 1, 5], ["sum", 7], ["sum", 16]];
  let mode = "naive", gen = null, ops = 0, a = [], t = [], used = new Set(), answers = [], running = false, ran = {}, reached = false, line = "", cur = 0;
  const low = (i) => i & -i;
  function build() { t = new Array(N + 1).fill(0); for (let i = 1; i <= N; i++) { t[i] += a[i - 1]; const j = i + low(i); if (j <= N) t[j] += t[i]; } }
  function* naive() {
    for (const [k, i, v] of JOBS) {
      used = new Set(); cur = i;
      if (k === "add") { a[i - 1] += v; ops++; used.add(i); yield `add ${v} at ${i}: one cell, one write`; continue; }
      let s = 0; for (let j = 1; j <= i; j++) { s += a[j - 1]; ops++; used.add(j); }
      answers.push(s); yield `sum of 1..${i}: read ${i} cells = ${s}`;
    }
    used = new Set(); cur = 0;
    yield `${JOBS.length} jobs done with ${ops} cell reads and writes`;
  }
  function* fen() {
    for (const [k, i, v] of JOBS) {
      used = new Set(); cur = i; const hops = [];
      if (k === "add") { a[i - 1] += v; for (let j = i; j <= N; j += low(j)) { t[j] += v; ops++; used.add(j); hops.push(j); } yield `add ${v} at ${i}: climb i += i & -i through boxes ${hops.join(" → ")}`; continue; }
      let s = 0; for (let j = i; j > 0; j -= low(j)) { s += t[j]; ops++; used.add(j); hops.push(j); }
      answers.push(s); yield `sum of 1..${i} = ${s}: drop i -= i & -i through boxes ${hops.join(" → ")}`;
    }
    used = new Set(); cur = 0;
    yield `${JOBS.length} jobs done with ${ops} box reads and writes`;
  }
  function draw() {
    const fw = mode === "fenwick";
    for (let i = 1; i <= N; i++) {
      const x = (-N / 2 + i - 0.5) * SP, u = !fw && used.has(i);
      W.box("a" + i, { x, y: -2.6, z: 0, sx: SP - 0.08, sy: 0.7, sz: 0.3, color: u ? "c3" : i === cur ? "c4" : "c5", glow: u ? 0.3 : 0, opacity: u ? 0.95 : 0.8,
        label: String(a[i - 1]), labelSize: 0.24, labelUp: 0, info: { title: `Position ${i}`, html: `<p>One number: ${a[i - 1]}.</p>` } });
      W.label("ix" + i, String(i), [x, -3.25, 0.3], { color: "muted", size: 0.18 });
      // box i covers cells i - lowbit(i) + 1 .. i, drawn at the height of its level
      const w = low(i), lv = Math.log2(w), cx = (-N / 2 + i - w / 2) * SP, ub = fw && used.has(i);
      W.box("t" + i, { x: cx, y: -1.75 + lv * 0.95, z: 0, sx: w * SP - 0.1, sy: 0.75, sz: 0.3, visible: fw, color: ub ? "c1" : "c2", glow: ub ? 0.35 : 0, opacity: ub ? 0.95 : 0.4,
        label: fw ? `${i}: ${t[i]}` : "", labelSize: 0.22, labelUp: 0,
        info: { title: `Box ${i}`, html: `<p>Holds the sum of cells ${i - w + 1}..${i}, ${w} cell${w > 1 ? "s" : ""}. Its width is <b>i & -i</b> = ${w}, the lowest set bit of ${i} (${i.toString(2).padStart(5, "0")} in binary).</p><p>So every prefix 1..i splits into at most 5 of these boxes, one per set bit of i.</p>` } });
    }
  }
  function show() { api.status(`${mode === "naive" ? "plain array" : "Fenwick tree"} · ${ops} ${mode === "naive" ? "cell reads and writes" : "box reads and writes"}${answers.length ? ` · sums: ${answers.join(", ")}` : ""}\n${line}`); }
  function reset() { ops = 0; a = START.slice(); used = new Set(); answers = []; line = ""; cur = 0; build(); gen = mode === "naive" ? naive() : fen(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = ops;
    if (mode === "naive") api.explain(`${ops} reads and writes`, `<p>Adds were one write each, but every prefix sum read every cell up to i. O(n) per sum.</p><p>Switch to <b>Fenwick tree</b> and run it.</p>`);
    else if (ran.naive && !reached) { reached = true; api.explain("One box per set bit", `<p>Same sums with ${ops} box visits against ${ran.naive}. Box i holds the last <b>i & -i</b> cells up to i. A sum drops through one box per set bit of i; an add climbs through every box that covers i.</p><p>Both are O(log n), in a single array of n + 1 numbers.</p>`); api.done("You used a Fenwick tree"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(1300); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "plain array", value: "naive" }, { label: "Fenwick tree", value: "fenwick" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, -0.3, 0], dist: 19.5, theta: 0, phi: 1.5, instant: true });
  api.hud("bottom row: 16 numbers, positions 1..16 · blue boxes: box i holds the sum of its last i & -i cells · red = boxes this job touched · amber = the job's position");
  reset();
  api.explain("How to read this", `<p>Eight jobs: add to one position, or sum the first i numbers. <b>Run all</b> with <b>plain array</b>, then with <b>Fenwick tree</b>.</p>`);
});
