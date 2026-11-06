/* ModSim, chapter 25: estimate friction from an observation.
   A turntable (disk 7 kg, radius 0.5 m) with a teapot (0.3 kg at 0.4 m): I = ½·7·0.5² + 0.3·0.4²
   = 0.923 kg·m². Push the edge with 2 N for 0.5 s, then friction τ_f slows it to a stop.
   The real one turned 1.0 rad. Pick τ_f, push, and each try lands as a point on "angle turned vs
   τ_f": the curve a root finder walks along to hit 1.0.
   The naive model forgets that friction stops at rest: it keeps pushing and the table spins
   backwards. The "why": you can't measure friction directly, but you can measure what it does,
   and a model turns that observation back into the parameter. */
VIZ.register("ms-teapot", async (api) => {
  await VIZ.lib("ms-plot");
  const P = window.MSPLOT, I = 0.5 * 7 * 0.5 ** 2 + 0.3 * 0.4 ** 2, F = 2, RAD = 0.5, TP = 0.5;
  let tau = 0.25, naive = false, run = null, gen = 0, reached = api.wasDone;
  const tries = [];
  function simulate(tf, nv) {
    const dt = 0.01, out = [[0, 0, 0]]; let t = 0, th = 0, w = 0;
    while (t < 8) {
      let T = t < TP ? F * RAD : 0;
      if (nv || w > 0 || t < TP) T -= tf;
      w += (T / I) * dt; th += w * dt; t += dt;
      if (!nv && t > TP && w <= 0) { w = 0; out.push([t, th, 0]); break; }
      out.push([t, th, w]);
    }
    return out;
  }
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const { scene, plot } = P.split(w, h, 0.34, 34), now = run ? run.rows[run.i] : [0, 0, 0];
    P.title(g, api, `τ_f = ${tau.toFixed(3)} N·m${naive ? " · friction never lets go" : ""} · θ = ${now[1].toFixed(2)} rad`);
    // the turntable from above; the teapot rides at 0.4 m and the observed stop is marked at 1 rad
    const cx = (scene.x0 + scene.x1) / 2, cy = scene.y0 + (scene.y1 - scene.y0) / 2, R = Math.min(scene.x1 - scene.x0, scene.y1 - scene.y0) / 2 - 22;
    g.fillStyle = api.color("card"); g.strokeStyle = api.color("line"); g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill(); g.stroke();
    const at = (a, r) => [cx + r * Math.cos(-a), cy + r * Math.sin(-a)];
    g.strokeStyle = api.color("ok"); g.setLineDash([4, 4]); g.beginPath(); g.moveTo(cx, cy); g.lineTo(...at(1, R + 14)); g.stroke(); g.setLineDash([]);
    g.fillStyle = api.color("ok"); g.font = "11px 'IBM Plex Sans', sans-serif"; g.textAlign = "left"; g.fillText("seen: 1.0 rad", ...at(1, R + 4).map((v, i) => v + (i ? -8 : 6)));
    g.strokeStyle = api.color("muted"); g.beginPath(); g.moveTo(cx, cy); g.lineTo(...at(0, R)); g.stroke();
    g.strokeStyle = api.color("c2"); g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(...at(now[1], R)); g.stroke();
    const [px, py] = at(now[1], R * 0.8); g.fillStyle = api.color("c1"); g.beginPath(); g.arc(px, py, 9, 0, 7); g.fill();
    if (run && now[0] < TP) { const [ex, ey] = at(now[1] - 0.25, R); g.fillStyle = api.color("c4"); g.fillText("push", ex - 30, ey + 16); }
    const top = { ...plot, y1: plot.y0 + (plot.y1 - plot.y0) * 0.38 }, bot = { ...plot, y0: top.y1 + 52 };
    P.plot(g, api, top, {
      xlim: [0, 8], xlabel: "time (s)", ylim: [Math.min(-0.2, ...(run ? run.rows.map((q) => q[2]) : [0])) * 1.1, 0.6], ylabel: "ω (rad/s)", hlines: [{ v: 0, col: "muted", dash: [] }], vlines: [{ v: TP, col: "c4", dash: [3, 3] }],
      series: run ? [{ pts: run.rows.slice(0, run.i + 1).map((q) => [q[0], q[2]]), col: naive ? "bad" : "c2" }] : [],
    });
    P.plot(g, api, bot, {
      xlim: [0.05, 0.4], ylim: [0, 2], xlabel: "friction torque τ_f (N·m)", ylabel: "angle turned before stopping (rad)",
      hlines: [{ v: 1, col: "ok", label: "observed 1.0 rad" }], vlines: [{ v: tau, col: "c5" }],
      series: [{ pts: tries.slice().sort((a, b) => a[0] - b[0]), col: "c1", dots: true, line: true, width: 1.2, r: 3.5 }],
    });
  });
  async function push() {
    const my = ++gen, tf = tau, nv = naive, rows = simulate(tf, nv), E = rows[rows.length - 1];
    run = { rows, i: 0 };
    if (!nv) { const j = tries.findIndex((p) => Math.abs(p[0] - tf) < 1e-9); if (j >= 0) tries.splice(j, 1); tries.push([tf, E[1]]); }
    for (let i = 0, st = Math.ceil(rows.length / 60); i < rows.length && gen === my; i += st) { run.i = i; cv.redraw(); await api.sleep(12); }
    if (gen !== my) return;
    run.i = rows.length - 1; cv.redraw();
    api.status(nv ? `friction always on, ran to 8 s\nω went negative at ${rows.find((q) => q[0] > TP && q[2] < 0)?.[0].toFixed(2) ?? "–"} s; θ ended at ${E[1].toFixed(2)} rad and falling` : `τ_f = ${tf.toFixed(3)} N·m, I = ${I.toFixed(3)} kg·m²\nstopped after ${E[0].toFixed(2)} s, turned ${E[1].toFixed(3)} rad (seen: 1.0)`);
    if (!reached && !nv && Math.abs(E[1] - 1) < 0.01 && tries.length >= 3) {
      reached = true;
      api.explain("Friction, measured indirectly", `<p>τ_f = <b>${tf.toFixed(3)} N·m</b> turns the table ${E[1].toFixed(3)} rad, matching what was seen. The exact answer is 0.119 N·m: by hand, the total angle is 0.125·(1 − τ_f) / (I·τ_f), and setting that to 1 gives τ_f = 0.125 / (I + 0.125).</p><p>The dots are the root finder's view: angle turned falls steadily as friction grows, so there's one crossing of 1.0, and <code>root_bisect</code> halves the bracket round it until it's tight.</p><p>Try <b>Friction never lets go</b> to see why the model checks ω > 0: without it, friction keeps pushing after the table stops and spins it backwards.</p>`);
      api.done("Estimated the friction torque from one observation");
    }
  }
  api.seg([{ label: "Friction stops at rest", value: "ok" }, { label: "Friction never lets go (naive)", value: "naive" }], "ok", (v) => { naive = v === "naive"; gen++; run = null; cv.redraw(); });
  api.slider("Friction torque τ_f", { min: 0.05, max: 0.4, step: 0.001, value: tau, format: (v) => v.toFixed(3) + " N·m" }, (v) => { tau = v; cv.redraw(); });
  api.button("Push", push, { primary: true });
  api.status(`I = ½·7·0.5² + 0.3·0.4² = ${I.toFixed(3)} kg·m²\nPush with 2 N for 0.5 s and see how far it turns.`);
  api.explain("How to read this", "<p>Left: the turntable from above, with the teapot. The green line is where the real one stopped. Right: the spin rate during this push, and every friction torque you've tried against the angle it turned.</p><p>Find the friction torque that makes it turn exactly 1.0 rad.</p>");
});
