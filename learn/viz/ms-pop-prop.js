/* ModSim, chapter 6: births and deaths, proportional growth.
   Each year births = birth rate × population and deaths = death rate × population. Only the
   difference, alpha = birth − death, matters to the curve: try two pairs with the same gap.
   The faint line is the best constant-growth model from chapter 5, for comparison.
   The "why": a more realistic mechanism isn't automatically a better fit. Proportional growth
   bends upward forever, while the census bends the other way after about 1990. */
VIZ.register("ms-pop-prop", async (api) => {
  await VIZ.lib("ms-plot"); await VIZ.lib("ms-popkit");
  const P = window.MSPLOT, D = window.MSPOP;
  let birth = 0.035, death = 0.01, reached = api.wasDone;
  const constRun = D.sim(() => 0.07), constRms = D.rms(constRun);
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const a = birth - death, run = D.sim((p) => a * p);
    P.title(g, api, `alpha = ${birth.toFixed(4)} − ${death.toFixed(4)} = ${a.toFixed(4)} · RMS error ${(D.rms(run) * 1000).toFixed(0)} million`);
    P.plot(g, api, { x0: 52, y0: 46, x1: w - 16, y1: h - 36 }, {
      xlim: [1948, 2018], ylim: [2, 9], xlabel: "year", ylabel: "world population (billions)", xfmt: (t) => String(t),
      series: [...D.residuals(run), { pts: constRun, col: "c5", dash: [5, 4], width: 1.5, label: "best constant growth (chapter 5)" },
        { pts: D.CENSUS, col: "c2", dots: true, r: 4, label: "census" }, { pts: run, col: "c1", label: "proportional growth" }],
    });
  });
  function report() {
    const a = birth - death, e = D.rms(D.sim((p) => a * p));
    api.status(`births ${(birth * 100).toFixed(2)}% and deaths ${(death * 100).toFixed(2)}% of the population a year\nnet growth alpha = ${(a * 100).toFixed(2)}% a year\nRMS error ${(e * 1000).toFixed(0)} million (best constant model: ${(constRms * 1000).toFixed(0)} million)`);
    if (!reached && e < 0.22) {
      reached = true;
      api.explain("The best proportional fit, and its limit", `<p>Net growth of <b>${(a * 100).toFixed(2)}%</b> a year scores ${(e * 1000).toFixed(0)} million. That's worse than the best constant model (${(constRms * 1000).toFixed(0)} million), even though the mechanism is more realistic.</p><p>Look at the shape: the model curves upward faster and faster, while the census straightens out after 1990. Growth per person must be falling, which is chapter 7's idea.</p>`);
      api.done("Fitted proportional growth, and saw where it fails");
    }
  }
  api.slider("Birth rate (per person per year)", { min: 0.01, max: 0.05, step: 0.0005, value: birth, format: (v) => (v * 100).toFixed(2) + "%" }, (v) => { birth = v; cv.redraw(); report(); });
  api.slider("Death rate (per person per year)", { min: 0, max: 0.03, step: 0.0005, value: death, format: (v) => (v * 100).toFixed(2) + "%" }, (v) => { death = v; cv.redraw(); report(); });
  report();
  api.explain("How to read this", "<p>Set a birth rate and a death rate. Each year the population grows by their difference times the population, so a bigger world grows faster.</p><p>Make the RMS error as small as you can, then compare with the dashed constant-growth line.</p>");
});
