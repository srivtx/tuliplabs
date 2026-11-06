/* ModSim, chapter 2: two bike stations, minute by minute.
   Riders arrive at random: at Olin with chance p1 a minute, at Wellesley with chance p2. Every
   run is different. Raise p1 and the model does something impossible: a station goes negative.
   The "why": a model only knows the rules you wrote. Nothing in this one says "you can't take a
   bike that isn't there", which is the next chapter's fix. */
VIZ.register("ms-bike", async (api) => {
  await VIZ.lib("ms-plot"); await VIZ.lib("ms-bikekit");
  const P = window.MSPLOT, B = window.MSBIKE;
  let p1 = 0.5, p2 = 0.33, seed = 1, shown = [[0, 10, 2]], olin = 10, wel = 2, runs = [], running = false, reached = api.wasDone;
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const { scene, plot } = P.split(w, h, 0.36);
    B.draw(g, api, scene, olin, wel);
    P.title(g, api, `minute ${shown[shown.length - 1][0]} of 60`);
    const series = runs.flatMap((r) => [{ pts: r.map((q) => [q[0], q[1]]), col: "c2", alpha: 0.25, width: 1 }, { pts: r.map((q) => [q[0], q[2]]), col: "c1", alpha: 0.25, width: 1 }]);
    series.push({ pts: shown.map((q) => [q[0], q[1]]), col: "c2", label: "Olin" }, { pts: shown.map((q) => [q[0], q[2]]), col: "c1", label: "Wellesley" });
    const all = [...runs.flat(), ...shown], lo = Math.min(-6, ...all.map((q) => Math.min(q[1], q[2]))) - 1, hi = Math.max(14, ...all.map((q) => Math.max(q[1], q[2]))) + 1;
    P.plot(g, api, plot, { xlim: [0, 60], ylim: [lo, hi], xlabel: "minute", ylabel: "bikes at the station", hlines: [{ v: 0, col: "bad", dash: [], label: "empty" }], band: { y: [lo, 0], col: "bad" }, series, legend: "right" });
  });
  function report() {
    const lo = Math.min(...shown.map((q) => Math.min(q[1], q[2])));
    api.status(`p1 = ${p1.toFixed(2)} (Olin)   p2 = ${p2.toFixed(2)} (Wellesley)\nnow: Olin ${olin}, Wellesley ${wel}  ·  total ${olin + wel}\nlowest so far this run: ${lo}`);
    if (!reached && lo < 0) {
      reached = true;
      api.explain("An impossible state", `<p>A station reached <b>${lo}</b> bikes. Riders took bikes that weren't there, and the total stayed 12 the whole time, so the model is perfectly consistent with its own rules.</p><p>The rules are what's wrong: nothing says a rider must find a bike. Chapter 3 adds that check.</p>`);
      api.done("Found the model's bug: negative bikes");
    }
  }
  async function run() {
    if (running) return; running = true;
    if (shown.length > 1) runs.push(shown);
    const r = B.run(p1, p2, 60, false, P.rng(seed++ * 7919));
    for (let i = 1; i < r.hist.length && running; i++) { shown = r.hist.slice(0, i + 1); [, olin, wel] = r.hist[i]; cv.redraw(); report(); await api.sleep(35); }
    running = false;
  }
  api.slider("p1, riders at Olin per minute", { min: 0, max: 1, step: 0.01, value: p1, format: (v) => v.toFixed(2) }, (v) => { p1 = v; report(); });
  api.slider("p2, riders at Wellesley per minute", { min: 0, max: 1, step: 0.01, value: p2, format: (v) => v.toFixed(2) }, (v) => { p2 = v; report(); });
  api.button("Run an hour", run, { primary: true });
  api.button("Clear", () => { running = false; runs = []; shown = [[0, 10, 2]]; olin = 10; wel = 2; cv.redraw(); report(); });
  report();
  api.explain("How to read this", "<p>Olin starts with 10 bikes, Wellesley with 2. Run an hour a few times: each run differs, and faint lines keep the old ones.</p><p>Then push p1 up toward 0.6 and watch the shaded zone below zero.</p>");
});
