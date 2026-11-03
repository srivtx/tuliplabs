/* DSA, chapter 50: suffix arrays.
   The 16 suffixes of "abababababababab", one per row, sorted into dictionary order.
   The "why": sorting the suffixes as strings means every comparison can read a long run of equal
   letters, so the cost grows like n² log n on repetitive text. Prefix doubling sorts by the first
   1, 2, 4, 8… letters. Each round only compares pairs of ranks from the round before (the rank of
   the first k letters, then the rank of the next k), so a comparison is O(1) and log n rounds do it. */
VIZ.register("ds-suffix", async (api) => {
  const W = await api.world3d();
  const S = "abababababababab", n = S.length, SZ = 0.34;
  let mode = "naive", gen = null, ops = 0, order = [], rk = [], k = 0, done = false, running = false, ran = {}, reached = false, line = "";
  function msort(a, cmp) {
    if (a.length < 2) return a.slice();
    const m = a.length >> 1, l = msort(a.slice(0, m), cmp), r = msort(a.slice(m), cmp), out = [];
    let i = 0, j = 0;
    while (i < l.length && j < r.length) out.push(cmp(l[i], r[j]) <= 0 ? l[i++] : r[j++]);
    return out.concat(l.slice(i), r.slice(j));
  }
  function* naive() {
    order = msort(order, (a, b) => {
      let t = 0;
      while (a + t < n && b + t < n && S[a + t] === S[b + t]) { t++; ops++; }
      ops++;
      return a + t >= n ? -1 : b + t >= n ? 1 : S[a + t] < S[b + t] ? -1 : 1;
    });
    k = n; done = true;
    yield `sorted the suffixes as whole strings: ${ops} letters read, because "abab…" suffixes agree for a long way before they differ`;
  }
  function* doubling() {
    rk = [...S].map((c) => c.charCodeAt(0) - 96); k = 1; order = msort(order, (a, b) => { ops++; return rk[a] - rk[b]; });
    yield `round 0: sort by the first letter only. ${new Set(rk).size} different ranks so far`;
    while (true) {
      const key = (i) => [rk[i], i + k < n ? rk[i + k] : 0];
      order = msort(order, (a, b) => { ops++; const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1]; });
      const nr = new Array(n); nr[order[0]] = 1;
      for (let t = 1; t < n; t++) { const x = key(order[t]), y = key(order[t - 1]); nr[order[t]] = nr[order[t - 1]] + (x[0] !== y[0] || x[1] !== y[1] ? 1 : 0); }
      rk = nr; k *= 2;
      const distinct = new Set(rk).size;
      if (distinct === n) { done = true; yield `round: sort by (rank of first ${k / 2}, rank of next ${k / 2}) = the first ${k} letters. All ${n} ranks differ, so the order is final`; return; }
      yield `round: sort by (rank of first ${k / 2}, rank of next ${k / 2}) = the first ${k} letters. ${distinct} different ranks so far`;
    }
  }
  function draw() {
    for (let r = 0; r < n; r++) {
      const i = order[r], y = 2.7 - r * (SZ + 0.04);
      for (let c = 0; c < n; c++) {
        const has = i + c < n, sorted = c < k;
        W.box(`s${i}_${c}`, { x: -2.2 + c * (SZ + 0.03), y, z: 0, sx: SZ, sy: SZ, sz: 0.2, visible: has,
          color: done ? "c3" : sorted ? "c2" : "c5", opacity: sorted || done ? 0.9 : 0.45,
          label: has ? S[i + c] : "", labelSize: 0.17, labelUp: 0,
          info: { title: `Suffix starting at ${i}`, html: `<p>"${S.slice(i)}", ${n - i} letters.${mode === "doubling" && rk.length ? ` Its rank by the first ${k} letters is ${rk[i]}.` : ""}</p><p>A suffix array is just the list of start positions in sorted order: ${order.join(", ")}.</p>` } });
      }
      W.label("st" + r, String(i), [-2.75, y, 0.2], { color: "c1", size: 0.17 });
      W.label("rk" + r, mode === "doubling" && rk.length ? `rank ${rk[i]}` : "", [-2.2 + n * (SZ + 0.03) + 0.2, y, 0.2], { color: "muted", size: 0.15 });
    }
  }
  function show() { api.status(`${mode === "naive" ? "sort whole strings" : "prefix doubling"} · ${ops} ${mode === "naive" ? "letters read" : "rank-pair comparisons"}\n${line}`); }
  function reset() { ops = 0; order = [...Array(n).keys()]; rk = []; k = mode === "naive" ? 0 : 0; done = false; line = ""; gen = mode === "naive" ? naive() : doubling(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = ops;
    if (mode === "naive") api.explain(`${ops} letters read`, `<p>Each comparison walked along both suffixes until they differed. On repetitive text that's long, so the sort costs up to n² log n.</p><p>Switch to <b>prefix doubling</b> and run it.</p>`);
    else if (ran.naive && !reached) { reached = true; api.explain("Double what's sorted", `<p>${ops} comparisons of two small numbers, against ${ran.naive} letters read. After each round, the rank of the first k letters is known, and the first 2k letters are just two of those ranks side by side.</p><p>log n rounds of an n log n sort: O(n log² n), and O(n log n) with counting sort.</p>`); api.done("You built a suffix array"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(1300); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "sort whole strings", value: "naive" }, { label: "prefix doubling", value: "doubling" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0.55, 0.45, 0], dist: 12, theta: 0, phi: 1.5, instant: true });
  api.hud("one row per suffix, red number = where it starts · blue letters = the part already sorted on · green = final order");
  reset();
  api.explain("How to read this", `<p>Sort the 16 suffixes of "${S}". <b>Step</b> with <b>sort whole strings</b>, then with <b>prefix doubling</b>, and compare the work.</p>`);
});
