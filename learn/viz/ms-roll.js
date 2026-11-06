/* ModSim, chapter 24: the toilet paper problem.
   A roll (core 2 cm, full 5.5 cm, 47 m of paper) turns at a constant ω. Paper comes off at the
   rim speed r·ω, and every radian takes a layer of thickness k off the radius:
   dθ/dt = ω, dy/dt = r·ω, dr/dt = −k·ω, with k = (R_max² − R_min²) / (2L).
   The naive model keeps the radius at 5.5 cm and empties the roll far too soon, with a fat roll
   still left. The "why": rotation and linear motion are tied by v = r·ω, and when r changes the
   paper's speed changes with it. */
VIZ.register("ms-roll", async (api) => {
  await VIZ.lib("ms-plot");
  const P = window.MSPLOT, RMIN = 0.02, RMAX = 0.055, L = 47, K = (RMAX ** 2 - RMIN ** 2) / (2 * L);
  let omega = 10, shrink = true, run = null, gen = 0, reached = api.wasDone;
  const ghosts = {}, seen = {};
  function simulate(w, sh) {
    const out = [], dt = 0.25; let t = 0, y = 0, r = RMAX, th = 0;
    out.push([t, y, r, th]);
    while (y < L && t < 400) {
      const ny = y + (sh ? r - (K * w * dt) / 2 : r) * w * dt;
      if (ny >= L) { const f = (L - y) / (ny - y); t += f * dt; th += w * f * dt; r -= sh ? K * w * f * dt : 0; y = L; out.push([t, y, r, th]); break; }
      y = ny; th += w * dt; if (sh) r -= K * w * dt; t += dt; out.push([t, y, r, th]);
    }
    return out;
  }
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const { scene, plot } = P.split(w, h, 0.3, 34);
    const now = run ? run.rows[run.i] : [0, 0, RMAX, 0], r = now[2];
    P.title(g, api, `ω = ${omega} rad/s · ${shrink ? "radius shrinks" : "radius fixed"} · t = ${now[0].toFixed(1)} s`);
    // the roll, seen end on: paper annulus, the core, and a mark that turns with θ
    const cx = (scene.x0 + scene.x1) / 2 - 10, cy = scene.y0 + (scene.y1 - scene.y0) * 0.42, S = Math.min(scene.x1 - scene.x0 - 40, scene.y1 - scene.y0 - 80) / (2 * RMAX);
    g.fillStyle = api.color("card"); g.strokeStyle = api.color("line"); g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, RMAX * S, 0, 7); g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]);
    g.fillStyle = api.color("c4"); g.globalAlpha = 0.75; g.beginPath(); g.arc(cx, cy, r * S, 0, 7); g.fill(); g.globalAlpha = 1;
    g.fillStyle = api.color("muted"); g.beginPath(); g.arc(cx, cy, RMIN * S, 0, 7); g.fill();
    g.fillStyle = api.color("card"); g.beginPath(); g.arc(cx, cy, RMIN * S * 0.8, 0, 7); g.fill();
    g.strokeStyle = api.color("ink"); g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + r * S * Math.cos(now[3] / 40), cy + r * S * Math.sin(now[3] / 40)); g.stroke();
    // the sheet coming off the right of the roll
    g.fillStyle = api.color("c4"); g.globalAlpha = 0.5; g.fillRect(cx + r * S - 2, cy, 4, scene.y1 - cy - 30); g.globalAlpha = 1;
    g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif"; g.textAlign = "center";
    g.fillText(`radius ${(r * 100).toFixed(2)} cm`, cx, scene.y1 - 34);
    g.fillText(`paper speed ${(r * omega).toFixed(2)} m/s`, cx, scene.y1 - 18);
    const top = { x0: plot.x0, y0: plot.y0, x1: plot.x1, y1: plot.y0 + (plot.y1 - plot.y0) * 0.55 }, bot = { x0: plot.x0, y0: top.y1 + 30, x1: plot.x1, y1: plot.y1 };
    const tmax = Math.max(60, ...Object.values(ghosts).map((G) => G[G.length - 1][0]), run ? run.rows[run.rows.length - 1][0] : 0) * 1.05;
    const gs = (col) => Object.entries(ghosts).filter(([key]) => !run || key !== run.key).map(([key, G]) => ({ pts: G.map((q) => [q[0], q[col]]), col: key.startsWith("s") ? "c1" : "c3", width: 1.2, dash: [5, 4], alpha: 0.7 }));
    const cur = (col, f = 1) => (run ? [{ pts: run.rows.slice(0, run.i + 1).map((q) => [q[0], q[col] * f]), col: run.key.startsWith("s") ? "c1" : "c3", width: 2.5 }] : []);
    P.plot(g, api, top, { xlim: [0, tmax], ylim: [0, 52], ylabel: "paper out y (m)", hlines: [{ v: L, col: "ink", label: "47 m: empty" }], series: [...gs(1), ...cur(1)] });
    P.plot(g, api, bot, { xlim: [0, tmax], ylim: [0, 6], xlabel: "time (s)", ylabel: "radius r (cm)", hlines: [{ v: RMIN * 100, col: "muted", label: "the core" }], series: [...gs(2).map((s) => ({ ...s, pts: s.pts.map(([a, b]) => [a, b * 100]) })), ...cur(2, 100)] });
  });
  async function unroll() {
    const my = ++gen, key = (shrink ? "s" : "f") + omega, rows = simulate(omega, shrink);
    check(); run = { rows, i: 0, key }; ghosts[key] = rows; seen[key] = rows[rows.length - 1];
    for (let i = 0, st = Math.ceil(rows.length / 60); i < rows.length && gen === my; i += st) { run.i = i; cv.redraw(); await api.sleep(12); }
    if (gen !== my) return;
    run.i = rows.length - 1; cv.redraw();
    const E = rows[rows.length - 1];
    api.status(`${shrink ? "radius shrinks by k·ω" : "radius held at 5.5 cm"}, ω = ${omega} rad/s\nempty after ${E[0].toFixed(1)} s and ${(E[3] / (2 * Math.PI)).toFixed(0)} turns\nradius left: ${(E[2] * 100).toFixed(2)} cm`);
    check();
  }
  function check() {
    const a = seen["s" + omega], b = seen["f" + omega];
    if (!reached && a && b) {
      reached = true;
      api.explain("Each turn gives less paper", `<p>At ω = ${omega} rad/s the shrinking roll empties after <b>${a[0].toFixed(1)} s</b> and ${(a[3] / (2 * Math.PI)).toFixed(0)} turns, ending at ${(a[2] * 100).toFixed(1)} cm, the core. Holding the radius at 5.5 cm says ${b[0].toFixed(1)} s, and leaves the model claiming the roll is still full size.</p><p>The paper speed is r·ω: it starts at ${(RMAX * omega).toFixed(2)} m/s and falls to ${(RMIN * omega).toFixed(2)} m/s as the roll thins. Landing on exactly 2 cm when y reaches 47 m is the check that k and the dynamics agree.</p>`);
      api.done("Unrolled the roll both ways");
    }
  }
  api.seg([{ label: "Radius shrinks", value: "s" }, { label: "Radius fixed (naive)", value: "f" }], "s", (v) => { shrink = v === "s"; gen++; run = null; cv.redraw(); });
  api.slider("Turning speed ω", { min: 4, max: 20, step: 1, value: omega, format: (v) => v + " rad/s" }, (v) => { omega = v; gen++; run = null; cv.redraw(); });
  api.button("Unroll", unroll, { primary: true });
  api.status(`k = (R_max² − R_min²) / 2L = ${K.toExponential(2)} m per radian\nUnroll with the radius shrinking, then with it fixed.`);
  api.explain("How to read this", "<p>Left: the roll from the end, with its current radius and paper speed. Right: paper unrolled and radius over time; earlier runs stay as dashed ghosts.</p><p>Unroll it with the radius shrinking and with the radius held fixed, at the same ω, and compare when each runs out.</p>");
});
