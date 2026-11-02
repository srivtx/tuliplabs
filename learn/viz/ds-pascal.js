/* DSA, chapter 40: counting with Pascal's triangle.
   How many ways can you choose 4 friends out of 10 for a road trip? C(10, 4).
   The "why": listing every possible group means looking at all 2¹⁰ = 1,024 subsets and keeping the
   ones of size 4. For C(60, 30) that's 10¹⁸ subsets. Pascal's rule counts without listing: a group
   of r from n either includes the last person (choose r − 1 from the other n − 1) or doesn't
   (choose r from n − 1). So C(n, r) = C(n − 1, r − 1) + C(n − 1, r): each cell is the sum of the two
   above it. 66 additions for the whole triangle up to row 10. */
VIZ.register("ds-pascal", async (api) => {
  const W = await api.world3d();
  const N = 10, R = 4;
  let mode = "list", gen = null, ops = 0, mask = 0, found = 0, tri = [], cur = null, reads = [], running = false, ran = {}, reached = false, line = "";
  const bits = (m) => { let c = 0; for (; m; m &= m - 1) c++; return c; };
  function* list() {
    for (let m = 0; m < 1 << N; m++) {
      ops++; mask = m;
      if (bits(m) === R) found++;
      if (m % 16 === 15) yield `checked ${m + 1} groups: ${found} have exactly ${R} people`;
    }
    yield `all ${ops.toLocaleString("en")} possible groups checked: C(${N}, ${R}) = ${found}`;
  }
  function* pascal() {
    for (let n = 0; n <= N; n++) {
      tri[n] = [];
      for (let r = 0; r <= n; r++) {
        ops++; cur = [n, r];
        if (r === 0 || r === n) { tri[n][r] = 1; reads = []; yield `C(${n}, ${r}) = 1: ${r === 0 ? "choose nobody" : "choose everybody"}, one way`; continue; }
        tri[n][r] = tri[n - 1][r - 1] + tri[n - 1][r]; reads = [[n - 1, r - 1], [n - 1, r]];
        yield `C(${n}, ${r}) = C(${n - 1}, ${r - 1}) + C(${n - 1}, ${r}) = ${tri[n - 1][r - 1]} + ${tri[n - 1][r]} = ${tri[n][r]}`;
      }
    }
    cur = [N, R]; reads = []; found = tri[N][R];
    yield `C(${N}, ${R}) = ${found}, after ${ops} cells`;
  }
  function draw() {
    const li = mode === "list";
    for (let i = 0; i < N; i++) {
      const on = (mask >> i) & 1;
      W.box("f" + i, { x: -4.5 + i, y: 1.2, z: 0, sx: 0.8, sy: 0.8, sz: on ? 0.8 : 0.3, visible: li, color: on ? (bits(mask) === R ? "c3" : "c2") : "c5", opacity: on ? 0.92 : 0.4,
        label: String(i + 1), labelSize: 0.26, labelUp: 0, info: { title: `Friend ${i + 1}`, html: `<p>${on ? "In this group." : "Not in this group."}</p>` } });
    }
    W.label("lf", li ? `${bits(mask)} in this group · ${found} groups of ${R} found` : "", [0, -0.4, 0.3], { color: "ink", size: 0.3 });
    for (let n = 0; n <= N; n++) for (let r = 0; r <= n; r++) {
      const v = tri[n] && tri[n][r], hot = cur && cur[0] === n && cur[1] === r, rd = reads.some(([a, b]) => a === n && b === r), goal = n === N && r === R;
      W.box(`t${n}_${r}`, { x: (r - n / 2) * 0.98, y: 4.1 - n * 0.78, z: 0, sx: 0.9, sy: 0.68, sz: 0.3, visible: !li, color: hot ? "c1" : rd ? "c4" : goal ? "c3" : v ? "c2" : "c5", glow: hot || rd ? 0.35 : 0, opacity: v ? 0.92 : 0.25,
        label: v ? String(v) : "", labelSize: 0.22, labelUp: 0, info: { title: `C(${n}, ${r})`, html: `<p>Ways to choose ${r} from ${n}${v ? `: ${v}` : ""}.</p>` } });
    }
  }
  function show() { api.status(`${mode === "list" ? "list every possible group" : "Pascal's triangle"} · ${ops.toLocaleString("en")} ${mode === "list" ? "groups checked" : "cells"}${found ? ` · C(${N}, ${R}) = ${found}` : ""}\n${line}`); }
  function reset() { ops = 0; mask = 0; found = 0; tri = []; cur = null; reads = []; line = ""; gen = mode === "list" ? list() : pascal(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = ops;
    if (mode === "list") api.explain(`${ops.toLocaleString("en")} groups`, `<p>Every subset of the 10 friends was built and counted. For choosing 30 from 60 that would be 10¹⁸ subsets.</p><p>Switch to <b>Pascal's triangle</b> and run it.</p>`);
    else if (ran.list && !reached) { reached = true; api.explain("Count, don't list", `<p>Same ${found}, from ${ops} cells against ${ran.list.toLocaleString("en")} groups. Each cell is the sum of the two above: a group either includes the last person or doesn't.</p><p>For many queries modulo a prime, precompute factorials instead: C(n, r) = n! / (r! (n − r)!), with the division done by inverses.</p>`); api.done("You counted combinations with Pascal's rule"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "list" ? 70 : 260); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "list every group", value: "list" }, { label: "Pascal's triangle", value: "pascal" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.9, 0], dist: 17.5, theta: 0, phi: 1.5, instant: true });
  api.hud(`choose ${R} friends from ${N} · list: tall boxes = in the group, green when it has exactly ${R} · triangle: row n, position r = C(n, r) · amber = the two cells added · green = C(${N}, ${R})`);
  reset();
  api.explain("How to read this", `<p>How many ways can you pick ${R} friends out of ${N}? <b>Run all</b> with <b>list every group</b>, then with <b>Pascal's triangle</b>.</p>`);
});
