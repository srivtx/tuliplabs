/* ModSim, chapter 12: vaccines or hand washing, on a $1200 budget.
   Doses cost $100 and move a student from S to R before term. Whatever is left goes on a
   hand-washing campaign, which cuts β by up to 20% with diminishing returns:
   factor = 0.2 / (1 + e^(−0.01·(spending − 500))).
   Slide the split. Each split you try leaves a bar, so the chart fills in as you explore.
   The "why": neither extreme is best. The two interventions have different returns, and the best
   plan mixes them. */
VIZ.register("ms-budget", async (api) => {
  await VIZ.lib("ms-plot"); await VIZ.lib("ms-sirkit");
  const P = window.MSPLOT, M = window.MSSIR;
  const factor = (x) => 0.2 / (1 + Math.exp(-0.01 * (x - 500)));
  const usd = (n) => "$" + n;
  let doses = 12, reached = api.wasDone; const tried = new Map();
  const plan = (d) => { const f = d / 90; return M.run({ beta: (1 / 3) * (1 - factor(1200 - 100 * d)), gamma: 1 / 4, s0: 89 / 90 - f, r0: f }); };
  const sick = (d) => M.total(plan(d)) * 90;
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const { scene, plot } = P.split(w, h, 0.5, 30);
    const R = plan(doses);
    P.title(g, api, `${doses} doses (${usd(doses * 100)}) + ${usd(1200 - doses * 100)} on hand washing → ${sick(doses).toFixed(1)} students sick`);
    P.plot(g, api, { ...scene, x0: scene.x0 + 40, y0: scene.y0 + 18, y1: scene.y1 - 26 }, {
      xlim: [0, 98], ylim: [0, Math.max(0.02, ...plan(0).map((q) => q[2]), ...R.map((q) => q[2])) * 1.25], xlabel: "day", ylabel: "fraction sick (I)",
      series: [{ pts: plan(0).map((q) => [q[0], q[2]]), col: "c5", dash: [4, 4], width: 1.5, label: "all on hand washing" }, { pts: R.map((q) => [q[0], q[2]]), col: "bad", label: "this plan" }],
    });
    // a bar for every split tried
    const { x0, y0, x1, y1 } = plot, bw = (x1 - x0) / 13, Y = (v) => y1 - (v / 30) * (y1 - y0);
    g.strokeStyle = api.color("line"); g.lineWidth = 1; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.font = "11px 'IBM Plex Sans', sans-serif"; g.textAlign = "center";
    const best = tried.size ? Math.min(...tried.values()) : null;
    for (let d = 0; d <= 12; d++) {
      const cx = x0 + (d + 0.5) * bw;
      g.fillStyle = api.color("muted"); g.fillText(d, cx, y1 + 13);
      if (!tried.has(d)) { g.fillText("?", cx, y1 - 6); continue; }
      const v = tried.get(d);
      g.fillStyle = api.color(d === doses ? "c4" : v === best ? "c3" : "c2");
      g.fillRect(cx - bw * 0.36, Y(v), bw * 0.72, y1 - Y(v));
      g.fillStyle = api.color("ink"); g.fillText(v.toFixed(1), cx, Y(v) - 4);
    }
    g.fillStyle = api.color("muted"); g.fillText("doses bought (the rest of the budget goes on hand washing)", (x0 + x1) / 2, y1 + 26);
    g.textAlign = "left"; g.fillText("students who get sick", x0, y0 - 7);
  });
  function update() {
    tried.set(doses, sick(doses)); cv.redraw();
    const f = factor(1200 - doses * 100);
    api.status(`${doses} doses: ${doses} students immune from day 0\n${usd(1200 - doses * 100)} on hand washing: β cut by ${(f * 100).toFixed(1)}%\n${sick(doses).toFixed(1)} students get sick over the term`);
    const all = [...Array(13).keys()].map((d) => [d, sick(d)]), bestD = all.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
    if (!reached && tried.size >= 5 && doses === bestD) {
      reached = true;
      api.explain("A mix beats either extreme", `<p>The best plan is <b>${bestD} doses</b> with ${usd(1200 - bestD * 100)} on hand washing: ${sick(bestD).toFixed(1)} students sick, against ${sick(12).toFixed(1)} for all vaccines and ${sick(0).toFixed(1)} for all hand washing.</p><p>Hand washing's returns flatten out at the top of its curve, so the first few hundred dollars taken from it cost little, and spending them on doses saves more. Past the best mix, every dollar moved hurts hand washing more than the dose helps.</p>`);
      api.done("Found the best split of the budget");
    }
  }
  api.slider("Doses bought ($100 each)", { min: 0, max: 12, step: 1, value: doses, format: (v) => `${v} (${usd(v * 100)})` }, (v) => { doses = v; update(); });
  update();
  api.explain("How to read this", "<p>Left: how many students are sick each day under your plan. Right: every split you've tried, as a bar of total students who get sick.</p><p>Start at all doses (12), try all hand washing (0), then search between them for the lowest bar.</p>");
});
