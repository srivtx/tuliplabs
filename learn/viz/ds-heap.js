/* DSA, chapter 15: the binary heap.
   31 numbers; take out the smallest, ten times (the next job, the closest point, the cheapest edge).
   The "why": scanning for the minimum costs n comparisons per removal. A min-heap is a tree kept
   in a list where every parent is ≤ its children, so the minimum is always at the root. Removing it
   moves the last item to the root and sifts it down one level at a time: about 2·log₂ n
   comparisons. Building the heap from scratch (heapify) is O(n). */
VIZ.register("ds-heap", async (api) => {
  const W = await api.world3d();
  const V = [54, 17, 88, 31, 6, 72, 45, 93, 23, 61, 12, 79, 38, 97, 2, 66, 49, 84, 27, 9, 58, 70, 35, 91, 14, 42, 80, 63, 20, 99, 51];
  const POPS = 10;
  let mode = "scan", gen = null, cmps = 0, h = [], out = [], hot = [], running = false, ran = {}, reached = false, line = "";
  const key = (v) => "v" + v;
  function treePos(i) {
    const lvl = Math.floor(Math.log2(i + 1)), p = i - (2 ** lvl - 1), w = 15.2 / 2 ** lvl;
    return [-7.6 + (p + 0.5) * w, 4.4 - lvl * 1.15];
  }
  function* scan() {
    h = V.slice();
    for (let k = 0; k < POPS; k++) {
      let m = 0; hot = [h[0]];
      for (let i = 1; i < h.length; i++) {
        cmps++; hot = [h[i], h[m]];
        if (h[i] < h[m]) m = i;
        yield `pop ${k + 1}: compare ${h[i]} with the smallest so far, ${h[m]}`;
      }
      out.push(h[m]); h.splice(m, 1); hot = [];
      yield `pop ${k + 1}: the minimum is ${out[out.length - 1]}, take it out`;
    }
  }
  function* down(i) {
    while (true) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < h.length) { cmps++; hot = [h[l], h[m]]; if (h[l] < h[m]) m = l; }
      if (r < h.length) { cmps++; hot = [h[r], h[m]]; if (h[r] < h[m]) m = r; }
      if (m === i) { hot = []; return; }
      [h[i], h[m]] = [h[m], h[i]];
      yield `${h[i]} is smaller than its parent ${h[m]}: swap them`;
      i = m;
    }
  }
  function* heap() {
    h = V.slice();
    yield "heapify: fix every parent from the bottom level up";
    for (let i = (h.length >> 1) - 1; i >= 0; i--) yield* down(i);
    yield `heap built with ${cmps} comparisons: every parent ≤ its children, so ${h[0]} is at the root`;
    for (let k = 0; k < POPS; k++) {
      const top = h[0], last = h.pop();
      out.push(top);
      if (h.length) { h[0] = last; yield `pop ${k + 1}: take ${top} from the root, move the last item (${last}) up there`; yield* down(0); }
    }
  }
  function draw() {
    const inH = new Set(h);
    V.forEach((v) => { if (!inH.has(v) && !out.includes(v)) W.remove(key(v)); });
    h.forEach((v, i) => {
      const [x, y] = mode === "heap" ? treePos(i) : [-7.5 + i * 0.5, 1.2];
      const isHot = hot.includes(v);
      W.box(key(v), { x, y, z: 0, sx: 0.44, sy: 0.44, sz: 0.44, color: isHot ? "c1" : mode === "heap" && i === 0 ? "c3" : "c2", glow: isHot ? 0.35 : 0, opacity: 0.95,
        label: String(v), labelSize: 0.22, labelUp: mode === "heap" ? 0 : 0.36,
        info: { title: `${v}`, html: mode === "heap" ? `<p>At index ${i} of the list. Its children are at ${2 * i + 1} and ${2 * i + 2}, its parent at ${(i - 1) >> 1}.</p>` : "<p>In an unordered list: finding the minimum means looking at everything.</p>" } });
    });
    out.forEach((v, k) => W.box(key(v), { x: -3.8 + k * 0.85, y: 6.1, z: 0, sx: 0.6, sy: 0.6, sz: 0.6, color: "c4", opacity: 0.95, label: String(v), labelSize: 0.26, labelUp: 0, info: { title: `Removed: ${v}`, html: `<p>Pop number ${k + 1}. They come out smallest first.</p>` } }));
    for (let i = 1; i < V.length; i++) {
      if (mode === "heap" && i < h.length) W.line("e" + i, key(h[i]), key(h[(i - 1) >> 1]), { color: "line" });
      else W.unline("e" + i);
    }
    W.label("ol", "taken out, in order →", [-2.6, 6.85, 0.4], { color: "muted", size: 0.26 });
  }
  function show() { api.status(`${mode === "scan" ? "scan for the minimum" : "min-heap"} · ${cmps} comparison${cmps === 1 ? "" : "s"} · taken out: ${out.length} of ${POPS}\n${line}`); }
  function reset() { cmps = 0; out = []; hot = []; line = ""; V.forEach((v) => W.remove(key(v))); h = V.slice(); gen = mode === "scan" ? scan() : heap(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { hot = []; draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = cmps;
    if (mode === "scan") api.explain(`${cmps} comparisons`, `<p>Every removal looked at everything left: about n per pop. A scheduler handling 10⁵ jobs that way does 10¹⁰ comparisons.</p><p>Switch to <b>min-heap</b> and step through it.</p>`);
    else if (ran.scan && !reached) { reached = true; api.explain("Only one path per pop", `<p>${cmps} comparisons instead of ${ran.scan}, and that includes building the heap. Each pop walks a single root-to-leaf path, ${Math.ceil(Math.log2(V.length))} levels deep, so it's O(log n) instead of O(n). With 10⁵ items that's 17 levels instead of 10⁵ looks.</p>`); api.done("You used a heap"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "scan" ? 25 : 260); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "scan for the minimum", value: "scan" }, { label: "min-heap", value: "heap" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 3, 0], dist: 22.5, theta: 0, phi: 1.5, instant: true });
  api.hud(`take out the smallest, ${POPS} times · red = being compared · green = the root (the minimum) · yellow = taken out`);
  reset();
  api.explain("How to read this", `<p>Take out the smallest number ${POPS} times. <b>Run all</b> with <b>scan for the minimum</b>, then switch to <b>min-heap</b> and watch the tree.</p>`);
});
