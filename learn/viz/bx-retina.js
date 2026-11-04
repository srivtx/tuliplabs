/* Build your own X, chapter 47: your eye filters the world before you see it.
   Cells in the retina compare themselves with their neighbours: light in the centre excites, light
   around it inhibits. It's the "sharpen" kernel, built from neurons. So you don't see brightness,
   you see brightness compared with what's around it.
   The "why": the optic nerve has about 1 million fibres for over 100 million light sensors, so the
   eye can't send everything. Sending differences compresses the image, and it costs you the truth:
   two identical greys look different, and flat bands appear to have glowing edges. */
VIZ.register("bx-retina", async (api) => {
  const STEPS = 8, MID = 0.52, DARK = 0.14, LIGHT = 0.88, COVER = 0.3;
  let scene = "greys", reach = 34, covered = false, guess = null, reached = api.wasDone;
  let line = null, signal = null;

  function squares(w, h) {
    const s = Math.min(h * 0.5, w * 0.16);
    return [{ x: w * 0.25 - s / 2, s }, { x: w * 0.75 - s / 2, s }];
  }
  function scan(w, h) {
    const b = new Float32Array(w), sq = squares(w, h);
    for (let x = 0; x < w; x++) {
      if (scene === "steps") b[x] = 0.16 + 0.68 * (Math.floor((x / w) * STEPS) / (STEPS - 1));
      else b[x] = sq.some((q) => x >= q.x && x < q.x + q.s) ? MID : covered ? COVER : x < w / 2 ? DARK : LIGHT;
    }
    return b;
  }
  function compute(w, h) {
    line = scan(w, h);
    // the surround: a Gaussian-weighted average of the neighbours, as wide as the slider says
    const R = Math.ceil(reach * 2.5), kern = [];
    let tot = 0;
    for (let i = -R; i <= R; i++) { const v = Math.exp(-(i * i) / (2 * reach * reach)); kern.push(v); tot += v; }
    signal = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -R; i <= R; i++) s += line[Math.max(0, Math.min(w - 1, x + i))] * kern[i + R];
      signal[x] = line[x] + 1.3 * (line[x] - s / tot);
    }
  }
  const grey = (v) => { const c = Math.round(Math.max(0, Math.min(1, v)) * 255); return `rgb(${c},${c},${c})`; };

  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const picH = Math.round(h * 0.54), rule = api.color("line");
    compute(Math.max(2, Math.floor(w)), picH);
    if (scene === "steps") {
      for (let x = 0; x < w; x++) { g.fillStyle = grey(line[Math.min(line.length - 1, x)]); g.fillRect(x, 0, 1.5, picH); }
    } else {
      if (covered) { g.fillStyle = grey(COVER); g.fillRect(0, 0, w, picH); }
      else { g.fillStyle = grey(DARK); g.fillRect(0, 0, w / 2, picH); g.fillStyle = grey(LIGHT); g.fillRect(w / 2, 0, w / 2, picH); }
      g.fillStyle = grey(MID);
      for (const q of squares(w, picH)) g.fillRect(q.x, (picH - q.s) / 2, q.s, q.s);
    }
    // the graph
    const gy = picH + 26, gh = h - gy - 6, lo = scene === "steps" ? -0.05 : -0.45, hi = scene === "steps" ? 1.05 : 1.45, Y = (v) => gy + gh - ((v - lo) / (hi - lo)) * gh;
    g.strokeStyle = rule; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, Y(0) + 0.5); g.lineTo(w, Y(0) + 0.5); g.stroke();
    const plot = (arr, col, lw) => {
      g.strokeStyle = col; g.lineWidth = lw; g.beginPath();
      for (let x = 0; x < arr.length; x++) x ? g.lineTo(x, Y(arr[x])) : g.moveTo(0, Y(arr[0]));
      g.stroke();
    };
    plot(line, api.color("c2"), 1.8);
    plot(signal, api.color("c1"), 2);
    g.font = "11px 'IBM Plex Mono', monospace"; g.textAlign = "left";
    g.fillStyle = api.color("c2"); g.fillText("true brightness", 0, picH + 16);
    g.fillStyle = api.color("c1"); g.fillText("what the retina sends", 128, picH + 16);
  });

  function tellGuess(v) {
    guess = v;
    api.status("Now press Cover the surroundings.");
    api.explain(v === "same" ? "You've seen this before" : "That's what nearly everyone sees", "<p>Look at the red line under the picture. It's what cells in your retina report, and it's higher for the left square. Now press <b>Cover the surroundings</b>.</p>");
  }
  const row = api.row();
  api.button("Left looks lighter", () => { if (scene === "greys") tellGuess("left"); }, { row });
  api.button("Right looks lighter", () => { if (scene === "greys") tellGuess("right"); }, { row });
  api.button("They match", () => { if (scene === "greys") tellGuess("same"); }, { row });
  const row2 = api.row();
  const cover = api.button("Cover the surroundings", () => {
    if (scene !== "greys") return;
    covered = !covered;
    cover.textContent = covered ? "Bring them back" : "Cover the surroundings";
    cv.redraw();
    if (covered) {
      api.explain("The same grey", "<p>The squares are exactly the same grey, and the blue line proves it: it's level across both. Your eye never reported the grey. It reported the <b>difference</b> from the surroundings.</p><p>Now switch to <b>Steps</b>.</p>");
      api.status("Identical. Press the button again to watch them change back.");
      if (guess && !reached) { reached = true; api.done("You don't see brightness. You see differences, because your retina is running a filter"); }
    }
  }, { row: row2, primary: true });
  api.seg([{ label: "Two greys", value: "greys" }, { label: "Steps", value: "steps" }], "greys", (v) => {
    scene = v;
    covered = false; cover.textContent = "Cover the surroundings";
    if (v === "steps") {
      api.explain("Edges that aren't there", "<p>Each band is one flat grey: the blue line is level on every step. Yet each band seems darker along one edge and lighter along the other. Those stripes are <b>Mach bands</b>, named after Ernst Mach, who described them in 1865.</p><p>The red line shows why. It's the retina's sharpen filter overshooting at each step. You're seeing the filter itself.</p>");
      api.status("Move the slider to change how far the neighbours reach.");
    } else {
      api.explain("Two squares", "<p>Which square looks lighter?</p>");
      api.status("Which square looks lighter?");
    }
    cv.redraw();
  });
  api.slider("How far neighbours reach", { min: 3, max: 50, step: 1, value: reach }, (v) => { reach = v; cv.redraw(); });
  api.explain("Two squares", "<p>Each cell in your retina compares its own light with the light around it. Which square looks lighter? Pick one, and then test it.</p>");
  api.status("Which square looks lighter?");
});
