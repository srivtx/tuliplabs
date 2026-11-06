/* Complexity, chapter 11: evolution, one ingredient at a time.
   All 256 genomes of 8 bits, laid out on a 16×16 map in Gray-code order so that cells side by side
   (wrapping at the edges) differ by one bit. Brighter cells are fitter. Dots show where the 100
   agents are, bigger where more of them sit. Everyone starts on the worst genome.
   Each generation 20% die and are replaced by copies of survivors chosen by fitness⁸ (as in the
   chapter's run), and a copy has a 20% chance to flip one bit.
   Switch off mutation, or selection, and see which half of evolution stops working. */
VIZ.register("tc-evo", async (api) => {
  const N = 8, G = 256, POP = 100;
  let seed = 41, mode = "both", pop, gen = 0, trace = [], running = false, triedNoMut = false, reached = api.wasDone;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const one = [], zero = [];
  for (let i = 0; i < N; i++) { one.push(rnd()); zero.push(rnd()); }
  const fit = new Float64Array(G);
  for (let x = 0; x < G; x++) { let s = 0; for (let i = 0; i < N; i++) s += (x >> i) & 1 ? one[i] : zero[i]; fit[x] = s / N; }
  let best = 0, worst = 0;
  for (let x = 0; x < G; x++) { if (fit[x] > fit[best]) best = x; if (fit[x] < fit[worst]) worst = x; }
  const fLo = fit[worst], fHi = fit[best];
  const gray = (v) => v ^ (v >> 1), cell = [];
  for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) cell[(gray(r) << 4) | gray(c)] = [r, c];
  function reset() { seed = 97; pop = new Array(POP).fill(worst); gen = 0; trace = [mean()]; }
  const mean = () => pop.reduce((s, x) => s + fit[x], 0) / POP;
  function step() {
    const w = pop.map((x) => fit[x] ** 8), tot = w.reduce((a, b) => a + b, 0);
    const pick = () => {
      if (mode === "nosel") return pop[(rnd() * POP) | 0];
      let r = rnd() * tot; for (let i = 0; i < POP; i++) { r -= w[i]; if (r <= 0) return pop[i]; } return pop[POP - 1];
    };
    const next = pop.slice();
    for (let i = 0; i < POP; i++) if (rnd() < 0.2) {
      let child = pick();
      if (mode !== "nomut" && rnd() < 0.2) child ^= 1 << ((rnd() * N) | 0);
      next[i] = child;
    }
    pop = next; gen++; trace.push(mean());
  }
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const narrow = w < 560, mw = narrow ? w : Math.min(w * 0.5, h);
    const s = Math.min((mw - 12) / 16, ((narrow ? h * 0.55 : h) - 34) / 16), x0 = 6, y0 = 28;
    const count = new Map(); pop.forEach((x) => count.set(x, (count.get(x) || 0) + 1));
    for (let x = 0; x < G; x++) {
      const [r, c] = cell[x], t = (fit[x] - fLo) / (fHi - fLo);
      g.fillStyle = api.color("c3"); g.globalAlpha = 0.06 + 0.6 * t * t;
      g.fillRect(x0 + c * s, y0 + r * s, s - 1, s - 1);
    }
    g.globalAlpha = 1;
    const [br, bc] = cell[best];
    g.strokeStyle = api.color("c4"); g.lineWidth = 2; g.strokeRect(x0 + bc * s + 1, y0 + br * s + 1, s - 3, s - 3);
    for (const [x, k] of count) {
      const [r, c] = cell[x];
      g.fillStyle = api.color("c1"); g.beginPath(); g.arc(x0 + (c + 0.5) * s - 0.5, y0 + (r + 0.5) * s - 0.5, Math.min(s * 0.46, 2 + Math.sqrt(k) * 1.3), 0, 7); g.fill();
    }
    const kinds = count.size;
    g.fillStyle = api.color("ink"); g.font = "600 13px 'IBM Plex Mono', monospace"; g.textAlign = "left";
    g.fillText(`generation ${gen} · ${kinds} different genome${kinds > 1 ? "s" : ""} · ${count.get(best) || 0} on the peak`, x0, 18);
    // mean fitness over time
    const px0 = narrow ? 40 : mw + 40, px1 = w - 12, py0 = narrow ? y0 + 16 * s + 30 : 44, py1 = h - 30;
    const X = (k) => px0 + (k / Math.max(200, trace.length - 1)) * (px1 - px0), Y = (v) => py1 - ((v - fLo) / (fHi - fLo)) * (py1 - py0);
    g.strokeStyle = api.color("line"); g.lineWidth = 1; g.strokeRect(px0, py0, px1 - px0, py1 - py0);
    g.setLineDash([4, 4]); g.strokeStyle = api.color("c4"); g.beginPath(); g.moveTo(px0, Y(fHi)); g.lineTo(px1, Y(fHi)); g.stroke(); g.setLineDash([]);
    g.strokeStyle = api.color("c1"); g.lineWidth = 2; g.beginPath(); trace.forEach((v, k) => (k ? g.lineTo(X(k), Y(v)) : g.moveTo(X(k), Y(v)))); g.stroke();
    g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif"; g.textAlign = "left";
    g.fillText("mean fitness (dashed: the peak)", px0, py0 - 8);
    g.textAlign = "center"; g.fillText("generations", (px0 + px1) / 2, py1 + 16);
  });
  function report() {
    const onPeak = pop.filter((x) => x === best).length;
    const label = { both: "selection and mutation", nomut: "selection, no mutation", nosel: "mutation, no selection" }[mode];
    api.status(`${label}\ngeneration ${gen}: mean fitness ${mean().toFixed(3)} (worst ${fLo.toFixed(3)}, peak ${fHi.toFixed(3)})\n${onPeak} of ${POP} agents on the peak`);
    if (!reached && mode === "both" && triedNoMut && onPeak >= 20) {
      reached = true;
      api.explain("Both halves, together", `<p>With selection alone nothing moved: every agent is a copy of the worst genome, and copies of it are all there is to choose. With mutation alone (try <b>No selection</b>) the population spreads out and settles near average fitness, nowhere near the peak.</p><p>Together, mutation proposes and selection keeps what works, one bit at a time, and ${onPeak} agents reached the peak in ${gen} generations. Neither ingredient is evolution on its own.</p>`);
      api.done("The population climbed to the peak");
    }
  }
  api.seg([{ label: "Selection + mutation", value: "both" }, { label: "No mutation", value: "nomut" }, { label: "No selection", value: "nosel" }], mode, (v) => {
    mode = v; if (v === "nomut") triedNoMut = true; running = false; reset(); cv.redraw(); report();
    api.explain({ both: "Selection and mutation", nomut: "No mutation", nosel: "No selection" }[v], {
      both: "<p>Copies are chosen by fitness, and each copy may flip one bit.</p>",
      nomut: "<p>Copies are chosen by fitness, but they're exact. Run it and see if anything changes.</p>",
      nosel: "<p>Copies are chosen at random, whatever their fitness, and may flip a bit. The population spreads out, but does it climb?</p>",
    }[v]);
  });
  api.button("Run", async () => {
    if (running) { running = false; return; }
    running = true;
    for (let k = 0; k < 400 && running; k++) { step(); cv.redraw(); report(); await api.sleep(30); }
    running = false;
  }, { primary: true });
  api.button("Step", () => { step(); cv.redraw(); report(); });
  api.button("Start over", () => { running = false; reset(); cv.redraw(); report(); });
  reset(); report();
  api.explain("How to read this", "<p>Each square is one of the 256 genomes of 8 bits; squares side by side differ by one bit. Brighter is fitter, and the amber box is the peak. Orange dots are the population, starting together on the worst genome.</p><p>Try <b>No mutation</b> first, then put it back.</p>");
});
