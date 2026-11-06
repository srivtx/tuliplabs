/* Complexity, chapter 8: a sand pile that tunes itself.
   A 30×30 table. Drop grains at random (or click to drop one where you like). A cell with more
   than 3 grains topples, sending one grain to each neighbour; grains off the edge are lost.
   Cells that toppled in the last avalanche are outlined. Right: avalanche sizes on log-log axes,
   and the average height over time.
   The twist: start the table empty or start it tall (10 grains everywhere). Both settle to the
   same average, about 2.1, with no one tuning anything. That's self-organized criticality. */
VIZ.register("tc-sand", async (api) => {
  const N = 30;
  let a, last = new Set(), sizes = [], heights = [], dropped = 0, biggest = 0, seed = 17, running = false, reached = api.wasDone;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  function reset(fill) {
    a = new Int32Array(N * N);
    for (let i = 0; i < N * N; i++) a[i] = fill === "tall" ? 10 : 0;
    sizes = []; heights = []; dropped = 0; biggest = 0; last = new Set();
    if (fill === "tall") { relax(-1); sizes = []; }
    heights.push(mean());
  }
  const mean = () => a.reduce((s, v) => s + v, 0) / (N * N);
  function relax(start) {
    const stack = [], hit = new Set();
    if (start >= 0) stack.push(start); else for (let i = 0; i < N * N; i++) stack.push(i);
    while (stack.length) {
      const i = stack.pop();
      if (a[i] <= 3) continue;
      const k = a[i] >> 2; a[i] -= 4 * k; hit.add(i);
      const r = (i / N) | 0, c = i % N;
      for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
        const j = rr * N + cc; a[j] += k; if (a[j] > 3) stack.push(j);
      }
      if (a[i] > 3) stack.push(i);
    }
    return hit;
  }
  function drop(i) {
    a[i]++; dropped++;
    const hit = relax(i);
    if (hit.size) { sizes.push(hit.size); last = hit; biggest = Math.max(biggest, hit.size); } else last = new Set();
    if (dropped % 10 === 0) heights.push(mean());
  }
  let geo = { x: 0, y: 0, s: 1 };
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const narrow = w < 560, gw = narrow ? w : Math.min(w * 0.5, h);
    const s = Math.min((gw - 12) / N, ((narrow ? h * 0.55 : h) - 34) / N), x0 = 6, y0 = 28;
    geo = { x: x0, y: y0, s };
    const shade = [api.color("card"), api.color("c5"), api.color("c2"), api.color("c3")];
    for (let i = 0; i < N * N; i++) {
      const r = (i / N) | 0, c = i % N;
      g.fillStyle = shade[Math.min(3, a[i])]; g.fillRect(x0 + c * s, y0 + r * s, s - 0.5, s - 0.5);
    }
    g.strokeStyle = api.color("c4"); g.lineWidth = 1.5;
    for (const i of last) { const r = (i / N) | 0, c = i % N; g.strokeRect(x0 + c * s + 1, y0 + r * s + 1, s - 2.5, s - 2.5); }
    g.fillStyle = api.color("ink"); g.font = "600 13px 'IBM Plex Mono', monospace"; g.textAlign = "left";
    g.fillText(`${dropped} grains dropped · last avalanche ${last.size} cells`, x0, 18);
    // log-log histogram of avalanche sizes
    const px0 = narrow ? 40 : gw + 36, px1 = w - 12, py0 = narrow ? y0 + N * s + 30 : 40, pyMid = narrow ? py0 + (h - py0) * 0.62 : h * 0.62, py1 = pyMid;
    const bins = new Array(10).fill(0);
    for (const z of sizes) bins[Math.min(9, Math.floor(Math.log2(z)))]++;
    // bar height = avalanches per unit of size (count ÷ bin width), on a log axis, so a power law is a straight slope
    const dens = bins.map((c, b) => (c ? Math.log10(c / 2 ** b) : null)), ok = dens.filter((d) => d !== null);
    const dHi = ok.length ? Math.max(...ok) : 1, dLo = ok.length ? Math.min(...ok) - 0.3 : 0;
    const LX = (b) => px0 + (b / 10) * (px1 - px0), LY = (b) => py1 - ((dens[b] - dLo) / Math.max(0.5, dHi - dLo)) * (py1 - py0);
    g.strokeStyle = api.color("line"); g.lineWidth = 1; g.strokeRect(px0, py0, px1 - px0, py1 - py0);
    bins.forEach((c, b) => { if (!c) return; g.fillStyle = b >= Math.log2(200) ? api.color("c4") : api.color("c1"); g.fillRect(LX(b) + 1, LY(b), (px1 - px0) / 10 - 2, py1 - LY(b)); });
    g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif"; g.textAlign = "center";
    for (const b of [0, 2, 4, 6, 8]) g.fillText(2 ** b, LX(b) + (px1 - px0) / 20, py1 + 13);
    g.fillText("avalanche size, cells (doubling bins)", (px0 + px1) / 2, py1 + 25);
    g.textAlign = "left"; g.fillText("how often, per cell of size (log scale)", px0 + 2, py0 - 7);
    // average height over time
    const hy0 = py1 + 44, hy1 = h - 10;
    if (hy1 - hy0 > 30) {
      const HY = (v) => hy1 - (Math.min(v, 4) / 4) * (hy1 - hy0), HX = (k) => px0 + (k / Math.max(1, heights.length - 1)) * (px1 - px0);
      g.strokeStyle = api.color("line"); g.strokeRect(px0, hy0, px1 - px0, hy1 - hy0);
      g.setLineDash([3, 3]); g.strokeStyle = api.color("muted"); g.beginPath(); g.moveTo(px0, HY(2.1)); g.lineTo(px1, HY(2.1)); g.stroke(); g.setLineDash([]);
      g.strokeStyle = api.color("c3"); g.lineWidth = 2; g.beginPath(); heights.forEach((v, k) => (k ? g.lineTo(HX(k), HY(v)) : g.moveTo(HX(k), HY(v)))); g.stroke();
      g.fillStyle = api.color("muted"); g.textAlign = "left"; g.fillText(`average grains per cell: ${mean().toFixed(2)}  (dashed: 2.1)`, px0 + 4, hy0 + 13);
    }
  });
  cv.canvas.addEventListener("click", (e) => {
    const b = cv.canvas.getBoundingClientRect(), c = Math.floor((e.clientX - b.left - geo.x) / geo.s), r = Math.floor((e.clientY - b.top - geo.y) / geo.s);
    if (r >= 0 && r < N && c >= 0 && c < N) { drop(r * N + c); cv.redraw(); report(); }
  });
  function report() {
    api.status(`${dropped} grains dropped, ${sizes.length} avalanches\nbiggest avalanche: ${biggest} cells\naverage height ${mean().toFixed(2)}`);
    if (!reached && dropped >= 1500 && biggest >= 200) {
      reached = true;
      api.explain("Critical, untuned", `<p>Most grains do nothing. A few set off avalanches, and now and then one sweeps <b>${biggest}</b> cells. The bars fall in a near-straight slope on log-log axes: a <b>power law</b>, with no typical size.</p><p>Nobody set the pile to this state. Grains pile up until avalanches carry them off the edge as fast as they arrive, and the pile parks itself at the critical point. Try <b>Start tall</b>: it falls to the same average.</p>`);
      api.done("The pile found its own critical point");
    }
  }
  api.button("Drop 1", () => { drop((rnd() * N * N) | 0); cv.redraw(); report(); }, { primary: true });
  api.button("Run", async () => {
    if (running) { running = false; return; }
    running = true;
    for (let k = 0; k < 4000 && running; k++) { for (let j = 0; j < 25; j++) drop((rnd() * N * N) | 0); cv.redraw(); report(); await api.sleep(16); }
    running = false;
  });
  api.button("Start empty", () => { running = false; reset("empty"); cv.redraw(); report(); });
  api.button("Start tall", () => {
    running = false; reset("tall"); cv.redraw(); report();
    api.explain("Start tall", "<p>Every cell began with 10 grains, then the whole table toppled until no cell had more than 3. Now Run and watch the average height. It drifts to the same place an empty table climbs to.</p>");
  });
  reset("empty"); report();
  api.explain("How to read this", "<p>Darker to brighter: 0, 1, 2, 3 grains. Four or more and a cell topples, giving one grain to each neighbour. Amber outlines show the last avalanche.</p><p>Run it, or click the table to drop grains by hand. Watch the size chart.</p>");
});
