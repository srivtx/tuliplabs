/* ModSim, chapter 18: fit the glucose minimal model.
   Four sliders: G0 (glucose just after the injection), k1 (glucose returning on its own), k2
   (remote insulin decaying) and k3 (how strongly insulin acts). Red bars are the errors; the
   score is their RMS. Start from a patient whose insulin barely works and fit the data.
   The comparison: "Insulin does nothing" sets k3 = 0, so only k1 can bring glucose down. However
   you set k1, that model can't make the fast early fall and the slow tail at once.
   The "why": each parameter shapes a different part of the curve, and a model with the right
   mechanism can fit what a simpler one can't. */
VIZ.register("ms-glucose-fit", async (api) => {
  await VIZ.lib("ms-plot"); await VIZ.lib("ms-glukit");
  const P = window.MSPLOT, M = window.MSGLU;
  const p = { G0: 250, k1: 0.01, k2: 0.04, k3: 4e-6 };
  let noIns = false, reached = api.wasDone;
  const runNow = () => M.run({ ...p, k3: noIns ? 0 : p.k3, dt: 0.5 });
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const R = runNow(), top = { x0: 52, y0: 46, x1: w - 16, y1: h * 0.66 }, bot = { x0: 52, y0: h * 0.66 + 34, x1: w - 16, y1: h - 30 };
    P.title(g, api, `RMS error ${M.rms(R).toFixed(1)} mg/dL${noIns ? " · insulin switched off" : ""}`);
    const bars = M.T.slice(1).map((t, i) => ({ pts: [[t, M.GLU[i + 1]], [t, M.at(R, t)]], col: "bad", width: 1.5, alpha: 0.8 }));
    P.plot(g, api, top, {
      xlim: [0, 182], ylim: [70, 320], ylabel: "glucose (mg/dL)", legend: "right",
      hlines: [{ v: M.Gb, col: "muted", label: "fasting level" }],
      series: [...bars, { pts: M.T.map((t, i) => [t, M.GLU[i]]), col: "c2", dots: true, r: 3.5, label: "measured" }, { pts: R.map((q) => [q[0], q[1]]), col: "c1", label: "model" }],
    });
    P.plot(g, api, bot, {
      xlim: [0, 182], ylim: [0, Math.max(0.01, ...R.map((q) => q[2])) * 1.15], xlabel: "time (min)", ylabel: "remote insulin X (per min)",
      series: [{ pts: R.map((q) => [q[0], q[2]]), col: "c3" }],
    });
  });
  function report() {
    const e = M.rms(runNow());
    api.status(`G0 ${p.G0}, k1 ${p.k1.toFixed(3)}, k2 ${p.k2.toFixed(3)}, k3 ${(noIns ? 0 : p.k3).toExponential(1)}\nRMS error ${e.toFixed(2)} mg/dL  (the best fit is about 2.9)`);
    if (!reached && !noIns && e < 4) {
      reached = true;
      api.explain("A good fit", `<p>RMS error <b>${e.toFixed(1)} mg/dL</b>, close to the measurement noise. G0 sets where the curve starts, k3 how hard insulin pushes it down early on, k2 how long that push lasts, and k1 the slow return to the fasting level.</p><p>Now try <b>Insulin does nothing</b>: the best it can manage is about 5.9 mg/dL, twice the full model's error, because one rate can't give both the steep start and the gentle tail. That gap is the evidence that insulin's effect is in the data.</p>`);
      api.done("Fitted the glucose model by hand");
    }
  }
  const S = (label, key, o) => api.slider(label, o, (v) => { p[key] = v; cv.redraw(); report(); });
  S("G0, glucose after injection (mg/dL)", "G0", { min: 200, max: 340, step: 1, value: p.G0, format: (v) => v });
  S("k1, glucose returns on its own", "k1", { min: 0, max: 0.06, step: 0.001, value: p.k1, format: (v) => v.toFixed(3) });
  S("k2, remote insulin decays", "k2", { min: 0.005, max: 0.08, step: 0.001, value: p.k2, format: (v) => v.toFixed(3) });
  S("k3, insulin's strength (×10⁻⁶)", "k3", { min: 0, max: 4e-5, step: 5e-7, value: p.k3, format: (v) => (v * 1e6).toFixed(1) });
  api.seg([{ label: "Full model", value: "full" }, { label: "Insulin does nothing (naive)", value: "none" }], "full", (v) => { noIns = v === "none"; cv.redraw(); report(); });
  report();
  api.explain("How to read this", "<p>Dots are the measured glucose; the orange line is the model; red bars are the gaps. Below: X, the insulin acting in the tissues.</p><p>Get the RMS error under 4 mg/dL. Start with G0 for the first points, then k3 and k2 for the fall, then k1 for the tail.</p>");
});
