/* DSA, chapter 7: two pointers.
   A sorted row of numbers; find two that add up to the target.
   The "why": checking every pair is O(n²). On a sorted list, put L at the smallest and R at the
   biggest. If the sum is too small, the only way to grow it is to move L right (R is already the
   biggest, so L can never pair with anything to make the target); if it's too big, move R left.
   Every check throws one number away for good, so at most n checks: O(n). */
VIZ.register("ds-twoptr", async (api) => {
  const W = await api.world3d();
  const A = [2, 3, 5, 8, 11, 13, 16, 19, 21, 24, 27, 30], T = 37;
  const N = A.length, X = (i) => -6.05 + i * 1.1, H = (v) => 0.3 + v * 0.13;
  let mode = "naive", gen = null, checks = 0, hi = [], gone = new Map(), found = null, running = false, ran = {}, reached = false, line = "";
  function* naive() {
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      checks++; hi = [i, j];
      if (A[i] + A[j] === T) { found = [i, j]; yield `${A[i]} + ${A[j]} = ${T} ✓`; return; }
      yield `${A[i]} + ${A[j]} = ${A[i] + A[j]}, not ${T}`;
    }
  }
  function* twoptr() {
    let l = 0, r = N - 1;
    while (l < r) {
      checks++; hi = [l, r];
      const s = A[l] + A[r];
      if (s === T) { found = [l, r]; yield `${A[l]} + ${A[r]} = ${T} ✓`; return; }
      if (s < T) { yield `${A[l]} + ${A[r]} = ${s} < ${T}: too small, so ${A[l]} can't be in the answer. L moves right`; gone.set(l, "small"); l++; }
      else { yield `${A[l]} + ${A[r]} = ${s} > ${T}: too big, so ${A[r]} can't be in the answer. R moves left`; gone.set(r, "big"); r--; }
    }
  }
  function draw() {
    A.forEach((v, i) => {
      const isF = found && found.includes(i), on = hi.includes(i), out = gone.get(i);
      W.box("n" + i, { x: X(i), y: H(v) / 2, z: 0, sx: 0.85, sy: H(v), sz: 0.85, color: isF ? "c3" : on ? "c4" : "c2", glow: isF || on ? 0.4 : 0, opacity: out ? 0.18 : 0.95,
        label: String(v), labelSize: 0.3, labelUp: 0.35,
        info: { title: String(v), html: out ? `<p>Ruled out: paired with the ${out === "small" ? "biggest" : "smallest"} number still in play, the sum was still ${out === "small" ? "too small" : "too big"}, so no partner left can work.</p>` : "<p>Still in play. The list is sorted, so moving a pointer always makes the sum go one predictable way.</p>" } });
    });
    const two = mode === "two" && hi.length === 2;
    W.label("L", two ? "L" : null, two ? [X(hi[0]), -0.55, 0.5] : [0, 0, 0], { color: "c1", size: 0.45 });
    W.label("R", two ? "R" : null, two ? [X(hi[1]), -0.55, 0.5] : [0, 0, 0], { color: "c1", size: 0.45 });
  }
  function show() { api.status(`${mode === "naive" ? "every pair" : "two pointers"} · target ${T} · ${checks} check${checks === 1 ? "" : "s"}\n${line}`); }
  function reset() { checks = 0; hi = []; gone = new Map(); found = null; line = ""; gen = mode === "naive" ? naive() : twoptr(); draw(); show(); }
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
    if (mode === "naive") api.explain(`${checks} checks`, `<p>Every pair before ${A[found[0]]} + ${A[found[1]]} got tried. With 10⁵ numbers that's up to 5·10⁹.</p><p>Switch to <b>two pointers</b> and run it.</p>`);
    else if (ran.naive && !reached) { reached = true; api.explain("Each check rules one number out", `<p>${checks} checks instead of ${ran.naive}. Because the list is sorted, a sum that's too small means the left number is too small for <b>every</b> partner, so it's gone for good. At most n − 1 checks: O(n), and O(1) extra memory (no hash set needed).</p>`); api.done("You walked two pointers inward"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "naive" ? 90 : 700); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "every pair", value: "naive" }, { label: "two pointers", value: "two" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 1.6, 0], dist: 19, theta: 0, phi: 1.4, instant: true });
  api.hud(`sorted · find two adding to ${T} · yellow = being checked · faded = ruled out · green = found`);
  reset();
  api.explain("How to read this", `<p>The numbers are <b>sorted</b>. Find two that add up to <b>${T}</b>. Press <b>Run all</b> to try <b>every pair</b>, then switch to <b>two pointers</b> and step through it slowly.</p>`);
});
