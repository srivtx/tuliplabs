/* Complexity, chapter 3: a small world by rewiring.
   A ring of 100 people, each linked to the 2 nearest on each side. Slide p and each edge is
   rewired to a random person with chance p. Every edge keeps its own random draw, so moving p up
   only adds shortcuts, it never reshuffles the ones you have.
   Live: clustering C and path length L, both as a share of the ring's own values. Click a person
   to see breadth-first search spread from them, one colour per ring of hand-offs.
   The "why": a handful of shortcuts collapses L while barely touching C. That window is the small
   world. */
VIZ.register("tc-ws", async (api) => {
  const N = 100, K = 4;
  let p = 0.001, src = 0, reached = api.wasDone, trail = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // one fixed draw per lattice edge: [u, v, chance, new end]
  const base = [];
  for (let i = 0; i < N; i++) for (let d = 1; d <= K / 2; d++) base.push([i, (i + d) % N, rnd(), (rnd() * N) | 0]);
  let adj, edges;
  function build() {
    adj = Array.from({ length: N }, () => new Set()); edges = [];
    const has = (a, b) => adj[a].has(b);
    for (const [u, v0, r, t] of base) {
      let v = v0, short = false;
      if (r < p) {
        let c = t;
        while (c === u || has(u, c)) c = (c + 1) % N;
        v = c; short = true;
      }
      if (has(u, v)) continue;
      adj[u].add(v); adj[v].add(u); edges.push([u, v, short]);
    }
  }
  function bfs(s) {
    const d = new Array(N).fill(-1); d[s] = 0; const q = [s];
    for (let h = 0; h < q.length; h++) for (const v of adj[q[h]]) if (d[v] < 0) { d[v] = d[q[h]] + 1; q.push(v); }
    return d;
  }
  function clustering() {
    let s = 0;
    for (let i = 0; i < N; i++) {
      const nb = [...adj[i]], k = nb.length; if (k < 2) continue;
      let t = 0; for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) if (adj[nb[a]].has(nb[b])) t++;
      s += t / ((k * (k - 1)) / 2);
    }
    return s / N;
  }
  function pathLength() {
    let s = 0, c = 0;
    for (let i = 0; i < N; i++) for (const x of bfs(i)) if (x > 0) { s += x; c++; }
    return s / c;
  }
  const save = p; p = 0; build(); const C0 = clustering(), L0 = pathLength(); p = save;
  let C, L;
  function update() {
    build(); C = clustering() / C0; L = pathLength() / L0;
    trail = trail.filter((q) => Math.abs(Math.log(q[0] / p)) > 0.03); trail.push([p, C, L]);
  }
  const LO = 0.001;
  const lx = (v, x0, x1) => x0 + (Math.log(v / LO) / Math.log(1 / LO)) * (x1 - x0);

  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const narrow = w < 560;
    const gw = narrow ? w : w * 0.5, gh = narrow ? h * 0.55 : h;
    const cx = gw / 2, cy = gh / 2 + 8, r = Math.min(gw, gh) / 2 - 22;
    const pos = (i) => [cx + r * Math.cos((i / N) * 2 * Math.PI - Math.PI / 2), cy + r * Math.sin((i / N) * 2 * Math.PI - Math.PI / 2)];
    const d = bfs(src), far = Math.max(...d);
    const ring = (k) => (k < 0 ? api.color("c5") : k === 0 ? api.color("c4") : api.color(["c1", "c2", "c3"][(k - 1) % 3]));
    for (const [u, v, short] of edges) {
      const [x1, y1] = pos(u), [x2, y2] = pos(v);
      g.strokeStyle = short ? api.color("c4") : api.color("line"); g.lineWidth = short ? 1.6 : 1; g.globalAlpha = short ? 0.9 : 0.7;
      g.beginPath(); g.moveTo(x1, y1);
      if (short) g.quadraticCurveTo(cx + (x1 + x2 - 2 * cx) * 0.15, cy + (y1 + y2 - 2 * cy) * 0.15, x2, y2); else g.lineTo(x2, y2);
      g.stroke();
    }
    g.globalAlpha = 1;
    for (let i = 0; i < N; i++) {
      const [x, y] = pos(i);
      g.fillStyle = ring(d[i]); g.beginPath(); g.arc(x, y, i === src ? 6 : 3.6, 0, 7); g.fill();
    }
    g.fillStyle = api.color("ink"); g.font = "600 13px 'IBM Plex Mono', monospace"; g.textAlign = "left";
    g.fillText(`${edges.filter((e) => e[2]).length} shortcuts`, 8, 18);
    g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif";
    g.fillText(`from the big dot, everyone is within ${far} hand-offs`, 8, 34);
    // plot of C/C0 and L/L0 against p
    const px0 = narrow ? 40 : gw + 40, px1 = w - 12, py0 = narrow ? gh + 40 : 52, py1 = h - 32;
    g.strokeStyle = api.color("line"); g.lineWidth = 1; g.strokeRect(px0, py0, px1 - px0, py1 - py0);
    // the small-world window
    const sw = trail.filter((q) => q[1] > 0.8 && q[2] < 0.5);
    g.fillStyle = api.color("ok"); g.globalAlpha = 0.12;
    for (const q of sw) g.fillRect(lx(q[0], px0, px1) - 4, py0, 8, py1 - py0);
    g.globalAlpha = 1;
    g.fillStyle = api.color("muted"); g.textAlign = "center";
    for (const t of [0.001, 0.01, 0.1, 1]) g.fillText(t, lx(t, px0, px1), py1 + 14);
    g.fillText("p, chance each edge is rewired (log scale)", (px0 + px1) / 2, py1 + 27);
    g.textAlign = "right"; g.fillText("100%", px0 - 4, py0 + 4); g.fillText("0", px0 - 4, py1 + 4);
    const s = trail.slice().sort((a, b) => a[0] - b[0]);
    for (const [idx, col, lab] of [[1, "c3", "clustering C / C₀"], [2, "c1", "path length L / L₀"]]) {
      g.strokeStyle = g.fillStyle = api.color(col); g.lineWidth = 2;
      g.beginPath(); s.forEach((q, i) => { const X = lx(q[0], px0, px1), Y = py1 - q[idx] * (py1 - py0); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke();
      s.forEach((q) => { g.beginPath(); g.arc(lx(q[0], px0, px1), py1 - q[idx] * (py1 - py0), 2.5, 0, 7); g.fill(); });
      g.textAlign = "left"; g.font = "600 11px 'IBM Plex Sans', sans-serif";
      g.fillText(lab, px0 + 6, py0 - 32 + idx * 12);
    }
    const xp = lx(p, px0, px1);
    g.strokeStyle = api.color("c4"); g.lineWidth = 1.5; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(xp, py0); g.lineTo(xp, py1); g.stroke(); g.setLineDash([]);
    g.font = "11px 'IBM Plex Sans', sans-serif";
  });
  cv.canvas.addEventListener("click", (e) => {
    const b = cv.canvas.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    const w = b.width, h = b.height, narrow = w < 560, gw = narrow ? w : w * 0.5, gh = narrow ? h * 0.55 : h;
    const cx = gw / 2, cy = gh / 2 + 8, r = Math.min(gw, gh) / 2 - 22;
    let best = -1, bd = 196;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * 2 * Math.PI - Math.PI / 2, dx = cx + r * Math.cos(a) - x, dy = cy + r * Math.sin(a) - y;
      if (dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = i; }
    }
    if (best >= 0) { src = best; cv.redraw(); }
  });
  function report() {
    api.status(`p = ${p.toFixed(4)}\nclustering C = ${(C * 100).toFixed(0)}% of the ring's\npath length L = ${(L * 100).toFixed(0)}% of the ring's  (${(L * L0).toFixed(1)} hand-offs on average)`);
    if (!reached && L < 0.5 && C > 0.8) {
      reached = true;
      api.explain("A small world", `<p>With only ${edges.filter((e) => e[2]).length} shortcuts out of ${edges.length} links, the average distance fell to <b>${(L * 100).toFixed(0)}%</b> of the ring's, while friends of friends still mostly know each other (<b>${(C * 100).toFixed(0)}%</b> of the clustering).</p><p>Each shortcut serves everyone near both ends, so a few go a long way. Clustering is local, so it hardly notices. Slide on to p = 1 and you get a plain random graph: short paths, but the clustering is gone.</p>`);
      api.done("Short paths and tight friendships, at once");
    }
  }
  const sl = api.slider("Rewire chance, p", { min: Math.log(LO), max: 0, step: 0.02, value: Math.log(p), format: (v) => Math.exp(v).toFixed(3) }, (v) => { p = Math.exp(v); update(); cv.redraw(); report(); });
  api.button("Sweep p", async () => {
    for (let v = Math.log(LO); v <= 0.001; v += 0.23) { p = Math.exp(v); sl.set(v); update(); cv.redraw(); report(); await api.sleep(60); }
  }, { primary: true });
  update(); report();
  api.explain("How to read this", "<p>A ring where everyone knows their two nearest neighbours on each side. Amber curves are shortcuts made by rewiring.</p><p>Right: the green line is clustering (do my friends know each other?), the red line is path length (how many hand-offs to reach anyone?), both as a share of the plain ring. Move p, or Sweep it. Click anyone on the ring to see how far their news travels.</p>");
});
