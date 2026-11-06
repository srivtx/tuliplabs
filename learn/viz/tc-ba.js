/* Complexity, chapter 4: growing hubs.
   Grow a network one node at a time. Each newcomer makes 2 links. With "rich get richer" it picks
   targets in proportion to their degree; with "pick anyone" (the naive comparison) every node is
   equally likely. Nodes sit on a spiral in order of arrival, sized by degree, and a histogram of
   degrees fills in beside them.
   The "why": the rule, not the age, makes hubs. Uniform growth also favours old nodes a little,
   but only preferential attachment gives a heavy tail with hubs many times the average. */
VIZ.register("tc-ba", async (api) => {
  const M = 2, MAX = 300;
  let mode = "pref", deg, edges, ends, seed = 5, running = false, reached = api.wasDone, uniformBest = 0;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  function reset() {
    edges = [[0, 1], [1, 2], [2, 0]]; deg = [2, 2, 2];
    ends = [0, 1, 1, 2, 2, 0]; // every edge end, so a uniform pick from ends is a pick by degree
  }
  function addNode() {
    const v = deg.length, picked = new Set();
    while (picked.size < M) picked.add(mode === "pref" ? ends[(rnd() * ends.length) | 0] : (rnd() * v) | 0);
    deg.push(0);
    for (const u of picked) { edges.push([v, u]); deg[u]++; deg[v]++; ends.push(u, v); }
  }
  const maxDeg = () => Math.max(...deg);
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const narrow = w < 560, gw = narrow ? w : w * 0.55, gh = narrow ? h * 0.58 : h;
    const cx = gw / 2, cy = gh / 2 + 10, R = Math.min(gw, gh) / 2 - 18, n = deg.length;
    const pos = (i) => { const r = R * Math.sqrt((i + 0.5) / MAX), a = i * 2.39996; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    const top = maxDeg();
    g.lineWidth = 0.8; g.strokeStyle = api.color("c5"); g.globalAlpha = 0.35;
    g.beginPath(); for (const [a, b] of edges) { const [x1, y1] = pos(a), [x2, y2] = pos(b); g.moveTo(x1, y1); g.lineTo(x2, y2); } g.stroke();
    g.globalAlpha = 1;
    for (let i = 0; i < n; i++) {
      const [x, y] = pos(i), d = deg[i];
      g.fillStyle = d === top ? api.color("c4") : d >= 10 ? api.color("c1") : api.color("c2");
      g.beginPath(); g.arc(x, y, 1.6 + Math.sqrt(d) * 1.5, 0, 7); g.fill();
    }
    g.fillStyle = api.color("ink"); g.font = "600 13px 'IBM Plex Mono', monospace"; g.textAlign = "left";
    g.fillText(`${n} nodes · biggest hub ${top} links · average ${(2 * edges.length / n).toFixed(1)}`, 8, 18);
    g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif";
    g.fillText("oldest at the centre, newest at the rim", 8, 34);
    // histogram of degrees
    const hx0 = narrow ? 36 : gw + 30, hx1 = w - 12, hy0 = narrow ? gh + 30 : 50, hy1 = h - 30;
    const counts = {}; deg.forEach((d) => (counts[d] = (counts[d] || 0) + 1));
    const dmax = Math.max(30, top), cmax = Math.max(...Object.values(counts));
    g.strokeStyle = api.color("line"); g.lineWidth = 1; g.beginPath(); g.moveTo(hx0, hy0); g.lineTo(hx0, hy1); g.lineTo(hx1, hy1); g.stroke();
    const bw = (hx1 - hx0) / dmax;
    for (const [d, c] of Object.entries(counts)) {
      const hh = (Math.sqrt(c) / Math.sqrt(cmax)) * (hy1 - hy0);
      g.fillStyle = +d === top ? api.color("c4") : +d >= 10 ? api.color("c1") : api.color("c2");
      g.fillRect(hx0 + (d - 1) * bw + 0.5, hy1 - hh, Math.max(1.5, bw - 1), hh);
    }
    if (uniformBest) {
      const x = hx0 + (uniformBest - 0.5) * bw;
      g.setLineDash([4, 4]); g.strokeStyle = api.color("muted"); g.beginPath(); g.moveTo(x, hy0); g.lineTo(x, hy1); g.stroke(); g.setLineDash([]);
      g.fillStyle = api.color("muted"); g.textAlign = "left"; g.fillText(`best hub with "pick anyone": ${uniformBest}`, Math.min(x + 4, hx1 - 150), hy0 + 12);
    }
    g.fillStyle = api.color("muted"); g.textAlign = "center";
    for (const t of [2, 10, 20, 30, 40, 50].filter((t) => t <= dmax)) g.fillText(t, hx0 + (t - 0.5) * bw, hy1 + 14);
    g.fillText("links per node", (hx0 + hx1) / 2, hy1 + 26);
    g.textAlign = "left"; g.fillText("how many nodes (square-root scale)", hx0 + 4, hy0 - 8);
  });
  function report() {
    const n = deg.length, top = maxDeg();
    api.status(`rule: ${mode === "pref" ? "rich get richer (pick by degree)" : "pick anyone (uniform)"}\n${n} of ${MAX} nodes, biggest hub ${top} links, ${(top / (2 * edges.length / n)).toFixed(1)}× the average`);
    if (n >= MAX && mode === "uniform") uniformBest = Math.max(uniformBest, top);
    if (!reached && n >= MAX && mode === "pref" && uniformBest && top >= 25) {
      reached = true;
      api.explain("The rule makes the hubs", `<p>Same number of nodes, same 2 links each. Picking anyone, the best-connected node reached <b>${uniformBest}</b>. Picking by degree, it reached <b>${top}</b>.</p><p>Each link a node wins makes the next one likelier, so early leads compound. That gives a <b>heavy tail</b>: most nodes have 2 or 3 links and a few have dozens, like airports, web pages and citations.</p>`);
      api.done("Hubs grew from a rich-get-richer rule");
    }
  }
  api.seg([{ label: "Rich get richer", value: "pref" }, { label: "Pick anyone (naive)", value: "uniform" }], mode, (v) => {
    mode = v; running = false; seed = 5; reset(); cv.redraw(); report();
    api.explain(v === "pref" ? "Rich get richer" : "Pick anyone", v === "pref"
      ? "<p>A newcomer links to a node with chance proportional to its links. A node with 20 links is 10 times as likely to be picked as one with 2.</p>"
      : "<p>A newcomer links to any existing node with equal chance. Old nodes still collect more links, because they've been around longer. Grow it and see how far that gets them.</p>");
  });
  api.button("Grow", async () => {
    if (running) return; running = true;
    while (running && deg.length < MAX) { for (let k = 0; k < 4 && deg.length < MAX; k++) addNode(); cv.redraw(); report(); await api.sleep(25); }
    running = false; report();
  }, { primary: true });
  api.button("Add one", () => { if (deg.length < MAX) addNode(); cv.redraw(); report(); });
  api.button("Start over", () => { running = false; seed = 5; reset(); cv.redraw(); report(); });
  reset(); report();
  api.explain("How to read this", "<p>Each newcomer joins with 2 links. Dot size is how many links a node has; amber is the biggest hub.</p><p>Grow it with <b>Pick anyone</b> first, then with <b>Rich get richer</b>, and compare the biggest hubs.</p>");
});
