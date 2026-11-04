/* Build your own X, chapter 45: lanes nobody planned.
   Two crowds walk opposite ways down a corridor. Each person wants to go straight and steps aside
   for anyone in front of them. Within seconds the crowd sorts itself into lanes. Nobody chose lanes
   and no one can see them: it's just that walking behind someone going your way is the path with
   the least shoving, and every step aside makes that a little more likely.
   The "why": take away the sideways step and the same people stall head-on. Order here isn't
   imposed from above; it comes from each person making a tiny local adjustment. */
VIZ.register("bx-lanes", async (api) => {
  const LX = 34, LY = 9, R = 0.26, V0 = 1.3, TAU = 0.5, DT = 0.03;
  let n = 170, X, Y, U, V, D, dodge = true, order = 0.5, pace = 1, seen = 0, reached = api.wasDone, wasBlocked = false;
  function start() {
    X = new Float64Array(n); Y = new Float64Array(n); U = new Float64Array(n); V = new Float64Array(n); D = new Int8Array(n);
    for (let i = 0; i < n; i++) {
      D[i] = i % 2 ? 1 : -1; X[i] = Math.random() * LX; Y[i] = R + Math.random() * (LY - 2 * R); U[i] = D[i] * V0 * 0.5;
    }
    seen = 0;
  }
  const wrap = (d) => (d > LX / 2 ? d - LX : d < -LX / 2 ? d + LX : d);
  function step() {
    const fx = new Float64Array(n), fy = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      fx[i] += (D[i] * V0 - U[i]) / TAU;
      fy[i] += -V[i] / TAU;
      for (let j = i + 1; j < n; j++) {
        const dx = wrap(X[i] - X[j]), dy = Y[i] - Y[j];
        if (dx > 2.4 || dx < -2.4 || dy > 2.4 || dy < -2.4) continue;
        const d = Math.hypot(dx, dy) || 1e-3, nx = dx / d, ny = dy / d;
        const f = 3.2 * Math.exp((2 * R - d) / 0.28);
        // you react more to people ahead of you than behind you
        const wi = 0.3 + 0.7 * (0.5 - 0.5 * nx * D[i]), wj = 0.3 + 0.7 * (0.5 + 0.5 * nx * D[j]);
        fx[i] += f * wi * nx; fy[i] += f * wi * ny; fx[j] -= f * wj * nx; fy[j] -= f * wj * ny;
      }
      const a = 1.6 * Math.exp((R - Y[i]) / 0.2), b = 1.6 * Math.exp((R - (LY - Y[i])) / 0.2);
      fy[i] += a - b;
    }
    for (let i = 0; i < n; i++) {
      U[i] += fx[i] * DT; V[i] += fy[i] * DT;
      if (!dodge) V[i] = 0;
      const s = Math.hypot(U[i], V[i]), m = V0 * 1.3;
      if (s > m) { U[i] *= m / s; V[i] *= m / s; }
      X[i] = (X[i] + U[i] * DT + LX) % LX;
      Y[i] = Math.max(R, Math.min(LY - R, Y[i] + V[i] * DT));
    }
  }
  // Lanes: of the people level with you, how many are going your way?
  function measure() {
    let same = 0, all = 0, go = 0;
    for (let i = 0; i < n; i++) {
      go += U[i] * D[i];
      for (let j = 0; j < n; j++) {
        if (i === j || Math.abs(Y[i] - Y[j]) > 0.35 || Math.abs(wrap(X[i] - X[j])) > 5) continue;
        all++; if (D[i] === D[j]) same++;
      }
    }
    order = order * 0.92 + (all ? same / all : 0.5) * 0.08;
    pace = pace * 0.92 + (go / n / V0) * 0.08;
  }
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    if (!X) return;
    const top = 8, ch = h - 16, s = ch / LY, sx = w / LX;
    g.strokeStyle = api.color("line"); g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, top); g.lineTo(w, top); g.moveTo(0, top + ch); g.lineTo(w, top + ch); g.stroke();
    const c1 = api.color("c1"), c2 = api.color("c2");
    for (let i = 0; i < n; i++) {
      const px = X[i] * sx, py = top + Y[i] * s;
      g.fillStyle = D[i] > 0 ? c2 : c1;
      g.beginPath(); g.moveTo(px + D[i] * 8, py); g.lineTo(px - D[i] * 5, py - 5.5); g.lineTo(px - D[i] * 5, py + 5.5); g.fill();
    }
  });
  api.loop(() => {
    if (!cv.w) return;
    if (!X) start();
    step(); step(); measure(); cv.redraw(); seen++;
    if (!dodge && pace < 0.4) wasBlocked = true;
    api.hud(`in lanes: <b>${Math.round(Math.max(0, (order - 0.5) * 2) * 100)}%</b>`);
    api.status(`walking at ${Math.round(Math.max(0, pace) * 100)}% of the speed people want`);
    if (!reached && wasBlocked && dodge && order > 0.86 && pace > 0.6) {
      reached = true;
      api.done("Lanes with no leader, no sign and no plan. One small step aside did it");
    }
  });
  api.seg([{ label: "People step aside", value: 1 }, { label: "Nobody steps aside", value: 0 }], 1, (v) => {
    dodge = !!v;
    api.explain(v ? "People step aside" : "Nobody steps aside", v
      ? "<p>Each person walks straight and shifts away from whoever is ahead. Someone behind a person going their way gets pushed less, so they stay there. Others join, and that's a lane. No one can see it from inside.</p>"
      : "<p>The same crowd, with one line removed: no sideways steps. People meet head-on and the whole corridor stalls. The pace number falls to almost nothing.</p>");
  });
  const row = api.row();
  api.button("Mix them up", () => { if (X) { start(); order = 0.5; } }, { row });
  api.slider("People", { min: 60, max: 260, step: 10, value: 170 }, (v) => { n = v; start(); order = 0.5; });
  api.explain("Two crowds, one corridor", "<p>Blue walks right, red walks left, and the corridor loops round. Press <b>Nobody steps aside</b> to see them stall, then let them step aside and watch what appears.</p>");
});
