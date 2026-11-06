/* Complexity, chapter 9: Sugarscape and the Gini coefficient.
   A 50×50 world with two sugar mountains. 400 agents look along the 4 directions up to their
   vision, move to the richest free cell, harvest it, then burn their metabolism. Sugar regrows by
   1 per step. Agents that run out die.
   Toggle "Everyone the same" (the naive comparison): one vision, one metabolism, one starting
   stock. Right: the Lorenz curve of wealth and the Gini over time.
   The "why": inequality grows from differences in luck of place and in ability, compounded each
   step, with no one taking from anyone. */
VIZ.register("tc-sugar", async (api) => {
  const N = 50;
  let cap, sugar, agents, steps = 0, mode = "varied", gini = [], seed = 31, running = false, reached = api.wasDone;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const ri = (a, b) => a + ((rnd() * (b - a + 1)) | 0);
  function makeCap() {
    cap = new Float32Array(N * N);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const d1 = Math.hypot(r - 15, c - 15), d2 = Math.hypot(r - 35, c - 35);
      cap[r * N + c] = Math.max(0, 4 - Math.floor(Math.min(d1, d2) / 5));
    }
  }
  function reset() {
    seed = 31; makeCap(); sugar = cap.slice(); steps = 0; gini = [];
    const taken = new Set(); agents = [];
    while (agents.length < 400) {
      const loc = ri(0, N * N - 1); if (taken.has(loc)) continue; taken.add(loc);
      agents.push(mode === "varied"
        ? { loc, vision: ri(1, 6), metab: ri(1, 4), sugar: ri(5, 25) }
        : { loc, vision: 3, metab: 2, sugar: 15 });
    }
    gini.push(G());
  }
  function G() {
    const w = agents.map((a) => a.sugar).sort((a, b) => a - b), n = w.length, tot = w.reduce((s, v) => s + v, 0);
    if (!n || !tot) return 0;
    let s = 0; w.forEach((v, i) => (s += (2 * (i + 1) - n - 1) * v));
    return s / (n * tot);
  }
  function step() {
    const occ = new Set(agents.map((a) => a.loc));
    // random order each step
    for (let i = agents.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [agents[i], agents[j]] = [agents[j], agents[i]]; }
    for (const a of agents) {
      occ.delete(a.loc);
      const r = (a.loc / N) | 0, c = a.loc % N;
      let best = a.loc, bs = sugar[a.loc], bd = 0;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let d = 1; d <= a.vision; d++) {
        const j = ((r + dr * d + N) % N) * N + ((c + dc * d + N) % N);
        if (occ.has(j)) continue;
        if (sugar[j] > bs || (sugar[j] === bs && d < bd)) { best = j; bs = sugar[j]; bd = d; }
      }
      a.loc = best; occ.add(best);
      a.sugar += sugar[best]; sugar[best] = 0; a.sugar -= a.metab;
    }
    agents = agents.filter((a) => a.sugar >= 0);
    for (let i = 0; i < N * N; i++) sugar[i] = Math.min(cap[i], sugar[i] + 1);
    steps++; gini.push(G());
  }
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const narrow = w < 560, gw = narrow ? w : Math.min(w * 0.5, h);
    const s = Math.min((gw - 12) / N, ((narrow ? h * 0.55 : h) - 34) / N), x0 = 6, y0 = 28;
    for (let i = 0; i < N * N; i++) {
      if (!sugar[i]) continue;
      g.fillStyle = api.color("c4"); g.globalAlpha = 0.12 + 0.17 * sugar[i];
      g.fillRect(x0 + (i % N) * s, y0 + ((i / N) | 0) * s, s, s);
    }
    g.globalAlpha = 1;
    const sorted = agents.map((a) => a.sugar).sort((a, b) => a - b), q9 = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
    for (const a of agents) {
      g.fillStyle = a.sugar >= q9 ? api.color("c1") : api.color("c2");
      g.beginPath(); g.arc(x0 + (a.loc % N + 0.5) * s, y0 + (((a.loc / N) | 0) + 0.5) * s, a.sugar >= q9 ? s * 0.48 : s * 0.32, 0, 7); g.fill();
    }
    g.fillStyle = api.color("ink"); g.font = "600 13px 'IBM Plex Mono', monospace"; g.textAlign = "left";
    g.fillText(`step ${steps} · ${agents.length} alive · Gini ${G().toFixed(2)}`, x0, 18);
    // Lorenz curve
    const px0 = narrow ? 40 : gw + 40, px1 = w - 12, py0 = narrow ? y0 + N * s + 30 : 44;
    const size = Math.min(px1 - px0, (narrow ? h - py0 : h * 0.55) - 30), py1 = py0 + size;
    g.strokeStyle = api.color("line"); g.lineWidth = 1; g.strokeRect(px0, py0, size, size);
    g.setLineDash([4, 4]); g.beginPath(); g.moveTo(px0, py1); g.lineTo(px0 + size, py0); g.stroke(); g.setLineDash([]);
    const tot = sorted.reduce((a, b) => a + b, 0) || 1;
    g.beginPath(); g.moveTo(px0, py1); let cum = 0;
    sorted.forEach((v, i) => { cum += v; g.lineTo(px0 + ((i + 1) / sorted.length) * size, py1 - (cum / tot) * size); });
    g.lineTo(px0 + size, py1); g.closePath(); g.fillStyle = api.color("c1"); g.globalAlpha = 0.18; g.fill(); g.globalAlpha = 1;
    g.strokeStyle = api.color("c1"); g.lineWidth = 2; g.stroke();
    g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif"; g.textAlign = "left";
    g.fillText("share of all sugar held by the poorest x%", px0, py0 - 8);
    g.fillText("dashed: everyone equal", px0 + 6, py0 + 14);
    // Gini over time
    const gy0 = py1 + 30, gy1 = h - 12, gx1 = px1;
    if (gy1 - gy0 > 30) {
      const GX = (k) => px0 + (k / Math.max(100, gini.length - 1)) * (gx1 - px0), GY = (v) => gy1 - v * (gy1 - gy0);
      g.strokeStyle = api.color("line"); g.strokeRect(px0, gy0, gx1 - px0, gy1 - gy0);
      g.setLineDash([3, 3]); g.beginPath(); g.moveTo(px0, GY(0.4)); g.lineTo(gx1, GY(0.4)); g.stroke(); g.setLineDash([]);
      g.strokeStyle = api.color("c3"); g.lineWidth = 2; g.beginPath(); gini.forEach((v, k) => (k ? g.lineTo(GX(k), GY(v)) : g.moveTo(GX(k), GY(v)))); g.stroke();
      g.fillStyle = api.color("muted"); g.fillText("Gini over time (dashed: 0.4)", px0 + 4, gy0 + 13);
    }
  });
  function report() {
    const gg = G();
    api.status(`${mode === "varied" ? "agents differ in vision, metabolism and start" : "everyone the same: vision 3, metabolism 2, 15 sugar"}\nstep ${steps}, ${agents.length} alive\nGini ${gg.toFixed(2)}  (0 = all equal, 1 = one holds everything)`);
    if (!reached && mode === "varied" && steps >= 100 && gg > 0.4) {
      reached = true;
      api.explain("Inequality from foraging", `<p>After ${steps} steps the Gini is <b>${gg.toFixed(2)}</b>. The top tenth (orange) sit on the mountain tops. No agent steals; each just takes the best cell it can see.</p><p>Small edges, like seeing one cell further or burning one less sugar, compound every step. Switch to <b>Everyone the same</b> to see how much of it comes from place alone.</p>`);
      api.done("Inequality grew out of simple rules");
    }
  }
  api.seg([{ label: "Agents differ", value: "varied" }, { label: "Everyone the same (naive)", value: "same" }], mode, (v) => {
    mode = v; running = false; reset(); cv.redraw(); report();
    api.explain(v === "varied" ? "Agents differ" : "Everyone the same", v === "varied"
      ? "<p>Vision 1–6 cells, metabolism 1–4 sugar a step, starting stock 5–25. Like the book's Sugarscape.</p>"
      : "<p>Every agent sees 3 cells, burns 2 sugar and starts with 15. Any inequality now comes only from where they happened to start and who got to a cell first.</p>");
  });
  api.button("Step", () => { step(); cv.redraw(); report(); }, { primary: true });
  api.button("Run", async () => {
    if (running) { running = false; return; }
    running = true;
    for (let k = 0; k < 150 && running; k++) { step(); step(); cv.redraw(); report(); await api.sleep(30); }
    running = false;
  });
  api.button("Start over", () => { running = false; reset(); cv.redraw(); report(); });
  reset(); report();
  api.explain("How to read this", "<p>Brighter cells hold more sugar: two mountains. Dots are agents; the richest tenth are large and orange.</p><p>Run it and watch the Lorenz curve bow away from the dashed line. The more it bows, the higher the Gini.</p>");
});
