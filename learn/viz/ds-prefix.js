/* DSA, chapter 4: prefix sums.
   Top row: daily sales. Below it: the running total P, where P[k] = sum of the first k days.
   Queries ask "total sales from day l to day r".
   The "why": adding up the range for every query costs up to n additions per query, so q queries
   cost O(n·q). Building P once costs n additions, and then every query is one subtraction,
   P[r+1] − P[l], because the running total up to r minus the running total before l leaves exactly
   the days in between. */
VIZ.register("ds-prefix", async (api) => {
  const W = await api.world3d();
  const A = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
  const Q = [[2, 7], [0, 9], [4, 5], [1, 8], [3, 9], [0, 4]];
  const N = A.length, X = (i) => -5.4 + i * 1.2;
  const P = [0]; A.forEach((v) => P.push(P[P.length - 1] + v));
  let mode = "naive", gen = null, ops = 0, built = 0, hi = [], phi = [], answers = [], running = false, ran = {}, reached = false, line = "";
  function* naive() {
    for (const [l, r] of Q) {
      let s = 0;
      for (let i = l; i <= r; i++) { s += A[i]; ops++; hi = [l, i]; yield `day ${l}..${r}: running ${s}`; }
      answers.push(s); hi = []; yield `day ${l}..${r} = ${s}`;
    }
  }
  function* prefix() {
    for (let k = 1; k <= N; k++) { built = k; ops++; phi = [k]; yield `P[${k}] = P[${k - 1}] + ${A[k - 1]} = ${P[k]}`; }
    for (const [l, r] of Q) {
      ops++; phi = [l, r + 1]; hi = [l, r];
      answers.push(P[r + 1] - P[l]);
      yield `day ${l}..${r} = P[${r + 1}] − P[${l}] = ${P[r + 1]} − ${P[l]} = ${P[r + 1] - P[l]}`;
    }
  }
  function draw() {
    A.forEach((v, i) => {
      const on = hi.length && i >= hi[0] && i <= hi[1];
      W.box("a" + i, { x: X(i), y: 2 + v * 0.12, z: 0, sx: 0.95, sy: 0.3 + v * 0.24, sz: 0.9, color: on ? "c4" : "c2", glow: on ? 0.35 : 0,
        label: String(v), labelSize: 0.32, labelUp: 0.6 + 0.3 / (0.3 + v * 0.24),
        info: { title: `Day ${i}: ${v} sold`, html: "<p>One day's sales. A range question adds up a run of these.</p>" } });
    });
    for (let k = 0; k <= N; k++) {
      const show = mode === "prefix" && k <= built, on = phi.includes(k);
      W.box("p" + k, { x: X(k) - 0.6, y: -1.6, z: 0, sx: 0.95, sy: 0.7, sz: 0.9, color: on ? "c1" : show ? "c3" : "c5", opacity: show ? 0.95 : 0.12, glow: on ? 0.4 : 0,
        label: show ? `P${k}\n${P[k]}` : "", labelSize: 0.28, labelUp: 0,
        info: { title: `P[${k}] = ${P[k]}`, html: `<p>The total of the first ${k} days (days 0..${k - 1}). P[0] = 0 so that a range starting at day 0 works too.</p><p>Any range l..r is <b>P[r+1] − P[l]</b>: everything up to r, minus everything before l.</p>` } });
    }
  }
  function show() {
    api.status(`${mode === "naive" ? "add up every range" : "prefix sums"} · ${ops} addition${ops === 1 ? "" : "s"}/subtraction${ops === 1 ? "" : "s"} · ${answers.length}/${Q.length} queries answered\n${line}`);
  }
  function reset() { gen = mode === "naive" ? naive() : prefix(); ops = 0; built = 0; hi = []; phi = []; answers = []; line = ""; draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { hi = []; phi = []; draw(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = ops;
    if (mode === "naive") api.explain(`${ops} additions`, `<p>Each query walked its whole range. With n = 10⁵ days and 10⁵ queries that's up to 10¹⁰.</p><p>Switch to <b>prefix sums</b> and run it.</p>`);
    else if (ran.naive && !reached) { reached = true; api.explain("Build once, answer instantly", `<p>${N} additions to build P, then <b>one subtraction per query</b>: ${ops} in total instead of ${ran.naive}. With q queries it's O(n + q) instead of O(n·q).</p>`); api.done("You answered range sums with prefix sums"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "naive" ? 110 : 420); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "add up every range", value: "naive" }, { label: "prefix sums", value: "prefix" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [-0.3, 0.5, 0], dist: 18, theta: 0, phi: 1.35, instant: true });
  api.hud("top: sales per day · bottom: running totals P · yellow = range asked about · red = the two P's used");
  reset();
  api.explain("How to read this", `<p>Six questions like "total sales from day 2 to day 7". Press <b>Run all</b> to add each range up, then switch to <b>prefix sums</b>.</p>`);
});
