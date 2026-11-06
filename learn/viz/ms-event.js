/* ModSim, chapter 20: stop the simulation when something happens.
   A penny falls 381 m with no air. The naive run goes for a fixed t_end and keeps falling
   through the pavement. With an event function, y, the solver stops the moment y reaches 0.
   The "why": "when does it land?" isn't a time you can choose in advance; it's what you're trying
   to find. An event lets the model tell you. */
VIZ.register("ms-event", async (api) => {
  await VIZ.lib("ms-plot");
  const P = window.MSPLOT, H = 381, g0 = 9.8;
  let tEnd = 12, useEvent = false, rows = [], running = false, reached = api.wasDone, triedNaive = false;
  function run() {
    const dt = 0.01, out = [[0, H, 0]]; let y = H, v = 0, t = 0;
    while (t < tEnd - 1e-9) {
      const ny = y + v * dt, nv = v - g0 * dt;
      if (useEvent && ny <= 0) { const f = y / (y - ny); out.push([t + f * dt, 0, v + f * (nv - v)]); return { out, landed: true }; }
      y = ny; v = nv; t += dt; out.push([t, y, v]);
    }
    return { out, landed: false };
  }
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const { scene, plot } = P.split(w, h, 0.22);
    const last = rows.length ? rows[rows.length - 1] : [0, H, 0];
    const top = scene.y0 + 16, ground = scene.y0 + (scene.y1 - scene.y0) * 0.72, Ypx = (y) => ground - (y / H) * (ground - top);
    g.fillStyle = api.color("c5"); g.fillRect(scene.x0 + 10, top, 30, ground - top);
    g.fillStyle = api.color("line"); g.fillRect(scene.x0, ground, scene.x1 - scene.x0, 3);
    g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif"; g.textAlign = "left"; g.fillText("pavement", scene.x0 + 46, ground + 14);
    g.fillStyle = api.color(last[1] < 0 ? "bad" : "c4"); g.beginPath(); g.ellipse(scene.x0 + 60, Math.min(Ypx(last[1]), scene.y1 - 6), 6, 3, 0, 0, 7); g.fill();
    P.title(g, api, `${useEvent ? "stop when y = 0" : `run to t_end = ${tEnd} s`} · t = ${last[0].toFixed(2)} s, y = ${last[1].toFixed(1)} m`);
    P.plot(g, api, plot, {
      xlim: [0, 15], ylim: [-400, 400], xlabel: "time (s)", ylabel: "height y (m)",
      hlines: [{ v: 0, col: "bad", dash: [], label: "the ground" }], band: { y: [-400, 0], col: "bad" },
      series: [{ pts: rows.map((q) => [q[0], q[1]]), col: "c1" }],
    });
  });
  async function drop() {
    if (running) return; running = true;
    const R = run(); rows = [];
    for (let i = 0; i < R.out.length && running; i += 15) { rows = R.out.slice(0, i + 1); cv.redraw(); await api.sleep(8); }
    rows = R.out; running = false; cv.redraw();
    const last = rows[rows.length - 1];
    if (!useEvent) triedNaive = true;
    api.status(`${useEvent ? "event: y crosses 0" : `fixed end time ${tEnd} s`}\nstopped at t = ${last[0].toFixed(3)} s, y = ${last[1].toFixed(1)} m, v = ${last[2].toFixed(1)} m/s${!useEvent && last[1] < 0 ? `\nthat's ${(-last[1]).toFixed(0)} m underground` : ""}`);
    if (!reached && useEvent && R.landed && triedNaive) {
      reached = true;
      api.explain("The model tells you when", `<p>The event stopped the run at <b>t = ${last[0].toFixed(2)} s</b>, at ${(-last[2]).toFixed(1)} m/s, exactly where the penny meets the pavement. The formula agrees: √(2·381/9.8) = ${Math.sqrt(2 * H / g0).toFixed(2)} s.</p><p>With a fixed t_end you had to guess, and a guess too long kept falling underground. An event function returns a number that crosses zero at the moment you care about.</p>`);
      api.done("Stopped the fall at the ground");
    }
  }
  api.seg([{ label: "Fixed t_end (naive)", value: "fixed" }, { label: "Stop when y = 0", value: "event" }], "fixed", (v) => { useEvent = v === "event"; rows = []; cv.redraw(); });
  api.slider("t_end (s)", { min: 4, max: 15, step: 0.5, value: tEnd, format: (v) => v + " s" }, (v) => { tEnd = v; rows = []; cv.redraw(); });
  api.button("Drop", drop, { primary: true });
  api.status("Drop with a fixed end time first.");
  api.explain("How to read this", "<p>A penny falls from 381 m with no air. Run to a fixed end time and see where it ends up, then switch on the event and drop again.</p>");
});
