/* ModSim, chapter 23: the Green Monster.
   Fenway's left-field wall is 11.3 m high and 94.5 m from home plate. Choose a speed and an angle
   and hit; the ball either clears the wall or stops against it. Find the slowest hit that clears.
   The naive model ignores drag and says about 32 m/s is enough; with air it takes about 41 m/s.
   The "why": a root finder over speed, wrapped round an optimizer over angle, is this search done
   carefully. Each guess is a whole simulation. */
VIZ.register("ms-monster", async (api) => {
  await VIZ.lib("ms-plot"); await VIZ.lib("ms-ballkit");
  const P = window.MSPLOT, B = window.MSBALL, WX = 94.5, WH = 11.3;
  let speed = 36, angle = 40, drag = true, rows = [], cur = true, gen = 0, reached = api.wasDone, last = null;
  const tries = [];
  const atWall = (s, a, d) => { const R = B.fly(s, a, d, WX), L = R[R.length - 1]; return L[1] >= WX - 1e-9 ? L[2] : -1; };
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const box = { x0: 48, y0: 44, x1: w - 14, y1: h - 34 };
    P.title(g, api, `${drag ? "with drag" : "no drag"} · ${speed.toFixed(1)} m/s at ${angle}°${last ? ` · ${last}` : ""}`);
    const series = tries.slice(-6).map((t) => ({ pts: t.R.map((q) => [q[1], q[2]]), col: t.clear ? "ok" : "bad", width: 1, alpha: 0.35 }));
    if (rows.length) series.push({ pts: rows.map((q) => [q[1], q[2]]), col: cur ? "c1" : "c3", width: 2.5 });
    const { X, Y } = P.plot(g, api, box, { xlim: [0, 130], ylim: [0, 45], xlabel: "distance from home plate (m)", ylabel: "height (m)", series });
    g.fillStyle = api.color("c3"); g.globalAlpha = 0.85; g.fillRect(X(WX) - 4, Y(WH), 8, Y(0) - Y(WH)); g.globalAlpha = 1;
    g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif"; g.textAlign = "right";
    g.fillText("the wall, 11.3 m", X(WX) - 8, Y(WH) + 4);
    if (rows.length) { const q = rows[rows.length - 1]; g.fillStyle = api.color("ink"); g.beginPath(); g.arc(X(q[1]), Y(q[2]), 4.5, 0, 7); g.fill(); }
  });
  async function hit() {
    const my = ++gen, s = speed, a = angle, d = drag, hw = atWall(s, a, d), clear = hw >= WH;
    const R = clear || hw < 0 ? B.fly(s, a, d) : B.fly(s, a, d, WX);
    cur = d; tries.push({ R, clear });
    last = hw < 0 ? "lands short" : clear ? `clears by ${(hw - WH).toFixed(1)} m` : `hits the wall ${hw.toFixed(1)} m up`;
    api.status(`${d ? "with drag" : "no drag"}: ${s.toFixed(1)} m/s at ${a}°\n${hw < 0 ? "lands before the wall" : `height at the wall ${hw.toFixed(2)} m (needs 11.3)`}`);
    if (!reached && d && clear && s <= 41.5) {
      reached = true;
      api.explain("Just over", `<p><b>${s.toFixed(1)} m/s at ${a}°</b> clears the Monster. The slowest hit that can clear it is about <b>41.1 m/s</b>, launched near 44°.</p><p>Switch to <b>No drag</b>: the textbook parabola clears it at about 32 m/s, more than a fifth too slow. The air is most of the problem.</p><p>The chapter's method picks the angle with the greatest <i>range</i> (about 41°) and then the speed, and gets 41.3 m/s. A slightly steeper hit clears a tall wall a touch more cheaply, because what matters here is height at 94.5 m, not distance.</p>`);
      api.done("Found the slowest hit over the Green Monster");
    }
    for (let j = 0, st = Math.ceil(R.length / 70); j < R.length && gen === my; j += st) { rows = R.slice(0, j + 1); cv.redraw(); await api.sleep(10); }
    if (gen === my) { rows = R; cv.redraw(); }
  }
  api.seg([{ label: "With drag", value: "drag" }, { label: "No drag (naive)", value: "none" }], "drag", (v) => { drag = v === "drag"; gen++; rows = []; last = null; cv.redraw(); });
  api.slider("Launch speed", { min: 28, max: 50, step: 0.1, value: speed, format: (v) => v.toFixed(1) + " m/s" }, (v) => { speed = v; cv.redraw(); });
  api.slider("Launch angle", { min: 20, max: 70, step: 1, value: angle, format: (v) => v + "°" }, (v) => { angle = v; cv.redraw(); });
  api.button("Hit", hit, { primary: true });
  api.status("Hit, then lower the speed and try angles until it only just clears.");
  api.explain("How to read this", "<p>The green bar is the wall. Green ghosts cleared it; red ones didn't.</p><p>Find the slowest speed, at any angle, that still clears the wall with drag. Then see what the no-drag model would have told you.</p>");
});
