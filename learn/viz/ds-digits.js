/* DSA, chapter 35: digit DP.
   How many whole numbers from 0 to 4,327 have digits adding up to 13?
   The "why": brute force checks all 4,328 numbers, and for a limit like 10¹⁸ that's hopeless. But
   once a number's leading digits are already smaller than the limit's, the remaining digits are
   free (0–9 each), and how many ways they can finish depends only on (how many digits are left,
   digit sum so far). That's a small table: 5 × 14 cells. Then walk the limit's digits once: at
   each position, every smaller digit drops you into the free table; the equal digit stays "tight". */
VIZ.register("ds-digits", async (api) => {
  const W = await api.world3d();
  const LIM = "4327", L = LIM.length, S = 13;
  let mode = "brute", gen = null, work = 0, count = 0, shown = "0000", f = [], cur = null, reads = [], tightPos = -1, running = false, ran = {}, reached = false, line = "";
  const dsum = (x) => [...String(x)].reduce((s, c) => s + +c, 0);
  function* brute() {
    for (let x = 0; x <= +LIM; x++) {
      work++; if (dsum(x) === S) count++;
      if (x % 40 === 39 || x === +LIM) { shown = String(x).padStart(L, "0"); yield `checked up to ${x}: ${count} found so far`; }
    }
    yield `all ${work.toLocaleString("en")} numbers checked: ${count} have digit sum ${S}`;
  }
  function* digitDp() {
    f = Array.from({ length: L + 1 }, () => Array(S + 1).fill(undefined));
    for (let pos = L; pos >= 0; pos--) for (let s = 0; s <= S; s++) {
      work++; cur = [pos, s];
      if (pos === L) { f[pos][s] = s === S ? 1 : 0; reads = []; yield `no digits left, sum ${s}: ${f[pos][s] ? "exactly 13, that's 1 number" : "not 13, 0 numbers"}`; continue; }
      let t = 0; reads = [];
      for (let d = 0; d <= 9 && s + d <= S; d++) { t += f[pos + 1][s + d]; reads.push([pos + 1, s + d]); }
      f[pos][s] = t;
      yield `${L - pos} free digit${L - pos === 1 ? "" : "s"} left, sum ${s}: try 0–9 next, add up ${reads.length} cells below = ${t}`;
    }
    reads = []; cur = null;
    let s = 0;
    for (let pos = 0; pos < L; pos++) {
      const lim = +LIM[pos]; tightPos = pos;
      let add = 0; reads = [];
      for (let d = 0; d < lim && s + d <= S; d++) { add += f[pos + 1][s + d]; reads.push([pos + 1, s + d]); }
      work++; count += add;
      shown = LIM.slice(0, pos) + "?".repeat(L - pos);
      yield `tight on "${LIM.slice(0, pos) || "–"}", sum ${s}: next digit 0..${lim - 1} makes it smaller than ${LIM}, so the rest is free: +${add}. Total ${count}`;
      s += lim;
    }
    reads = []; tightPos = L; work++; shown = LIM;
    if (s === S) count++;
    yield `${LIM} itself has digit sum ${s}${s === S ? ": +1" : ", not 13"}. Total ${count}`;
  }
  function draw() {
    const dp = mode === "dp";
    for (let i = 0; i < L; i++) W.box("dg" + i, { x: -1.5 + i * 1.0, y: 3.1, z: 0, sx: 0.85, sy: 0.85, sz: 0.4, color: dp && i < tightPos ? "c4" : "c5", opacity: 0.95,
      label: shown[i], labelSize: 0.32, labelUp: 0, info: { title: `Digit ${i + 1}`, html: dp ? "<p>The limit's digits, followed while the number is still equal to it (tight).</p>" : "<p>The number being checked.</p>" } });
    for (let pos = 0; pos <= L; pos++) {
      W.label("rp" + pos, `${L - pos} left`, [-5.5, 1.6 - pos * 0.8, 0.3], { color: dp ? "muted" : "line", size: 0.2 });
      for (let s = 0; s <= S; s++) {
        const v = f[pos] && f[pos][s], hot = cur && cur[0] === pos && cur[1] === s, rd = reads.some(([a, b]) => a === pos && b === s);
        W.box(`f${pos}_${s}`, { x: -4.4 + s * 0.74, y: 1.6 - pos * 0.8, z: 0, sx: 0.68, sy: 0.68, sz: 0.25, color: hot ? "c1" : rd ? "c4" : v ? "c2" : v === 0 ? "c5" : "muted", glow: hot || rd ? 0.35 : 0, opacity: dp ? 0.95 : 0.12,
          label: dp && v !== undefined ? String(v) : "", labelSize: 0.19, labelUp: 0,
          info: { title: `${L - pos} free digits left, sum so far ${s}`, html: `<p>Ways to finish with digit sum ${S}: ${v ?? "not filled yet"}.</p>` } });
      }
    }
    for (let s = 0; s <= S; s++) W.label("cs" + s, String(s), [-4.4 + s * 0.74, 2.2, 0.3], { color: dp ? "muted" : "line", size: 0.2 });
  }
  function show() { api.status(`${mode === "brute" ? "check every number" : "digit DP"} · ${work.toLocaleString("en")} ${mode === "brute" ? "numbers" : "steps"} · found ${count}\n${line}`); }
  function reset() { work = 0; count = 0; shown = "0000"; f = []; cur = null; reads = []; tightPos = -1; line = ""; gen = mode === "brute" ? brute() : digitDp(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = work;
    if (mode === "brute") api.explain(`${work.toLocaleString("en")} numbers`, `<p>${count} of them have digit sum ${S}. Fine for 4,327; for a limit of 10¹⁸ it would take longer than the age of the universe.</p><p>Switch to <b>digit DP</b> and run it.</p>`);
    else if (ran.brute && !reached) { reached = true; api.explain("Free digits only care about the sum", `<p>Same ${count}, in ${work} steps against ${ran.brute.toLocaleString("en")}. Once a number is already below the limit, its remaining digits are free, and the count depends only on (digits left, sum so far): one small table.</p><p>The limit's own digits are walked once, "tight". For 10¹⁸ that's 19 digits × ~170 sums × 10 choices.</p>`); api.done("You counted numbers with digit DP"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "brute" ? 25 : 150); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "check every number", value: "brute" }, { label: "digit DP", value: "dp" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.4, 0], dist: 17.5, theta: 0, phi: 1.5, instant: true });
  api.hud(`count 0..${LIM} with digit sum ${S} · top: the digits · table: rows = free digits left, columns = digit sum so far, number = ways to finish · amber = cells being added`);
  reset();
  api.explain("How to read this", `<p>How many numbers from 0 to ${LIM} have digits adding up to ${S}? <b>Run all</b> with <b>check every number</b>, then with <b>digit DP</b>.</p>`);
});
