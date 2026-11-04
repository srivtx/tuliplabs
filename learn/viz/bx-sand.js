/* Build your own X, chapter 42: a falling-sand world.
   A small planet made of pixels: a sea, an island with dry seeds, a crater of lava. Every pixel
   looks only at its neighbours and follows a few lines of rules. Nothing in the code says "pile",
   "wave", "rain" or "rock", and all of them happen anyway.
   The "why": the order you visit the pixels is the whole engine. Scan from the top and a grain gets
   moved again on every row, so it reaches the floor in one step: the world has no speed limit.
   Always look left first and every pile leans. Bottom-up, each pixel moved once, with a fair coin:
   piles stand straight, and nothing can travel faster than one cell per step. */
VIZ.register("bx-sand", async (api) => {
  const E = 0, SAND = 1, WATER = 2, STONE = 3, SEED = 4, PLANT = 5, BLOOM = 6, LAVA = 7, STEAM = 8, FIRE = 9;
  const RGB = {
    [SAND]: [224, 180, 92], [WATER]: [52, 128, 204], [STONE]: [122, 127, 138], [SEED]: [150, 104, 60], [PLANT]: [63, 170, 82],
    [BLOOM]: [255, 111, 181], [LAVA]: [255, 92, 38], [STEAM]: [168, 188, 208], [FIRE]: [255, 186, 60],
  };
  const WEIGHT = { [E]: 1, [STEAM]: 0, [WATER]: 2, [LAVA]: 3, [SAND]: 4, [SEED]: 4 };
  const RULES = {
    [SAND]: ["Sand", "<p>Look down. If that cell is empty or water, swap with it. If not, try down-left and down-right, in a fair random order. That's the whole rule. The pile, its slope and the way it sinks through water are not written anywhere.</p>"],
    [WATER]: ["Water", "<p>The sand rule, plus one line: if you can't go down, slide sideways. That extra line is why a sea goes flat and a pile doesn't.</p>"],
    [STONE]: ["Stone", "<p>Never moves. Lava that touches water turns into this, which is how real islands get made.</p>"],
    [SEED]: ["Seed", "<p>Falls like sand. When water touches it, it starts to grow. A plant drinks the water that lands on it and adds one cell upward, and it flowers when it runs out of height.</p>"],
    [LAVA]: ["Lava", "<p>Water, but heavier and slower. Touching water, it boils that water into steam and cools into stone. Touching a plant, it starts a fire.</p>"],
    [E]: ["Erase", "<p>Removes whatever you paint over. Try opening a gap in the crater wall.</p>"],
  };
  let GW = 0, GH = 128, cell, tint, life, done, trav, stamp = 0, tick = 0, img, off, octx;
  let mode = "real", brush = SAND, rain = 0, grown = 0, stoneMade = 0, fastest = 0, reached = api.wasDone, paused = false;
  const at = (x, y) => y * GW + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH;
  const coin = () => Math.random() < 0.5;
  function put(x, y, v, l = 0) { if (!inb(x, y)) return; const i = at(x, y); cell[i] = v; tint[i] = (Math.random() * 22) | 0; life[i] = l; }

  function planet() {
    cell = new Uint8Array(GW * GH); tint = new Uint8Array(GW * GH); life = new Uint8Array(GW * GH);
    done = new Uint32Array(GW * GH); trav = new Uint16Array(GW * GH);
    rain = grown = stoneMade = 0;
    const X = (f) => Math.round(f * GW), Y = (f) => Math.round(f * GH);
    const seaEnd = X(0.36), craterA = X(0.68), craterB = X(0.93);
    for (let x = 0; x < GW; x++) {
      // sea bed, island, crater floor
      let top;
      if (x < seaEnd) top = Y(0.84) + Math.round(Math.sin(x * 0.2) * 2);
      else if (x < craterA) top = Y(0.6) + Math.round(Math.sin(x * 0.31) * 1.5);
      else top = Y(0.86);
      for (let y = top; y < GH; y++) put(x, y, STONE);
    }
    // the beach rises out of the sea
    for (let x = X(0.22); x < seaEnd; x++) {
      const h = Math.round(((x - X(0.22)) / (seaEnd - X(0.22))) * (Y(0.84) - Y(0.6)));
      for (let k = 0; k < h; k++) put(x, Y(0.84) - k, SAND);
    }
    // sea
    for (let x = 0; x < seaEnd; x++) for (let y = Y(0.68); y < GH; y++) if (!cell[at(x, y)]) put(x, y, WATER);
    // island soil
    for (let x = seaEnd; x < craterA; x++) { let y = 0; while (y < GH && !cell[at(x, y)]) y++; for (let k = 1; k <= 3; k++) put(x, y - k, SAND); }
    // crater walls and lava
    const rim = Y(0.48);
    for (let y = rim; y < Y(0.9); y++) for (let k = 0; k < 3; k++) { put(craterA + k, y, STONE); put(craterB + k, y, STONE); }
    for (let x = craterA + 3; x < craterB; x++) for (let y = Y(0.62); y < Y(0.87); y++) put(x, y, LAVA);
    // dry seeds along the island
    for (let x = seaEnd + 4; x < craterA - 3; x += Math.max(4, X(0.05))) put(x, Y(0.4), SEED, 12 + ((Math.random() * 12) | 0));
    img = new ImageData(GW, GH);
    off = document.createElement("canvas"); off.width = GW; off.height = GH; octx = off.getContext("2d");
  }

  function swap(i, j) {
    const c = cell[i], t = tint[i], l = life[i], d = trav[i];
    cell[i] = cell[j]; tint[i] = tint[j]; life[i] = life[j]; trav[i] = trav[j];
    cell[j] = c; tint[j] = t; life[j] = l; trav[j] = d + 1;
    if (d + 1 > fastest) fastest = d + 1;
    if (mode !== "top") { done[i] = stamp; done[j] = stamp; }
  }
  const sinks = (a, x, y) => { if (!inb(x, y)) return false; const b = cell[at(x, y)]; return WEIGHT[b] !== undefined && WEIGHT[b] < WEIGHT[a]; };
  function sideFirst() { return mode === "left" ? -1 : coin() ? -1 : 1; }
  function fall(x, y, a) {
    const i = at(x, y);
    if (sinks(a, x, y + 1)) { swap(i, at(x, y + 1)); return true; }
    const s = sideFirst();
    if (sinks(a, x + s, y + 1)) { swap(i, at(x + s, y + 1)); return true; }
    if (sinks(a, x - s, y + 1)) { swap(i, at(x - s, y + 1)); return true; }
    return false;
  }
  function flow(x, y, a) {
    if (fall(x, y, a)) return;
    const i = at(x, y), s = sideFirst();
    if (sinks(a, x + s, y)) swap(i, at(x + s, y));
    else if (sinks(a, x - s, y)) swap(i, at(x - s, y));
  }
  const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  function update(x, y) {
    const i = at(x, y), a = cell[i];
    switch (a) {
      case SAND: fall(x, y, a); break;
      case WATER: flow(x, y, a); break;
      case SEED:
        if (!fall(x, y, a)) for (const [dx, dy] of N4) if (inb(x + dx, y + dy) && cell[at(x + dx, y + dy)] === WATER) { cell[i] = PLANT; break; }
        break;
      case PLANT:
        for (const [dx, dy] of N4) {
          if (!inb(x + dx, y + dy) || cell[at(x + dx, y + dy)] !== WATER || Math.random() > 0.35) continue;
          const nx = x + ((Math.random() * 3) | 0) - 1;
          if (life[i] > 0 && inb(nx, y - 1) && cell[at(nx, y - 1)] === E) {
            put(x + dx, y + dy, E);
            put(nx, y - 1, life[i] <= 1 ? BLOOM : PLANT, life[i] - 1);
            life[i] = 0; grown++;
          }
          break;
        }
        break;
      case LAVA:
        for (const [dx, dy] of N4) {
          if (!inb(x + dx, y + dy)) continue;
          const j = at(x + dx, y + dy), b = cell[j];
          if (b === WATER) { put(x + dx, y + dy, STEAM); if (coin()) { put(x, y, STONE, 1); stoneMade++; return; } }
          else if (b === STONE && life[j] === 1 && Math.random() < 0.01) put(x + dx, y + dy, LAVA);   // a thin new crust cracks open again
          else if ((b === PLANT || b === BLOOM || b === SEED) && Math.random() < 0.4) put(x + dx, y + dy, FIRE, 30);
        }
        if (Math.random() < 0.3) flow(x, y, a);
        break;
      case STEAM: {
        if (y < GH * 0.14 ? Math.random() < 0.006 : Math.random() < 0.0006) { put(x, y, WATER); rain++; return; }
        const s = Math.random() < 0.62 ? -1 : 1;   // a light wind blows steam over the island
        const up = at(x, Math.max(0, y - 1));
        if (y > 0 && cell[up] === E && Math.random() < 0.8) swap(i, up);
        else if (inb(x + s, y) && cell[at(x + s, y)] === E) swap(i, at(x + s, y));
        break;
      }
      case FIRE:
        if (life[i]-- <= 0) { cell[i] = E; return; }
        for (const [dx, dy] of N4) {
          if (!inb(x + dx, y + dy)) continue;
          const b = cell[at(x + dx, y + dy)];
          if ((b === PLANT || b === BLOOM || b === SEED) && Math.random() < 0.18) put(x + dx, y + dy, FIRE, 26);
          else if (b === WATER) { put(x, y, STEAM); return; }
        }
        if (y > 0 && cell[at(x, y - 1)] === E && Math.random() < 0.25) swap(i, at(x, y - 1));
        break;
    }
  }
  function step() {
    tick++; stamp++; fastest = 0; trav.fill(0);
    const top = mode === "top", ltr = mode === "left" || tick % 2 === 0;
    for (let r = 0; r < GH; r++) {
      const y = top ? r : GH - 1 - r;
      for (let c = 0; c < GW; c++) {
        const x = ltr ? c : GW - 1 - c;
        if (cell[at(x, y)] && done[at(x, y)] !== stamp) update(x, y);
      }
    }
    if (!reached && rain >= 30 && grown >= 10) {
      reached = true;
      api.done("The water cycle came out of a few lines about neighbours. Nobody wrote it");
    }
  }

  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    if (!off) return;
    g.imageSmoothingEnabled = false;
    g.drawImage(off, 0, 0, w, h);
  });
  cv.canvas.style.touchAction = "none";
  cv.canvas.style.cursor = "crosshair";
  function render() {
    const d = img.data;
    for (let i = 0; i < cell.length; i++) {
      const c = cell[i], p = i * 4;
      if (!c) { d[p + 3] = 0; continue; }
      const k = RGB[c], t = c === STONE || c === SAND ? tint[i] - 11 : c === WATER || c === LAVA ? (tint[i] - 11) * 0.6 : c === FIRE ? ((Math.random() * 60) | 0) - 30 : 0;
      d[p] = k[0] + t; d[p + 1] = k[1] + t; d[p + 2] = k[2] + t; d[p + 3] = c === STEAM ? 200 : 255;
    }
    octx.putImageData(img, 0, 0);
    cv.redraw();
  }

  let held = null, last = null;
  const cellAt = (e) => { const r = cv.canvas.getBoundingClientRect(); return [Math.floor(((e.clientX - r.left) / r.width) * GW), Math.floor(((e.clientY - r.top) / r.height) * GH)]; };
  function dab(x, y) {
    const R = brush === STONE || brush === E ? 2 : 3;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R || !inb(x + dx, y + dy)) continue;
      if (brush === E) { put(x + dx, y + dy, E); continue; }
      if (cell[at(x + dx, y + dy)] !== E) continue;
      if (brush === SEED ? Math.random() < 0.06 : brush === STONE || Math.random() < 0.5) put(x + dx, y + dy, brush, brush === SEED ? 14 + ((Math.random() * 12) | 0) : 0);
    }
  }
  function paintLine(a, b) {
    const n = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), 1);
    for (let k = 0; k <= n; k++) dab(Math.round(a[0] + ((b[0] - a[0]) * k) / n), Math.round(a[1] + ((b[1] - a[1]) * k) / n));
  }
  cv.canvas.addEventListener("pointerdown", (e) => { if (!cell) return; cv.canvas.setPointerCapture(e.pointerId); held = last = cellAt(e); dab(...held); });
  cv.canvas.addEventListener("pointermove", (e) => { if (!held) return; held = cellAt(e); paintLine(last, held); last = held; });
  const lift = () => { held = last = null; };
  cv.canvas.addEventListener("pointerup", lift);
  cv.canvas.addEventListener("pointercancel", lift);

  api.loop(() => {
    if (!cv.w) return;
    if (!cell) { GW = Math.max(100, Math.min(240, Math.round((GH * cv.w) / cv.h))); planet(); }
    if (held) dab(...held);
    if (!paused) { step(); step(); }
    render();
    api.hud(`fastest pixel this step: <b>${fastest}</b> cell${fastest === 1 ? "" : "s"}`);
    api.status(`rain drops ${rain}/30 · plant cells grown ${grown}/10 · new rock ${stoneMade}`);
  });

  const pick = (v) => { brush = v; const [t, html] = RULES[v]; api.explain(t, html); };
  api.seg([
    { label: "Sand", value: SAND }, { label: "Water", value: WATER }, { label: "Stone", value: STONE },
    { label: "Seed", value: SEED }, { label: "Lava", value: LAVA }, { label: "Erase", value: E },
  ], SAND, pick);
  api.seg([
    { label: "Bottom-up, fair", value: "real" }, { label: "Top-down", value: "top" }, { label: "Always left", value: "left" },
  ], "real", (v) => {
    mode = v;
    api.explain(...{
      real: ["Bottom-up, fair", "<p>Each pixel moves at most once per step, and left or right is a coin toss. Watch the counter on the picture: nothing ever moves more than <b>1</b> cell. This world has a speed limit, and so does ours.</p>"],
      top: ["Top-down", "<p>The obvious loop. A grain moves down a row, then the loop reaches that row and moves it again, all the way to the floor. The counter jumps to dozens: sand teleports. Pour some and watch it arrive instantly.</p>"],
      left: ["Always left", "<p>Every grain tries left first, so nothing is fair. Piles lean over and the sea creeps sideways. Pour a tall pile to see it. A tiny bias in the rules becomes a visible shape in the world.</p>"],
    }[v]);
  });
  const row = api.row();
  const pauseBtn = api.button("Pause", () => { paused = !paused; pauseBtn.textContent = paused ? "Play" : "Pause"; }, { row });
  api.button("New planet", () => { if (cv.w) planet(); }, { row });
  api.explain("Paint on the picture", "<p>Pick something and drag on the world. Choosing a material shows its entire rule here. There is no code for piles, seas, rain or islands: only these rules, run on every pixel.</p>");
});
