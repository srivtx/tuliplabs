/* DSA, chapter 33: bitmask DP (Held-Karp for the travelling salesperson).
   A van leaves depot 0, visits nine shops once each, and comes back. Find the shortest round trip.
   The "why": brute force tries every order of the nine shops: 9! = 362,880 routes. But two partial
   routes that have visited the same set of shops and stand at the same shop are interchangeable:
   only the shorter one can matter. So the state is (set visited, current shop), with the set stored
   as the bits of an integer. That's 9 × 2⁸ = 2,304 states (each shop is in half the sets), each trying up to 8 previous shops. */
VIZ.register("ds-tsp", async (api) => {
  const W = await api.world3d();
  const P = [[-5, 0], [-3.5, 2.6], [-1, 3], [1.8, 2.4], [4.6, 2.8], [5.2, 0.2], [3.4, -2.4], [0.6, -1.2], [-1.8, -2.8], [-4, -2.2]];
  const N = P.length, M = N - 1, FULL = (1 << M) - 1;
  const D = P.map((a) => P.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1])));
  let mode = "brute", gen = null, work = 0, best = Infinity, route = [], mask = 0, running = false, ran = {}, reached = false, line = "";
  const tourLen = (r) => r.reduce((s, c, i) => s + D[c][r[(i + 1) % r.length]], 0);
  function* brute() {
    const a = [...Array(M).keys()].map((i) => i + 1), c = Array(M).fill(0);
    const check = () => { work++; const r = [0, ...a], L = tourLen(r); if (L < best - 1e-9) { best = L; route = r; } };
    check();
    let i = 0;
    while (i < M) {
      if (c[i] < i) { const j = i % 2 ? c[i] : 0; [a[j], a[i]] = [a[i], a[j]]; check(); c[i]++; i = 0; if (work % 4000 === 0) yield `${work.toLocaleString("en")} routes checked`; }
      else { c[i] = 0; i++; }
    }
    yield `all ${work.toLocaleString("en")} orders checked: shortest ${best.toFixed(1)}`;
  }
  function* heldKarp() {
    const dp = new Float64Array((FULL + 1) * M).fill(Infinity), par = new Int8Array((FULL + 1) * M).fill(-1);
    const back = (m, last) => { const r = []; while (last >= 0) { r.unshift(last + 1); const p = par[m * M + last]; m ^= 1 << last; last = p; } return [0, ...r]; };
    for (let j = 0; j < M; j++) { dp[(1 << j) * M + j] = D[0][j + 1]; work++; }
    for (let m = 1; m <= FULL; m++) {
      mask = m;
      if (m & (m - 1)) for (let last = 0; last < M; last++) {
        if (!(m >> last & 1)) continue;
        const pm = m ^ (1 << last);
        work++;
        for (let prev = 0; prev < M; prev++) {
          if (!(pm >> prev & 1)) continue;
          const v = dp[pm * M + prev] + D[prev + 1][last + 1];
          if (v < dp[m * M + last]) { dp[m * M + last] = v; par[m * M + last] = prev; }
        }
      }
      let bl = -1;
      for (let last = 0; last < M; last++) if (m >> last & 1 && (bl < 0 || dp[m * M + last] < dp[m * M + bl])) bl = last;
      route = back(m, bl);
      yield `set ${m.toString(2).padStart(M, "0")}: best path through these shops ends at ${bl + 1}, length ${dp[m * M + bl].toFixed(1)}`;
    }
    let bl = 0;
    for (let last = 0; last < M; last++) if (dp[FULL * M + last] + D[last + 1][0] < dp[FULL * M + bl] + D[bl + 1][0]) bl = last;
    best = dp[FULL * M + bl] + D[bl + 1][0]; route = back(FULL, bl); mask = FULL;
    yield `every set done: close the loop back to the depot. Shortest ${best.toFixed(1)}`;
  }
  function draw() {
    const on = new Set(route);
    P.forEach(([x, y], v) => W.box("c" + v, { x, y, z: 0, sx: 0.7, sy: 0.7, sz: 0.5, color: v === 0 ? "c4" : on.has(v) ? "c3" : "c5", opacity: 0.95,
      label: String(v), labelSize: 0.28, labelUp: 0, info: { title: v ? `Shop ${v}` : "Depot", html: `<p>${v ? "Visit once." : "Start and finish here."}</p>` } }));
    for (let k = 0; k < N; k++) {
      const closed = mode === "brute" || route.length === N && mask === FULL && best < Infinity;
      if (k < route.length - 1 || (closed && k === route.length - 1 && route.length === N)) W.line("e" + k, "c" + route[k], "c" + route[(k + 1) % route.length], { color: mode === "brute" ? "c2" : "c3" });
      else W.unline("e" + k);
    }
    for (let b = 0; b < M; b++) W.box("bit" + b, { x: 3.6 - b * 0.9, y: -4.5, z: 0, sx: 0.75, sy: 0.6, sz: 0.25, color: mask >> b & 1 ? "c1" : "muted", opacity: mode === "hk" ? 0.9 : 0.15,
      label: String(b + 1), labelSize: 0.22, labelUp: 0, info: { title: `Bit ${b}`, html: `<p>1 if shop ${b + 1} is in the set.</p>` } });
  }
  function show() { api.status(`${mode === "brute" ? "brute force: every order" : "Held-Karp: (set, last shop) states"} · ${work.toLocaleString("en")} ${mode === "brute" ? "routes" : "states"}${best < Infinity ? ` · best ${best.toFixed(1)}` : ""}\n${line}`); }
  function reset() { work = 0; best = Infinity; route = []; mask = 0; line = ""; gen = mode === "brute" ? brute() : heldKarp(); draw(); show(); }
  function step(quiet) {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; if (!quiet) { draw(); show(); } return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = work;
    if (mode === "brute") api.explain(`${work.toLocaleString("en")} routes`, `<p>Every order of the nine shops, each measured in full. With 15 shops it would be 87 billion.</p><p>Switch to <b>Held-Karp</b> and run it.</p>`);
    else if (ran.brute && !reached) { reached = true; api.explain("Remember the set, not the order", `<p>${work.toLocaleString("en")} states against ${ran.brute.toLocaleString("en")} routes, same shortest trip. Two partial routes that visited the same shops and stand at the same shop are interchangeable, so only the shorter is kept.</p><p>The set is an integer whose bits say which shops are in it (the row of boxes). O(2ⁿ · n²): still exponential, but n = 20 is fine where n! never is.</p>`); api.done("You solved a tour with bitmask DP"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; let k = 0, q = false; while (step(q = mode === "hk" && ++k % 4 !== 0)) { if (!q) await api.sleep(mode === "brute" ? 30 : 16); } running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "brute force", value: "brute" }, { label: "Held-Karp", value: "hk" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, -0.8, 0], dist: 17.5, theta: 0, phi: 1.5, instant: true });
  api.hud("amber = the depot · lines = the best route found so far · bottom row: the set of shops as bits (lit = in the set)");
  reset();
  api.explain("How to read this", `<p>Start at depot 0, visit all nine shops once, and return. <b>Run all</b> with <b>brute force</b>, then with <b>Held-Karp</b>.</p>`);
});
