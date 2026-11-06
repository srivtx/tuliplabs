/* ModSim, chapter 13: sweep two parameters at once.
   A 10×10 grid of SIR runs: β from 0.1 to 1.0 across, γ from 0.1 to 1.0 up. Each cell is shaded
   by the fraction of the class that gets sick. Sweep fills the grid one run at a time; click a
   cell to see its curves.
   The naive comparison: sweep β alone at a fixed γ. It gives one row of the picture and hides
   the pattern you can only see with both.
   The "why": the bright-to-dark edge runs along a diagonal, β ≈ γ. What matters is the ratio, the
   idea chapter 14 makes exact. */
VIZ.register("ms-sweep2", async (api) => {
  await VIZ.lib("ms-plot"); await VIZ.lib("ms-sirkit");
  const P = window.MSPLOT, M = window.MSSIR, V = [...Array(10)].map((_, i) => +(0.1 * (i + 1)).toFixed(1));
  const grid = new Map(); let pick = [2, 2], running = false, rowOnly = false, reached = api.wasDone;
  const key = (a, b) => a + "," + b;
  const frac = (bi, gi) => M.total(M.run({ beta: V[bi], gamma: V[gi] }));
  let geo = null;
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const { scene, plot } = P.split(w, h, 0.5, 30);
    const size = Math.min(scene.x1 - scene.x0 - 40, scene.y1 - scene.y0 - 34), cs = size / 10, gx = scene.x0 + 40, gy = scene.y0 + 4;
    geo = { gx, gy, cs };
    for (let bi = 0; bi < 10; bi++) for (let gi = 0; gi < 10; gi++) {
      const x = gx + bi * cs, y = gy + (9 - gi) * cs, v = grid.get(key(bi, gi));
      if (v === undefined) { g.strokeStyle = api.color("line"); g.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1); continue; }
      g.fillStyle = api.color("bad"); g.globalAlpha = 0.08 + 0.92 * v; g.fillRect(x, y, cs - 1, cs - 1); g.globalAlpha = 1;
    }
    g.strokeStyle = api.color("c4"); g.lineWidth = 2; g.strokeRect(gx + pick[0] * cs + 1, gy + (9 - pick[1]) * cs + 1, cs - 3, cs - 3);
    if (grid.size === 100) { g.setLineDash([4, 4]); g.strokeStyle = api.color("ink"); g.lineWidth = 1; g.beginPath(); g.moveTo(gx, gy + size); g.lineTo(gx + size, gy); g.stroke(); g.setLineDash([]); }
    g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif"; g.textAlign = "center";
    for (let i = 0; i < 10; i += 3) { g.fillText(V[i], gx + (i + 0.5) * cs, gy + size + 13); }
    g.fillText("β, contact rate →", gx + size / 2, gy + size + 26);
    g.textAlign = "right"; for (let i = 0; i < 10; i += 3) g.fillText(V[i], gx - 4, gy + (9 - i + 0.5) * cs + 4);
    g.save(); g.translate(scene.x0 + 8, gy + size / 2); g.rotate(-Math.PI / 2); g.textAlign = "center"; g.fillText("γ, recovery rate →", 0, 0); g.restore();
    const [bi, gi] = pick, R = M.run({ beta: V[bi], gamma: V[gi] });
    P.title(g, api, `${grid.size} of 100 runs · picked β = ${V[bi]}, γ = ${V[gi]}: ${Math.round(M.total(R) * 100)}% get sick`);
    P.plot(g, api, plot, {
      xlim: [0, 98], ylim: [0, 1], xlabel: "day", ylabel: "fraction of the class", legend: "right",
      series: [{ pts: R.map((q) => [q[0], q[1]]), col: "c2", label: "S" }, { pts: R.map((q) => [q[0], q[2]]), col: "bad", label: "I" }, { pts: R.map((q) => [q[0], q[3]]), col: "c3", label: "R" }],
    });
  });
  cv.canvas.addEventListener("click", (e) => {
    if (!geo) return;
    const b = cv.canvas.getBoundingClientRect(), bi = Math.floor((e.clientX - b.left - geo.gx) / geo.cs), gi = 9 - Math.floor((e.clientY - b.top - geo.gy) / geo.cs);
    if (bi < 0 || bi > 9 || gi < 0 || gi > 9) return;
    pick = [bi, gi]; grid.set(key(bi, gi), frac(bi, gi)); cv.redraw(); report();
  });
  function report() {
    const [bi, gi] = pick;
    api.status(`${grid.size} of 100 runs done\npicked: β = ${V[bi]}, γ = ${V[gi]}, β/γ = ${(V[bi] / V[gi]).toFixed(2)}\n${Math.round(frac(bi, gi) * 100)}% of the class gets sick`);
    if (!reached && grid.size === 100) {
      reached = true;
      api.explain("A diagonal edge", "<p>The dark corner (few sick) sits where recovery is fast and contact is slow; the bright corner is the reverse. The edge between them runs along the dashed diagonal, β = γ.</p><p>Pick two cells on the same line out from the corner, like β 0.2, γ 0.1 and β 0.6, γ 0.3: they give about the same outbreak. Only the ratio β/γ seems to matter, which chapter 14 proves.</p>");
      api.done("Swept both parameters and saw the pattern");
    }
  }
  api.button("Sweep both", async () => {
    if (running) return; running = true;
    for (let gi = 0; gi < 10 && running; gi++) for (let bi = 0; bi < 10 && running; bi++) {
      if (rowOnly && gi !== 2) continue;
      if (!grid.has(key(bi, gi))) { grid.set(key(bi, gi), frac(bi, gi)); pick = [bi, gi]; cv.redraw(); report(); await api.sleep(25); }
    }
    running = false;
  }, { primary: true });
  api.seg([{ label: "Both β and γ", value: "both" }, { label: "β only, γ = 0.3 (naive)", value: "row" }], "both", (v) => {
    rowOnly = v === "row";
    api.explain(rowOnly ? "One parameter at a time" : "Both at once", rowOnly
      ? "<p>Sweeping β alone fills one row: you learn where the outbreak takes off for γ = 0.3, and nothing about how that depends on γ.</p>"
      : "<p>Every pair of values gets its own run, so the picture shows how the two parameters work together.</p>");
  });
  api.button("Clear", () => { running = false; grid.clear(); cv.redraw(); report(); });
  report();
  api.explain("How to read this", "<p>Each square is one run of the plague model. Redder means more of the class got sick. Click any square to run it and see its curves.</p><p>Sweep one row first (β only), then the whole grid.</p>");
});
