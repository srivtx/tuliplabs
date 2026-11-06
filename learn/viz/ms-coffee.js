/* ModSim, chapter 15: fit Newton's law of cooling by hand.
   A cup at 90 °C in a 22 °C room cools by r·(T − 22) degrees a minute. The measurement says it
   is 70 °C after 30 minutes. Slide r until the model passes through that point.
   The naive comparison takes steps of half a minute but forgets to multiply the rate by dt, so
   it cools twice as fast for the same r. Fitting r to that model gives a wrong r.
   The "why": a parameter only means something together with the model, and a step-size bug
   quietly changes what the fitted number means. */
VIZ.register("ms-coffee", async (api) => {
  await VIZ.lib("ms-plot");
  const P = window.MSPLOT;
  let r = 0.005, forgetDt = false, reached = api.wasDone;
  function run(rr, bug = forgetDt) {
    const dt = 0.5, out = [[0, 90]]; let T = 90;
    for (let t = 0; t < 60 - 1e-9; t += dt) { T -= rr * (T - 22) * (bug ? 1 : dt); out.push([t + dt, T]); }
    return out;
  }
  const at30 = (R) => R.find((q) => Math.abs(q[0] - 30) < 1e-9)[1];
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const R = run(r), T30 = at30(R), { scene, plot } = P.split(w, h, 0.22);
    // a cup with a thermometer level
    const cx = (scene.x0 + scene.x1) / 2, cw = Math.min(70, (scene.x1 - scene.x0) * 0.6), top = scene.y0 + 40, bot = scene.y1 - 30;
    g.strokeStyle = api.color("ink"); g.lineWidth = 2; g.strokeRect(cx - cw / 2, top, cw, bot - top);
    const lvl = (T30 - 22) / (90 - 22);
    g.fillStyle = api.color(T30 > 70.5 ? "c1" : T30 < 69.5 ? "c2" : "ok"); g.fillRect(cx - cw / 2 + 3, bot - 3 - lvl * (bot - top - 6), cw - 6, lvl * (bot - top - 6));
    g.fillStyle = api.color("ink"); g.font = "600 15px 'IBM Plex Mono', monospace"; g.textAlign = "center";
    g.fillText(`${T30.toFixed(1)} °C`, cx, bot + 20);
    g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif"; g.fillText("after 30 min", cx, top - 8);
    P.title(g, api, `r = ${r.toFixed(4)} per minute · model at 30 min: ${T30.toFixed(1)} °C (measured 70)`);
    P.plot(g, api, plot, {
      xlim: [0, 60], ylim: [20, 92], xlabel: "minutes", ylabel: "coffee temperature (°C)",
      hlines: [{ v: 22, col: "muted", label: "room, 22 °C" }],
      series: [{ pts: R, col: "c1", label: forgetDt ? "model (forgot dt)" : "model" }, { pts: [[30, 70]], col: "c4", dots: true, r: 6, label: "measured: 70 °C at 30 min" }],
    });
  });
  function report() {
    const T30 = at30(run(r));
    api.status(`r = ${r.toFixed(4)} per minute${forgetDt ? "  ·  steps of 0.5 min, rate not multiplied by dt" : ""}\nmodel after 30 minutes: ${T30.toFixed(2)} °C\nmeasured: 70 °C, off by ${(T30 - 70).toFixed(2)}`);
    if (!reached && !forgetDt && Math.abs(T30 - 70) < 0.15) {
      reached = true;
      api.explain("Fitted", `<p>r ≈ <b>${r.toFixed(4)}</b> per minute puts the model on the measurement. Now the model predicts the cup at any time, not only at 30 minutes.</p><p>Try <b>Forget dt</b>: the same r cools far too fast, and fitting r to that model would give about half the true value. Chapter 16 finds r exactly with a root finder.</p>`);
      api.done("Fitted the cooling constant to a measurement");
    }
  }
  api.slider("Cooling constant r (per minute)", { min: 0.002, max: 0.03, step: 0.0001, value: r, format: (v) => v.toFixed(4) }, (v) => { r = v; cv.redraw(); report(); });
  api.seg([{ label: "Rate × dt", value: "ok" }, { label: "Forget dt (naive)", value: "bug" }], "ok", (v) => { forgetDt = v === "bug"; cv.redraw(); report(); });
  report();
  api.explain("How to read this", "<p>The cup shows the model's temperature after 30 minutes: orange if too hot, blue if too cold, green when it matches the measured 70 °C.</p><p>Slide r until the curve passes through the amber dot.</p>");
});
