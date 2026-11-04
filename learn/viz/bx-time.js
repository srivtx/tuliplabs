/* Build your own X, chapter 43: why time only runs forward.
   A box of gas. Every particle obeys laws that work equally well backward, and this simulation
   really is exactly reversible: positions are whole numbers and the update
   x[n+1] = 2 x[n] - x[n-1] + round(force) reads the same in both directions, so no rounding error
   exists. Press Reverse and every collision undoes itself and the gas walks back into its corner.
   The "why": nothing in the laws makes the mixed state special. There are simply far more mixed
   arrangements than tidy ones. Reversal only works if every particle is exact: nudge one by the
   smallest possible step and the error doubles again and again (chaos), and the gas never gets
   home. That is the arrow of time: the laws don't have one, but knowing the past exactly is
   impossible. */
VIZ.register("bx-time", async (api) => {
  const N = 240, L = 2 ** 36;          // box size in lattice units (whole numbers, exact in a double)
  const R = L / 32;                    // particles repel inside this distance
  const R2 = R * R, CELL = R, GRID = Math.ceil(L / CELL);
  const WALL = R * 0.5;
  const K = 0.05;                      // spring strength per step²
  let x, y, px, py, tick, dir, nudged;
  let reached = api.wasDone, didExact = false, hist = [];
  const head = new Int32Array(GRID * GRID), next = new Int32Array(N);
  const fx = new Float64Array(N), fy = new Float64Array(N);

  function seedRng(s) { return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
  function start() {
    const r = seedRng(11);
    x = new Float64Array(N); y = new Float64Array(N); px = new Float64Array(N); py = new Float64Array(N);
    const side = Math.ceil(Math.sqrt(N)), gap = R * 0.92;
    for (let i = 0; i < N; i++) {
      x[i] = Math.round(WALL * 2 + (i % side) * gap + r() * R * 0.01);
      y[i] = Math.round(WALL * 2 + Math.floor(i / side) * gap + r() * R * 0.01);
      const a = r() * 6.2832, s = L * 0.004 * (0.5 + r());
      px[i] = Math.round(x[i] - Math.cos(a) * s);
      py[i] = Math.round(y[i] - Math.sin(a) * s);
    }
    tick = 0; dir = 1; nudged = false; hist = [];
  }
  function forces() {
    fx.fill(0); fy.fill(0); head.fill(-1);
    for (let i = 0; i < N; i++) {
      const c = Math.min(GRID - 1, Math.max(0, (x[i] / CELL) | 0)) + GRID * Math.min(GRID - 1, Math.max(0, (y[i] / CELL) | 0));
      next[i] = head[c]; head[c] = i;
    }
    for (let i = 0; i < N; i++) {
      const cx = Math.min(GRID - 1, Math.max(0, (x[i] / CELL) | 0)), cy = Math.min(GRID - 1, Math.max(0, (y[i] / CELL) | 0));
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox, gy = cy + oy;
        if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) continue;
        for (let j = head[gx + GRID * gy]; j >= 0; j = next[j]) {
          if (j <= i) continue;
          const dx = x[i] - x[j], dy = y[i] - y[j], d2 = dx * dx + dy * dy;
          if (d2 >= R2 || d2 === 0) continue;
          const d = Math.sqrt(d2), f = (K * (R - d)) / d;
          fx[i] += f * dx; fy[i] += f * dy; fx[j] -= f * dx; fy[j] -= f * dy;
        }
      }
      if (x[i] < WALL) fx[i] += K * (WALL - x[i]);
      if (x[i] > L - WALL) fx[i] -= K * (x[i] - L + WALL);
      if (y[i] < WALL) fy[i] += K * (WALL - y[i]);
      if (y[i] > L - WALL) fy[i] -= K * (y[i] - L + WALL);
    }
  }
  // One step of the exactly reversible rule. It never looks at which way time is going:
  // reversing is just swapping "now" and "before".
  function step() {
    forces();
    for (let i = 0; i < N; i++) {
      const nx = 2 * x[i] - px[i] + Math.round(fx[i]), ny = 2 * y[i] - py[i] + Math.round(fy[i]);
      px[i] = x[i]; py[i] = y[i]; x[i] = nx; y[i] = ny;
    }
    tick += dir;
  }
  function reverse() {
    for (let i = 0; i < N; i++) {
      const a = x[i], b = y[i];
      x[i] = px[i]; y[i] = py[i]; px[i] = a; py[i] = b;
    }
    dir = -dir;
    tick += dir;
  }
  // Entropy, the way you'd really measure it: chop the box into cells and count how many
  // arrangements look like this one (log of the multinomial, per particle, 0 to 1).
  const B = 6;
  const lnFact = (() => { const t = [0]; for (let i = 1; i <= N; i++) t[i] = t[i - 1] + Math.log(i); return t; })();
  function entropy() {
    const c = new Int32Array(B * B);
    for (let i = 0; i < N; i++) c[Math.min(B - 1, Math.max(0, ((x[i] / L) * B) | 0)) + B * Math.min(B - 1, Math.max(0, ((y[i] / L) * B) | 0))]++;
    let s = lnFact[N];
    for (const v of c) s -= lnFact[v];
    return s / (N * Math.log(B * B));
  }
  function inCorner() {
    let n = 0;
    for (let i = 0; i < N; i++) if (x[i] < L / 2 && y[i] < L / 2) n++;
    return n / N;
  }

  api.wide();
  const PAD = 12;
  const cv = api.canvas2d((g, w, h) => {
    if (!x) return;
    const chartW = Math.min(280, w * 0.34), box = Math.min(h - PAD * 2, w - chartW - PAD * 3), s = box / L, bx = PAD, by = (h - box) / 2;
    const line = api.color("line"), ink = api.color("ink"), muted = api.color("muted");
    g.strokeStyle = line; g.lineWidth = 1; g.strokeRect(bx + 0.5, by + 0.5, box, box);
    g.setLineDash([3, 4]); g.strokeRect(bx + 0.5, by + 0.5, box / 2, box / 2); g.setLineDash([]);
    const c1 = api.color("c1"), c2 = api.color("c2");
    for (let i = 0; i < N; i++) {
      const sp = Math.hypot(x[i] - px[i], y[i] - py[i]);
      g.fillStyle = i === 0 && nudged ? api.color("c4") : sp > L * 0.0042 ? c1 : c2;
      g.beginPath(); g.arc(bx + x[i] * s, by + y[i] * s, Math.max(2, box / 110), 0, 6.2832); g.fill();
    }
    // the entropy chart
    const cx = bx + box + PAD * 2, cw = w - cx - PAD, ch = Math.min(box * 0.62, 190), cy = by + 26;
    g.fillStyle = ink; g.font = "600 12px 'IBM Plex Sans', sans-serif"; g.textAlign = "left";
    g.fillText("How mixed is it?", cx, by + 10);
    g.strokeStyle = line; g.strokeRect(cx + 0.5, cy + 0.5, cw, ch);
    if (hist.length > 1) {
      const n = Math.max(600, hist.length);
      g.lineWidth = 2;
      g.beginPath();
      hist.forEach(([e, d], i) => {
        const X = cx + (i / n) * cw, Y = cy + ch - e * ch;
        i ? g.lineTo(X, Y) : g.moveTo(X, Y);
      });
      g.strokeStyle = dir > 0 ? c2 : c1; g.stroke();
    }
    g.fillStyle = muted; g.font = "11px 'IBM Plex Mono', monospace";
    g.fillText("all mixed", cx + 4, cy + 12);
    g.fillText("all in the corner", cx + 4, cy + ch - 5);
    g.fillText(`time ${tick}`, cx, cy + ch + 16);
    g.fillStyle = dir > 0 ? ink : c1;
    g.fillText(dir > 0 ? "▶ forward" : "◀ backward", cx, cy + ch + 32);
  });

  function say() {
    const c = Math.round(inCorner() * 100);
    if (dir > 0 && tick === 0) api.status("All 240 particles start in one corner. Press Play.");
    else api.status(`${c}% of the gas in the corner · ${Math.round(entropy() * 100)}% mixed`);
  }
  let playing = false, speed = 2;
  api.loop(() => {
    if (!x) { if (cv.w) { start(); say(); cv.redraw(); } return; }
    if (!playing) return;
    for (let k = 0; k < speed; k++) {
      step();
      if (dir < 0 && tick === 0) {
        playing = false; playBtn.textContent = "Play";
        const c = inCorner();
        if (!nudged && c > 0.99) {
          didExact = true;
          api.explain("It went back", "<p>Every collision undid itself, in order, and all 240 particles walked back into the corner. Nothing in the laws of motion forbids that. It's the same film, played the other way.</p><p>Now start again, and this time press <b>Nudge one</b> before you reverse.</p>");
          api.status("Back at time 0: every particle exactly where it started.");
        } else if (nudged && c > 0.75) {
          api.explain("Nearly home", "<p>You reversed soon after the nudge, so the error hadn't had time to grow. Start again, let it mix for longer, nudge, then reverse.</p>");
          api.status(`Back at time 0, and ${Math.round(c * 100)}% made it home: the flaw needs more time to grow.`);
        } else if (nudged) {
          api.explain("One step, and the past is gone", `<p>You moved one particle by the smallest possible distance, about one part in 69 billion of the box. The other ${N - 1} were perfect. That error doubled and doubled through the collisions, and only ${Math.round(c * 100)}% of the gas is in the corner.</p><p>That's the arrow of time. The laws run both ways, but going back needs <b>perfect</b> knowledge of everything, and any flaw grows until it fills the box.</p>`);
          api.status(`Back at time 0, and only ${Math.round(c * 100)}% made it home.`);
          if (didExact && !reached) { reached = true; api.done("The laws run both ways. Going back needs perfect knowledge, and that's why time has a direction"); }
        }
        break;
      }
      if (tick % 3 === 0) { hist.push([entropy(), dir]); }
    }
    if (playing) say();
    cv.redraw();
  });

  const row = api.row();
  const playBtn = api.button("Play", () => { if (!x) return; playing = !playing; playBtn.textContent = playing ? "Pause" : "Play"; }, { primary: true, row });
  api.button("Reverse time", () => {
    if (!x || tick < 200 || dir < 0) { api.status(dir < 0 ? "Time is already running backward." : "Let it mix for a while first."); return; }
    reverse();
    playing = true; playBtn.textContent = "Pause";
    api.explain("Time is running backward", "<p>Each particle's <b>now</b> and <b>a moment ago</b> were swapped. That's the only change. The same rule keeps running, and it can't tell which way is forward.</p>");
  }, { row });
  api.button("Nudge one", () => {
    if (!x || dir < 0) return;
    x[0] += 1; nudged = true;
    api.explain("One particle moved", `<p>Particle 1 (now amber) has shifted by a single unit: one part in 69 billion of the box. Now press <b>Reverse time</b>.</p>`);
    cv.redraw();
  }, { row });
  api.button("Start again", () => {
    if (!x) return;
    start(); playing = false; playBtn.textContent = "Play"; say(); cv.redraw();
  }, { row });
  api.slider("Speed", { min: 1, max: 6, value: 2 }, (v) => { speed = v; });
  api.explain("Laws with no arrow", "<p>The rule moving these particles works equally well backward. Yet you've never seen gas gather itself into a corner, or an egg un-break. Press <b>Play</b>, let it mix, and press <b>Reverse time</b>.</p>");
});
