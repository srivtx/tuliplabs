/* ModSim, chapter 21: from terminal velocity to C_d.
   A penny (2.5 g, 19 mm across) falls from 381 m with drag F = ½·ρ·v²·C_d·A. Choose C_d and
   drop it. Two bars show the forces at each moment: weight (fixed) and drag (growing with v²).
   When they match, the penny stops speeding up.
   Measurements say pennies top out near 18 m/s. Find the C_d that reproduces that.
   The "why": C_d can't be derived; you measure something you can see (the top speed) and solve
   for the number you can't. */
VIZ.register("ms-drag", async (api) => {
  await VIZ.lib("ms-plot");
  const P = window.MSPLOT, m = 2.5e-3, A = Math.PI * 0.0095 ** 2, rho = 1.2, g0 = 9.8, H = 381;
  let Cd = 1.0, rows = [], running = false, reached = api.wasDone;
  const vt = () => Math.sqrt((2 * m * g0) / (rho * Cd * A));
  function run() {
    const dt = 0.01, out = [[0, H, 0]]; let y = H, v = 0, t = 0;
    while (y > 0 && t < 60) { const drag = 0.5 * rho * v * v * Cd * A; v += (-g0 + drag / m) * dt; y += v * dt; t += dt; out.push([t, y, v]); }
    return out;
  }
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const { scene, plot } = P.split(w, h, 0.26);
    const last = rows.length ? rows[rows.length - 1] : [0, H, 0], v = Math.abs(last[2]);
    const W = m * g0, D = 0.5 * rho * v * v * Cd * A, maxF = W * 1.4, bh = scene.y1 - scene.y0 - 70, base = scene.y1 - 30;
    const bar = (x, f, col, label) => { const hh = Math.min(1, f / maxF) * bh; g.fillStyle = api.color(col); g.fillRect(x, base - hh, 30, hh); g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif"; g.textAlign = "center"; g.fillText(label, x + 15, base + 14); g.fillText((f * 1000).toFixed(1) + " mN", x + 15, base - hh - 6); };
    const bx = (scene.x0 + scene.x1) / 2;
    bar(bx - 40, W, "c5", "weight"); bar(bx + 10, D, "c1", "drag");
    P.title(g, api, `C_d = ${Cd.toFixed(2)} · terminal velocity ${vt().toFixed(1)} m/s · now ${v.toFixed(1)} m/s`);
    P.plot(g, api, plot, {
      xlim: [0, 30], ylim: [0, 40], xlabel: "time (s)", ylabel: "speed (m/s)",
      hlines: [{ v: 18, col: "ink", label: "measured: about 18 m/s" }],
      series: [{ pts: rows.map((q) => [q[0], -q[2]]), col: "c1" }],
    });
  });
  async function drop() {
    if (running) return; running = true;
    const R = run();
    for (let i = 0, k = Math.ceil(R.length / 120); i < R.length && running; i += k) { rows = R.slice(0, i + 1); cv.redraw(); await api.sleep(10); }
    rows = R; running = false; cv.redraw();
    const v = -R[R.length - 1][2];
    api.status(`C_d = ${Cd.toFixed(2)}, area ${(A * 1e4).toFixed(2)} cm², mass 2.5 g\nlanded after ${R[R.length - 1][0].toFixed(1)} s at ${v.toFixed(1)} m/s\nterminal velocity √(2mg / ρ·C_d·A) = ${vt().toFixed(1)} m/s`);
    if (!reached && Math.abs(v - 18) < 0.3) {
      reached = true;
      api.explain("A measured coefficient", `<p>C_d ≈ <b>${Cd.toFixed(2)}</b> makes the penny land at ${v.toFixed(1)} m/s. Setting drag equal to weight gives the same answer directly: C_d = 2mg / (ρ·A·v²) ≈ 0.44.</p><p>The bars show why it levels off: drag grows with the square of speed until it matches the penny's weight, and from then on the forces cancel.</p>`);
      api.done("Found the penny's drag coefficient");
    }
  }
  api.slider("Drag coefficient C_d", { min: 0.1, max: 1.5, step: 0.01, value: Cd, format: (v) => v.toFixed(2) }, (v) => { Cd = v; if (!running) { rows = []; cv.redraw(); } });
  api.button("Drop", drop, { primary: true });
  api.status("Pick a C_d and drop the penny.");
  api.explain("How to read this", "<p>Left: the two forces on the penny right now. Right: its speed as it falls.</p><p>Change C_d and drop again until it lands at the measured 18 m/s.</p>");
});
