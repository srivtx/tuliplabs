/* ModSim, chapter 22: fly the ball.
   A baseball (145 g, 73 mm, C_d 0.33) leaves the bat 1 m up. The state is two vectors, position
   R and velocity V. Each step adds gravity, straight down, and drag, pointing against V with
   size ½·ρ·|V|²·C_d·A. Arrows on the ball show V (blue) and the drag force (red) as it flies.
   The naive model leaves drag out, the textbook parabola.
   The "why": drag always points backwards along the path, so it needs the vector form, and at
   40 m/s it is nearly as strong as gravity. */
VIZ.register("ms-fly", async (api) => {
  await VIZ.lib("ms-plot");
  const P = window.MSPLOT, m = 0.145, A = Math.PI * 0.0365 ** 2, k = (1.2 * 0.33 * A) / 2, g0 = 9.8;
  let speed = 40, angle = 45, drag = true, cur = true, rows = [], ghost = null, running = false, gen = 0, reached = api.wasDone;
  const flown = {};
  function fly(withDrag) {
    const c = withDrag ? k : 0, dt = 0.005, out = [];
    let x = 0, y = 1, vx = speed * Math.cos((angle * Math.PI) / 180), vy = speed * Math.sin((angle * Math.PI) / 180), t = 0;
    out.push([t, x, y, vx, vy]);
    while (y >= 0 && t < 20) {
      const v = Math.hypot(vx, vy), ax = (-c * v * vx) / m, ay = -g0 - (c * v * vy) / m;
      const nx = x + vx * dt, ny = y + vy * dt;
      if (ny < 0) { const f = y / (y - ny); out.push([t + f * dt, x + f * (nx - x), 0, vx, vy]); break; }
      x = nx; y = ny; vx += ax * dt; vy += ay * dt; t += dt; out.push([t, x, y, vx, vy]);
    }
    return out;
  }
  const top = (R) => Math.max(...R.map((q) => q[2]));
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const last = rows.length ? rows[rows.length - 1] : null, box = { x0: 48, y0: 40, x1: w - 14, y1: h - 34 };
    P.title(g, api, `${cur ? "with drag" : "no drag"} · ${speed} m/s at ${angle}°${last ? ` · x = ${last[1].toFixed(1)} m, y = ${last[2].toFixed(1)} m` : ""}`);
    const series = [];
    if (ghost) series.push({ pts: ghost.R.map((q) => [q[1], q[2]]), col: "muted", dash: [5, 4], width: 1.5, label: ghost.drag ? "with drag" : "no drag" });
    if (rows.length) series.push({ pts: rows.map((q) => [q[1], q[2]]), col: cur ? "c1" : "c3", label: cur ? "with drag" : "no drag" });
    const { X, Y } = P.plot(g, api, box, {
      xlim: [0, 180], ylim: [0, 60], xlabel: "distance from home plate (m)", ylabel: "height (m)", legend: "right",
      series,
    });
    if (!last) return;
    // the ball, its velocity and the drag force on it, in pixels
    const bx = X(last[1]), by = Y(last[2]), vx = last[3], vy = last[4], v = Math.hypot(vx, vy);
    const arrow = (dx, dy, col) => {
      const ex = bx + dx, ey = by - dy, a = Math.atan2(-dy, dx);
      g.strokeStyle = api.color(col); g.fillStyle = api.color(col); g.lineWidth = 2;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke();
      g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - 7 * Math.cos(a - 0.4), ey - 7 * Math.sin(a - 0.4)); g.lineTo(ex - 7 * Math.cos(a + 0.4), ey - 7 * Math.sin(a + 0.4)); g.fill();
    };
    if (v > 0.1 && last[2] > 0) {
      arrow((vx / 40) * 50, (vy / 40) * 50, "c2");
      if (cur) { const F = k * v * v, s = (F / (m * g0)) * 50; arrow((-vx / v) * s, (-vy / v) * s, "bad"); }
      arrow(0, -50, "c4");
    }
    g.fillStyle = api.color("ink"); g.beginPath(); g.arc(bx, by, 4.5, 0, 7); g.fill();
  });
  async function hit() {
    if (running) return; running = true;
    if (rows.length && rows.done) ghost = { R: rows, drag: rows.drag };
    const R = fly(drag), d = drag, my = ++gen; cur = d;
    flown[(d ? "d" : "n") + speed + "/" + angle] = R[R.length - 1][1];
    for (let i = 0, st = Math.ceil(R.length / 90); i < R.length && gen === my; i += st) { rows = R.slice(0, i + 1); cv.redraw(); await api.sleep(10); }
    if (gen !== my) return;
    rows = R; rows.done = true; rows.drag = d; running = false; cv.redraw();
    const L = R[R.length - 1], F0 = k * speed * speed;
    api.status(`${d ? "with drag" : "no drag"}: ${speed} m/s at ${angle}°\nlanded ${L[1].toFixed(1)} m out after ${L[0].toFixed(2)} s, highest ${top(R).toFixed(1)} m\n${d ? `drag at launch ${F0.toFixed(2)} N vs weight ${(m * g0).toFixed(2)} N` : "only gravity acts"}`);
    const key = speed + "/" + angle;
    if (!reached && flown["d" + key] != null && flown["n" + key] != null) {
      reached = true;
      const a = flown["n" + key], b = flown["d" + key];
      api.explain("Air takes a big bite", `<p>The same hit lands at <b>${a.toFixed(0)} m</b> with no air and <b>${b.toFixed(0)} m</b> with drag: ${(100 * (1 - b / a)).toFixed(0)}% shorter.${speed === 40 && angle === 45 ? " Off the bat, drag is 1.33 N against a weight of 1.42 N, nearly as strong as gravity." : ""}</p><p>Watch the red arrow: it always points straight back along the path, so it slows the ball forwards <i>and</i> upwards. That's why it needs the vector form, −V̂ · ½ρ|V|²C_dA, and why the drag path comes down steeper than it went up.</p>`);
      api.done("Flew the ball with and without drag");
    }
  }
  const reset = () => { running = false; gen++; { if (rows.done) ghost = { R: rows, drag: rows.drag }; rows = []; cv.redraw(); } };
  api.seg([{ label: "With drag", value: "drag" }, { label: "No drag (naive)", value: "none" }], "drag", (v) => { drag = v === "drag"; reset(); });
  api.slider("Launch speed", { min: 20, max: 55, step: 1, value: speed, format: (v) => v + " m/s" }, (v) => { speed = v; reset(); });
  api.slider("Launch angle", { min: 10, max: 80, step: 1, value: angle, format: (v) => v + "°" }, (v) => { angle = v; reset(); });
  api.button("Hit", hit, { primary: true });
  api.status("Hit the ball with drag, then again without.");
  api.explain("How to read this", "<p>The ball flies across the field. Arrows on it: blue is its velocity, amber its weight, red the drag force, drawn to the same scale as the weight.</p><p>Hit it with drag and without, at the same speed and angle, and compare where they land. The last flight stays as a dashed ghost.</p>");
});
