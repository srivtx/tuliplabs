/* DSA, chapter 46: sparse tables.
   16 numbers that never change, and a dozen questions "what's the smallest number in l..r?".
   The "why": scanning reads r − l + 1 cells per question. A sparse table spends n log n work once,
   storing the minimum of every block whose length is a power of two (row k holds blocks of 2^k).
   Any range is covered by two blocks of the same size that may overlap, and because
   min(x, x) = x the overlap doesn't matter. Every question then costs two reads. */
VIZ.register("ds-sparse", async (api) => {
  const W = await api.world3d();
  const A = [7, 2, 9, 4, 8, 6, 1, 5, 9, 3, 7, 8, 2, 6, 4, 5], N = 16, SP = 0.68, K = 5;
  const QS = [[0, 15], [3, 11], [8, 14], [1, 6], [9, 13], [2, 12], [4, 10], [10, 15], [0, 7], [5, 9], [11, 14], [0, 12]];
  let mode = "naive", gen = null, ops = 0, built = 0, sp = [], used = new Set(), rl = -1, rr = -1, answers = [], running = false, ran = {}, reached = false, line = "";
  function makeTable() {
    sp = [A.slice()]; built = 0;
    for (let k = 1; k < K; k++) { sp[k] = []; for (let i = 0; i + (1 << k) <= N; i++) { sp[k][i] = Math.min(sp[k - 1][i], sp[k - 1][i + (1 << (k - 1))]); built++; } }
  }
  function* naive() {
    for (const [l, r] of QS) {
      used = new Set(); rl = l; rr = r; let m = Infinity;
      for (let i = l; i <= r; i++) { m = Math.min(m, A[i]); ops++; used.add("0_" + i); }
      answers.push(m); yield `min of ${l}..${r}: scan ${r - l + 1} cells = ${m}`;
    }
    used = new Set(); rl = rr = -1;
    yield `${QS.length} questions answered with ${ops} cell reads`;
  }
  function* table() {
    used = new Set(); ops = built;
    yield `built once: ${built} mins, row by row (row k = min of two row k − 1 blocks side by side)`;
    for (const [l, r] of QS) {
      const len = r - l + 1, k = 31 - Math.clz32(len), b = r - (1 << k) + 1;
      used = new Set([k + "_" + l, k + "_" + b]); rl = l; rr = r; ops += 2;
      const m = Math.min(sp[k][l], sp[k][b]); answers.push(m);
      yield `min of ${l}..${r} (length ${len}): two blocks of ${1 << k}, at ${l} and ${b}${b < l + (1 << k) ? " (they overlap, and that's fine)" : ""} = ${m}`;
    }
    used = new Set(); rl = rr = -1;
    yield `${QS.length} questions answered: ${built} reads to build, then 2 per question`;
  }
  function draw() {
    const tb = mode === "table";
    for (let k = 0; k < K; k++) for (let i = 0; i + (1 << k) <= N; i++) {
      const key = k + "_" + i, u = used.has(key), x = (-N / 2 + i + 0.5) * SP, inR = k === 0 && rl >= 0 && i >= rl && i <= rr;
      W.box("c" + key, { x, y: -2.6 + k * 1.05, z: 0, sx: SP - 0.08, sy: 0.7, sz: 0.3, visible: k === 0 || tb,
        color: u ? (tb ? "c1" : "c3") : inR ? "c4" : k === 0 ? "c5" : "c2", glow: u ? 0.35 : 0, opacity: u ? 0.95 : inR ? 0.8 : k === 0 ? 0.8 : 0.4,
        label: String(sp[k][i]), labelSize: 0.24, labelUp: 0,
        info: { title: k ? `Row ${k}, start ${i}` : `Position ${i}`, html: k ? `<p>The minimum of cells ${i}..${i + (1 << k) - 1}, a block of ${1 << k}. Worked out once from two blocks of ${1 << (k - 1)} in the row below.</p><p>Row ${k} has ${N - (1 << k) + 1} entries, so the whole table is about n log n numbers.</p>` : `<p>One number: ${A[i]}. The numbers never change; that's what lets us precompute.</p>` } });
    }
    for (let k = 0; k < K; k++) W.label("rk" + k, k === 0 ? "a" : tb ? `2^${k}` : "", [(-N / 2 - 0.6) * SP, -2.6 + k * 1.05, 0.3], { color: "muted", size: 0.2 });
    for (let i = 0; i < N; i++) W.label("ix" + i, String(i), [(-N / 2 + i + 0.5) * SP, -3.2, 0.3], { color: "muted", size: 0.18 });
  }
  function show() { api.status(`${mode === "naive" ? "scan the range" : "sparse table"} · ${ops} reads${answers.length ? ` · answers: ${answers.join(", ")}` : ""}\n${line}`); }
  function reset() { ops = 0; used = new Set(); rl = rr = -1; answers = []; line = ""; makeTable(); gen = mode === "naive" ? naive() : table(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = ops;
    if (mode === "naive") api.explain(`${ops} reads`, `<p>Every question scanned its whole range. With 10⁵ questions on 10⁵ numbers that's up to 10¹⁰ reads.</p><p>Switch to <b>sparse table</b> and run it.</p>`);
    else if (ran.naive && !reached) { reached = true; api.explain("Two blocks, always", `<p>${built} reads to build the table, then exactly 2 per question: ${ops} against ${ran.naive}, and the gap grows with every question.</p><p>Any range is two power-of-two blocks that may overlap. Overlap is harmless for min, max and gcd, because counting a number twice doesn't change them. It would break a sum.</p>`); api.done("You used a sparse table"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(1100); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "scan the range", value: "naive" }, { label: "sparse table", value: "table" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, -0.4, 0], dist: 18.5, theta: 0, phi: 1.5, instant: true });
  api.hud("bottom row: 16 numbers that never change · row 2^k: the minimum of the block of 2^k starting there · amber = the question's range · red = the two blocks read");
  reset();
  api.explain("How to read this", `<p>Twelve questions: the smallest number in a range. <b>Run all</b> with <b>scan the range</b>, then with <b>sparse table</b>.</p>`);
});
