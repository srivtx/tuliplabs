/* ModSim, chapter 19: a low-pass filter.
   An RC circuit with R·C = 1 second: dV_out/dt = (V_in − V_out) / (R·C). Feed it a 5 V sine
   wave of frequency f. Slow waves pass; fast ones come out small. "Measure" adds a point: the
   output's size as a share of the input's, once it has settled.
   Find the frequency where the output is 71% (1/√2) of the input: the cutoff f_c = 1/(2π·R·C).
   The "why": the same equation as the cooling coffee, with a moving room temperature, and the
   cutoff falls out of the parameters. */
VIZ.register("ms-filter", async (api) => {
  await VIZ.lib("ms-plot");
  const P = window.MSPLOT, RC = 1, FC = 1 / (2 * Math.PI * RC);
  let f = 1, pts = [], theory = false, reached = api.wasDone;
  function sim(freq) {
    const per = 1 / freq, dt = Math.min(per / 200, RC / 50), T = Math.max(8 * per, 6 * RC + 2 * per);
    let v = 0; const out = [];
    for (let t = 0; t <= T; t += dt) { out.push([t, 5 * Math.sin(2 * Math.PI * freq * t), v]); v += ((5 * Math.sin(2 * Math.PI * freq * t) - v) / RC) * dt; }
    const tail = out.filter((q) => q[0] > T - 2 * per), amp = Math.max(...tail.map((q) => Math.abs(q[2])));
    return { out, T, per, ratio: amp / 5 };
  }
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const S = sim(f), { scene, plot } = P.split(w, h, 0.5, 30);
    const win = S.out.filter((q) => q[0] >= S.T - 3 * S.per), t0 = win[0][0], step = Math.max(1, Math.floor(win.length / 400));
    const thin = win.filter((_, i) => i % step === 0);
    P.title(g, api, `f = ${f.toFixed(3)} Hz · output is ${(S.ratio * 100).toFixed(0)}% of the input`);
    P.plot(g, api, { ...scene, x0: scene.x0 + 40, y0: scene.y0 + 18, y1: scene.y1 - 26 }, {
      xlim: [0, 3 * S.per], ylim: [-5.5, 5.5], xlabel: "time (s), last three cycles", ylabel: "voltage (V)", legend: "right",
      xfmt: (t) => P.fmt(t),
      series: [{ pts: thin.map((q) => [q[0] - t0, q[1]]), col: "c2", label: "V_in" }, { pts: thin.map((q) => [q[0] - t0, q[2]]), col: "c1", width: 2.5, label: "V_out" }],
    });
    const lx = (v) => Math.log10(v), curve = []; for (let e = -2; e <= 1.0001; e += 0.05) curve.push([e, 1 / Math.sqrt(1 + (10 ** e / FC) ** 2)]);
    P.plot(g, api, plot, {
      xlim: [-2, 1], ylim: [0, 1.05], xlabel: "frequency f (Hz, log scale)", ylabel: "output ÷ input", xfmt: (e) => P.fmt(10 ** e),
      hlines: [{ v: Math.SQRT1_2, col: "c4", label: "71% (1/√2)" }], vlines: [{ v: lx(f), col: "c5" }, ...(theory ? [{ v: lx(FC), col: "c3", label: "f_c = 1/(2πRC)" }] : [])],
      series: [...(theory ? [{ pts: curve, col: "c3", width: 1.5, dash: [5, 4] }] : []), { pts: pts.map(([a, b]) => [lx(a), b]).sort((a, b) => a[0] - b[0]), col: "c1", line: true, dots: true, r: 3.5 }],
    });
  });
  function report(extra = "") {
    api.status(`input: 5 V sine at ${f.toFixed(3)} Hz; R·C = ${RC} s\noutput amplitude ${(sim(f).ratio * 5).toFixed(2)} V (${(sim(f).ratio * 100).toFixed(1)}%)${extra}`);
  }
  function measure() {
    const S = sim(f); pts = pts.filter(([a]) => Math.abs(Math.log10(a / f)) > 0.01); pts.push([f, S.ratio]); cv.redraw(); report();
    if (!reached && pts.length >= 4 && Math.abs(S.ratio - Math.SQRT1_2) < 0.025) {
      reached = true; theory = true; cv.redraw();
      api.explain("The cutoff", `<p>At <b>${f.toFixed(3)} Hz</b> the output is ${(S.ratio * 100).toFixed(0)}% of the input. The formula says f_c = 1/(2π·R·C) = <b>${FC.toFixed(3)} Hz</b>, and the dashed curve is the exact answer.</p><p>Below the cutoff the capacitor keeps up with the input; above it, the input turns round before the output can follow, so fast wiggles are smoothed away. That's what a low-pass filter is for.</p>`);
      api.done("Found the filter's cutoff by measuring");
    }
  }
  api.slider("Input frequency f", { min: -2, max: 1, step: 0.01, value: 0, format: (e) => (10 ** e).toFixed(3) + " Hz" }, (e) => { f = 10 ** e; cv.redraw(); report(); });
  api.button("Measure", measure, { primary: true });
  api.button("Show the formula", () => { theory = true; cv.redraw(); });
  report();
  api.explain("How to read this", "<p>Left: the input sine (blue) and the filter's output (orange) once it has settled. Right: every frequency you've measured.</p><p>Measure a few slow and fast frequencies, then home in on where the output is 71% of the input.</p>");
});
