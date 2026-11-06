/* ModSim, chapter 10: one queue or two?
   A store with two counters. Each minute a customer arrives with chance λ, and each busy counter
   finishes with chance μ = 0.3. Three designs:
   - one queue feeding both counters,
   - two queues, each new customer joins the shorter,
   - two queues, each new customer picks one at random (the naive design).
   Watch the store, or sweep λ: each point runs 20,000 minutes and turns the average number in the
   store L into the average time W = L / λ (Little's law).
   The "why": one shared line never leaves a counter idle while someone waits. */
VIZ.register("ms-queue", async (api) => {
  await VIZ.lib("ms-plot");
  const P = window.MSPLOT, MU = 0.3;
  const DESIGNS = { one: "one queue", short: "two queues, join the shorter", rand: "two queues, pick at random" };
  const COL = { one: "c3", short: "c2", rand: "c1" };
  let design = "one", lam = 0.45, state = { one: 0, q: [0, 0] }, minute = 0, area = 0, running = false, curves = {}, reached = api.wasDone, rnd = P.rng(5);
  function tick(s, d, lamb, r) {
    if (d === "one") {
      const busy = Math.min(2, s.one); let done = 0; for (let i = 0; i < busy; i++) if (r() < MU) done++;
      s.one -= done; if (r() < lamb) s.one++;
      return s.one;
    }
    for (let i = 0; i < 2; i++) if (s.q[i] > 0 && r() < MU) s.q[i]--;
    if (r() < lamb) { const k = d === "short" ? (s.q[0] <= s.q[1] ? 0 : 1) : (r() < 0.5 ? 0 : 1); s.q[k]++; }
    return s.q[0] + s.q[1];
  }
  function avgW(d, lamb) {
    const r = P.rng(99), s = { one: 0, q: [0, 0] }; let a = 0;
    for (let t = 0; t < 20000; t++) a += tick(s, d, lamb, r);
    return a / 20000 / lamb;
  }
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const { scene: sc, plot } = P.split(w, h, 0.38);
    // the store: two counters at the top, customers as dots below them
    const cx = [(sc.x0 * 2 + sc.x1) / 3, (sc.x0 + sc.x1 * 2) / 3], cy = sc.y0 + 30, dot = 9;
    const queueAt = (x, n, startY, col) => { for (let i = 0; i < n && i < 14; i++) { g.fillStyle = api.color(col); g.beginPath(); g.arc(x, startY + i * (dot + 4), dot / 2, 0, 7); g.fill(); } if (n > 14) { g.fillStyle = api.color("muted"); g.fillText(`+${n - 14}`, x + 8, startY + 14 * (dot + 4)); } };
    g.font = "11px 'IBM Plex Sans', sans-serif"; g.textAlign = "center";
    cx.forEach((x, i) => { g.fillStyle = api.color("c5"); g.fillRect(x - 18, cy - 12, 36, 10); g.fillStyle = api.color("muted"); g.fillText(`counter ${i + 1}`, x, cy - 16); });
    if (design === "one") {
      const n = state.one, serving = Math.min(2, n);
      for (let i = 0; i < serving; i++) queueAt(cx[i], 1, cy + 10, "c4");
      queueAt((cx[0] + cx[1]) / 2, n - serving, cy + 34, COL.one);
    } else state.q.forEach((n, i) => { if (n) queueAt(cx[i], 1, cy + 10, "c4"); queueAt(cx[i], Math.max(0, n - 1), cy + 34, COL[design]); });
    P.title(g, api, `minute ${minute} · ${DESIGNS[design]} · average wait so far ${minute ? (area / minute / lam).toFixed(1) : "–"} min`);
    P.plot(g, api, plot, {
      xlim: [0.1, 0.55], ylim: [0, 30], xlabel: "λ, customers arriving per minute", ylabel: "average time in the store W (minutes)",
      vlines: [{ v: lam, col: "c4" }],
      series: Object.entries(curves).map(([d, pts]) => ({ pts, col: COL[d], line: true, dots: true, label: DESIGNS[d] })),
    });
  });
  function report() {
    api.status(`λ = ${lam.toFixed(2)} arrivals a minute, μ = ${MU} per counter\nload: ${(lam / (2 * MU) * 100).toFixed(0)}% of what the two counters can serve\n${Object.keys(curves).length}/3 designs swept`);
  }
  async function watch() {
    if (running) { running = false; return; }
    running = true; state = { one: 0, q: [0, 0] }; minute = 0; area = 0;
    while (running && minute < 600) { for (let k = 0; k < 2; k++) { area += tick(state, design, lam, rnd); minute++; } cv.redraw(); await api.sleep(40); }
    running = false; report();
  }
  async function sweep() {
    running = false; const pts = [], d = design;
    for (let l = 0.1; l <= 0.5501; l += 0.05) { pts.push([l, avgW(d, l)]); curves[d] = pts.slice(); cv.redraw(); await api.sleep(30); }
    report();
    if (!reached && Object.keys(curves).length === 3) {
      reached = true;
      const at = (d) => curves[d][curves[d].length - 1][1];
      api.explain("One line, or a smart choice", `<p>At λ = 0.55 the average time in the store was <b>${at("one").toFixed(1)}</b> minutes with one queue, <b>${at("short").toFixed(1)}</b> with two queues where people join the shorter, and <b>${at("rand").toFixed(1)}</b> when they pick at random.</p><p>One shared line never leaves a counter idle while someone waits. Joining the shorter line gets almost all of that benefit, so those two curves nearly overlap. Real customers can't always choose well, and picking at random is clearly worse once the store gets busy.</p>`);
      api.done("Compared three checkout designs fairly");
    }
  }
  api.seg(Object.entries(DESIGNS).map(([v, l]) => ({ label: v === "rand" ? "Pick at random (naive)" : v === "one" ? "One queue" : "Join the shorter", value: v })), design, (v) => {
    design = v; running = false; state = { one: 0, q: [0, 0] }; minute = 0; area = 0; cv.redraw(); report();
  });
  api.slider("λ, arrivals per minute", { min: 0.1, max: 0.55, step: 0.01, value: lam, format: (v) => v.toFixed(2) }, (v) => { lam = v; cv.redraw(); report(); });
  api.button("Sweep λ", sweep, { primary: true });
  api.button("Watch the store", watch);
  report();
  api.explain("How to read this", "<p>Left: the store. Amber customers are being served; the rest wait. Right: average time in the store for each design as arrivals get busier.</p><p>Sweep λ for all three designs, so they're compared over the same range.</p>");
});
