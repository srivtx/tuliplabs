/* Probability & Stats, chapter 10: least squares, literally.
   Points, a line you steer with sliders, and each residual drawn as an actual SQUARE between the point
   and the line. The best line is the one whose squares have the smallest total area.
   The "why": squaring makes big misses count a lot, which is also why one outlier can drag the line. */
VIZ.register("ps-regress", async (api) => {
  const W = await api.world3d();
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  let pts = [], slope = 0.2, icept = 2, outlier = false, handFit = false, wasClose = false;
  const OUT = { x: 9.2, y: 0.4 };
  function newData() {
    pts = [];
    for (let i = 0; i < 14; i++) { const x = 0.5 + rnd() * 9; pts.push({ x, y: 1 + 0.55 * x + gauss() * 0.7 }); }
  }
  const data = () => (outlier ? pts.concat([OUT]) : pts);
  function best() {
    const d = data(), n = d.length;
    const mx = d.reduce((a, p) => a + p.x, 0) / n, my = d.reduce((a, p) => a + p.y, 0) / n;
    const sxy = d.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0), sxx = d.reduce((a, p) => a + (p.x - mx) ** 2, 0);
    const b = sxy / sxx;
    return { b, a: my - b * mx, mx, my };
  }
  const sse = (a, b) => data().reduce((s, p) => s + (p.y - (a + b * p.x)) ** 2, 0);
  const X = (x) => x - 5, Yv = (y) => y - 1;
  function draw() {
    W.clear();
    const d = data();
    // axes
    W.line("ax", [X(0), Yv(0), 0], [X(10), Yv(0), 0], { color: "muted" });
    W.line("ay", [X(0), Yv(0), 0], [X(0), Yv(8), 0], { color: "muted" });
    W.label("xl", "size (x)", [X(9.2), Yv(-0.5), 0], { color: "muted", size: 0.3 });
    W.label("yl", "rent (y)", [X(1.2), Yv(7.6), 0], { color: "muted", size: 0.3 });
    d.forEach((p, i) => {
      const yhat = icept + slope * p.x, r = p.y - yhat, a = Math.abs(r);
      const isOut = outlier && i === d.length - 1;
      W.box("p" + i, { x: X(p.x), y: Yv(p.y), z: 0, s: 0.26, color: isOut ? "c1" : "c2", instant: true,
        info: { title: isOut ? "The outlier" : `Point (${p.x.toFixed(1)}, ${p.y.toFixed(2)})`, html: `<p>The line predicts <b>${yhat.toFixed(2)}</b> here, so the <b>residual</b> (actual − predicted) is <b>${r.toFixed(2)}</b>.</p><p>Its square has area <b>${(r * r).toFixed(2)}</b>. ${isOut ? "Because it's far from the others, its square is huge, and the line tilts a long way just to shrink it. Squaring gives far-away points a lot of pull." : "Least squares picks the line that makes the total area of all the squares as small as possible."}</p>` } });
      if (a > 0.02) W.box("sq" + i, { x: X(p.x) + (r > 0 ? -a / 2 : a / 2), y: Yv((p.y + yhat) / 2), z: -0.02, sx: a, sy: a, sz: 0.04, color: isOut ? "c1" : "c4", opacity: 0.42, instant: true,
        info: { title: `Squared residual: ${(r * r).toFixed(2)}`, html: "<p>A literal square: its side is the vertical miss, so its area is the miss squared. Move the line and watch which squares grow and shrink.</p><p>Why squares and not plain distances? Squares are smooth (calculus can find the exact best line), they never cancel out, and they make one big miss cost more than two small ones.</p>" } });
    });
    W.line("fit", [X(0), Yv(icept), 0.05], [X(10), Yv(icept + slope * 10), 0.05], { color: "c1" });
    const bb = best(), area = sse(icept, slope), min = sse(bb.a, bb.b);
    api.hud(`total square area <b>${area.toFixed(2)}</b> · best possible <b>${min.toFixed(2)}</b>${area <= min * 1.05 ? " · ✓ within 5%" : ""}`);
    api.status(`your line:  y = ${icept.toFixed(2)} + ${slope.toFixed(3)}·x\nbest line:  y = ${bb.a.toFixed(2)} + ${bb.b.toFixed(3)}·x\ntotal squared error: ${area.toFixed(2)}  (best ${min.toFixed(2)})\ncorrelation r = ${corr().toFixed(3)}`);
    if (!outlier && handFit && area <= min * 1.05) {
      wasClose = true;
      api.explain("You found it by hand", "<p>Within 5% of the best possible total area. Now press <b>Add outlier</b>: one strange point, and watch where the best line goes.</p>");
    }
    if (outlier && wasClose) {
      api.explain("One point, a big swing", `<p>The outlier's square is so big that the best line tilted from slope ${bestNoOut.b.toFixed(2)} to <b>${bb.b.toFixed(2)}</b> to reduce it. Least squares listens to everyone, and it listens to big misses <i>most</i>.</p><p>That's why you always plot your data first, and why robust methods (like using absolute errors, or removing data-entry mistakes) exist.</p>`);
      api.done("You fitted a line by hand and watched an outlier drag it");
    }
  }
  let bestNoOut = { b: 0 };
  function corr() {
    const d = data(), n = d.length, mx = d.reduce((a, p) => a + p.x, 0) / n, my = d.reduce((a, p) => a + p.y, 0) / n;
    const sxy = d.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
    const sxx = d.reduce((a, p) => a + (p.x - mx) ** 2, 0), syy = d.reduce((a, p) => a + (p.y - my) ** 2, 0);
    return sxy / Math.sqrt(sxx * syy);
  }
  const sS = api.slider("Slope", { min: -0.5, max: 1.5, step: 0.01, value: slope, format: (v) => v.toFixed(2) }, (v) => { slope = v; handFit = true; draw(); });
  const iS = api.slider("Intercept", { min: -2, max: 6, step: 0.02, value: icept, format: (v) => v.toFixed(2) }, (v) => { icept = v; handFit = true; draw(); });
  api.button("Snap to least squares", () => { const bb = best(); slope = bb.b; icept = bb.a; sS.set(slope); iS.set(icept); draw(); }, { primary: true });
  api.button("Add outlier", (btn) => {
    if (!outlier) bestNoOut = best();
    outlier = !outlier; btn.textContent = outlier ? "Remove outlier" : "Add outlier";
    if (outlier) { const bb = best(); slope = bb.b; icept = bb.a; sS.set(slope); iS.set(icept); }
    draw();
  });
  api.button("New data", () => { newData(); handFit = false; wasClose = false; draw(); });
  W.camera({ target: [0.4, 2.8, 0], dist: 16.5, theta: 0.14, phi: 1.32, instant: true });
  api.explain("How to read this", "<p>Blue points are apartments (size, rent). The red line is your model. Each amber <b>square</b> sits on a point's vertical miss: its side is the residual, so its area is the residual squared.</p><p>Steer the line with the sliders and make the total area (top left) as small as you can. Click any square to ask why squares.</p>");
  newData();
  draw();
});
