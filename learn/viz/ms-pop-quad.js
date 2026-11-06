/* ModSim, chapter 7: quadratic growth and the carrying capacity.
   net growth = alpha·p + beta·p². With beta < 0, crowding slows growth, and it stops at
   p = −alpha/beta, the equilibrium (dashed). Fit alpha and beta to the census, then look ahead
   to 2250 and watch the model settle on its equilibrium.
   The "why": one extra term bends the curve the right way, and it brings a prediction with it:
   a population the world levels off at. */
VIZ.register("ms-pop-quad", async (api) => {
  await VIZ.lib("ms-plot"); await VIZ.lib("ms-popkit");
  const P = window.MSPLOT, D = window.MSPOP;
  let alpha = 0.025, beta = -0.0012, far = false, reached = api.wasDone;
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const upd = (p) => alpha * p + beta * p * p, run = D.sim(upd, undefined, 1950, far ? 2250 : 2016), K = beta < 0 ? -alpha / beta : Infinity;
    P.title(g, api, `equilibrium −alpha/beta = ${isFinite(K) ? K.toFixed(1) + " billion" : "none"} · RMS error ${(D.rms(run) * 1000).toFixed(0)} million`);
    const top = far ? Math.max(16, Math.min(40, (isFinite(K) ? K : 30) + 2)) : 9;
    P.plot(g, api, { x0: 52, y0: 46, x1: w - 16, y1: h - 36 }, {
      xlim: far ? [1950, 2250] : [1948, 2018], ylim: [2, top], xlabel: "year", ylabel: "world population (billions)", xfmt: (t) => String(t),
      hlines: isFinite(K) && K < top ? [{ v: K, col: "c4", label: "equilibrium" }] : [],
      series: [...(far ? [] : D.residuals(run)), { pts: D.CENSUS, col: "c2", dots: true, r: far ? 2.5 : 4, label: "census" }, { pts: run, col: "c1", label: "quadratic model" }],
    });
  });
  function report() {
    const e = D.rms(D.sim((p) => alpha * p + beta * p * p)), K = -alpha / beta;
    api.status(`alpha = ${alpha.toFixed(4)}, beta = ${beta.toFixed(5)}\nequilibrium ${beta < 0 ? K.toFixed(2) + " billion" : "none (beta must be negative)"}\nRMS error 1950–2016: ${(e * 1000).toFixed(0)} million`);
    if (!reached && e < 0.06) {
      reached = true;
      api.explain("The curve bends the right way", `<p>RMS error <b>${(e * 1000).toFixed(0)} million</b>, far better than constant (157) or proportional (215) growth. The beta term makes growth per person fall as the world fills.</p><p>And the fit carries a prediction: growth stops at <b>${K.toFixed(1)} billion</b>. Press <b>Look ahead</b> to see the model level off there.</p>`);
      api.done("Fitted quadratic growth to the census");
    }
  }
  api.slider("alpha (growth per person)", { min: 0.015, max: 0.035, step: 0.0005, value: alpha, format: (v) => v.toFixed(4) }, (v) => { alpha = v; cv.redraw(); report(); });
  api.slider("beta (crowding)", { min: -0.004, max: 0, step: 0.0001, value: beta, format: (v) => v.toFixed(4) }, (v) => { beta = v; cv.redraw(); report(); });
  api.seg([{ label: "Fit: 1950–2016", value: "fit" }, { label: "Look ahead to 2250", value: "far" }], "fit", (v) => { far = v === "far"; cv.redraw(); });
  report();
  api.explain("How to read this", "<p>alpha is growth per person in an empty world; beta (negative) is how much crowding slows it. Fit both to the census dots.</p><p>The dashed line is where growth stops. Switch to <b>Look ahead</b> to see the model reach it.</p>");
});
