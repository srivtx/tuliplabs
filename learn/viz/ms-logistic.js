/* ModSim, chapter 9: the logistic equation, solved two ways.
   The exact solution x(t) = K / (1 + A·e^(−rt)) is the smooth curve. The simulation takes steps
   of dt years: x += r·x·(1 − x/K)·dt. Small steps hug the curve. Big steps overshoot K, and past
   r·dt = 2 they bounce around it forever.
   The "why": the recurrence and the differential equation are the same model only when the steps
   are small; the closed form tells you what the loop should give. */
VIZ.register("ms-logistic", async (api) => {
  await VIZ.lib("ms-plot");
  const P = window.MSPLOT, K = 12, x0 = 2.5, T = 120;
  let r = 0.1, dt = 1, reached = api.wasDone, sawBig = false;
  const exact = (t) => K / (1 + ((K - x0) / x0) * Math.exp(-r * t));
  function simulate() {
    const out = [[0, x0]]; let x = x0;
    for (let t = 0; t < T - 1e-9; t += dt) { x += r * x * (1 - x / K) * dt; out.push([t + dt, x]); }
    return out;
  }
  const maxErr = (s) => Math.max(...s.map(([t, x]) => Math.abs(x - exact(t))));
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const s = simulate(), e = maxErr(s);
    P.title(g, api, `r·dt = ${(r * dt).toFixed(2)} · biggest gap from the exact curve ${(e / K * 100).toFixed(1)}% of K`);
    const ex = []; for (let t = 0; t <= T; t += 0.5) ex.push([t, exact(t)]);
    P.plot(g, api, { x0: 52, y0: 46, x1: w - 16, y1: h - 36 }, {
      xlim: [0, T], ylim: [0, Math.max(16, Math.min(30, ...s.map((q) => q[1]).filter(isFinite)) + 1)], xlabel: "time (years)", ylabel: "population (billions)",
      hlines: [{ v: K, col: "c4", label: "K, carrying capacity" }],
      series: [{ pts: ex, col: "c3", width: 3, label: "exact solution" }, { pts: s, col: "c1", line: true, dots: s.length < 140, r: 2.5, label: `simulation, steps of ${dt} years` }],
    });
  });
  function report() {
    const s = simulate(), e = maxErr(s) / K;
    if (r * dt >= 1.2) sawBig = true;
    api.status(`r = ${r}, K = ${K}, step dt = ${dt} years\nr·dt = ${(r * dt).toFixed(2)}${r * dt > 2 ? " (above 2: it never settles)" : r * dt > 1 ? " (above 1: it overshoots K)" : ""}\nbiggest gap from the exact solution: ${(e * 100).toFixed(2)}% of K`);
    if (!reached && sawBig && e < 0.01) {
      reached = true;
      api.explain("When the loop matches the math", `<p>With steps of <b>${dt} years</b> the simulation stays within 1% of the exact curve. With big steps it overshot K, because each step uses the growth rate from the start of the step, long after it should have slowed down.</p><p>That's what the closed form is for: a yardstick. The loop is the same model only when r·dt is small.</p>`);
      api.done("Matched the simulation to the exact solution");
    }
  }
  api.slider("Step size dt (years)", { min: 0.5, max: 25, step: 0.5, value: dt, format: (v) => v + " y" }, (v) => { dt = v; cv.redraw(); report(); });
  api.slider("Growth rate r", { min: 0.02, max: 0.2, step: 0.01, value: r, format: (v) => v.toFixed(2) }, (v) => { r = v; cv.redraw(); report(); });
  report();
  api.explain("How to read this", "<p>The thick green curve is the exact logistic solution. The orange line is a loop that takes steps of dt years.</p><p>Try big steps first (r·dt above 1, then above 2) and watch it misbehave. Then make the steps small enough to stay within 1%.</p>");
});
