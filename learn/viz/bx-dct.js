/* Build your own X, chapter 48: a block of pixels is a stack of 64 waves.
   JPEG cuts a picture into 8×8 blocks and rewrites each one as a sum of 64 fixed wave patterns,
   the two-dimensional cousin of the synthesizer's bars. Nothing is lost by this step, but the
   numbers change shape: in a smooth block almost all the energy lands on a few patterns.
   The "why": keeping the same count of raw pixels looks far worse, because pixels share the load
   evenly and waves don't. And pure noise has no pattern, so no choice of waves helps: that's what
   it means for something to be incompressible. */
VIZ.register("bx-dct", async (api) => {
  const N = 8, M = 64;
  const C = []; // the orthonormal cosine table
  for (let u = 0; u < N; u++) { C[u] = []; for (let x = 0; x < N; x++) C[u][x] = u ? 0.5 * Math.cos(((2 * x + 1) * u * Math.PI) / 16) : 1 / Math.sqrt(8); }
  let seed = 9;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const noise = Array.from({ length: M }, () => 40 + rnd() * 180);
  const BLOCKS = {
    sky: (x, y) => 128 + 62 * Math.sin((x + 1.6 * y) / 6.5 - 0.8),
    edge: (x, y) => (x + y * 0.4 > 4.6 ? 205 : 62),
    noise: (x, y) => noise[y * N + x],
  };
  let which = "sky", mode = "waves", kept = 64, reached = api.wasDone, sawWaves = false;
  let px = new Float64Array(M), co = new Float64Array(M), out = new Float64Array(M), order = [], used = new Set(), match = 1;
  // pixels to keep, spread evenly: bit-reversed positions, so that any prefix covers the block
  const rev = (v) => ((v & 1) << 2) | (v & 2) | ((v & 4) >> 2);
  const spread = Array.from({ length: M }, (_, i) => i).sort((p, q) => {
    const key = (i) => { const a = rev(i % N), b = rev(i >> 3); let k = 0; for (let t = 0; t < 3; t++) k |= (((a >> (2 - t)) & 1) << (5 - 2 * t)) | (((b >> (2 - t)) & 1) << (4 - 2 * t)); return k; };
    return key(p) - key(q);
  });

  function load() {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) px[y * N + x] = BLOCKS[which](x, y);
    for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
      let s = 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) s += px[y * N + x] * C[u][x] * C[v][y];
      co[v * N + u] = s;
    }
    // the average brightness comes first, then the rest by size
    order = Array.from({ length: M }, (_, i) => i).sort((p, q) => (q === 0) - (p === 0) || Math.abs(co[q]) - Math.abs(co[p]));
  }
  function rebuild() {
    used = new Set();
    if (mode === "waves") {
      for (let i = 0; i < kept; i++) used.add(order[i]);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        let s = 0;
        for (const k of used) s += co[k] * C[k % N][x] * C[k >> 3][y];
        out[y * N + x] = s;
      }
    } else {
      const keep = spread.slice(0, kept);
      keep.forEach((k) => used.add(k));
      for (let i = 0; i < M; i++) {
        let best = keep[0], d = 1e9;
        for (const k of keep) { const e = (k % N - (i % N)) ** 2 + ((k >> 3) - (i >> 3)) ** 2; if (e < d) { d = e; best = k; } }
        out[i] = px[best];
      }
    }
    let mean = 0, err = 0, tot = 0;
    for (let i = 0; i < M; i++) mean += px[i] / M;
    for (let i = 0; i < M; i++) { err += (px[i] - out[i]) ** 2; tot += (px[i] - mean) ** 2; }
    match = Math.max(0, 1 - err / tot);
    judge();
    cv.redraw();
  }
  function judge() {
    const pc = Math.round(match * 100 - 0.5);
    api.hud(`Keeping <b>${kept}</b> of 64 ${mode === "waves" ? "waves" : "pixels"} · ${pc}% match`);
    if (which === "sky" && mode === "waves" && kept <= 8 && match >= 0.97) sawWaves = true;
    if (!reached && sawWaves && which === "sky" && mode === "pixels" && kept <= 8) {
      reached = true;
      api.done("Same count of numbers, a far better picture. Change what you store and most of it stops mattering");
      api.explain("Why waves win", `<p>Raw pixels share the load equally: drop one and you've lost one-64th of the picture. After the transform, a smooth block has nearly everything in a few numbers, and the rest are almost zero. You haven't thrown anything away yet. You've only moved it into a pile you can afford to throw away.</p><p>Now try <b>Noise</b>.</p>`);
    }
  }

  const grey = (v) => { const c = Math.round(Math.max(0, Math.min(255, v))); return `rgb(${c},${c},${c})`; };
  function lay(w, h) {
    if (w < 620) {
      const top = 46, s = Math.min((w - 12) / 2, 130), t = Math.min(h - top - s - 12, w - 40);
      return { a: { x: w / 2 - s - 6, y: top, s }, b: { x: w / 2 + 6, y: top, s }, t: { x: (w - t) / 2, y: top + s + 10, s: t } };
    }
    const top = 44, g = Math.min(h - top - 8, w * 0.42), s = Math.min((w - g - 40) / 2, h - top - 8), y = top + (h - top - 8 - s) / 2;
    return { a: { x: 0, y, s }, b: { x: w - s, y, s }, t: { x: (w - g) / 2, y: top, s: g } };
  }
  function block(g, R, data, label) {
    const c = R.s / N;
    for (let i = 0; i < M; i++) { g.fillStyle = grey(data[i]); g.fillRect(R.x + (i % N) * c, R.y + (i >> 3) * c, c + 0.5, c + 0.5); }
    g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Mono', monospace"; g.textAlign = "left";
    g.fillText(label, R.x, R.y - 6);
  }
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const L = lay(w, h);
    block(g, L.a, px, "the block");
    block(g, L.b, out, "rebuilt");
    if (mode === "pixels") {
      g.strokeStyle = api.color("c1"); g.lineWidth = 1.5;
      const c = L.a.s / N;
      for (const k of used) g.strokeRect(L.a.x + (k % N) * c + 1, L.a.y + (k >> 3) * c + 1, c - 2, c - 2);
    }
    // the 64 waves: each tile is one fixed pattern, lit if it's in use
    const T = L.t, cell = T.s / N, gap = 1.5, sub = (cell - gap) / N;
    g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Mono', monospace"; g.textAlign = "left";
    g.fillText("the 64 waves", T.x, T.y - 6);
    for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
      const on = mode === "waves" && used.has(v * N + u);
      g.globalAlpha = on ? 1 : 0.16;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const p = C[u][x] * C[v][y] * (u ? 1 : Math.SQRT2) * (v ? 1 : Math.SQRT2) * 4;
        g.fillStyle = grey(128 + p * 110);
        g.fillRect(T.x + u * cell + x * sub, T.y + v * cell + y * sub, sub + 0.4, sub + 0.4);
      }
    }
    g.globalAlpha = 1;
  });
  let ready = false;
  api.loop(() => { if (cv.w && !ready) { ready = true; load(); rebuild(); } });
  api.seg([{ label: "Smooth sky", value: "sky" }, { label: "Sharp edge", value: "edge" }, { label: "Noise", value: "noise" }], "sky", (v) => {
    which = v; load(); rebuild();
    if (v === "sky") api.explain("A smooth block", "<p>Most of a photo looks like this: gentle change. A handful of slow waves is enough.</p>");
    if (v === "edge") api.explain("A sharp edge", "<p>Corners need many waves, as you saw on the synthesizer. Drop the fast ones and the edge starts to ripple. That ripple is the fuzz you see around text in a heavily squeezed JPEG.</p>");
    if (v === "noise") api.explain("Noise", "<p>Nothing here is predictable, so the energy spreads across all 64 waves and no small set does the job. Noise can't be compressed, and it isn't because the method is weak. A pattern is what compression feeds on, and noise has none.</p>");
  });
  api.seg([{ label: "Keep waves", value: "waves" }, { label: "Keep pixels", value: "pixels" }], "waves", (v) => {
    mode = v; rebuild();
    api.status(v === "waves" ? "Waves kept in order of size, with the average brightness always first." : "Pixels kept evenly across the block, and the gaps filled from the nearest one.");
  });
  api.slider("How many to keep", { min: 1, max: 64, step: 1, value: kept }, (v) => { kept = v; if (ready) rebuild(); });
  api.explain("64 numbers, two ways", "<p>On the left is an 8×8 block of a photo. All 64 patterns in the middle, added up in the right amounts, rebuild it exactly.</p><p>Slide the number down. How few waves can you keep before it stops looking right?</p>");
  api.status("Slide down, and watch which waves stay lit.");
});
