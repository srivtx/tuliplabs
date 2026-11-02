/* DSA, chapter 3: hash maps and sets (two-sum).
   Top row: the numbers. Find two of them that add up to the target.
   The "why": the obvious way compares each new number with every earlier one: 1 + 2 + … checks,
   O(n²). A hash set remembers every number seen so far in buckets chosen by the number itself
   (here: value % 8), so "have I seen target − x?" jumps straight to one small bucket. One lookup
   per number: O(n). */
VIZ.register("ds-hash", async (api) => {
  const W = await api.world3d();
  const A = [30, 11, 24, 37, 19, 7, 29, 14, 32, 39, 34, 4], T = 23, B = 8;
  const N = A.length, X = (i) => -6.6 + i * 1.2, BX = (b) => -4.9 + b * 1.4;
  let mode = "naive", gen = null, checks = 0, buckets = [], found = null, running = false, ran = { naive: 0, hash: 0 }, reached = false, line = "", hi = [];
  function* naive() {
    for (let j = 0; j < N; j++) for (let i = 0; i < j; i++) {
      checks++; hi = [i, j];
      if (A[i] + A[j] === T) { found = [i, j]; yield `${A[i]} + ${A[j]} = ${T} ✓`; return; }
      yield `${A[i]} + ${A[j]} = ${A[i] + A[j]}, not ${T}`;
    }
  }
  function* hash() {
    for (let j = 0; j < N; j++) {
      const need = T - A[j], b = ((need % B) + B) % B;
      checks++; hi = [j]; buckets.look = b;
      const hit = (buckets[b] || []).find((i) => A[i] === need);
      if (hit !== undefined) { found = [hit, j]; yield `need ${T} − ${A[j]} = ${need}: bucket ${need} % 8 = ${b} has it ✓`; return; }
      yield `need ${T} − ${A[j]} = ${need}: bucket ${b} doesn't have it`;
      const bb = A[j] % B; (buckets[bb] = buckets[bb] || []).push(j); buckets.look = bb;
      yield `store ${A[j]} in bucket ${A[j]} % 8 = ${bb}`;
    }
  }
  function draw() {
    const where = {};
    buckets.forEach((list, b) => (list || []).forEach((i, k) => (where[i] = [b, k])));
    A.forEach((v, i) => {
      const inB = mode === "hash" && where[i], isF = found && found.includes(i), isH = hi.includes(i);
      W.box("n" + i, { x: inB ? BX(inB[0]) : X(i), y: inB ? -0.95 - inB[1] * 1.05 : 2.4, z: 0, s: 0.8, color: isF ? "c3" : isH ? "c4" : inB ? "c2" : "c5", glow: isF || isH ? 0.4 : 0,
        label: String(v), labelSize: 0.32, labelUp: 0,
        info: { title: `${v}`, html: mode === "hash" ? `<p>Stored in bucket <b>${v} % 8 = ${v % 8}</b>. To ask "is ${v} here?" you only look in that bucket, never at the rest.</p>` : `<p>In the naive way, every later number gets compared with this one.</p>` } });
    });
    for (let b = 0; b < B; b++) W.label("bl" + b, mode === "hash" ? `bucket ${b}` : null, [BX(b), 0.15, 0.6], { color: "muted", size: 0.26 });
  for (let b = 0; b < B; b++) W.box("b" + b, { x: BX(b), y: -0.25, z: 0, sx: 1.2, sy: 0.18, sz: 1.0, color: mode === "hash" && buckets.look === b ? "c4" : "c5", opacity: mode === "hash" ? 0.8 : 0.15,
      info: { title: `Bucket ${b}`, html: `<p>Holds numbers whose remainder when divided by 8 is ${b}. A real hash table uses a hash function that scatters keys evenly and grows the number of buckets as it fills, so each bucket stays tiny: O(1) on average.</p>` } });
  }
  function show() {
    api.status(`${mode === "naive" ? "every earlier number" : "hash set: one lookup per number"} · target ${T} · ${checks} check${checks === 1 ? "" : "s"}\n${line}`);
  }
  function reset() { buckets = []; found = null; hi = []; checks = 0; line = ""; gen = mode === "naive" ? naive() : hash(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) return false;
    line = r.value; draw(); show();
    if (found) { finish(); return false; }
    return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = checks;
    if (mode === "naive") api.explain("60 comparisons", `<p>The pair was ${A[found[0]]} and ${A[found[1]]}, near the end, so every pair before it got checked: ${checks} comparisons. With 10⁵ numbers that's up to 5·10⁹.</p><p>Switch to <b>hash set</b> and run it.</p>`);
    else if (ran.naive && !reached) { reached = true; api.explain("One lookup per number", `<p>${checks} lookups instead of ${ran.naive} comparisons. Each number asks one question, "have I seen ${T} − me?", and the bucket answers it without looking at anything else.</p><p>Trading a little memory for a lot of time is the most common trick in DSA.</p>`); api.done("You found the pair with a hash set"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "naive" ? 90 : 420); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "every earlier number", value: "naive" }, { label: "hash set", value: "hash" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.4, 0], dist: 16.5, theta: 0, phi: 1.35, instant: true });
  api.hud(`find two numbers adding to ${T} · yellow = being checked · green = found · click a number or bucket`);
  reset();
  api.explain("How to read this", `<p>Find two numbers that add up to <b>${T}</b>. Press <b>Run all</b> to compare each number with <b>every earlier number</b>, then switch to <b>hash set</b>.</p>`);
});
