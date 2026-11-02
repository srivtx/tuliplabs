/* DSA, chapter 6: sorting and what it unlocks.
   Sixteen bars, shuffled. Two ways to put them in order, counting comparisons.
   The "why": insertion sort slides each bar left past every bigger bar before it, so a badly
   shuffled list costs about n²/4 comparisons. Merge sort sorts runs of 1, 2, 4, 8… and merges
   neighbouring runs; a merge of two sorted runs costs at most one comparison per bar it places,
   so each of the log n rounds costs about n: O(n log n). Python's sorted() is in this family. */
VIZ.register("ds-sort", async (api) => {
  const W = await api.world3d();
  const START = [15, 3, 14, 9, 12, 1, 16, 7, 10, 5, 13, 2, 11, 8, 4, 6];
  const N = START.length, X = (i) => -6 + i * 0.8;
  let mode = "ins", gen = null, arr = [], cmp = 0, hi = [], runs = null, running = false, ran = {}, reached = false, line = "";
  function* insertion() {
    for (let i = 1; i < N; i++) {
      let j = i;
      while (j > 0) {
        cmp++; hi = [j - 1, j];
        if (arr[j - 1] <= arr[j]) { yield `${arr[j - 1]} ≤ ${arr[j]}: ${arr[j]} stays`; break; }
        yield `${arr[j - 1]} > ${arr[j]}: swap`;
        [arr[j - 1], arr[j]] = [arr[j], arr[j - 1]]; j--;
      }
    }
    hi = [];
  }
  function* merge() {
    for (let w = 1; w < N; w *= 2) {
      runs = w * 2;
      for (let lo = 0; lo < N; lo += 2 * w) {
        const L = arr.slice(lo, lo + w), R = arr.slice(lo + w, lo + 2 * w), out = [];
        let a = 0, b = 0;
        while (a < L.length && b < R.length) {
          cmp++; hi = [lo + out.length, lo + out.length + (L.length - a)];
          const take = L[a] <= R[b] ? L[a++] : R[b++];
          out.push(take);
          arr.splice(lo, 2 * w, ...out, ...L.slice(a), ...R.slice(b));
          yield `merging runs of ${w}: placed ${take}`;
        }
        out.push(...L.slice(a), ...R.slice(b));
        arr.splice(lo, 2 * w, ...out);
      }
      hi = []; yield `every run of ${2 * w} is now sorted`;
    }
    runs = null;
  }
  function draw() {
    arr.forEach((v, i) => {
      const on = hi.includes(i), grp = runs ? Math.floor(i / runs) % 2 : 0;
      W.box("b" + v, { x: X(i), y: v * 0.13, z: 0, sx: 0.66, sy: v * 0.26, sz: 0.66, color: on ? "c4" : grp ? "c1" : "c2", glow: on ? 0.4 : 0,
        label: String(v), labelSize: 0.28, labelUp: 0.35,
        info: { title: `Bar ${v}`, html: mode === "ins" ? "<p>Insertion sort slides each bar left, one comparison and swap at a time, until the bar before it is smaller.</p>" : "<p>Merge sort keeps runs that are already sorted (alternating colours) and merges two neighbouring runs by repeatedly taking the smaller front bar.</p>" } });
    });
  }
  function show() { api.status(`${mode === "ins" ? "insertion sort" : "merge sort"} · ${cmp} comparison${cmp === 1 ? "" : "s"}\n${line}`); }
  function reset() { arr = START.slice(); cmp = 0; hi = []; runs = null; line = ""; gen = mode === "ins" ? insertion() : merge(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { line = "sorted"; draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = cmp;
    if (mode === "ins") api.explain(`${cmp} comparisons`, `<p>Every bar walked left past each bigger bar before it. For n bars that's up to n²/2: at n = 10⁵, about 5·10⁹.</p><p>Switch to <b>merge sort</b> and run it.</p>`);
    else if (ran.ins && !reached) { reached = true; api.explain("log n rounds of n", `<p>${cmp} comparisons instead of ${ran.ins}. ${Math.log2(N)} rounds (runs of 1→2→4→8→16), each costing at most ${N}. At n = 10⁵ that's about 1.7·10⁶.</p><p>Once data is sorted, equal things sit together and binary search works: that's what sorting <b>unlocks</b>.</p>`); api.done("You raced two sorts"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "ins" ? 70 : 160); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "insertion sort", value: "ins" }, { label: "merge sort", value: "merge" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 1.8, 0], dist: 19.5, theta: 0, phi: 1.4, instant: true });
  api.hud("height = value · yellow = being compared · merge sort: each colour block = one run being merged");
  reset();
  api.explain("How to read this", `<p>Sixteen shuffled bars. Press <b>Run all</b> for <b>insertion sort</b>, then switch to <b>merge sort</b> and compare the comparison counts.</p>`);
});
