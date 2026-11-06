/* Complexity, chapter 2: the tipping point of a random graph.
   Left: one Erdős–Rényi graph on a circle, each node coloured by its component (the largest in
   green, the rest grey). Right: P(connected) against p on a log axis. "Test 100 graphs" adds a
   point for the current n and p, so you build the S-curve yourself.
   The "why": connectivity doesn't creep up with p. It flips over a narrow window around
   p* = ln(n)/n, and the window narrows as n grows. */
VIZ.register("tc-er", async (api) => {
  let n = 40, p = 0.05, seed = 11, edges = [], comp = [], reached = api.wasDone;
  const pts = { 10: [], 40: [], 100: [] };
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  function graph() {
    const E = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) if (rnd() < p) E.push([i, j]);
    return E;
  }
  function components(E) {
    const par = Array.from({ length: n }, (_, i) => i);
    const f = (x) => (par[x] === x ? x : (par[x] = f(par[x])));
    for (const [a, b] of E) par[f(a)] = f(b);
    return Array.from({ length: n }, (_, i) => f(i));
  }
  const sizes = (c) => { const m = {}; c.forEach((r) => (m[r] = (m[r] || 0) + 1)); return m; };
  function makeOne() { edges = graph(); comp = components(edges); }
  const pstar = () => Math.log(n) / n;
  const LO = 0.005, HI = 1;
  const lx = (v, x0, x1) => x0 + ((Math.log(v) - Math.log(LO)) / (Math.log(HI) - Math.log(LO))) * (x1 - x0);

  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const narrow = w < 560;
    const gw = narrow ? w : w * 0.45, gh = narrow ? h * 0.5 : h;
    // the graph
    const cx = gw / 2, cy = gh / 2 + 6, r = Math.min(gw, gh) / 2 - 26;
    const pos = (i) => [cx + r * Math.cos((i / n) * 2 * Math.PI - Math.PI / 2), cy + r * Math.sin((i / n) * 2 * Math.PI - Math.PI / 2)];
    const sz = sizes(comp), big = +Object.keys(sz).reduce((a, b) => (sz[a] >= sz[b] ? a : b), comp[0]);
    g.strokeStyle = api.color("line"); g.lineWidth = 1;
    for (const [a, b] of edges) {
      const [x1, y1] = pos(a), [x2, y2] = pos(b);
      g.globalAlpha = comp[a] === big ? 0.55 : 0.35; g.strokeStyle = comp[a] === big ? api.color("c3") : api.color("c5");
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }
    g.globalAlpha = 1;
    for (let i = 0; i < n; i++) {
      const [x, y] = pos(i);
      g.fillStyle = comp[i] === big ? api.color("c3") : api.color("c5");
      g.beginPath(); g.arc(x, y, n > 60 ? 3 : 4.5, 0, 7); g.fill();
    }
    const nc = Object.keys(sz).length;
    g.fillStyle = api.color("ink"); g.font = "600 13px 'IBM Plex Mono', monospace"; g.textAlign = "left";
    g.fillText(nc === 1 ? "connected" : `${nc} pieces, largest ${sz[big]} of ${n}`, 8, 18);
    // the plot
    const px0 = narrow ? 44 : gw + 44, px1 = w - 12, py0 = narrow ? gh + 26 : 30, py1 = h - 30;
    g.strokeStyle = api.color("line"); g.lineWidth = 1;
    g.strokeRect(px0, py0, px1 - px0, py1 - py0);
    g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif"; g.textAlign = "center";
    for (const t of [0.01, 0.03, 0.1, 0.3, 1]) { const x = lx(t, px0, px1); g.fillText(t, x, py1 + 14); }
    g.fillText("p, chance of each edge (log scale)", (px0 + px1) / 2, py1 + 27);
    g.textAlign = "right";
    for (const t of [0, 0.5, 1]) g.fillText(t * 100 + "%", px0 - 5, py1 - t * (py1 - py0) + 4);
    g.textAlign = "left"; g.fillText("share connected", px0 + 4, py0 - 6);
    // p* line and current p
    const xs = lx(pstar(), px0, px1);
    g.setLineDash([4, 4]); g.strokeStyle = api.color("muted"); g.beginPath(); g.moveTo(xs, py0); g.lineTo(xs, py1); g.stroke(); g.setLineDash([]);
    g.fillText(`p* = ln(${n})/${n}`, Math.min(xs + 4, px1 - 80), py0 + 14);
    const xp = lx(p, px0, px1);
    g.strokeStyle = api.color("c4"); g.lineWidth = 2; g.beginPath(); g.moveTo(xp, py0); g.lineTo(xp, py1); g.stroke();
    // points, one series per n
    const cols = { 10: api.color("c5"), 40: api.color("c2"), 100: api.color("c1") };
    for (const k of [10, 40, 100]) {
      const s = pts[k].slice().sort((a, b) => a[0] - b[0]);
      g.strokeStyle = cols[k]; g.fillStyle = cols[k]; g.lineWidth = k === n ? 2 : 1; g.globalAlpha = k === n ? 1 : 0.5;
      g.beginPath(); s.forEach(([x, y], i) => { const X = lx(x, px0, px1), Y = py1 - y * (py1 - py0); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke();
      s.forEach(([x, y]) => { g.beginPath(); g.arc(lx(x, px0, px1), py1 - y * (py1 - py0), 3.5, 0, 7); g.fill(); });
      g.globalAlpha = 1;
    }
  });

  function report(extra = "") {
    api.status(`n = ${n} nodes, p = ${p.toFixed(3)}, so about ${Math.round((p * n * (n - 1)) / 2)} edges\np* = ln(n)/n = ${pstar().toFixed(3)}${extra}`);
  }
  function test() {
    let c = 0;
    for (let k = 0; k < 100; k++) { const e = graph(); const cc = components(e); if (Object.keys(sizes(cc)).length === 1) c++; }
    const L = pts[n].filter((q) => Math.abs(Math.log(q[0] / p)) > 0.01); L.push([p, c / 100]); pts[n] = L;
    makeOne(); cv.redraw();
    report(`\n100 graphs: ${c} connected`);
    const s = pts[n], lo = s.find((q) => q[1] < 0.2 && q[0] >= pstar() / 2), hi = s.find((q) => q[1] > 0.8 && q[0] <= pstar() * 2);
    if (!reached && n >= 40 && lo && hi) {
      reached = true;
      api.explain("A switch, not a dial", `<p>At p = ${lo[0].toFixed(3)} only ${Math.round(lo[1] * 100)}% of graphs held together. At p = ${hi[0].toFixed(3)}, ${Math.round(hi[1] * 100)}% did. That's a factor of ${(hi[0] / lo[0]).toFixed(1)} in p for nearly the whole jump.</p><p>A sudden change in the whole from a smooth change in the parts is a <b>phase transition</b>. Switch n to 100 and the window gets narrower still.</p>`);
      api.done("Found both sides of the tipping point");
    }
  }
  api.slider("Chance of each edge, p", { min: Math.log(LO), max: 0, step: 0.01, value: Math.log(p), format: (v) => Math.exp(v).toFixed(3) }, (v) => { p = Math.exp(v); makeOne(); cv.redraw(); report(); });
  api.seg([{ label: "10 nodes", value: 10 }, { label: "40 nodes", value: 40 }, { label: "100 nodes", value: 100 }], n, (v) => {
    n = +v; makeOne(); cv.redraw(); report();
    api.explain(`${n} nodes`, `<p>The tipping point sits at about ln(${n})/${n} = ${pstar().toFixed(3)}. Bigger graphs tip at a smaller p, and more sharply.</p>`);
  });
  api.button("Test 100 graphs", test, { primary: true });
  api.button("New graph", () => { makeOne(); cv.redraw(); report(); });
  makeOne(); report();
  api.explain("How to read this", "<p>Left: one random graph. Each pair of nodes is joined with chance p. The biggest connected piece is green.</p><p>Right: each point is 100 graphs at one p. Move p, test, move again. A smooth dial would give a gentle slope. Watch what you actually get near the dashed line.</p>");
});
