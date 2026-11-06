/* Complexity, chapter 10: a jam that drives backward.
   A ring road of 200 cells. Each step every car speeds up by 1 (up to 5), slows to fit the gap to
   the car ahead, and moves. With "distracted" drivers each also brakes at random with chance 0.15.
   Top: the road now, cars coloured by speed. Below: one row per step, so time runs down and a jam
   shows as a red streak.
   Tap the brakes on one car with "perfect" drivers and the jam is yours alone. Watch which way the
   streak leans: cars drive right, but the jam moves left. */
VIZ.register("tc-jam", async (api) => {
  const L = 200, VMAX = 5, ROWS = 90;
  let n = 36, eps = 0, pos, vel, hist, steps = 0, running = false, tap = null, reached = api.wasDone, seed = 13;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  function reset() {
    pos = Array.from({ length: n }, (_, i) => Math.floor((i * L) / n)); vel = new Array(n).fill(VMAX >> 1);
    hist = []; steps = 0; tap = null; record();
  }
  function record() {
    const row = new Int8Array(L).fill(-1);
    pos.forEach((x, i) => (row[x] = vel[i]));
    hist.push(row); if (hist.length > ROWS) hist.shift();
  }
  function step(brake = -1) {
    const nv = vel.map((v, i) => {
      const gap = (pos[(i + 1) % n] - pos[i] - 1 + L) % L;
      let s = Math.min(v + 1, VMAX);
      s = Math.min(s, gap);
      if (s > 0 && rnd() < eps) s--;
      if (i === brake) s = 0;
      return s;
    });
    vel = nv; pos = pos.map((x, i) => (x + vel[i]) % L);
    steps++; record();
    if (tap) tap.t++;
  }
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const cw = (w - 12) / L, x0 = 6, roadY = 30, top = roadY + 26, rh = Math.max(2, (h - top - 8) / ROWS);
    const col = (v) => (v === 0 ? api.color("bad") : v < 3 ? api.color("c4") : api.color("c2"));
    g.fillStyle = api.color("card"); g.fillRect(x0, roadY, cw * L, 12);
    pos.forEach((x, i) => { g.fillStyle = col(vel[i]); g.fillRect(x0 + x * cw, roadY, Math.max(2, cw - 0.5), 12); });
    hist.forEach((row, r) => { for (let x = 0; x < L; x++) if (row[x] >= 0) { g.fillStyle = col(row[x]); g.fillRect(x0 + x * cw, top + r * rh, Math.max(1.5, cw), Math.max(1.5, rh)); } });
    if (tap) {
      const r = hist.length - 1 - tap.t;
      if (r >= 0) { g.strokeStyle = api.color("ink"); g.lineWidth = 1.5; g.strokeRect(x0 + tap.x * cw - 3, top + r * rh - 3, cw + 6, rh + 6); }
    }
    g.fillStyle = api.color("ink"); g.font = "600 13px 'IBM Plex Mono', monospace"; g.textAlign = "left";
    g.fillText(`step ${steps} · ${n} cars · ${vel.filter((v) => v === 0).length} stopped`, x0, 18);
    g.textAlign = "right"; g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif";
    g.fillText("cars drive →     time runs down ↓", w - 8, 18);
  });
  // how far upstream of the tap the most distant stopped car is
  function jamBack() {
    if (!tap) return 0;
    let best = 0;
    pos.forEach((x, i) => { if (vel[i] === 0) { const d = (tap.x - x + L) % L; if (d < L / 2) best = Math.max(best, d); } });
    return best;
  }
  function report() {
    const back = jamBack();
    api.status(`${n} cars on ${L} cells, ${eps ? "distracted drivers (random braking 15%)" : "perfect drivers"}\nstep ${steps}: average speed ${(vel.reduce((a, b) => a + b, 0) / n).toFixed(2)} of ${VMAX}${tap ? `\nthe jam is now ${back} cells behind where you braked` : ""}`);
    if (tap) tap.best = Math.max(tap.best, back);
    if (!reached && tap && eps === 0 && tap.best >= 25) {
      reached = true;
      api.explain("The jam drives backward", `<p>You stopped one car for one step. ${tap.t} steps later cars are still stopping <b>${tap.best} cells behind</b> that spot. Each car leaves the jam at the front and a new one joins at the back, so the jam itself moves against the traffic.</p><p>No car caused it after the first: it's a pattern passed from car to car, like the glider in Life. Switch to <b>distracted drivers</b> and jams start from nowhere.</p>`);
      api.done("A jam drove backward");
    }
  }
  api.slider("Cars on the road", { min: 10, max: 60, step: 1, value: n, format: (v) => v }, (v) => { n = v; running = false; reset(); cv.redraw(); report(); });
  api.seg([{ label: "Perfect drivers", value: 0 }, { label: "Distracted (naive)", value: 0.15 }], 0, (v) => {
    eps = +v; tap = null; cv.redraw(); report();
    api.explain(eps ? "Distracted drivers" : "Perfect drivers", eps
      ? "<p>Each step, any moving car may slow by 1 for no reason (chance 0.15). Jams now appear on their own, with nobody to blame.</p>"
      : "<p>Nobody brakes unless they have to. At a light load traffic flows freely forever, until someone taps the brakes.</p>");
  });
  api.button("Run", async () => {
    if (running) { running = false; return; }
    running = true;
    for (let k = 0; k < 600 && running; k++) { step(); cv.redraw(); report(); await api.sleep(45); }
    running = false;
  }, { primary: true });
  api.button("Tap the brakes", () => {
    const i = (rnd() * n) | 0; tap = { x: pos[i], t: -1, best: 0 }; step(i); cv.redraw(); report();
  });
  api.button("Start over", () => { running = false; reset(); cv.redraw(); report(); });
  reset();
  for (let k = 0; k < 20; k++) step();
  report();
  api.explain("How to read this", "<p>The strip at the top is the ring road now. Below, each row is one step, newest at the bottom. Blue is fast, amber slow, red stopped.</p><p>Run it with perfect drivers, then tap the brakes once and watch the red streak.</p>");
});
