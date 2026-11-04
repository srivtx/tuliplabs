/* Build your own X, chapter 49: every letter is made of these curves.
   A Bézier curve is built from nothing but "go part of the way from A to B", repeated. Drag the
   handles to shape it, and slide t to watch the construction. A screen can't draw a curve, so the
   curve is cut into straight lines first.
   The "why": a fixed number of lines is wrong at nearly every size, too many for a tiny letter and
   too few for a poster. Cutting a curve in half until each piece is straight enough spends lines
   only where the screen can show them. (For one smooth curve, even steps do about as well as
   halving, which is measured, so the comparison here is with a fixed count.) */
VIZ.register("bx-bezier", async (api) => {
  const GHOST = [[0.1, 0.8], [0.3, -0.1], [0.62, 1.1], [0.9, 0.2]];
  const P = [[0.1, 0.8], [0.36, 0.72], [0.64, 0.34], [0.9, 0.2]];
  let t = 0.4, how = "split", tol = 1, size = 1, grabbed = -1, reached = api.wasDone, lines = 0;
  const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  function point(ps, u) { let c = ps; while (c.length > 1) { const n = []; for (let i = 0; i + 1 < c.length; i++) n.push(lerp(c[i], c[i + 1], u)); c = n; } return c[0]; }
  const PAD = 26, PY = 66, FIXED = 32;
  const toPx = (p, w, h) => [PAD + (0.5 + (p[0] - 0.5) * size) * (w - 2 * PAD), PY + (0.5 + (p[1] - 0.5) * size) * (h - 2 * PY)];
  // How far the curve strays from the straight line between u0 and u1, in pixels
  function stray(ps, u0, u1) {
    const a = point(ps, u0), b = point(ps, u1), dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    let worst = 0;
    for (let i = 1; i < 8; i++) { const q = point(ps, u0 + ((u1 - u0) * i) / 8); worst = Math.max(worst, Math.abs((q[0] - a[0]) * dy - (q[1] - a[1]) * dx) / len); }
    return worst;
  }
  const fixedCuts = () => Array.from({ length: FIXED + 1 }, (_, i) => i / FIXED);
  function splitCuts(ps, u0 = 0, u1 = 1, depth = 0) {
    if (depth > 12 || stray(ps, u0, u1) <= tol) return [u0, u1];
    const m = (u0 + u1) / 2;
    return [...splitCuts(ps, u0, m, depth + 1).slice(0, -1), ...splitCuts(ps, m, u1, depth + 1)];
  }
  function gap() {
    let worst = 0;
    for (let i = 0; i <= 40; i++) { const a = point(P, i / 40), b = point(GHOST, i / 40); worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1])); }
    return worst;
  }

  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const px = P.map((p) => toPx(p, w, h)), gx = GHOST.map((p) => toPx(p, w, h));
    const ink = api.color("ink"), muted = api.color("muted"), c1 = api.color("c1"), c2 = api.color("c2"), c4 = api.color("c4"), rule = api.color("line");
    // the shape to match
    g.strokeStyle = c4; g.lineWidth = 2; g.setLineDash([6, 5]); g.globalAlpha = 0.8; g.beginPath();
    for (let i = 0; i <= 80; i++) { const q = point(gx, i / 80); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }
    g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    // the straight lines the computer really draws
    const cuts = how === "fixed" ? fixedCuts() : splitCuts(px);
    lines = cuts.length - 1;
    g.strokeStyle = c2; g.lineWidth = 2.4; g.beginPath();
    cuts.forEach((u, i) => { const q = point(px, u); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); });
    g.stroke();
    g.fillStyle = c2;
    for (const u of cuts) { const q = point(px, u); g.beginPath(); g.arc(q[0], q[1], 2.6, 0, 6.2832); g.fill(); }
    // the construction at t
    let row = px, shade = 0;
    while (row.length > 1) {
      g.strokeStyle = shade ? c1 : rule; g.globalAlpha = shade ? 0.75 : 1; g.lineWidth = 1.2;
      g.beginPath(); row.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke();
      const n = []; for (let i = 0; i + 1 < row.length; i++) n.push(lerp(row[i], row[i + 1], t));
      g.fillStyle = c1;
      if (n.length > 1) for (const q of n) { g.beginPath(); g.arc(q[0], q[1], 3, 0, 6.2832); g.fill(); }
      row = n; shade++;
    }
    g.globalAlpha = 1;
    g.fillStyle = c1; g.beginPath(); g.arc(row[0][0], row[0][1], 6, 0, 6.2832); g.fill();
    // the handles
    px.forEach((q, i) => {
      const end = i === 0 || i === 3;
      g.fillStyle = api.color("card"); g.strokeStyle = end ? muted : ink; g.lineWidth = 2;
      g.beginPath(); g.arc(q[0], q[1], end ? 5 : 9, 0, 6.2832); g.fill(); g.stroke();
    });
    api.hud(`<b>${lines}</b> straight lines · off by ${Math.round(gap() * 100)}`);
  });
  cv.canvas.style.touchAction = "none";
  cv.canvas.style.cursor = "grab";
  const at = (e) => { const r = cv.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.canvas.addEventListener("pointerdown", (e) => {
    if (!cv.w) return;
    const p = at(e); let best = -1, d = 34;
    P.forEach((q, i) => { const s = toPx(q, cv.w, cv.h), e2 = Math.hypot(s[0] - p[0], s[1] - p[1]); if ((i === 1 || i === 2) && e2 < d) { d = e2; best = i; } });
    if (best >= 0) { grabbed = best; cv.canvas.setPointerCapture(e.pointerId); }
  });
  cv.canvas.addEventListener("pointermove", (e) => {
    if (grabbed < 0) return;
    const p = at(e);
    const ux = (p[0] - PAD) / (cv.w - 2 * PAD), uy = (p[1] - PY) / (cv.h - 2 * PY);
    P[grabbed] = [Math.max(-0.1, Math.min(1.1, 0.5 + (ux - 0.5) / size)), Math.max(-0.15, Math.min(1.15, 0.5 + (uy - 0.5) / size))];
    cv.redraw();
    if (!reached && gap() < 0.035) {
      reached = true;
      api.status("Now try a smaller size, and watch the number of lines.");
      api.done("Two handles, a whole curve. Every letter you're reading is a chain of these");
      api.explain("Four points, one curve", "<p>A curve like that takes only four points to store, however large you draw it. That's why fonts stay sharp at any size: the file holds the recipe, not the pixels.</p><p>Now move <b>Size on screen</b>, and compare <b>Just enough lines</b> with <b>Always 32 lines</b>.</p>");
    }
  });
  const drop = () => { grabbed = -1; };
  cv.canvas.addEventListener("pointerup", drop);
  cv.canvas.addEventListener("pointercancel", drop);
  let first = true;
  api.loop(() => { if (cv.w && first) { first = false; cv.redraw(); } });

  api.slider("t: how far along", { min: 0, max: 1, step: 0.01, value: t, format: (v) => v.toFixed(2) }, (v) => {
    t = v; cv.redraw();
    api.status("Every red dot is t of the way along its line. Do that until one dot is left, and it's on the curve.");
  });
  api.seg([{ label: "Just enough lines", value: "split" }, { label: "Always 32 lines", value: "fixed" }], "split", (v) => {
    how = v; cv.redraw();
    api.explain(v === "fixed" ? "Always 32 lines" : "Just enough lines", v === "fixed"
      ? "<p>One fixed number is wrong at nearly every size. On a small letter most of these lines are shorter than a pixel, and that work can't be seen. A screen full of text has thousands of curves, so it adds up.</p>"
      : "<p>Cut the curve in half. If a piece is already straight enough, stop. If not, cut it again. Shrink the curve and the count drops, because a small curve doesn't need many lines to look right.</p>");
  });
  api.slider("Size on screen", { min: 0.1, max: 1, step: 0.05, value: size, format: (v) => `${Math.round(v * 100)}%` }, (v) => { size = v; cv.redraw(); });
  api.slider("Allowed error", { min: 0.2, max: 8, step: 0.1, value: tol, format: (v) => `${v.toFixed(1)} px` }, (v) => { tol = v; cv.redraw(); });
  api.explain("Going part of the way", "<p>Drag the two big handles until the blue curve sits on the dashed one. The curve is pulled towards them, but doesn't touch them.</p><p>Then slide <b>t</b> to see how a point on the curve gets made: there's no formula to remember, only \"go part of the way from A to B\", repeated.</p>");
  api.status("Drag the two big handles.");
});
