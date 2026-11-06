/* Complexity, chapter 7: can the water get through?
   A 40×40 rock. Each cell is porous with chance q. Pour water on the top row and watch it spread
   wave by wave to porous neighbours. Right: "Test 50 rocks" adds a point, the share of fresh rocks
   at this q that let water reach the bottom.
   The twist: let water squeeze through diagonal gaps too, and the threshold drops a long way.
   The "why": near q ≈ 0.59 the answer flips from "almost never" to "almost always". */
VIZ.register("tc-perc", async (api) => {
  const N = 40;
  let q = 0.55, diag = false, seed = 21, porous, wet, front = 0, through = false, running = false, reached = api.wasDone;
  const pts = { 4: [], 8: [] };
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const rock = () => Array.from({ length: N * N }, () => rnd() < q);
  const nbrs = (i) => {
    const r = (i / N) | 0, c = i % N, out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue; if (!diag && dr && dc) continue;
      const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < N && cc >= 0 && cc < N) out.push(rr * N + cc);
    }
    return out;
  };
  // wet[i] = wave number when cell i got wet, or -1
  function flood(P) {
    const W = new Array(N * N).fill(-1), q0 = [];
    for (let c = 0; c < N; c++) if (P[c]) { W[c] = 0; q0.push(c); }
    for (let h = 0; h < q0.length; h++) for (const j of nbrs(q0[h])) if (P[j] && W[j] < 0) { W[j] = W[q0[h]] + 1; q0.push(j); }
    return W;
  }
  const reaches = (W) => { for (let c = 0; c < N; c++) if (W[(N - 1) * N + c] >= 0) return true; return false; };
  function fresh() { porous = rock(); wet = flood(porous); through = reaches(wet); front = 0; }
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const narrow = w < 560, gw = narrow ? w : Math.min(w * 0.55, h);
    const s = Math.min((gw - 12) / N, ((narrow ? h * 0.6 : h) - 34) / N), x0 = 6, y0 = 28;
    for (let i = 0; i < N * N; i++) {
      const r = (i / N) | 0, c = i % N;
      g.fillStyle = !porous[i] ? api.color("c5") : wet[i] >= 0 && wet[i] <= front ? api.color("c2") : api.color("card");
      g.fillRect(x0 + c * s, y0 + r * s, s - 0.5, s - 0.5);
    }
    const shown = through && Math.max(...wet.slice((N - 1) * N)) >= 0 && front >= Math.min(...wet.slice((N - 1) * N).filter((x) => x >= 0));
    g.fillStyle = api.color("ink"); g.font = "600 13px 'IBM Plex Mono', monospace"; g.textAlign = "left";
    g.fillText(front >= 9999 || shown ? (through ? "water got through" : "water stopped") : `wave ${front}`, x0, 18);
    if (shown) { g.fillStyle = api.color("ok"); g.fillRect(x0, y0 + N * s + 1, N * s, 3); }
    // plot
    const px0 = narrow ? 44 : gw + 40, px1 = w - 12, py0 = narrow ? y0 + N * s + 34 : 40, py1 = h - 30;
    const X = (v) => px0 + ((v - 0.3) / 0.6) * (px1 - px0), Y = (v) => py1 - v * (py1 - py0);
    g.strokeStyle = api.color("line"); g.lineWidth = 1; g.strokeRect(px0, py0, px1 - px0, py1 - py0);
    g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif"; g.textAlign = "center";
    for (const t of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) g.fillText(t, X(t), py1 + 14);
    g.fillText("q, chance a cell is porous", (px0 + px1) / 2, py1 + 27);
    g.textAlign = "right"; for (const t of [0, 0.5, 1]) g.fillText(t * 100 + "%", px0 - 4, Y(t) + 4);
    g.textAlign = "left"; g.fillText("share of rocks that let water through", px0 + 2, py0 - 8);
    g.strokeStyle = api.color("c4"); g.lineWidth = 2; g.beginPath(); g.moveTo(X(q), py0); g.lineTo(X(q), py1); g.stroke();
    for (const k of [4, 8]) {
      const s2 = pts[k].slice().sort((a, b) => a[0] - b[0]), col = k === 4 ? api.color("c2") : api.color("c1");
      g.strokeStyle = g.fillStyle = col; g.lineWidth = 2; g.globalAlpha = (k === 8) === diag ? 1 : 0.45;
      g.beginPath(); s2.forEach(([a, b], i) => (i ? g.lineTo(X(a), Y(b)) : g.moveTo(X(a), Y(b)))); g.stroke();
      s2.forEach(([a, b]) => { g.beginPath(); g.arc(X(a), Y(b), 3.5, 0, 7); g.fill(); });
      g.globalAlpha = 1;
    }
  });
  function report(extra = "") {
    const n = porous.filter(Boolean).length;
    api.status(`q = ${q.toFixed(2)}: ${n} of ${N * N} cells porous\nwater moves ${diag ? "in 8 directions (diagonals too)" : "up, down, left, right"}${extra}`);
  }
  async function pour() {
    if (running) return; running = true;
    const last = Math.max(...wet);
    for (front = 0; front <= last && running; front++) { cv.redraw(); await api.sleep(18); }
    front = 9999; running = false; cv.redraw();
    report(`\nthis rock: ${through ? "water got through" : "water stopped"}`);
  }
  function test() {
    let k = 0; const saveP = porous, saveW = wet;
    for (let t = 0; t < 50; t++) if (reaches(flood(rock()))) k++;
    porous = saveP; wet = saveW;
    const key = diag ? 8 : 4;
    pts[key] = pts[key].filter((p) => Math.abs(p[0] - q) > 0.004); pts[key].push([q, k / 50]);
    cv.redraw(); report(`\n50 rocks: ${k} let water through`);
    const lo = pts[4].find((p) => p[0] <= 0.55 && p[1] < 0.3), hi = pts[4].find((p) => p[0] >= 0.63 && p[1] > 0.7);
    if (!reached && lo && hi) {
      reached = true;
      api.explain("A critical point", `<p>At q = ${lo[0].toFixed(2)}, ${Math.round(lo[1] * 100)}% of rocks let water through. At q = ${hi[0].toFixed(2)}, ${Math.round(hi[1] * 100)}% did. The flip happens around <b>q ≈ 0.59</b>, and gets sharper on bigger rocks.</p><p>Right at that point the wet region is a fractal: holes inside holes at every size. Try the <b>Diagonals too</b> twist and see the threshold move.</p>`);
      api.done("Found both sides of the percolation threshold");
    }
  }
  api.slider("Porosity, q", { min: 0.3, max: 0.9, step: 0.01, value: q, format: (v) => v.toFixed(2) }, (v) => { q = v; running = false; fresh(); front = 9999; cv.redraw(); report(); });
  api.seg([{ label: "4 directions", value: "4" }, { label: "Diagonals too", value: "8" }], "4", (v) => {
    diag = v === "8"; running = false; fresh(); front = 9999; cv.redraw(); report();
    api.explain(diag ? "Diagonals too" : "4 directions", diag
      ? "<p>Now water squeezes between two cells that only touch at a corner. Every rock has more paths, so it percolates at a much lower q, near 0.41. The rule for <b>neighbour</b> sets where the tipping point sits.</p>"
      : "<p>Water moves only to cells sharing an edge. The threshold is near 0.59.</p>");
  });
  api.button("Pour", pour, { primary: true });
  api.button("Test 50 rocks", test);
  api.button("New rock", () => { running = false; fresh(); front = 9999; cv.redraw(); report(); });
  fresh(); front = 9999; report();
  api.explain("How to read this", "<p>Grey cells are solid, dark cells are porous. Pour, and blue water spreads one wave at a time from the top row.</p><p>Then test many rocks at a few values of q, below and above 0.6, and look at the curve.</p>");
});
