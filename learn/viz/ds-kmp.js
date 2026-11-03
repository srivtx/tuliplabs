/* DSA, chapter 48: KMP and the Z-function.
   A 20-letter text and a 6-letter pattern that partly overlaps itself.
   The "why": the obvious search tries every start and, after a mismatch, slides the pattern one
   place and re-reads text it has already matched, so it can cost n × m comparisons. KMP never moves
   backwards in the text. The failure table says, for each prefix of the pattern, how long its
   longest border is (a prefix that is also a suffix), so after a mismatch the pattern jumps to the
   next place it could still match and keeps the letters already known to agree. O(n + m). */
VIZ.register("ds-kmp", async (api) => {
  const W = await api.world3d();
  const T = "ABABABACABABABABACAB", P = "ABABAC", n = T.length, m = P.length, SP = 0.62;
  const F = [0];
  for (let i = 1, k = 0; i < m; i++) { while (k && P[i] !== P[k]) k = F[k - 1]; if (P[i] === P[k]) k++; F[i] = k; }
  let mode = "naive", gen = null, ops = 0, shift = 0, ti = -1, pj = -1, ok = null, hits = [], known = 0, running = false, ran = {}, reached = false, line = "";
  function* naive() {
    for (let s = 0; s + m <= n; s++) {
      shift = s; let j = 0;
      for (; j < m; j++) {
        ops++; ti = s + j; pj = j; ok = T[s + j] === P[j];
        yield `start ${s}: compare text[${s + j}] = ${T[s + j]} with pattern[${j}] = ${P[j]}${ok ? "" : ", mismatch, slide one place and start over"}`;
        if (!ok) break;
      }
      if (j === m) { hits.push(s); yield `match at ${s}! slide one place and start over`; }
    }
    ti = pj = -1; ok = null;
    yield `done: ${ops} letter comparisons, matches at ${hits.join(", ")}`;
  }
  function* kmp() {
    let j = 0;
    for (let i = 0; i < n; i++) {
      for (;;) {
        ops++; shift = i - j; ti = i; pj = j; known = j; ok = T[i] === P[j];
        if (ok) { yield `compare text[${i}] = ${T[i]} with pattern[${j}] = ${P[j]}: match, move both on`; j++; break; }
        if (j === 0) { yield `compare text[${i}] = ${T[i]} with pattern[0]: mismatch, nothing to keep, move the text on`; break; }
        const nj = F[j - 1];
        yield `compare text[${i}] = ${T[i]} with pattern[${j}] = ${P[j]}: mismatch. The ${j} letters before already match, and the failure table says ${nj} of them still line up. Keep the text where it is.`;
        j = nj;
      }
      if (j === m) { hits.push(i - m + 1); shift = i - m + 1; ti = pj = -1; ok = null; yield `match at ${i - m + 1}! The table says keep ${F[m - 1]} letters and carry on`; j = F[m - 1]; }
    }
    ti = pj = -1; ok = null;
    yield `done: ${ops} letter comparisons, matches at ${hits.join(", ")}, and the text was never read backwards`;
  }
  function draw() {
    const x0 = (-n / 2 + 0.5) * SP;
    for (let i = 0; i < n; i++) {
      const hit = hits.some((h) => i >= h && i < h + m), cur = i === ti;
      W.box("t" + i, { x: x0 + i * SP, y: 1, z: 0, sx: SP - 0.08, sy: 0.6, sz: 0.3, color: cur ? (ok ? "c3" : "c1") : hit ? "c3" : "c5", glow: cur ? 0.4 : 0, opacity: cur || hit ? 0.95 : 0.75,
        label: T[i], labelSize: 0.26, labelUp: 0, info: { title: `Text position ${i}`, html: `<p>The letter ${T[i]}.${hit ? " Part of a match." : ""}</p>` } });
      W.label("ti" + i, String(i), [x0 + i * SP, 1.55, 0.3], { color: "muted", size: 0.16 });
    }
    for (let j = 0; j < m; j++) {
      const cur = j === pj, x = x0 + (shift + j) * SP;
      W.box("p" + j, { x, y: 0.15, z: 0, sx: SP - 0.08, sy: 0.6, sz: 0.3, color: cur ? (ok ? "c3" : "c1") : mode === "kmp" && j < known && pj >= 0 ? "c4" : "c2", glow: cur ? 0.4 : 0, opacity: 0.9,
        label: P[j], labelSize: 0.26, labelUp: 0,
        info: { title: `Pattern position ${j}`, html: `<p>Failure value ${F[j]}: the first ${j + 1} letters "${P.slice(0, j + 1)}" end with "${P.slice(0, F[j])}"${F[j] ? `, which is also how they start` : ` (no border)`}.</p><p>After a mismatch just past here, KMP slides the pattern so those ${F[j]} letters line up again, without re-reading the text.</p>` } });
      W.label("pf" + j, mode === "kmp" ? String(F[j]) : "", [x, -0.45, 0.3], { color: "c1", size: 0.2 });
    }
    W.label("fl", mode === "kmp" ? "failure" : "", [x0 + (shift - 1.3) * SP, -0.45, 0.3], { color: "c1", size: 0.16 });
  }
  function show() { api.status(`${mode === "naive" ? "try every start" : "KMP"} · ${ops} comparisons${hits.length ? ` · matches at ${hits.join(", ")}` : ""}\n${line}`); }
  function reset() { ops = 0; shift = 0; ti = pj = -1; ok = null; hits = []; known = 0; line = ""; gen = mode === "naive" ? naive() : kmp(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = ops;
    if (mode === "naive") api.explain(`${ops} comparisons`, `<p>After every mismatch the pattern slid one place and re-read letters it had already matched. On text like "AAAA…AB" that's n × m.</p><p>Switch to <b>KMP</b> and run it.</p>`);
    else if (ran.naive && !reached) { reached = true; api.explain("Never read backwards", `<p>${ops} comparisons against ${ran.naive}. The failure table (red numbers) says how much of the pattern still matches after a mismatch, so the text pointer only ever moves forward.</p><p>At most 2n comparisons for the search and 2m to build the table: O(n + m).</p>`); api.done("You used KMP"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(420); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "try every start", value: "naive" }, { label: "KMP", value: "kmp" }], mode, (md) => { if (running) return; mode = md; reset(); });
  W.camera({ target: [0, 0.5, 0], dist: 9.5, theta: 0, phi: 1.5, instant: true });
  api.hud("top: the text · below: the pattern, at its current start · green = letters agree · red = mismatch · amber = letters KMP already knows match · red numbers = the failure table");
  reset();
  api.explain("How to read this", `<p>Find "${P}" in "${T}". <b>Run all</b> with <b>try every start</b>, then with <b>KMP</b>, and watch the comparison count.</p>`);
});
