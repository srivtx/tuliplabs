/* ModSim, chapter 3: no more negative bikes, and a metric.
   The same two stations, now with the fix: if a rider finds the station empty, no bike moves and
   we count an unhappy customer. "No check" is chapter 2's model, for comparison.
   Both models see the same riders (the same random numbers), so the difference is the rule alone.
   The "why": the smallest change that fixes the problem, plus a number (unhappy riders) that lets
   you compare designs. */
VIZ.register("ms-bike-guard", async (api) => {
  await VIZ.lib("ms-plot"); await VIZ.lib("ms-bikekit");
  const P = window.MSPLOT, B = window.MSBIKE;
  let p1 = 0.6, p2 = 0.3, guard = true, seed = 3, res = null, upto = 0, running = false, reached = api.wasDone;
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const { scene, plot } = P.split(w, h, 0.36);
    const row = res ? res.hist[upto] : [0, 10, 2];
    B.draw(g, api, { ...scene, y1: scene.y1 - 40 }, row[1], row[2]);
    if (res && guard) {
      const ue = (k) => res.events.filter((e) => e[0] <= upto && e[1] === k).length;
      g.fillStyle = api.color("c4"); g.font = "600 12px 'IBM Plex Mono', monospace"; g.textAlign = "center";
      const mid = (scene.x0 + scene.x1) / 2;
      g.fillText(`${ue("o")} unhappy`, (scene.x0 + mid) / 2, scene.y1 - 18); g.fillText(`${ue("w")} unhappy`, (mid + scene.x1) / 2, scene.y1 - 18);
    }
    P.title(g, api, `minute ${upto} of 60 · ${guard ? "with the empty check" : "no check (chapter 2)"}`);
    const hs = res ? res.hist.slice(0, upto + 1) : [[0, 10, 2]];
    const lo = Math.min(-2, ...hs.map((q) => Math.min(q[1], q[2]))) - 1;
    const miss = res && guard ? res.events.filter((e) => e[0] <= upto).map((e) => [e[0], 0]) : [];
    P.plot(g, api, plot, { xlim: [0, 60], ylim: [lo, 14], xlabel: "minute", ylabel: "bikes at the station", legend: "right",
      hlines: [{ v: 0, col: "bad", dash: [] }], band: { y: [lo, 0], col: "bad" },
      series: [{ pts: hs.map((q) => [q[0], q[1]]), col: "c2", label: "Olin" }, { pts: hs.map((q) => [q[0], q[2]]), col: "c1", label: "Wellesley" }, { pts: miss, col: "c4", dots: true, r: 4, label: miss.length ? "a rider found it empty" : undefined }] });
  });
  // Like MSBIKE.run, but also records when each unhappy rider arrived.
  function simulate() {
    const rnd = P.rng(seed * 7919), hist = [[0, 10, 2]], events = []; let o = 10, wl = 2;
    for (let t = 1; t <= 60; t++) {
      if (rnd() < p1) { if (guard && o === 0) events.push([t, "o"]); else { o--; wl++; } }
      if (rnd() < p2) { if (guard && wl === 0) events.push([t, "w"]); else { wl--; o++; } }
      hist.push([t, o, wl]);
    }
    return { hist, events };
  }
  function report() {
    const done = res && upto === 60, ev = res ? res.events.filter((e) => e[0] <= upto) : [];
    const lo = res ? Math.min(...res.hist.slice(0, upto + 1).map((q) => Math.min(q[1], q[2]))) : 2;
    api.status(`p1 = ${p1.toFixed(2)}, p2 = ${p2.toFixed(2)} · ${guard ? "empty check on" : "no check"}\nunhappy riders: Olin ${ev.filter((e) => e[1] === "o").length}, Wellesley ${ev.filter((e) => e[1] === "w").length}\nlowest count: ${lo}`);
    if (!reached && done && guard && lo >= 0 && ev.length > 0) {
      reached = true;
      api.explain("Fixed, and measured", `<p>The stations never went below zero, and <b>${ev.length}</b> riders found an empty rack. That count is the <b>metric</b>: one number that says how well this design serves people.</p><p>Run <b>No check</b> with the same riders to see the old model go negative instead. Next chapter, you'll use the metric to choose p1.</p>`);
      api.done("No negative bikes, and a number to compare designs");
    }
  }
  async function run() {
    if (running) return; running = true; res = simulate();
    for (upto = 0; upto <= 60 && running; upto++) { cv.redraw(); report(); await api.sleep(30); }
    upto = 60; running = false; cv.redraw(); report();
  }
  api.slider("p1, riders at Olin per minute", { min: 0, max: 1, step: 0.01, value: p1, format: (v) => v.toFixed(2) }, (v) => { p1 = v; report(); });
  api.slider("p2, riders at Wellesley per minute", { min: 0, max: 1, step: 0.01, value: p2, format: (v) => v.toFixed(2) }, (v) => { p2 = v; report(); });
  api.seg([{ label: "With the empty check", value: "on" }, { label: "No check (naive)", value: "off" }], "on", (v) => {
    guard = v === "on"; if (res) { running = false; res = simulate(); upto = 60; } cv.redraw(); report();
  });
  api.button("Run an hour", run, { primary: true });
  api.button("New riders", () => { running = false; seed++; res = null; upto = 0; cv.redraw(); report(); });
  report();
  api.explain("How to read this", "<p>Same stations, same random riders, two rules. Amber dots mark riders who found the station empty: with the check they go home unhappy, without it the count goes negative.</p><p>Switching the rule replays the same hour, so you see the rule's effect alone.</p>");
});
