/* DSA, chapter 59: meet in the middle.
   Eight weights. Which ones add up to exactly 86?
   The "why": trying every subset is 2^n: 256 here, a trillion at n = 40. Split the items in half.
   Each half has only 2^(n/2) subsets: list their sums, sort both lists, and walk two pointers (one up
   the left list, one down the right) looking for a pair that adds to the target. That's
   O(2^(n/2) · n) instead of O(2^n): at n = 40, about a million per half instead of a trillion. */
VIZ.register("ds-mitm", async (api) => {
  const W = await api.world3d();
  const ITEMS = [3, 34, 4, 12, 5, 2, 27, 9], T = 86, H = 4;
  const sub = (lo, m) => ITEMS.slice(lo, lo + H).reduce((s, w, i) => s + ((m >> i) & 1 ? w : 0), 0);
  let mode = "brute", gen = null, mask = -1, A = [], B = [], ia = -1, jb = -1, checks = 0, found = false, running = false, ran = {}, reached = false, line = "";
  function* brute() {
    for (let m = 0; m < 1 << ITEMS.length; m++) {
      mask = m; checks++;
      const s = ITEMS.reduce((t, w, i) => t + ((m >> i) & 1 ? w : 0), 0);
      if (s === T) { found = true; yield `subset ${m + 1} of 256 adds to ${T}: ${ITEMS.filter((_, i) => (m >> i) & 1).join(" + ")}`; return; }
      if (m % 16 === 15) yield `${m + 1} subsets tried, none adds to ${T} yet`;
    }
  }
  function* mitm() {
    for (let m = 0; m < 1 << H; m++) { A.push({ s: sub(0, m), m }); B.push({ s: sub(H, m), m }); checks += 2; }
    yield `left half (3, 34, 4, 12): ${A.length} subset sums. Right half (5, 2, 27, 9): ${B.length} more`;
    A.sort((x, y) => x.s - y.s); B.sort((x, y) => x.s - y.s); checks += 2 * 4 * H;
    yield `sort both lists. Now look for a left sum plus a right sum equal to ${T}`;
    ia = 0; jb = B.length - 1;
    while (ia < A.length && jb >= 0) {
      const s = A[ia].s + B[jb].s; checks++; mask = A[ia].m | (B[jb].m << H);
      if (s === T) { found = true; yield `${A[ia].s} + ${B[jb].s} = ${T}: found it, ${ITEMS.filter((_, i) => (mask >> i) & 1).join(" + ")}`; return; }
      if (s < T) { yield `${A[ia].s} + ${B[jb].s} = ${s}, too small: move the left pointer up`; ia++; }
      else { yield `${A[ia].s} + ${B[jb].s} = ${s}, too big: move the right pointer down`; jb--; }
    }
  }
  function draw() {
    ITEMS.forEach((w, i) => W.box("it" + i, { x: -3.15 + i * 0.9, y: 2.0, z: 0, sx: 0.7, sy: 0.55, sz: 0.4, color: mask >= 0 && (mask >> i) & 1 ? (found ? "c3" : "c4") : "c5",
      opacity: 0.92, label: `${w}`, labelSize: 0.22, labelUp: 0, info: { title: `Weight ${w}`, html: `<p>${i < H ? "Left" : "Right"} half. Each weight is in or out, so n weights make 2ⁿ subsets.</p>` } }));
    const mid = mode === "mitm";
    for (let k = 0; k < 1 << H; k++) {
      const a = A[k], b = B[k];
      W.box("a" + k, { x: -3.35 + k * 0.44, y: 0.15 + (a ? a.s : 0) / 110, z: 0, sx: 0.34, sy: Math.max(0.04, (a ? a.s : 0) / 55), sz: 0.3, visible: mid && !!a,
        color: k === ia ? "c1" : "c2", glow: k === ia ? 0.4 : 0, opacity: 0.9, label: a ? `${a.s}` : "", labelSize: 0.14, labelUp: 0.12,
        info: { title: `Left sum ${a ? a.s : ""}`, html: `<p>One subset of 3, 34, 4, 12.</p>` } });
      W.box("b" + k, { x: -3.35 + k * 0.44, y: -1.75 + (b ? b.s : 0) / 110, z: 0, sx: 0.34, sy: Math.max(0.04, (b ? b.s : 0) / 55), sz: 0.3, visible: mid && !!b,
        color: k === jb ? "c1" : "c3", glow: k === jb ? 0.4 : 0, opacity: 0.9, label: b ? `${b.s}` : "", labelSize: 0.14, labelUp: 0.12,
        info: { title: `Right sum ${b ? b.s : ""}`, html: `<p>One subset of 5, 2, 27, 9.</p>` } });
    }
    W.label("la", mid ? "left half sums" : "", [-2.6, -0.08, 0.2], { color: "muted", size: 0.15 });
    W.label("lb", mid ? "right half sums" : "", [-2.6, -1.98, 0.2], { color: "muted", size: 0.15 });
    W.label("big", mid ? "" : `${Math.max(0, mask + 1)} / 256`, [0, -0.4, 0], { color: found ? "c3" : "ink", size: 0.5 });
  }
  function show() { api.status(`${mode === "brute" ? "every subset" : "meet in the middle"} · ${checks} steps\n${line}`); }
  function reset() { mask = -1; A = []; B = []; ia = -1; jb = -1; checks = 0; found = false; line = ""; gen = mode === "brute" ? brute() : mitm(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = checks;
    if (mode === "brute") api.explain(`${checks} subsets`, `<p>Doubling with every weight: 40 weights would be a trillion subsets.</p><p>Switch to <b>meet in the middle</b> and run it.</p>`);
    else if (ran.brute !== undefined && !reached) { reached = true; api.explain("Two halves, two pointers", `<p>${checks} steps against ${ran.brute}. Each half has only 2^(n/2) subsets, and sorted lists let two pointers find the matching pair.</p><p>At n = 40 that's about a million sums per half instead of a trillion subsets.</p>`); api.done("You met in the middle"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(800); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "every subset", value: "brute" }, { label: "meet in the middle", value: "mitm" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.1, 0], dist: 10.5, theta: 0, phi: 1.5, instant: true });
  api.hud(`target ${T} · top: the eight weights, lit = in the current subset · meet in the middle: sorted sums of each half, red = the two pointers`);
  reset();
  api.explain("How to read this", `<p>Find weights that add to exactly ${T}. <b>Run all</b> with <b>every subset</b>, then with <b>meet in the middle</b>.</p>`);
});
