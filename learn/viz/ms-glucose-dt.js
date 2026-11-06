/* ModSim, chapter 17: small steps and interpolation.
   The glucose minimal model needs insulin at every moment, but insulin was only measured at a
   few times. Interpolation draws straight lines between the measurements; the naive choice holds
   each measurement until the next one. Then the model takes Euler steps of dt minutes.
   Shrink dt until the answer stops changing: that's when the step size no longer matters.
   The "why": a simulation is only an answer once it's independent of the choices you made to
   compute it. */
VIZ.register("ms-glucose-dt", async (api) => {
  await VIZ.lib("ms-plot"); await VIZ.lib("ms-glukit");
  const P = window.MSPLOT, M = window.MSGLU;
  let dt = 8, hold = false, reached = api.wasDone, triedBig = false;
  const ref = M.run({ dt: 0.05 });
  const gap = (rows) => Math.max(...M.T.map((t) => Math.abs(M.at(rows, t) - M.at(ref, t))));
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const R = M.run({ dt, hold }), top = { x0: 52, y0: 46, x1: w - 16, y1: h * 0.62 }, bot = { x0: 52, y0: h * 0.62 + 34, x1: w - 16, y1: h - 30 };
    P.title(g, api, `steps of ${dt} min · ${hold ? "insulin held" : "insulin interpolated"} · largest change from tiny steps: ${gap(R).toFixed(1)} mg/dL`);
    P.plot(g, api, top, {
      xlim: [0, 182], ylim: [70, 300], ylabel: "glucose (mg/dL)", legend: "right",
      series: [{ pts: ref.map((q) => [q[0], q[1]]), col: "c5", width: 1.5, dash: [4, 3], label: "steps of 0.05 min" }, { pts: R.map((q) => [q[0], q[1]]), col: "c1", line: true, dots: dt >= 2, r: 2.5, label: `steps of ${dt} min` }, { pts: M.T.map((t, i) => [t, M.GLU[i]]), col: "c2", dots: true, r: 3, label: "measured" }],
    });
    const ins = []; for (let t = 0; t <= 182; t += 0.5) ins.push([t, M.insulin(t, hold)]);
    P.plot(g, api, bot, {
      xlim: [0, 182], ylim: [0, 140], xlabel: "time (min)", ylabel: "insulin I(t) (µU/mL)",
      series: [{ pts: ins, col: "c3", label: hold ? "held until the next measurement" : "interpolated" }, { pts: M.T.map((t, i) => [t, M.INS[i]]), col: "c2", dots: true, r: 3 }],
    });
  });
  function report() {
    const R = M.run({ dt, hold }), e = gap(R);
    if (dt >= 4) triedBig = true;
    api.status(`dt = ${dt} minutes, ${Math.round(182 / dt)} steps\ninsulin ${hold ? "held at the last measurement" : "interpolated between measurements"}\nlargest difference from steps of 0.05 min: ${e.toFixed(2)} mg/dL`);
    if (!reached && triedBig && !hold && e < 1) {
      reached = true;
      api.explain("Small enough", `<p>With steps of <b>${dt} minutes</b> the curve is within ${e.toFixed(2)} mg/dL of one computed with steps 20 times smaller, so the step size no longer changes the answer.</p><p>With 8-minute steps it was off by about 10 mg/dL. Holding insulin instead of interpolating it shifts the curve by up to about 2 mg/dL here, and that gap doesn't shrink with smaller steps. Both choices belong to the computation, not to the body, so check them before trusting the model.</p>`);
      api.done("Made the answer independent of the step size");
    }
  }
  api.slider("Step size dt (minutes)", { min: 0.25, max: 8, step: 0.25, value: dt, format: (v) => v + " min" }, (v) => { dt = v; cv.redraw(); report(); });
  api.seg([{ label: "Interpolate insulin", value: "lin" }, { label: "Hold each measurement (naive)", value: "hold" }], "lin", (v) => { hold = v === "hold"; cv.redraw(); report(); });
  report();
  api.explain("How to read this", "<p>Top: glucose from the model against the measurements. The dashed line is the same model with tiny steps, as a reference. Bottom: the insulin the model is fed.</p><p>Start at big steps, then shrink dt until your curve sits on the dashed one.</p>");
});
