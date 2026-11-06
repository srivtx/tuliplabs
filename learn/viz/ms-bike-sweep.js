/* ModSim, chapter 4: sweep a parameter.
   Run the guarded bike model for p1 = 0, 0.05, … 1 (p2 fixed) and plot unhappy riders at Olin
   for each. With one run per value (the naive sweep) the curve is jagged, because each point is
   a single roll of the dice. Average 30 runs per point and the shape appears.
   The "why": a sweep turns "what happens at this setting?" into "how does it depend on it?", and
   with a random model each point needs several runs before you trust it. */
VIZ.register("ms-bike-sweep", async (api) => {
  await VIZ.lib("ms-plot"); await VIZ.lib("ms-bikekit");
  const P = window.MSPLOT, B = window.MSBIKE;
  let p2 = 0.2, reps = 30, pts = [], ghosts = [], seed = 11, running = false, triedOne = false, reached = api.wasDone;
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    P.title(g, api, `p2 = ${p2.toFixed(2)} · ${reps === 1 ? "one run per point" : `average of ${reps} runs per point`}`);
    const top = Math.max(12, ...pts.map((q) => q[1]), ...ghosts.flat().map((q) => q[1])) + 2;
    const knee = pts.length > 15 ? [...pts].filter((q) => q[1] < 1).pop() : null;
    P.plot(g, api, { x0: 52, y0: 46, x1: w - 16, y1: h - 36 }, {
      xlim: [0, 1], ylim: [0, top], xlabel: "p1, riders at Olin per minute", ylabel: "unhappy riders at Olin in an hour",
      vlines: knee ? [{ v: knee[0], col: "c4", label: `under 1 unhappy up to p1 ≈ ${knee[0].toFixed(2)}` }] : [],
      series: [...ghosts.map((s) => ({ pts: s, col: "c5", alpha: 0.6, width: 1 })), { pts, col: reps === 1 ? "c1" : "c2", line: true, dots: true }],
    });
  });
  async function sweep() {
    if (running) return; running = true;
    if (pts.length) ghosts.push(pts); pts = [];
    for (let i = 0; i <= 20 && running; i++) {
      const p1 = i / 20; let s = 0;
      for (let r = 0; r < reps; r++) s += B.run(p1, p2, 60, true, P.rng(seed++ * 7919)).olinEmpty;
      pts.push([p1, s / reps]); cv.redraw();
      api.status(`p1 = ${p1.toFixed(2)}: ${(s / reps).toFixed(reps === 1 ? 0 : 1)} unhappy riders${reps > 1 ? " on average" : ""}`);
      await api.sleep(60);
    }
    running = false;
    if (reps === 1) triedOne = true;
    if (!reached && pts.length === 21 && reps > 1 && triedOne) {
      reached = true;
      const knee = [...pts].filter((q) => q[1] < 1).pop();
      api.explain("A curve you can trust", `<p>One run per point gave a jagged line: the grey ghosts. Averaging ${reps} runs per point gave a smooth one. Up to about <b>p1 = ${knee ? knee[0].toFixed(2) : "?"}</b> almost nobody is turned away; beyond that, unhappy riders climb nearly in a straight line, since every extra rider finds Olin empty.</p><p>That's what a sweep is for: the shape of the dependence, not one number.</p>`);
      api.done("Swept p1 and found where the trouble starts");
    }
  }
  api.slider("p2, riders at Wellesley per minute", { min: 0, max: 0.6, step: 0.05, value: p2, format: (v) => v.toFixed(2) }, (v) => { p2 = v; ghosts = []; pts = []; cv.redraw(); });
  api.seg([{ label: "Average of 30 runs", value: 30 }, { label: "One run per point (naive)", value: 1 }], 30, (v) => { reps = +v; cv.redraw(); });
  api.button("Sweep p1", sweep, { primary: true });
  api.button("Clear", () => { running = false; pts = []; ghosts = []; cv.redraw(); });
  api.status("Press Sweep p1.");
  api.explain("How to read this", "<p>Each point is one setting of p1, with p2 held fixed. Its height is how many riders found Olin empty in an hour.</p><p>Sweep with <b>one run per point</b> first, then with the average, and compare.</p>");
});
