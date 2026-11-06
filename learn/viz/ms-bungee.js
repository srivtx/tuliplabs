/* ModSim, chapter 26: design the cord for a bungee dunk.
   A 75 kg jumper leaves a crane 80 m up on a 25 m cord. Gravity pulls down; drag comes from a
   terminal velocity of 60 m/s; once the jumper has fallen more than 25 m the cord pulls up with
   k·(stretch). Choose k and jump: the goal is a lowest point of exactly 0 m, a dip in the tea.
   Each jump adds a point to "lowest point vs k", which a root finder searches.
   The naive model leaves out drag (the energy formula) and says k ≈ 38.9 N/m; with drag that
   cord stops the jumper 4.4 m short of the cup. The "why": every force you leave out moves the
   answer, and the design is only as good as the model. */
VIZ.register("ms-bungee", async (api) => {
  await VIZ.lib("ms-plot");
  const P = window.MSPLOT, M = 75, G = 9.8, H = 80, L = 25, C = G / 60 ** 2;
  let k = 60, drag = true, run = null, gen = 0, reached = api.wasDone;
  const tries = { d: [], n: [] };
  function jump(kk, d) {
    const dt = 0.005, out = [[0, H, 0]]; let y = H, v = 0, t = 0, low = H, lowT = 0, turned = false;
    while (t < 12) {
      const fall = H - y, s = fall > L ? kk * (fall - L) : 0, a = -G - (d ? C * v * Math.abs(v) : 0) + s / M;
      v += a * dt; y += v * dt; t += dt; out.push([t, y, v]);
      if (!turned) { if (y < low) { low = y; lowT = t; } if (t > 0.1 && v > 0) turned = true; }
    }
    return { out, low, lowT };
  }
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const { scene, plot } = P.split(w, h, 0.26, 34), now = run ? run.R.out[run.i] : [0, H, 0];
    P.title(g, api, `k = ${k.toFixed(1)} N/m · ${drag ? "with drag" : "no drag"}${run && run.i === run.R.out.length - 1 ? ` · lowest ${run.R.low.toFixed(2)} m` : ""}`);
    // the crane, the cord (slack or taut), the jumper and the cup of tea at the bottom
    const top = scene.y0 + 18, ground = scene.y1 - 26, Yp = (y) => ground - ((y + 10) / (H + 10)) * (ground - top), cx = (scene.x0 + scene.x1) / 2;
    g.strokeStyle = api.color("muted"); g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 40, Yp(H)); g.lineTo(cx + 8, Yp(H)); g.moveTo(cx - 34, Yp(H)); g.lineTo(cx - 34, Yp(-10)); g.stroke();
    g.fillStyle = api.color("line"); g.fillRect(scene.x0, Yp(0), scene.x1 - scene.x0, 2);
    g.fillStyle = api.color("c4"); g.fillRect(cx - 8, Yp(0) - 8, 16, 8);
    g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif"; g.textAlign = "left"; g.fillText("tea", cx + 12, Yp(0) - 1);
    const fall = H - now[1], taut = fall > L;
    g.strokeStyle = api.color(taut ? "c1" : "c5"); g.lineWidth = taut ? 2 : 1.5; g.beginPath(); g.moveTo(cx, Yp(H));
    if (taut) g.lineTo(cx, Yp(now[1]));
    else { const yb = Yp(now[1]), sag = Math.min(30, (L - fall) * 1.6); g.quadraticCurveTo(cx + sag, (Yp(H) + yb) / 2 + sag, cx, yb); }
    g.stroke();
    g.fillStyle = api.color(now[1] < 0 ? "bad" : "ink"); g.beginPath(); g.arc(cx, Yp(now[1]), 6, 0, 7); g.fill();
    if (taut) { g.fillStyle = api.color("c1"); g.fillText(`cord ${(k * (fall - L)).toFixed(0)} N`, cx + 10, Yp(now[1]) + 4); }
    const tp = { ...plot, y1: plot.y0 + (plot.y1 - plot.y0) * 0.45 }, bt = { ...plot, y0: tp.y1 + 52 };
    P.plot(g, api, tp, {
      xlim: [0, 12], ylim: [-20, 85], xlabel: "time (s)", ylabel: "height (m)",
      hlines: [{ v: 0, col: "c4", dash: [], label: "the tea" }, { v: H - L, col: "muted", label: "cord goes taut" }], band: { y: [-20, 0], col: "bad" },
      series: run ? [{ pts: run.R.out.slice(0, run.i + 1).filter((_, j) => j % 4 === 0).map((q) => [q[0], q[1]]), col: drag ? "c1" : "c3" }] : [],
    });
    const srt = (a) => a.slice().sort((p, q) => p[0] - q[0]);
    P.plot(g, api, bt, {
      xlim: [20, 80], ylim: [-30, 30], xlabel: "cord stiffness k (N/m)", ylabel: "lowest point (m)", legend: "right",
      hlines: [{ v: 0, col: "c4", dash: [] }], vlines: [{ v: k, col: "c5" }],
      series: [
        ...(tries.n.length ? [{ pts: srt(tries.n), col: "c3", dots: true, line: true, width: 1.2, r: 3.5, label: "no drag" }] : []),
        ...(tries.d.length ? [{ pts: srt(tries.d), col: "c1", dots: true, line: true, width: 1.2, r: 3.5, label: "with drag" }] : []),
      ],
    });
  });
  async function go() {
    const my = ++gen, kk = k, d = drag, R = jump(kk, d), set = tries[d ? "d" : "n"];
    const j = set.findIndex((p) => Math.abs(p[0] - kk) < 1e-9); if (j >= 0) set.splice(j, 1); set.push([kk, R.low]);
    run = { R, i: 0 }; check(kk, d, R);
    for (let i = 0, st = Math.ceil(R.out.length / 90); i < R.out.length && gen === my; i += st) { run.i = i; cv.redraw(); await api.sleep(12); }
    if (gen !== my) return;
    run.i = R.out.length - 1; cv.redraw();
    const v = R.low;
    api.status(`k = ${kk.toFixed(1)} N/m, ${d ? "drag from v_term = 60 m/s" : "no drag"}\nlowest point ${v.toFixed(2)} m at t = ${R.lowT.toFixed(2)} s: ${v < -0.3 ? `${(-v).toFixed(1)} m into the ground` : v > 0.3 ? `${v.toFixed(1)} m above the tea` : "a dunk"}`);
  }
  function check(kk, d, R) {
    if (reached || !d || Math.abs(R.low) > 0.3 || tries.d.length < 3) return;
    reached = true;
    const nd = jump(kk, false).low, e = jump(38.9, true).low;
    api.explain("A perfect dunk", `<p>k = <b>${kk.toFixed(1)} N/m</b> brings the jumper to ${R.low.toFixed(2)} m, right into the tea. The root finder's answer is 34.7 N/m.</p><p>Now try <b>No drag</b>. The energy formula from the Parsons puzzle, which ignores the air, wants a stiffer 38.9 N/m. Use that cord in the real air and the jumper stops ${e.toFixed(1)} m above the cup, because drag has already taken some of the energy. Your cord without air would take them ${(-nd).toFixed(1)} m into the ground.</p><p>Gravity, drag, a spring that only pulls when stretched, an event for the lowest point and a root finder for k: the whole toolkit in one model.</p>`);
    api.done("Designed the cord for a bungee dunk");
  }
  api.seg([{ label: "With drag", value: "d" }, { label: "No drag (naive)", value: "n" }], "d", (v) => { drag = v === "d"; gen++; run = null; cv.redraw(); });
  api.slider("Cord stiffness k", { min: 20, max: 80, step: 0.1, value: k, format: (v) => v.toFixed(1) + " N/m" }, (v) => { k = v; cv.redraw(); });
  api.button("Jump", go, { primary: true });
  api.status("Jump, then change k until the lowest point is 0 m.");
  api.explain("How to read this", "<p>Left: the jumper on the cord, grey while slack and orange once it pulls. Right: height through the jump, and the lowest point for every k you've tried.</p><p>Find the cord stiffness that dips the jumper into the tea at 0 m, not above it and not into the ground.</p>");
});
