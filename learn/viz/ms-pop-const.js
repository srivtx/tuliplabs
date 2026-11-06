/* ModSim, chapter 5: constant growth, fitted by hand.
   The model adds the same number of people every year. Slide that number and watch the model
   line, the census dots, and the grey error bars between them. The error score is the
   root-mean-square (RMS) of those bars.
   The naive comparison: "Use the endpoints", the chapter's first choice, which makes the first
   and last points match exactly. You can beat it by letting both ends miss a little.
   The "why": a good fit is judged by all the data, not by two points. */
VIZ.register("ms-pop-const", async (api) => {
  await VIZ.lib("ms-plot"); await VIZ.lib("ms-popkit");
  const P = window.MSPLOT, D = window.MSPOP, ENDS = (7.333 - 2.558) / 66;
  let gr = 0.05, reached = api.wasDone;
  const endRms = D.rms(D.sim(() => ENDS));
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const run = D.sim(() => gr);
    P.title(g, api, `adds ${(gr * 1000).toFixed(0)} million people a year · RMS error ${(D.rms(run) * 1000).toFixed(0)} million`);
    P.plot(g, api, { x0: 52, y0: 46, x1: w - 16, y1: h - 36 }, {
      xlim: [1948, 2018], ylim: [2, 8], xlabel: "year", ylabel: "world population (billions)",
      xfmt: (t) => String(t),
      series: [...D.residuals(run), { pts: D.CENSUS, col: "c2", dots: true, r: 4, label: "census" }, { pts: run, col: "c1", label: "constant growth model" }],
    });
  });
  function report() {
    const e = D.rms(D.sim(() => gr));
    api.status(`annual growth ${gr.toFixed(4)} billion (${(gr * 1000).toFixed(1)} million a year)\nRMS error ${(e * 1000).toFixed(0)} million\nthe endpoint fit scores ${(endRms * 1000).toFixed(0)} million`);
    if (!reached && e < endRms - 0.01) {
      reached = true;
      api.explain("Better than matching the ends", `<p>Your line starts on the 1950 census but misses 2016, yet its RMS error is <b>${(e * 1000).toFixed(0)} million</b> against ${(endRms * 1000).toFixed(0)} million for the endpoint fit.</p><p>The endpoint fit trusts two points and ignores thirteen. Scoring every point is fairer. Notice, though, that no straight line follows the bend in the dots: growth was faster in the middle years. That's a reason for a new model, next chapter.</p>`);
      api.done("Beat the endpoint fit by hand");
    }
  }
  const sl = api.slider("Annual growth (billion people)", { min: 0.03, max: 0.11, step: 0.0005, value: gr, format: (v) => v.toFixed(4) }, (v) => { gr = v; cv.redraw(); report(); });
  api.button("Use the endpoints (naive)", () => {
    gr = ENDS; sl.set(ENDS); cv.redraw(); report();
    api.explain("The endpoint fit", `<p>Growth = (7.333 − 2.558) / 66 = ${ENDS.toFixed(4)} billion a year, so the line passes exactly through 1950 and 2016. Look at the grey bars in between: all on one side. Can you find a growth rate with a lower score?</p>`);
  });
  report();
  api.explain("How to read this", "<p>Dots are the census, the line is the model, and each grey bar is one year's error. The score squares the bars, averages them and takes the square root.</p><p>Slide the growth rate to make the score as small as you can.</p>");
});
