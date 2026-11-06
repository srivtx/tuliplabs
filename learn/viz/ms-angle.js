/* ModSim, chapter 23: range as a function of angle.
   Hit a 40 m/s baseball at an angle you choose. Each hit adds a point to range vs angle, so you
   build the curve the optimizer will search. With drag the top of the curve sits near 41°,
   not 45°; the naive no-drag model peaks at exactly 45°.
   The "why": an optimizer is a faster way of doing exactly this, one simulation per guess. */
VIZ.register("ms-angle", async (api) => {
  await VIZ.lib("ms-plot"); await VIZ.lib("ms-ballkit");
  const P = window.MSPLOT, B = window.MSBALL, SPEED = 40;
  let angle = 30, drag = true, rows = [], cur = true, gen = 0, curve = false, reached = api.wasDone;
  const pts = { d: [], n: [] };
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const { scene, plot } = P.split(w, h, 0.46, 34);
    const set = pts[drag ? "d" : "n"], best = set.length ? set.reduce((a, b) => (b[1] > a[1] ? b : a)) : null;
    P.title(g, api, `${SPEED} m/s, ${drag ? "with drag" : "no drag"}${best ? ` · best so far ${best[0]}° → ${best[1].toFixed(1)} m` : ""}`);
    P.plot(g, api, { ...scene, x0: scene.x0 + 34, y0: scene.y0 + 14, y1: scene.y1 - 26 }, {
      xlim: [0, 170], ylim: [0, 70], xlabel: "distance (m)", ylabel: "height (m)",
      series: rows.length ? [{ pts: rows.map((q) => [q[1], q[2]]), col: cur ? "c1" : "c3" }] : [],
    });
    const full = (d) => { const o = []; for (let a = 10; a <= 80; a += 1) o.push([a, B.range(SPEED, a, d)]); return o; };
    const series = [];
    if (curve) series.push({ pts: full(true), col: "c1", width: 1.3, dash: [5, 4] }, { pts: full(false), col: "c3", width: 1.3, dash: [5, 4] });
    const sorted = (s) => s.slice().sort((a, b) => a[0] - b[0]);
    if (pts.n.length) series.push({ pts: sorted(pts.n), col: "c3", dots: true, line: true, width: 1.5, r: 3.5, label: "no drag" });
    if (pts.d.length) series.push({ pts: sorted(pts.d), col: "c1", dots: true, line: true, width: 1.5, r: 3.5, label: "with drag" });
    P.plot(g, api, plot, {
      xlim: [10, 80], ylim: [0, 180], xlabel: "launch angle (degrees)", ylabel: "range (m)", legend: "right",
      vlines: [{ v: angle, col: "c5" }, ...(curve ? [{ v: 41, col: "c1", dash: [3, 3], label: "41°" }] : [])],
      series,
    });
  });
  async function hit() {
    check();
    const my = ++gen, d = drag, a = angle, R = B.fly(SPEED, a, d); cur = d;
    const set = pts[d ? "d" : "n"], L = R[R.length - 1][1];
    const i = set.findIndex((p) => p[0] === a); if (i >= 0) set.splice(i, 1); set.push([a, L]);
    for (let j = 0, st = Math.ceil(R.length / 60); j < R.length && gen === my; j += st) { rows = R.slice(0, j + 1); cv.redraw(); await api.sleep(10); }
    if (gen !== my) return;
    rows = R; cv.redraw();
    api.status(`${d ? "with drag" : "no drag"}, ${SPEED} m/s at ${a}°\nrange ${L.toFixed(1)} m`);
    check();
  }
  function check() {
    const D = pts.d, best = D.length ? D.reduce((p, q) => (q[1] > p[1] ? q : p)) : null;
    if (!reached && D.length >= 5 && best[0] >= 39 && best[0] <= 43 && D.some((p) => p[0] < best[0]) && D.some((p) => p[0] > best[0])) {
      reached = true; curve = true; cv.redraw();
      api.explain("Flatter than 45°", `<p>Your best hit with drag was <b>${best[0]}°, ${best[1].toFixed(1)} m</b>. The full curve (dashed) peaks at about <b>41°, 100.1 m</b>; without air it peaks at exactly 45°, 164 m.</p><p>Drag is strongest while the ball is fast, early in the flight, and a high ball spends longer in the air for drag to work on. A flatter launch trades some height for less time being slowed.</p><p>Notice how flat the top is: anywhere from 38° to 44° is within half a metre. <code>maximize</code> does what you just did, one simulation per guess, only more cleverly.</p>`);
      api.done("Found the best launch angle with drag");
    }
  }
  api.seg([{ label: "With drag", value: "drag" }, { label: "No drag (naive)", value: "none" }], "drag", (v) => { drag = v === "drag"; gen++; rows = []; cv.redraw(); });
  api.slider("Launch angle", { min: 10, max: 80, step: 1, value: angle, format: (v) => v + "°" }, (v) => { angle = v; cv.redraw(); });
  api.button("Hit", hit, { primary: true });
  api.button("Clear", () => { gen++; pts.d = []; pts.n = []; rows = []; curve = false; cv.redraw(); });
  api.status("Pick an angle and hit. Each hit adds a point.");
  api.explain("How to read this", "<p>Left: the flight. Right: range against launch angle, one point per hit.</p><p>Hit at a spread of angles with drag and find the one that goes furthest. Then try the no-drag model.</p>");
});
