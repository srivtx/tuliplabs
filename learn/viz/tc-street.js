/* Complexity, chapter 1: Schelling's street.
   80 houses in a row, red and blue households and a few empty lots. Each household looks two
   houses either side and is unhappy if fewer than a share t of its neighbours are its own colour.
   Unhappy households move to a random empty lot. Every step adds a row below, so time runs down
   the picture and you watch the street sort itself.
   The "why": nobody wants to live apart. Even t = 0.4, "I'm fine being outnumbered", sorts the
   street into long blocks. Moving at random (the naive comparison) leaves it mixed. */
VIZ.register("tc-street", async (api) => {
  const N = 80, R = 2, ROWS = 60;
  let street, history, t = 0.4, mode = "unhappy", steps = 0, seed = 3, reached = api.wasDone, running = false;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  function reset() {
    seed = 3;
    street = Array.from({ length: N }, () => (rnd() < 0.1 ? 0 : rnd() < 0.5 ? 1 : 2));
    history = [street.slice()]; steps = 0;
  }
  function likeShare(i, arr = street) {
    let like = 0, all = 0;
    for (let d = -R; d <= R; d++) {
      if (!d) continue;
      const v = arr[(i + d + N) % N];
      if (v) { all++; if (v === arr[i]) like++; }
    }
    return all ? like / all : 1;
  }
  const unhappy = () => street.map((v, i) => v && likeShare(i) < t);
  const segregation = () => { let s = 0, n = 0; street.forEach((v, i) => { if (v) { s += likeShare(i); n++; } }); return s / n; };
  function step() {
    const u = unhappy(), movers = [];
    street.forEach((v, i) => { if (v && (mode === "random" ? rnd() < 0.15 : u[i])) movers.push(i); });
    for (const i of movers) {
      const empties = street.map((v, j) => (v ? -1 : j)).filter((j) => j >= 0);
      const j = empties[(rnd() * empties.length) | 0];
      street[j] = street[i]; street[i] = 0;
    }
    history.push(street.slice()); if (history.length > ROWS) history.shift();
    steps++;
    return movers.length;
  }
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    if (!street) return;
    const cw = w / N, top = 34, rh = Math.max(2, (h - top - 8) / ROWS);
    const col = [api.color("card"), api.color("c1"), api.color("c2")];
    history.forEach((row, r) => row.forEach((v, i) => { g.fillStyle = col[v]; g.fillRect(i * cw, top + r * rh, cw + 0.5, rh + 0.5); }));
    const u = unhappy();
    g.strokeStyle = api.color("c4"); g.lineWidth = 2;
    street.forEach((v, i) => { if (u[i]) g.strokeRect(i * cw + 1, top + (history.length - 1) * rh - 1, cw - 2, rh + 2); });
    g.fillStyle = api.color("ink"); g.font = "600 13px 'IBM Plex Mono', monospace"; g.textAlign = "left";
    g.fillText(`step ${steps}  ·  like neighbours ${(segregation() * 100).toFixed(0)}%  ·  unhappy ${u.filter(Boolean).length}`, 8, 20);
    g.textAlign = "right"; g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif";
    g.fillText("time runs down ↓", w - 8, 20);
  });
  function report(moved) {
    const seg = segregation();
    api.status(`wants at least ${Math.round(t * 100)}% like neighbours (within ${R} houses)\nstep ${steps}: ${moved} moved\nshare of like neighbours: ${(seg * 100).toFixed(0)}%  (a random street is about 50%)`);
    if (!reached && mode === "unhappy" && t <= 0.5 && moved === 0 && steps > 0 && seg >= 0.75) {
      reached = true;
      api.explain("Mild wishes, a sorted street", `<p>Nobody asked to be in the majority: each household was happy as long as ${Math.round(t * 100)}% of its neighbours matched. Yet the street settled at <b>${(seg * 100).toFixed(0)}%</b> like neighbours.</p><p>That gap between what each agent wants and what the whole street does is the chapter's subject: <b>emergence</b>.</p>`);
      api.done("A street sorted itself, and nobody wanted it to");
    }
  }
  api.slider("Like neighbours wanted, t", { min: 0, max: 0.8, step: 0.05, value: t, format: (v) => Math.round(v * 100) + "%" }, (v) => { t = v; cv.redraw(); report(0); });
  api.seg([{ label: "Unhappy ones move", value: "unhappy" }, { label: "Random moves (naive)", value: "random" }], mode, (v) => {
    mode = v;
    api.explain(v === "random" ? "Moving at random" : "Only the unhappy move", v === "random"
      ? "<p>Households move by chance, whatever their neighbours. The street stays mixed, near 50%. So the sorting isn't caused by moving. It's caused by <b>who</b> moves.</p>"
      : "<p>A household moves only if fewer than t of its neighbours share its colour. Each move changes the neighbourhoods it leaves and joins, which can make others unhappy in turn.</p>");
  });
  api.button("Step", () => { report(step()); cv.redraw(); }, { primary: true });
  api.button("Run", async () => {
    if (running) return; running = true;
    for (let k = 0; k < 80 && running; k++) { const m = step(); cv.redraw(); report(m); if (!m && mode === "unhappy") break; await api.sleep(90); }
    running = false;
  });
  api.button("New street", () => { running = false; reset(); cv.redraw(); report(0); });
  reset(); report(0);
  api.explain("How to read this", "<p>Each column is a house: red, blue, or an empty lot. Every step adds a row underneath, so you read time downwards and the bottom row is the street now. Unhappy households are outlined in amber.</p><p>Set how picky households are, then Run.</p>");
});
