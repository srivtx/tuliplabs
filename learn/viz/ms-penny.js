/* ModSim, chapter 1: the falling penny.
   Drop a penny from a tower. "No air" is the first model: constant acceleration g. "With air"
   adds drag that grows with speed squared, tuned so the top speed is the measured 18 m/s.
   Right: speed against time for every drop, with the measured speed as a dashed line.
   The "why": validation. The first model's answer is precise and wrong; you only find out by
   comparing it with what really happens. */
VIZ.register("ms-penny", async (api) => {
  await VIZ.lib("ms-plot");
  const P = window.MSPLOT, g0 = 9.8, VT = 18, k = g0 / (VT * VT);
  let h = 381, air = false, y = 0, v = 0, t = 0, trace = [], runs = [], falling = false, reached = api.wasDone;
  const tried = new Set();
  api.wide();
  const cv = api.canvas2d((g, w, hh) => {
    const { scene: s, plot: b } = P.split(w, hh, 0.3);
    // the tower and the penny
    const top = s.y0 + 14, ground = s.y1 - 14, H = ground - top, tx = s.x0 + 18, tw = Math.min(46, (s.x1 - s.x0) * 0.3);
    const th = (h / 400) * H;
    g.fillStyle = api.color("c5"); g.fillRect(tx, ground - th, tw, th);
    g.fillStyle = api.color("line"); g.fillRect(s.x0, ground, s.x1 - s.x0, 2);
    const py = ground - th + (y / h) * th, px = tx + tw + 22;
    g.fillStyle = api.color("c4"); g.beginPath(); g.ellipse(px, Math.min(py, ground - 3), 6, 3, 0, 0, 7); g.fill();
    g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif"; g.textAlign = "left";
    g.fillText(`${h} m`, tx, ground - th - 6);
    P.title(g, api, `${air ? "with air" : "no air"} · t = ${t.toFixed(1)} s · v = ${v.toFixed(1)} m/s`);
    const series = runs.map((r) => ({ pts: r.pts, col: r.air ? "c3" : "c1", alpha: 0.5 }));
    series.push({ pts: trace, col: air ? "c3" : "c1", width: 2.5 });
    P.plot(g, api, b, {
      xlim: [0, 25], ylim: [0, 100], xlabel: "time (s)", ylabel: "speed (m/s)",
      hlines: [{ v: VT, col: "ink", label: "measured: about 18 m/s" }], series,
    });
  });
  function report() {
    const last = runs[runs.length - 1];
    api.status(`model: ${air ? "gravity and air drag" : "gravity only"}\ntower ${h} m${last ? `\nlast drop: hit the ground after ${last.t.toFixed(1)} s at ${last.v.toFixed(1)} m/s (${(last.v * 3.6).toFixed(0)} km/h)` : ""}`);
  }
  async function drop() {
    if (falling) return; falling = true;
    y = 0; v = 0; t = 0; trace = [[0, 0]];
    const dt = 0.02;
    while (y < h) {
      for (let k2 = 0; k2 < 8 && y < h; k2++) {
        const a = g0 - (air ? k * v * v : 0);
        v += a * dt; y += v * dt; t += dt;
      }
      trace.push([t, v]); cv.redraw();
      await api.sleep(16);
    }
    runs.push({ pts: trace, air, t, v }); tried.add(air);
    falling = false; cv.redraw(); report();
    if (!reached && tried.size === 2 && h >= 300) {
      reached = true;
      const na = runs.filter((r) => !r.air).pop(), wa = runs.filter((r) => r.air).pop();
      api.explain("The model was wrong, and now you know why", `<p>Without air the penny hits at <b>${na.v.toFixed(0)} m/s</b>. With drag it levels off near <b>${wa.v.toFixed(0)} m/s</b>, matching what people measure.</p><p>The first model wasn't badly computed. It left out the thing that matters. Comparing with reality, <b>validation</b>, is what told you to go back and add it.</p>`);
      api.done("Validated the penny model against the real speed");
    }
  }
  api.slider("Tower height", { min: 20, max: 400, step: 1, value: h, format: (x) => x + " m" }, (x) => { if (!falling) { h = x; y = 0; v = 0; t = 0; trace = []; cv.redraw(); report(); } });
  api.seg([{ label: "No air (first model)", value: "no" }, { label: "With air", value: "air" }], "no", (x) => {
    if (falling) return; air = x === "air"; y = 0; v = 0; t = 0; trace = []; cv.redraw(); report();
    api.explain(air ? "With air" : "No air", air
      ? "<p>Now drag pushes up, growing with speed squared. When drag equals the penny's weight, it stops speeding up: that top speed is the <b>terminal velocity</b>.</p>"
      : "<p>The penny speeds up by 9.8 m/s every second until it lands. Nothing slows it down.</p>");
  });
  api.button("Drop", drop, { primary: true });
  api.button("Clear runs", () => { if (!falling) { runs = []; trace = []; cv.redraw(); report(); } });
  report();
  api.explain("How to read this", "<p>Drop the penny with the first model, then with air, from the top of a 381 m tower. The plot keeps every drop's speed so you can compare them with the measured 18 m/s.</p>");
});
