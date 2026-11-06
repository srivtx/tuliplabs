/* ModSim, chapter 14: the contact number and the final size.
   Each "Random outbreak" runs the plague model with random β and γ until it's over, and plots
   the fraction never infected s∞ against c = β/γ. Different β and γ with the same ratio land
   in the same place. Then show the analytic relation c = ln(s∞)/(s∞ − 1) and see the dots sit on
   it. Finally, use it backwards: say how many students got sick and read off c.
   The "why": analysis collapses two parameters into one number, and lets you estimate it from
   something you can count. */
VIZ.register("ms-contact", async (api) => {
  await VIZ.lib("ms-plot"); await VIZ.lib("ms-sirkit");
  const P = window.MSPLOT, M = window.MSSIR, rnd = P.rng(21);
  let pts = [], showCurve = false, sick = 26, reached = api.wasDone;
  const cOf = (s) => Math.log(s) / (s - 1);
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const curve = []; for (let s = 0.0005; s < 0.995; s += 0.005) curve.push([cOf(s), s]);
    const sObs = (90 - sick) / 90, cObs = cOf(sObs);
    P.title(g, api, `${pts.length} outbreaks${showCurve ? ` · ${sick} of 90 sick → c ≈ ${cObs.toFixed(2)}` : ""}`);
    P.plot(g, api, { x0: 52, y0: 46, x1: w - 16, y1: h - 36 }, {
      xlim: [0, 5], ylim: [0, 1], xlabel: "contact number c = β/γ", ylabel: "fraction never infected, s∞", legend: "right",
      hlines: showCurve ? [{ v: sObs, col: "c4", label: `${90 - sick} of 90 never sick` }] : [],
      vlines: showCurve ? [{ v: cObs, col: "c4" }] : [],
      series: [...(showCurve ? [{ pts: curve, col: "c3", width: 2.5, label: "c = ln(s∞)/(s∞ − 1)" }] : []), { pts: pts.map((p) => [p.c, p.s]), col: "c1", dots: true, r: 4, label: "simulated outbreaks" }],
    });
  });
  function add(n) {
    for (let k = 0; k < n; k++) {
      const beta = 0.1 + 0.9 * rnd(), gamma = 0.1 + 0.6 * rnd(), c = beta / gamma;
      if (c > 5) { k--; continue; }
      const R = M.run({ beta, gamma, days: 1500, s0: 0.9999, i0: 0.0001 });
      pts.push({ beta, gamma, c, s: R[R.length - 1][1] });
    }
    cv.redraw(); report();
  }
  function report() {
    const last = pts[pts.length - 1];
    api.status(`${pts.length} outbreaks run${last ? `\nlast: β = ${last.beta.toFixed(2)}, γ = ${last.gamma.toFixed(2)}, c = ${last.c.toFixed(2)} → ${(last.s * 100).toFixed(0)}% never sick` : ""}${showCurve ? `\nestimate: ${sick} of 90 sick gives s∞ = ${((90 - sick) / 90).toFixed(3)}, so c ≈ ${cOf((90 - sick) / 90).toFixed(2)}` : ""}`);
    if (!reached && pts.length >= 8 && showCurve) {
      reached = true;
      api.explain("Two parameters, one number", `<p>Every dot is a different β and γ, yet they all fall close to one curve (the small gaps come from stepping a day at a time). Only the ratio c = β/γ, the number of new infections each case causes, decides how big the outbreak gets.</p><p>Read it backwards and you can estimate c from a count: if ${sick} of 90 students got sick, c ≈ <b>${cOf((90 - sick) / 90).toFixed(2)}</b>. Below c = 1 the curve hits the top: the outbreak never starts.</p>`);
      api.done("Estimated the contact number from an outbreak");
    }
  }
  api.button("Random outbreak", () => add(1), { primary: true });
  api.button("Ten more", () => add(10));
  api.button("Show the equation", () => { showCurve = true; cv.redraw(); report(); });
  api.slider("Students who got sick (of 90)", { min: 1, max: 85, step: 1, value: sick, format: (v) => v }, (v) => { sick = v; cv.redraw(); report(); });
  report();
  api.explain("How to read this", "<p>Each dot is a whole outbreak with random β and γ, run until it's over. Across is the ratio β/γ, up is the share of people who never caught it.</p><p>Run at least eight, guess the shape, then show the equation. Use the slider to estimate c from a count of sick students.</p>");
});
