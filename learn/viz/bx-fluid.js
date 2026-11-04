/* Build your own X, chapter 43: water from particles.
   Smoothed-particle hydrodynamics. There's no "water" object: only a few hundred dots. Each dot
   measures how crowded it is, and crowded dots push apart. That one idea gives you splashes,
   waves and a level surface. Pressure isn't a substance; it's what crowding feels like.
   The "why": checking every pair of dots costs n² (over a million checks a frame here). Dropping dots
   into a grid means each only checks the cells around it, more than 10 times less work, and the gap
   grows as the world gets bigger. That's the difference between a toy and a real-time fluid. */
VIZ.register("bx-fluid", async (api) => {
  const H = 16, H2 = H * H;           // a dot feels others within H pixels
  const REST = 2.6, STIFF = 520, NEAR = 1500, VISC = 0.5, G = 700;
  const MAX = 860;
  const X = new Float32Array(MAX), Y = new Float32Array(MAX), U = new Float32Array(MAX), V = new Float32Array(MAX);
  const D = new Float32Array(MAX), DN = new Float32Array(MAX), P = new Float32Array(MAX), PN = new Float32Array(MAX);
  let n = 0, w = 0, h = 0, cols = 0, rows = 0, head, nxt = new Int32Array(MAX);
  let search = "grid", pressure = true, viscous = true, pairs = 0, barrier = 0, reached = api.wasDone, stirred = 0, damOpened = false;
  let mouse = null, last = null, dam = true;

  function fill() {
    n = 0;
    const gap = H * 0.62, colsN = Math.floor((w * 0.34) / gap), rowsN = Math.floor((h * 0.86) / gap);
    for (let r = 0; r < rowsN; r++) for (let c = 0; c < colsN; c++) {
      if (n >= MAX) break;
      X[n] = 8 + c * gap + (r % 2) * 1.5; Y[n] = h - 8 - r * gap; U[n] = 0; V[n] = 0; n++;
    }
    dam = true; barrier = w * 0.36; damOpened = false; stirred = 0;
    head = null;
  }
  function index() {
    cols = Math.ceil(w / H) + 1; rows = Math.ceil(h / H) + 1;
    if (!head || head.length !== cols * rows) head = new Int32Array(cols * rows);
    head.fill(-1);
    for (let i = 0; i < n; i++) {
      const c = Math.max(0, Math.min(cols - 1, (X[i] / H) | 0)) + cols * Math.max(0, Math.min(rows - 1, (Y[i] / H) | 0));
      nxt[i] = head[c]; head[c] = i;
    }
  }
  function each(i, fn) {
    if (search === "all") {
      for (let j = i + 1; j < n; j++) { pairs++; fn(j); }
      return;
    }
    const cx = Math.max(0, Math.min(cols - 1, (X[i] / H) | 0)), cy = Math.max(0, Math.min(rows - 1, (Y[i] / H) | 0));
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox, gy = cy + oy;
      if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
      for (let j = head[gx + cols * gy]; j >= 0; j = nxt[j]) if (j > i) { pairs++; fn(j); }
    }
  }
  function step(dt) {
    pairs = 0;
    for (let i = 0; i < n; i++) {
      V[i] += G * dt;
      if (mouse) {
        const dx = X[i] - mouse[0], dy = Y[i] - mouse[1], d2 = dx * dx + dy * dy;
        if (d2 < 2600) { const f = 1 - d2 / 2600; U[i] += mouse[2] * f * 0.8; V[i] += mouse[3] * f * 0.8; }
      }
    }
    if (viscous) {
      index();
      for (let i = 0; i < n; i++) each(i, (j) => {
        const dx = X[j] - X[i], dy = Y[j] - Y[i], d2 = dx * dx + dy * dy;
        if (d2 >= H2 || d2 < 1e-6) return;
        const d = Math.sqrt(d2), q = 1 - d / H, ux = dx / d, uy = dy / d;
        const inward = (U[i] - U[j]) * ux + (V[i] - V[j]) * uy;
        if (inward > 0) {
          const I = dt * q * VISC * inward * 6;
          U[i] -= I * ux; V[i] -= I * uy; U[j] += I * ux; V[j] += I * uy;
        }
      });
    }
    const ox = new Float32Array(n), oy = new Float32Array(n);
    for (let i = 0; i < n; i++) { ox[i] = X[i]; oy[i] = Y[i]; X[i] += U[i] * dt; Y[i] += V[i] * dt; }
    index();
    if (pressure) {
      D.fill(0); DN.fill(0);
      for (let i = 0; i < n; i++) each(i, (j) => {
        const dx = X[j] - X[i], dy = Y[j] - Y[i], d2 = dx * dx + dy * dy;
        if (d2 >= H2) return;
        const q = 1 - Math.sqrt(d2) / H, q2 = q * q, q3 = q2 * q;
        D[i] += q2; D[j] += q2; DN[i] += q3; DN[j] += q3;
      });
      for (let i = 0; i < n; i++) { P[i] = STIFF * (D[i] - REST); PN[i] = NEAR * DN[i]; }
      for (let i = 0; i < n; i++) each(i, (j) => {
        const dx = X[j] - X[i], dy = Y[j] - Y[i], d2 = dx * dx + dy * dy;
        if (d2 >= H2 || d2 < 1e-6) return;
        const d = Math.sqrt(d2), q = 1 - d / H;
        const push = dt * dt * ((P[i] + P[j]) * q + (PN[i] + PN[j]) * q * q) * 0.5;
        const ax = (dx / d) * push, ay = (dy / d) * push;
        X[i] -= ax; Y[i] -= ay; X[j] += ax; Y[j] += ay;
      });
    }
    const wallR = w - 3, floor = h - 3;
    for (let i = 0; i < n; i++) {
      if (dam && X[i] > barrier) X[i] = barrier - Math.random() * 0.5;
      if (X[i] < 3) X[i] = 3 + Math.random() * 0.5;
      if (X[i] > wallR) X[i] = wallR - Math.random() * 0.5;
      if (Y[i] > floor) Y[i] = floor - Math.random() * 0.5;
      if (Y[i] < 2) Y[i] = 2;
      U[i] = (X[i] - ox[i]) / dt; V[i] = (Y[i] - oy[i]) / dt;
      const s = Math.hypot(U[i], V[i]);
      if (s > 900) { U[i] *= 900 / s; V[i] *= 900 / s; }
    }
  }

  api.wide();
  const cv = api.canvas2d((g, W, Hh) => {
    if (!n) return;
    const c2 = api.color("c2"), c1 = api.color("c1");
    for (let i = 0; i < n; i++) {
      const s = Math.min(1, Math.hypot(U[i], V[i]) / 380);
      g.fillStyle = s > 0.55 ? c1 : c2;
      g.globalAlpha = 0.5 + s * 0.5;
      g.beginPath(); g.arc(X[i], Y[i], 4.2, 0, 6.2832); g.fill();
    }
    g.globalAlpha = 1;
    if (dam) { g.fillStyle = api.color("c4"); g.fillRect(barrier, Hh * 0.04, 4, Hh * 0.96); }
  });
  cv.canvas.style.touchAction = "none";
  cv.canvas.style.cursor = "grab";
  const at = (e) => { const r = cv.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.canvas.addEventListener("pointerdown", (e) => { cv.canvas.setPointerCapture(e.pointerId); last = at(e); });
  cv.canvas.addEventListener("pointermove", (e) => {
    if (!last) return;
    const p = at(e);
    mouse = [p[0], p[1], (p[0] - last[0]) * 9, (p[1] - last[1]) * 9];
    if (damOpened) stirred += Math.hypot(p[0] - last[0], p[1] - last[1]);
    last = p;
  });
  const lift = () => { last = null; mouse = null; };
  cv.canvas.addEventListener("pointerup", lift);
  cv.canvas.addEventListener("pointercancel", lift);

  api.loop(() => {
    if (!cv.w) return;
    if (!n || cv.w !== w || cv.h !== h) { w = cv.w; h = cv.h; fill(); }
    step(1 / 90); step(1 / 90);
    mouse = last ? mouse && [mouse[0], mouse[1], mouse[2] * 0.6, mouse[3] * 0.6] : null;
    cv.redraw();
    api.hud(`${n} dots · <b>${Math.round(pairs).toLocaleString()}</b> pairs checked per pass`);
    if (!reached && damOpened && stirred > 500 && search === "grid" && pressure) {
      reached = true;
      api.done("Waves, splashes and a level surface, from dots that only know how crowded they are");
    }
  });

  const row = api.row();
  api.button("Open the dam", () => {
    if (!dam) return;
    dam = false; damOpened = true;
    api.explain("A dam break", "<p>Crowded dots at the bottom push out, and the wall of water collapses into a wave that runs along the floor and climbs the far side. No wave is written in the code. Drag through it to stir.</p>");
    api.status("Now drag on the water to stir it.");
  }, { primary: true, row });
  api.button("Reset", () => { if (w) fill(); api.status("The dam is back."); }, { row });
  api.seg([{ label: "Pressure on", value: 1 }, { label: "Pressure off", value: 0 }], 1, (v) => {
    pressure = !!v;
    api.explain(v ? "Pressure on" : "Pressure off", v
      ? "<p>Each dot adds up how close its neighbours are. Above a resting amount, it pushes them away. Water doesn't squash, and this is why.</p>"
      : "<p>Without crowding, nothing stops the dots piling into each other: they collapse into a thin sheet on the floor. All the volume of a real liquid comes from pressure.</p>");
  });
  api.seg([{ label: "Check nearby cells", value: "grid" }, { label: "Check every pair", value: "all" }], "grid", (v) => {
    search = v;
    api.explain(v === "grid" ? "A grid of cells" : "Every pair", v === "grid"
      ? "<p>Dots drop into cells the size of their reach. Each one looks only in the 9 cells around it. Look at the number on the picture: tens of thousands of pairs, not a million.</p>"
      : "<p>The obvious loop compares each dot with all the others. It gives the same water, but look at the number on the picture. Double the dots and this gets four times slower, while the grid only gets twice as slow.</p>");
  });
  api.explain("Water with no water in it", "<p>There's no code for waves or splashes here: only dots, each one measuring how crowded it is and pushing back. Press <b>Open the dam</b>, then drag on the water.</p>");
  api.status("A column of water, held back by a gate.");
});
