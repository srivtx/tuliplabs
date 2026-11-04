/* Build your own X, chapter 49: turning a letter into pixels.
   The outline is exact, and the screen is a coarse grid. Testing only the centre of each pixel gives
   jagged steps. Measuring how much of each pixel the shape covers, and using grey for the part-way
   ones, tricks your eye into seeing edges that fall between pixels.
   The "why": at small sizes coverage alone goes soft, because a stem can straddle two pixels and
   turn into two grey columns. Nudging the outline so that stems land on whole pixels is called
   hinting. And the hole in the letter comes from counting crossings with direction: filling between
   the outer edges would plug it. */
VIZ.register("bx-raster", async (api) => {
  const OUTER = [[12, 0], [55, 0], ["q", 88, 0, 88, 28], ["q", 88, 52, 62, 56], [90, 100], [66, 100], [40, 58], [34, 58], [34, 100], [12, 100]];
  const INNER = [[34, 18], [34, 41], [52, 41], ["q", 66, 41, 66, 29], ["q", 66, 18, 52, 18]];
  function flat(c) {
    const pts = [];
    let last = null;
    for (const s of c) {
      if (s[0] === "q") {
        for (let i = 1; i <= 8; i++) { const u = i / 8, v = 1 - u; pts.push([v * v * last[0] + 2 * v * u * s[1] + u * u * s[3], v * v * last[1] + 2 * v * u * s[2] + u * u * s[4]]); }
        last = [s[3], s[4]];
      } else { pts.push(s); last = s; }
    }
    return pts;
  }
  const PATHS = [flat(OUTER), flat(INNER)];
  let rows = 28, mode = "centre", hole = "wind", hint = false, shift = 0, reached = api.wasDone, sawCentre = false, sawSoft = false;

  // Maps the letter's own units (0 to 100 tall) onto pixels. Hinting moves the stem onto whole pixels.
  function mapper() {
    const s = rows / 100;
    if (!hint) return { sx: s, ox: shift + 1, sy: s };
    const stem = Math.max(1, Math.round(22 * s)), sx = stem / 22;
    return { sx, ox: Math.round(shift + 1 + 12 * s) - 12 * sx, sy: s };
  }
  function winding(x, y) {
    let w = 0;
    for (const p of PATHS) for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      if ((a[1] <= y) !== (b[1] <= y)) {
        const cx = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
        if (cx > x) w += b[1] > a[1] ? 1 : -1;
      }
    }
    return w;
  }
  function inside(x, y) {
    if (hole === "wind") return winding(x, y) !== 0;
    // the naive fill: anything between the outer contour's edges, so the hole is lost
    let c = 0; const p = PATHS[0];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      if ((a[1] <= y) !== (b[1] <= y)) { const cx = a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]); if (cx > x) c++; }
    }
    return c % 2 === 1;
  }
  function sample(px, py, m, n) { // share of this pixel (or of part of it) inside the letter
    let hit = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (inside((px + (i + 0.5) / n - m.ox) / m.sx, (py + (j + 0.5) / n) / m.sy)) hit++;
    }
    return hit / (n * n);
  }
  function stripe(px, py, m, k) { // one third of a pixel, for the coloured stripes
    let hit = 0;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 2; i++) {
      if (inside((px + (k + (i + 0.5) / 2) / 3 - m.ox) / m.sx, (py + (j + 0.5) / 4) / m.sy)) hit++;
    }
    return hit / 8;
  }
  const shade = (v) => Math.round(255 * (1 - v));
  function pixel(px, py, m) {
    if (mode === "centre") { const v = inside((px + 0.5 - m.ox) / m.sx, (py + 0.5) / m.sy) ? 1 : 0; return [shade(v), shade(v), shade(v)]; }
    if (mode === "cover") { const c = shade(sample(px, py, m, 4)); return [c, c, c]; }
    return [shade(stripe(px, py, m, 0)), shade(stripe(px, py, m, 1)), shade(stripe(px, py, m, 2))];
  }

  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const m = mapper(), cols = Math.ceil(rows * 0.98) + 3, top = 26, previewW = w < 560 ? 0 : Math.min(150, w * 0.22);
    const space = w - previewW - (previewW ? 20 : 0), cell = Math.min((h - top - (previewW ? 8 : 58)) / rows, space / cols);
    const gw = cell * cols, gh = cell * rows, gx = (space - gw) / 2, gy = top;
    const muted = api.color("muted");
    const data = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const c = pixel(x, y, m); data.push(c);
      g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      g.fillRect(gx + x * cell, gy + y * cell, cell + 0.5, cell + 0.5);
    }
    if (cell >= 7) {
      g.strokeStyle = "rgba(128,128,128,.35)"; g.lineWidth = 1; g.beginPath();
      for (let x = 0; x <= cols; x++) { g.moveTo(gx + x * cell, gy); g.lineTo(gx + x * cell, gy + gh); }
      for (let y = 0; y <= rows; y++) { g.moveTo(gx, gy + y * cell); g.lineTo(gx + gw, gy + y * cell); }
      g.stroke();
    }
    // the true outline, on top
    g.strokeStyle = api.color("c1"); g.lineWidth = 1.6;
    for (const p of PATHS) {
      g.beginPath();
      p.forEach((q, i) => { const X = gx + (q[0] * m.sx + m.ox) * cell, Y = gy + q[1] * m.sy * cell; i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
      g.closePath(); g.stroke();
    }
    // true size: one screen dot per pixel
    const bx = previewW ? space + 20 : (w - cols * 3) / 2, by = previewW ? top + 16 : gy + gh + 22;
    g.fillStyle = "#fff"; g.fillRect(bx - 6, by - 6, cols * 3 + 12, rows + 12);
    for (let r = 0; r < 3; r++) for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const c = data[y * cols + x];
      g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      g.fillRect(bx + r * cols + x, by + y, 1, 1);
    }
    g.fillStyle = muted; g.font = "11px 'IBM Plex Mono', monospace"; g.textAlign = "left";
    g.fillText("at real size", bx - 6, by - 11);
    api.hud(`<b>${rows}</b> pixels tall`);
  });
  let first = true;
  api.loop(() => { if (cv.w && first) { first = false; cv.redraw(); } });
  function judge() {
    if (rows <= 12 && mode === "centre") sawCentre = true;
    if (rows <= 12 && mode === "cover" && !hint) sawSoft = true;
    if (!reached && sawCentre && sawSoft && rows <= 12 && mode === "cover" && hint) {
      reached = true;
      api.done("Crisp at 12 pixels. A readable small letter is a negotiation between the true shape and the grid");
      api.explain("Hinting", "<p>The stem now fills whole pixels instead of smearing across two, so it stays dark and sharp. The letter is very slightly the wrong shape, on purpose. At this size being readable beats being accurate, and designers spent years writing these adjustments by hand.</p>");
    }
    cv.redraw();
  }
  api.seg([{ label: "Test the centre", value: "centre" }, { label: "Measure coverage", value: "cover" }, { label: "Coloured stripes", value: "stripes" }], "centre", (v) => {
    mode = v; judge();
    if (v === "centre") api.explain("Yes or no", "<p>Each pixel asks one question: is my centre inside the letter? Every pixel is black or white, so diagonals and curves turn into stairs. It's aliasing again, the same thing as the sound that folded down in chapter 46.</p>");
    if (v === "cover") api.explain("How much?", "<p>Each pixel asks how much of it is covered, and goes that shade of grey. An edge that lands 30% of the way across a pixel is drawn as 30% grey, so your eye places it <b>between</b> the pixels. Grey buys you position you don't have.</p>");
    if (v === "stripes") api.explain("Three lights per pixel", "<p>Each pixel on many screens is a red, a green and a blue stripe, side by side. Light them separately and you get three times the sideways detail. Zoomed in it's full of coloured fringes, but at real size your eye blends them. This is how text got sharper on flat screens, before pixels got small enough to make it matter less.</p>");
  });
  api.seg([{ label: "True outline", value: 0 }, { label: "Snap to pixels", value: 1 }], 0, (v) => {
    hint = !!v; judge();
    api.status(v ? "The stem's edges are now moved onto whole pixels." : "The outline is exact, wherever it falls.");
  });
  api.seg([{ label: "Count crossings", value: "wind" }, { label: "Outer edge only", value: "outer" }], "wind", (v) => {
    hole = v; cv.redraw();
    api.explain(v === "wind" ? "Count crossings" : "Outer edge only", v === "wind"
      ? "<p>From a point, look to the right and count the outline's crossings: +1 for one direction and −1 for the other. The hole's outline runs the opposite way, so inside it the count returns to 0.</p>"
      : "<p>Fill everything inside the outer shape and the hole is gone. That's why an inner outline in a font has to run the opposite way round.</p>");
  });
  api.slider("Pixels tall", { min: 8, max: 40, step: 1, value: rows }, (v) => { rows = v; judge(); });
  api.slider("Slide the letter sideways", { min: 0, max: 1, step: 0.05, value: 0, format: (v) => `${v.toFixed(2)} px` }, (v) => { shift = v; cv.redraw(); });
  api.explain("A curve meets a grid", "<p>The red line is the letter's exact outline. Your screen can only light up squares. Bring <b>Pixels tall</b> down to 12 and see what's left of it.</p>");
  api.status("Bring the letter down to 12 pixels tall.");
});
