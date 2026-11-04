/* Build your own X, chapter 44: the jam with no cause.
   22 cars on a circular road, like the 2008 experiment in Japan. No crash, no lights, no bottleneck.
   Each driver follows the car ahead with a small delay and a little unsteadiness, and after a while
   a stop-and-go wave appears from nothing and rolls backward round the ring.
   The "why": a small brake gets copied, slightly harder, by the driver behind, so the disturbance
   grows as it passes along the line. The cure isn't faster reactions. One car that holds a steady
   average speed and leaves a gap absorbs each wave instead of copying it, and the whole ring smooths
   out. The picture on the right shows it: every car moves up, while the red stripes slide down. */
VIZ.register("bx-traffic", async (api) => {
  const L = 230, LEN = 4.5, V0 = 12, A = 0.5, B = 1.5, T = 1.6, S0 = 2, NOISE = 0.8, DT = 0.05;
  let N = 22, x, v, brake, smart = false, avg = 3, t = 0, jammed = false, calm = 0, reached = api.wasDone, spread = 0, stopped = 0;
  let strip, sctx;
  const gauss = () => Math.sqrt(-2 * Math.log(Math.random() + 1e-9)) * Math.cos(6.2832 * Math.random());
  function start() {
    x = []; v = []; brake = [];
    for (let i = 0; i < N; i++) { x[i] = (i * L) / N; v[i] = 3; brake[i] = 0; }
    avg = 3; t = 0; calm = 0; jammed = false;
    if (sctx) sctx.clearRect(0, 0, strip.width, strip.height);
  }
  function gapOf(i) { let g = x[(i + 1) % N] - x[i] - LEN; if (g < -L / 2) g += L; return Math.max(g, 0.1); }
  function step() {
    const acc = [];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, gap = gapOf(i), dv = v[i] - v[j];
      const want = S0 + Math.max(0, v[i] * T + (v[i] * dv) / (2 * Math.sqrt(A * B)));
      let a = A * (1 - (v[i] / V0) ** 4 - (want / gap) ** 2) + NOISE * gauss() * Math.sqrt(1 / DT) * 0.1;
      if (smart && i === 0) {
        avg += ((v[0] - avg) * DT) / 25;
        const target = Math.min(avg, gap / 1.2);
        a = Math.max(-3, Math.min(1, (target - v[0]) * 0.6));
        if (gap < 3) a = -3;
      }
      if (brake[i] > 0) { a = -3; brake[i] -= DT; }
      acc[i] = a;
    }
    for (let i = 0; i < N; i++) { v[i] = Math.max(0, v[i] + acc[i] * DT); x[i] = (x[i] + v[i] * DT) % L; }
    t += DT;
  }
  const mix = (a, b, k) => a.map((c, i) => Math.round(c + (b[i] - c) * k));
  const heat = (s) => { const k = Math.min(1, s / 2); return `rgb(${mix([232, 72, 56], [63, 170, 110], k).join(",")})`; };

  api.wide();
  let ring = { cx: 0, cy: 0, r: 0 };
  const cv = api.canvas2d((g, w, h) => {
    if (!x) return;
    const narrow = w < 520, left = narrow ? Math.min(w, h * 0.56) : Math.min(h, w * 0.46), r = left / 2 - 26;
    ring = { cx: narrow ? w / 2 : left / 2 + 4, cy: narrow ? left / 2 : h / 2, r };
    g.strokeStyle = api.color("line"); g.lineWidth = 26;
    g.beginPath(); g.arc(ring.cx, ring.cy, r, 0, 6.2832); g.stroke();
    for (let i = 0; i < N; i++) {
      const th = (x[i] / L) * 6.2832 - Math.PI / 2, cx = ring.cx + Math.cos(th) * r, cy = ring.cy + Math.sin(th) * r;
      g.save(); g.translate(cx, cy); g.rotate(th + Math.PI / 2);
      g.fillStyle = smart && i === 0 ? api.color("c4") : heat(v[i]);
      g.fillRect(-(LEN / L) * 3.14 * r, -8, (LEN / L) * 6.28 * r, 16);
      g.restore();
    }
    g.textAlign = "center"; g.fillStyle = api.color("ink"); g.font = "600 22px 'IBM Plex Mono', monospace";
    g.fillText(`${stopped}`, ring.cx, ring.cy + 2);
    g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif";
    g.fillText(stopped === 1 ? "car nearly stopped" : "cars nearly stopped", ring.cx, ring.cy + 18);
    // the time and position picture
    const px = narrow ? 12 : left + 34, pw = w - px - 12, py = narrow ? left + 4 : 20, ph = h - py - 24;
    if (!strip || strip.width !== Math.floor(pw) || strip.height !== Math.floor(ph)) {
      strip = document.createElement("canvas"); strip.width = Math.max(10, Math.floor(pw)); strip.height = Math.max(10, Math.floor(ph)); sctx = strip.getContext("2d");
    }
    g.drawImage(strip, px, py);
    g.strokeStyle = api.color("line"); g.lineWidth = 1; g.strokeRect(px - 0.5, py - 0.5, strip.width + 1, strip.height + 1);
    g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Sans', sans-serif"; g.textAlign = "left";
    g.fillText("each car's path: up is forward, right is time", px, h - 8);
  });
  cv.canvas.style.cursor = "pointer";
  cv.canvas.addEventListener("pointerdown", (e) => {
    if (!x) return;
    const b = cv.canvas.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top;
    const d = Math.hypot(mx - ring.cx, my - ring.cy);
    if (Math.abs(d - ring.r) > 34) return;
    let th = Math.atan2(my - ring.cy, mx - ring.cx) + Math.PI / 2;
    if (th < 0) th += 6.2832;
    const pos = (th / 6.2832) * L;
    let best = 0, bd = 1e9;
    for (let i = 0; i < N; i++) { const q = Math.min(Math.abs(x[i] - pos), L - Math.abs(x[i] - pos)); if (q < bd) { bd = q; best = i; } }
    brake[best] = 1;
    api.explain("You tapped the brakes", "<p>One driver slowed for a moment. Watch the car behind react a little late and a little harder, then the next. The car that started it is long gone by the time the wave reaches the last driver.</p>");
  });
  let frame = 0;
  api.loop((dt) => {
    if (!cv.w) return;
    if (!x) start();
    const steps = Math.max(1, Math.min(30, Math.round(dt * 360)));   // 18 road-seconds per real second
    for (let k = 0; k < steps; k++) step();
    const m = v.reduce((p, c) => p + c, 0) / N;
    spread = Math.sqrt(v.reduce((p, c) => p + (c - m) ** 2, 0) / N);
    stopped = v.filter((s) => s < 0.4).length;
    if (sctx && (frame++ % 2 === 0)) {
      const W = strip.width, H = strip.height;
      sctx.globalCompositeOperation = "copy"; sctx.drawImage(strip, -1, 0);
      sctx.globalCompositeOperation = "source-over";
      for (let i = 0; i < N; i++) { sctx.fillStyle = smart && i === 0 ? "#f2b632" : heat(v[i]); sctx.fillRect(W - 2, H - (x[i] / L) * H - 1, 2, 2); }
    }
    if (!smart && spread > 1.6) jammed = true;
    if (smart && jammed && spread < 0.6) calm += steps * DT; else if (spread >= 0.6) calm = 0;
    if (!reached && smart && jammed && calm > 25) {
      reached = true;
      api.done("One patient car out of 22 dissolved a jam nobody caused. A real road trial saw the same thing");
    }
    cv.redraw();
    api.status(jammed && smart ? `speed spread ${spread.toFixed(1)}: ${spread < 0.6 ? "the wave is gone" : "the smart car is soaking it up"}` : spread > 1.6 ? `speed spread ${spread.toFixed(1)}: a jam, with no cause` : `speed spread ${spread.toFixed(1)}: flowing, for now`);
  });
  api.seg([{ label: "All human drivers", value: 0 }, { label: "One smart car", value: 1 }], 0, (val) => {
    smart = !!val;
    if (smart) avg = v ? v.reduce((p, c) => p + c, 0) / N : 3;
    api.explain(smart ? "One smart car" : "All human drivers", smart
      ? "<p>The amber car ignores the stop-and-go ahead. It holds the <b>average</b> speed of the last while and lets the gap in front of it grow and shrink. Each wave reaching it dies in that gap, so nothing passes to the driver behind.</p>"
      : "<p>Each driver matches the car in front with a slight delay and a little unsteadiness. Nobody is doing anything wrong, and a jam still forms. Give it about ten seconds.</p>");
  });
  const row = api.row();
  api.button("Start again", () => { if (x) start(); }, { row });
  api.slider("Cars on the road", { min: 14, max: 26, value: 22 }, (val) => { N = val; start(); });
  api.explain("A jam with no cause", "<p>No crash, no lights, no bottleneck: only 22 cars on a loop, the same setup as a real experiment in Japan in 2008. Wait for red to appear, or tap a car to brake it. In the picture on the right, see which way the red stripes move.</p>");
});
