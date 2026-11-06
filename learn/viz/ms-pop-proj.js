/* ModSim, chapter 8: projections, and how much they depend on the data you fit.
   Three models fitted to the census up to a year you choose: constant growth (the average yearly
   gain), proportional growth (the average growth rate) and quadratic growth (a straight-line fit
   of growth rate against population, as in the chapter). All three run on to 2100, beside the
   UN's projection (squares).
   The "why": models that agree on the past can disagree wildly on the future, and the quadratic
   one's forecast moves a lot depending on which years you fit. */
VIZ.register("ms-pop-proj", async (api) => {
  await VIZ.lib("ms-plot"); await VIZ.lib("ms-popkit");
  const P = window.MSPLOT, D = window.MSPOP;
  const UN = [[2020, 7.8], [2030, 8.5], [2040, 9.2], [2050, 9.7], [2060, 10.2], [2070, 10.5], [2080, 10.8], [2090, 11.0], [2100, 11.2]];
  let end = 2016, reached = api.wasDone; const tried = new Set();
  function fit(endYear) {
    const C = D.CENSUS.filter(([t]) => t <= endYear), p0 = C[0][1], last = C[C.length - 1];
    const gain = (last[1] - p0) / (last[0] - 1950);
    const rate = Math.log(last[1] / p0) / (last[0] - 1950);
    // regress yearly growth rate on population: rate = alpha + beta·p
    const xs = [], ys = [];
    for (let i = 0; i + 1 < C.length; i++) { const dt = C[i + 1][0] - C[i][0]; xs.push(C[i][1]); ys.push((C[i + 1][1] - C[i][1]) / dt / C[i][1]); }
    const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
    let sxy = 0, sxx = 0; xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
    const beta = sxy / sxx, alpha = my - beta * mx;
    return {
      cons: D.sim(() => gain, p0, 1950, 2100), prop: D.sim((p) => (Math.exp(rate) - 1) * p, p0, 1950, 2100),
      quad: D.sim((p) => alpha * p + beta * p * p, p0, 1950, 2100), alpha, beta,
    };
  }
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const f = fit(end), at = (r) => r[r.length - 1][1];
    P.title(g, api, `fitted to ${end === 2016 ? "all the census" : "the census up to " + end} · in 2100: ${at(f.cons).toFixed(1)}, ${at(f.prop).toFixed(1)}, ${at(f.quad) > 100 ? "∞" : at(f.quad).toFixed(1)} billion`);
    P.plot(g, api, { x0: 52, y0: 46, x1: w - 16, y1: h - 36 }, {
      xlim: [1950, 2100], ylim: [0, 45], xlabel: "year", ylabel: "world population (billions)", xfmt: (t) => String(t),
      band: { x: [1950, end], col: "c5" },
      series: [{ pts: f.cons, col: "c5", label: "constant growth" }, { pts: f.prop, col: "c1", label: "proportional growth" }, { pts: f.quad, col: "c3", label: "quadratic growth" },
        { pts: D.CENSUS.filter(([t]) => t <= end), col: "c2", dots: true, r: 3.5, label: "census used for the fit" },
        { pts: D.CENSUS.filter(([t]) => t > end), col: "c2", dots: true, r: 3.5, alpha: 0.35 },
        { pts: UN, col: "c4", dots: true, r: 3.5, label: "UN projection" }],
    });
  });
  function report() {
    const f = fit(end), q = f.quad[f.quad.length - 1][1];
    tried.add(end <= 1990 ? "early" : end >= 2010 ? "late" : "mid");
    api.status(`fit uses census years 1950–${end}\nquadratic: alpha ${f.alpha.toFixed(4)}, beta ${f.beta.toFixed(5)} → 2100: ${q > 100 ? "runs away" : q.toFixed(1) + " billion"}\nUN projection for 2100: 11.2 billion`);
    if (!reached && tried.has("early") && tried.has("late")) {
      reached = true;
      api.explain("Same past, different futures", `<p>Fitted to all the census, the three models say about <b>13, 28 and 12 billion</b> for 2100. Fitted only up to 1990, the quadratic model says about <b>25 billion</b>; fitted up to 1980 its beta even turns positive, there's no equilibrium, and it runs away.</p><p>Every one of those fits tracks the years it was given. Fitting the past well is necessary, but it isn't proof about the future.</p>`);
      api.done("Saw how much a forecast depends on its fit");
    }
  }
  api.slider("Fit using the census up to", { min: 1980, max: 2015, step: 5, value: 2016, format: (v) => String(v >= 2015 ? 2016 : v) }, (v) => { end = v >= 2015 ? 2016 : v; cv.redraw(); report(); });
  report();
  api.explain("How to read this", "<p>The shaded years are the data each model was fitted to. Everything to the right is a forecast.</p><p>Slide the fit back to 1990 or earlier, then forward again, and watch the 2100 numbers.</p>");
});
