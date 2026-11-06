/* Complexity, chapter 12: cooperation on a grid.
   900 players on a 30×30 grid (wrapping at the edges), each with one of three strategies: always
   defect, tit for tat, or always cooperate. Each generation every player plays its 8 neighbours,
   then copies whichever strategy scored best around it (its own included). 1% of copies flip to a
   random strategy.
   The comparison: a one-shot game, where tit for tat can't tell friend from foe yet, against a
   repeated game of 6 rounds, where it can.
   The "why": repetition makes reputation possible, and clusters of reciprocators earn more than
   the defectors who exploit them. */
VIZ.register("tc-pd", async (api) => {
  const N = 30, PAY = { CC: 3, CD: 0, DC: 5, DD: 1 };
  let rounds = 6, grid, gen = 0, seed = 3, running = false, trace = [], reached = api.wasDone;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const NAMES = { D: "always defect", T: "tit for tat", C: "always cooperate" };
  function play(a, b) {
    let s = 0, ma = null, mb = null;
    for (let r = 0; r < rounds; r++) {
      const x = a === "T" ? mb ?? "C" : a, y = b === "T" ? ma ?? "C" : b;
      s += PAY[x + y]; ma = x; mb = y;
    }
    return s / rounds;
  }
  const nb = (i, f) => { const r = (i / N) | 0, c = i % N; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) f(((r + dr + N) % N) * N + ((c + dc + N) % N)); };
  function reset() {
    seed = 3; gen = 0;
    grid = Array.from({ length: N * N }, () => { const u = rnd(); return u < 0.8 ? "D" : u < 0.9 ? "T" : "C"; });
    trace = [share()];
  }
  function share() { const m = { D: 0, T: 0, C: 0 }; grid.forEach((s) => m[s]++); for (const k in m) m[k] /= N * N; return m; }
  function step() {
    const sc = grid.map((s, i) => { let t = 0; nb(i, (j) => (t += play(s, grid[j]))); return t; });
    grid = grid.map((s, i) => {
      let b = i; nb(i, (j) => { if (sc[j] > sc[b]) b = j; });
      return rnd() < 0.01 ? "DTC"[(rnd() * 3) | 0] : grid[b];
    });
    gen++; trace.push(share());
  }
  const colour = (s) => api.color(s === "D" ? "bad" : s === "T" ? "c3" : "c2");
  let geo = { x: 0, y: 0, s: 1 };
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const narrow = w < 560, gw = narrow ? w : Math.min(w * 0.5, h);
    const s = Math.min((gw - 12) / N, ((narrow ? h * 0.55 : h) - 34) / N), x0 = 6, y0 = 28;
    geo = { x: x0, y: y0, s };
    grid.forEach((v, i) => { g.fillStyle = colour(v); g.fillRect(x0 + (i % N) * s, y0 + ((i / N) | 0) * s, s - 1, s - 1); });
    const m = share();
    g.fillStyle = api.color("ink"); g.font = "600 13px 'IBM Plex Mono', monospace"; g.textAlign = "left";
    g.fillText(`generation ${gen} · ${rounds === 1 ? "one-shot" : rounds + " rounds"} · tit for tat ${Math.round(m.T * 100)}%`, x0, 18);
    // stacked shares over time
    const px0 = narrow ? 40 : gw + 40, px1 = w - 12, py0 = narrow ? y0 + N * s + 30 : 44, py1 = h - 60;
    const X = (k) => px0 + (k / Math.max(60, trace.length - 1)) * (px1 - px0), Y = (v) => py1 - v * (py1 - py0);
    for (const [key, lo] of [["D", (q) => 0], ["T", (q) => q.D], ["C", (q) => q.D + q.T]]) {
      g.fillStyle = colour(key); g.globalAlpha = 0.85; g.beginPath();
      trace.forEach((q, k) => (k ? g.lineTo(X(k), Y(lo(q) + q[key])) : g.moveTo(X(k), Y(lo(q) + q[key]))));
      for (let k = trace.length - 1; k >= 0; k--) g.lineTo(X(k), Y(lo(trace[k])));
      g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
    g.strokeStyle = api.color("line"); g.lineWidth = 1; g.strokeRect(px0, py0, X(Math.max(60, trace.length - 1)) - px0, py1 - py0);
    g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif"; g.textAlign = "left";
    g.fillText("share of the grid over generations", px0, py0 - 8);
    let lx = px0;
    for (const k of ["D", "T", "C"]) { g.fillStyle = colour(k); g.fillRect(lx, py1 + 16, 10, 10); g.fillStyle = api.color("muted"); g.fillText(NAMES[k], lx + 14, py1 + 25); lx += g.measureText(NAMES[k]).width + 30; }
  });
  cv.canvas.addEventListener("click", (e) => {
    const b = cv.canvas.getBoundingClientRect(), c = Math.floor((e.clientX - b.left - geo.x) / geo.s), r = Math.floor((e.clientY - b.top - geo.y) / geo.s);
    if (r < 0 || r >= N || c < 0 || c >= N) return;
    const i = r * N + c; grid[i] = { D: "T", T: "C", C: "D" }[grid[i]]; cv.redraw(); report();
  });
  function report() {
    const m = share();
    api.status(`${rounds === 1 ? "one-shot game" : `repeated game, ${rounds} rounds per meeting`}\ngeneration ${gen}\ndefect ${Math.round(m.D * 100)}%  ·  tit for tat ${Math.round(m.T * 100)}%  ·  cooperate ${Math.round(m.C * 100)}%`);
    if (!reached && rounds > 1 && m.T >= 0.7) {
      reached = true;
      api.explain("Cooperation took over", `<p>From 80% defectors to <b>${Math.round(m.T * 100)}%</b> tit for tat in ${gen} generations. A defector next to tit for tat wins the first round, then gets punished every round after. Tit for tat next to its own kind cooperates all six.</p><p>So reciprocators in a cluster outscore defectors on the cluster's edge, and the edge moves outward. In the one-shot game there are no later rounds to punish anyone, and defection wins.</p>`);
      api.done("Tit for tat took over the grid");
    }
  }
  api.seg([{ label: "Repeated, 6 rounds", value: 6 }, { label: "One-shot (naive)", value: 1 }], rounds, (v) => {
    rounds = +v; running = false; reset(); cv.redraw(); report();
    api.explain(rounds === 1 ? "One-shot" : "Repeated", rounds === 1
      ? "<p>Each pair meets once. Tit for tat opens by cooperating and never gets to reply, so it's exploited like a pushover.</p>"
      : "<p>Each pair plays 6 rounds. Tit for tat copies its opponent's last move, so defectors only win the first round against it.</p>");
  });
  api.button("Run", async () => {
    if (running) { running = false; return; }
    running = true;
    for (let k = 0; k < 120 && running; k++) { step(); cv.redraw(); report(); await api.sleep(80); }
    running = false;
  }, { primary: true });
  api.button("Step", () => { step(); cv.redraw(); report(); });
  api.button("Start over", () => { running = false; reset(); cv.redraw(); report(); });
  reset(); report();
  api.explain("How to read this", "<p>Red always defects, green plays tit for tat, blue always cooperates. Each generation every player copies the best scorer around it. Click a square to change its strategy.</p><p>Try <b>One-shot</b> first, then the repeated game.</p>");
});
