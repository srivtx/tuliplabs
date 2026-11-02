/* DSA, chapter 9: binary search.
   32 sorted numbers; find where the target is (or where it would go).
   The "why": a scan from the left checks every number until it finds the target: O(n). On a sorted
   list, one look at the middle tells you which half can't contain the answer, so you throw that
   half away. 32 → 16 → 8 → 4 → 2 → 1: about log₂ n looks. A billion sorted numbers need 30. */
VIZ.register("ds-bsearch", async (api) => {
  const W = await api.world3d();
  const A = Array.from({ length: 32 }, (_, i) => 3 + i * 3 + (i % 4 === 1 ? 1 : 0));
  const N = A.length, X = (i) => -7.75 + i * 0.5, H = (v) => 0.2 + v * 0.045;
  let target = A[27], mode = "scan", gen = null, looks = 0, lo = 0, hi = N, mid = -1, foundAt = -1, running = false, ran = {}, reached = false, line = "";
  function* scan() {
    for (let i = 0; i < N; i++) {
      looks++; mid = i;
      if (A[i] >= target) { foundAt = i; yield A[i] === target ? `A[${i}] = ${target} ✓` : `A[${i}] = ${A[i]} ≥ ${target}: it would go here`; return; }
      yield `A[${i}] = ${A[i]} < ${target}, keep going`;
    }
    foundAt = N;
  }
  function* bin() {
    lo = 0; hi = N;
    while (lo < hi) {
      mid = (lo + hi) >> 1; looks++;
      if (A[mid] < target) { yield `middle A[${mid}] = ${A[mid]} < ${target}: the answer is to the right, drop the left half`; lo = mid + 1; }
      else { yield `middle A[${mid}] = ${A[mid]} ≥ ${target}: the answer is here or to the left, drop the right half`; hi = mid; }
    }
    foundAt = lo; mid = lo;
    yield lo < N && A[lo] === target ? `lo = hi = ${lo}: A[${lo}] = ${target} ✓` : `lo = hi = ${lo}: ${target} would go here`;
  }
  function draw() {
    A.forEach((v, i) => {
      const alive = mode === "scan" ? i >= Math.max(mid, 0) : i >= lo && i < hi, isM = i === mid, isF = i === foundAt;
      W.box("n" + i, { x: X(i), y: H(v) / 2, z: 0, sx: 0.42, sy: H(v), sz: 0.6, color: isF ? "c3" : isM ? "c4" : "c2", glow: isF || isM ? 0.4 : 0, opacity: alive || isF ? 0.95 : 0.15,
        label: isM || isF ? String(v) : "", labelSize: 0.3, labelUp: 0.35,
        info: { title: `A[${i}] = ${v}`, html: "<p>The list is sorted, so everything left of a number is smaller or equal and everything right is bigger or equal. That's what lets one look rule out a whole half.</p>" } });
    });
    const bin = mode === "bin" && foundAt < 0;
    W.label("lo", bin ? "lo" : null, [X(lo), -0.5, 0.4], { color: "c1", size: 0.36 });
    W.label("hi", bin ? "hi" : null, [X(Math.min(hi, N - 1)) + (hi === N ? 0.5 : 0), -0.5, 0.4], { color: "c1", size: 0.36 });
  }
  function show() { api.status(`${mode === "scan" ? "scan from the left" : "binary search"} · target ${target} · ${looks} look${looks === 1 ? "" : "s"}${mode === "bin" ? ` · ${hi - lo} still possible` : ""}\n${line}`); }
  function reset() { looks = 0; lo = 0; hi = N; mid = -1; foundAt = -1; line = ""; gen = mode === "scan" ? scan() : bin(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = looks;
    if (mode === "scan") api.explain(`${looks} looks`, `<p>The scan ignored the fact that the list is sorted. With 10⁹ numbers it could take 10⁹ looks.</p><p>Switch to <b>binary search</b> and run it.</p>`);
    else if (ran.scan && !reached) { reached = true; api.explain("Halve, halve, halve", `<p>${looks} looks instead of ${ran.scan}. Each look halves what's left: 32 → 16 → 8 → 4 → 2 → 1. log₂(10⁹) ≈ 30, so a billion numbers need about 30 looks.</p><p>Notice it finds the <b>first position where A[i] ≥ target</b>, which works even when the target isn't there.</p>`); api.done("You binary searched"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "scan" ? 120 : 800); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "scan from the left", value: "scan" }, { label: "binary search", value: "bin" }], mode, (m) => { if (running) return; mode = m; reset(); });
  api.seg([{ label: `target ${A[27]}`, value: A[27] }, { label: `target ${A[6]}`, value: A[6] }, { label: "target 50", value: 50 }], target, (t) => { if (running) return; target = t; reset(); });
  W.camera({ target: [0, 1.9, 0], dist: 23, theta: 0, phi: 1.38, instant: true });
  api.hud("32 sorted numbers · yellow = the one being looked at · faded = ruled out · green = answer");
  reset();
  api.explain("How to read this", `<p>Find where the target sits in a sorted list. <b>Run all</b> with a <b>scan from the left</b>, then switch to <b>binary search</b> and step through it.</p>`);
});
