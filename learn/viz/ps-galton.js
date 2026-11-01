/* Probability & Stats, chapter 4: a Galton board.
   Balls bounce left or right at every peg; the bins fill into a binomial shape that looks normal
   when there are many rows. Ghost columns show what the binomial formula predicts.
   The "why": a bin's height counts the PATHS that lead there, and the middle has the most paths. */
VIZ.register("ps-galton", async (api) => {
  const W = await api.world3d();
  let rows = 10, p = 0.5, counts, flying = [], total = 0, ghosts = true;
  const GAP = 0.9, BALL = 0.32, CUBE = 0.36;

  function comb(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r; }
  const pmf = (k) => comb(rows, k) * p ** k * (1 - p) ** (rows - k);
  const pegX = (r, i) => (i - r / 2) * GAP;
  const pegY = (r) => (rows - r) * GAP + 6.8; // above the tallest bar (MAXH = 6)
  const binX = (k) => (k - rows / 2) * GAP;

  function build() {
    W.clear();
    counts = new Array(rows + 1).fill(0);
    flying = []; total = 0;
    for (let r = 0; r < rows; r++) for (let i = 0; i <= r; i++) {
      W.box(`peg${r}_${i}`, { x: pegX(r, i), y: pegY(r), z: 0, s: 0.18, color: "c5", instant: true,
        info: { title: `Peg in row ${r + 1}`, html: `<p>Every ball hitting a peg goes <b>right</b> with probability p = ${p.toFixed(2)} and left otherwise, independently of everything before.</p><p>A ball's bin is just <b>how many times it went right</b>. That count is a <b>random variable</b>: a number that comes out of a random process.</p>` } });
    }
    for (let k = 0; k <= rows; k++) {
      W.label("bl" + k, String(k), [binX(k), -0.6, 0.6], { color: "muted", size: 0.3 });
    }
    drawBins();
    W.camera({ target: [0, (pegY(0) + 0.2) / 2, 0], dist: 13 + rows * 1.45, theta: 0.25, phi: 1.4, instant: true });
    report();
  }
  // bins and ghosts share one height scale, so the tallest thing is about 6 units high
  const MAXH = 6;
  function scale() {
    const top = Math.max(1, ...counts, ...(ghosts && total >= 20 ? counts.map((_, k) => pmf(k) * total) : [0]));
    return Math.min(CUBE, MAXH / top);
  }
  function drawBins() {
    const u = scale();
    for (let k = 0; k <= rows; k++) {
      const h = counts[k] * u;
      if (!counts[k]) { if (W.has("bin" + k)) W.remove("bin" + k); continue; }
      W.box("bin" + k, { x: binX(k), y: h / 2, z: 0, sx: GAP * 0.7, sy: h, sz: 0.5, color: "c2",
        label: counts[k] >= 1 ? String(counts[k]) : "", labelSize: 0.28, labelUp: 0.25,
        info: { title: `Bin ${k}: ${counts[k]} balls`, html: `<p>Every ball here went right exactly <b>${k}</b> times out of ${rows}. Different balls took different routes; there are <b>${comb(rows, k).toFixed(0)}</b> routes that end in this bin.</p>` } });
    }
    for (let k = rows + 1; k <= 30; k++) if (W.has("bin" + k)) W.remove("bin" + k);
    drawGhosts(u);
  }
  function drawGhosts(u) {
    for (let k = 0; k <= 30; k++) if (W.has("g" + k)) W.remove("g" + k);
    if (!ghosts || total < 20) return;
    for (let k = 0; k <= rows; k++) {
      const h = pmf(k) * total * u;
      if (h < 0.02) continue;
      W.box("g" + k, { x: binX(k), y: h / 2, z: -0.45, sx: GAP * 0.85, sy: h, sz: 0.12, color: "c4", opacity: 0.4, instant: true,
        info: { title: `Binomial prediction for bin ${k}`, html: `<p>The formula says P(${k} rights) = C(${rows}, ${k}) · p<sup>${k}</sup> · (1−p)<sup>${rows - k}</sup> = <b>${pmf(k).toFixed(4)}</b>, so about <b>${(pmf(k) * total).toFixed(1)}</b> of your ${total} balls.</p><p><b>C(${rows}, ${k}) = ${comb(rows, k).toFixed(0)}</b> is the number of different paths that end here. The middle bins have the most paths, which is why the pile is tallest there.</p>` } });
    }
  }
  function land(k) { counts[k]++; total++; }
  function drop(n, animate) {
    for (let j = 0; j < n; j++) {
      let k = 0;
      const path = [];
      for (let r = 0; r < rows; r++) { const right = Math.random() < p; path.push(right); if (right) k++; }
      if (animate && flying.length < 40) flying.push({ path, step: 0, t: 0, i: 0, key: "f" + Math.random().toString(36).slice(2), k });
      else land(k);
    }
    drawBins();
    report();
  }
  api.loop((dt) => {
    for (const b of flying.slice()) {
      b.t += dt * 6;
      while (b.t >= 1 && b.step < rows) { b.t -= 1; if (b.path[b.step]) b.i++; b.step++; }
      if (b.step >= rows) { W.remove(b.key); flying.splice(flying.indexOf(b), 1); land(b.k); drawBins(); report(); continue; }
      const r = b.step, x = pegX(r, b.i) + (b.path[r] ? 1 : -1) * GAP * 0.5 * b.t, y = pegY(r) + 0.3 - GAP * b.t;
      W.box(b.key, { x, y, z: 0, s: BALL, color: "c1", instant: true });
    }
  });

  function tvd() { // total variation distance between your bins and the formula
    if (!total) return 1;
    let d = 0;
    for (let k = 0; k <= rows; k++) d += Math.abs(counts[k] / total - pmf(k));
    return d / 2;
  }
  function report() {
    const mean = counts.reduce((a, c, k) => a + c * k, 0) / Math.max(1, total);
    const dist = tvd();
    api.hud(`${total} balls · ${rows} rows · p = ${p.toFixed(2)}`);
    api.status(`average bin: ${total ? mean.toFixed(2) : "–"}   (formula: n·p = ${(rows * p).toFixed(2)})\n` +
      `mismatch with binomial: ${total ? (dist * 100).toFixed(1) + "%" : "–"}  (0% = perfect)`);
    if (total >= 300 && Math.abs(p - 0.5) >= 0.1 && dist < 0.06) {
      api.explain("The formula predicted your pile", `<p>With p = ${p.toFixed(2)}, the pile shifted toward the ${p > 0.5 ? "right" : "left"} and leaned over, and the binomial formula (amber ghosts) still matches your ${total} balls to within ${(dist * 100).toFixed(1)}%.</p><p>That's what a <b>distribution</b> is: a rule that says how often each value of a random variable turns up.</p>`);
      api.done("You tilted the board and the binomial still predicted it");
    }
  }

  const rowsS = api.slider("Rows of pegs n", { min: 3, max: 16, value: rows }, (v) => { rows = v; build(); });
  api.slider("Chance of bouncing right p", { min: 0.1, max: 0.9, step: 0.05, value: p, format: (v) => v.toFixed(2) }, (v) => { p = v; build(); });
  api.button("Drop 1", () => drop(1, true), { primary: true });
  api.button("Drop 20", () => drop(20, true));
  api.button("Drop 500", () => drop(500, false));
  api.button("Clear", () => build());
  api.seg([{ label: "Formula ghosts on", value: true }, { label: "off", value: false }], true, (v) => { ghosts = v; drawBins(); });
  api.explain("How to read this", "<p>Balls (red) fall through rows of pegs. At each peg they go right with probability <b>p</b>. They pile up in bins (blue) numbered by <b>how many times they went right</b>.</p><p>Amber ghosts behind the bins show what the binomial formula predicts. Click any peg, bin or ghost to ask why.</p>");
  void rowsS;
  build();
  drop(12, true);
});
