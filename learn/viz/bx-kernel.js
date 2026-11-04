/* Build your own X, chapter 47: every photo filter is nine numbers.
   A picture is a grid of numbers. A kernel is a small grid that slides over it: each new pixel is
   its neighbours, weighted and added. Blur, sharpen, edges and emboss are the same loop with
   different numbers. Tap the numbers and the picture changes at once.
   The "why": if a kernel's numbers add to zero, a flat area comes out black whatever its brightness,
   so only change survives. That's what an edge detector is. And a wide blur doesn't need every
   neighbour: because a box blur splits into a row pass and a column pass, 225 sums become 30. */
VIZ.register("bx-kernel", async (api) => {
  const W = 256, H = 170;
  const PRESETS = {
    "No change": [0, 0, 0, 0, 1, 0, 0, 0, 0],
    Blur: [1, 1, 1, 1, 1, 1, 1, 1, 1],
    Sharpen: [0, -1, 0, -1, 5, -1, 0, -1, 0],
    Emboss: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
    Edges: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
  };
  let k = PRESETS["No change"].slice(), edited = false, reached = api.wasDone, wide = null;
  let probe = [140, 92];
  const src = new Float32Array(W * H), out = new Float32Array(W * H);
  const a = document.createElement("canvas"), b = document.createElement("canvas");
  a.width = b.width = W; a.height = b.height = H;
  const ag = a.getContext("2d", { willReadFrequently: true }), bg = b.getContext("2d");
  const img = bg.createImageData(W, H);

  // A small drawn scene, so that nothing needs loading: flat sky, hard edges, fine detail.
  function paint() {
    const sky = ag.createLinearGradient(0, 0, 0, H * 0.7);
    sky.addColorStop(0, "#5c6470"); sky.addColorStop(1, "#b4bac2");
    ag.fillStyle = sky; ag.fillRect(0, 0, W, H);
    ag.fillStyle = "#f0f0ea"; ag.beginPath(); ag.arc(206, 38, 20, 0, 6.2832); ag.fill();
    ag.fillStyle = "#6e7a68"; ag.beginPath(); ag.moveTo(0, 112);
    ag.quadraticCurveTo(70, 70, 140, 108); ag.quadraticCurveTo(200, 134, 256, 96); ag.lineTo(256, 170); ag.lineTo(0, 170); ag.fill();
    ag.fillStyle = "#3e4a40"; ag.fillRect(0, 138, W, 32);
    ag.fillStyle = "#d6d0c4"; ag.fillRect(104, 84, 74, 62);
    ag.fillStyle = "#57392e"; ag.beginPath(); ag.moveTo(94, 86); ag.lineTo(141, 50); ag.lineTo(188, 86); ag.fill();
    ag.fillStyle = "#2c2f36"; ag.fillRect(132, 112, 18, 34);
    ag.fillRect(112, 96, 13, 13); ag.fillRect(157, 96, 13, 13);
    ag.fillStyle = "#d6d0c4"; ag.fillRect(118, 96, 1, 13); ag.fillRect(112, 102, 13, 1); ag.fillRect(163, 96, 1, 13); ag.fillRect(157, 102, 13, 1);
    ag.fillStyle = "#26302a"; ag.beginPath(); ag.arc(52, 92, 24, 0, 6.2832); ag.arc(36, 106, 17, 0, 6.2832); ag.arc(68, 106, 17, 0, 6.2832); ag.fill();
    ag.fillStyle = "#3a2c24"; ag.fillRect(47, 108, 10, 34);
    ag.strokeStyle = "#e6e2d6"; ag.lineWidth = 1;
    for (let i = 0; i < 16; i++) { ag.beginPath(); ag.moveTo(i * 16 + 0.5, 150); ag.lineTo(i * 16 + 8.5, 164); ag.stroke(); }
    const d = ag.getImageData(0, 0, W, H).data;
    for (let i = 0; i < W * H; i++) { const v = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]; src[i] = v; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; }
    ag.putImageData(new ImageData(d, W, H), 0, 0);
  }
  const clampI = (v, m) => (v < 0 ? 0 : v >= m ? m - 1 : v);
  const sumK = () => k.reduce((p, q) => p + q, 0);
  function filter() {
    wide = null;
    const s = sumK(), div = s || 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let t = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const w = k[(j + 1) * 3 + i + 1];
        if (w) t += w * src[clampI(y + j, H) * W + clampI(x + i, W)];
      }
      out[y * W + x] = s ? t / div : Math.abs(t);
    }
    show();
  }
  function show() {
    for (let i = 0; i < W * H; i++) {
      const v = out[i] < 0 ? 0 : out[i] > 255 ? 255 : out[i];
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    bg.putImageData(img, 0, 0);
    cv.redraw();
  }
  function judge() {
    const s = sumK(), any = k.some((v) => v);
    api.hud(`The numbers add to <b>${s}</b>`);
    if (reached || !edited || s !== 0 || !any) return;
    let flat = 0, nf = 0, top = 0;
    for (let y = 2; y < 40; y++) for (let x = 4; x < 170; x++) { flat += out[y * W + x]; nf++; }
    for (let i = 0; i < W * H; i++) top = Math.max(top, out[i]);
    if (flat / nf < 6 && top > 40) {
      reached = true;
      api.done("Flat areas gone, outlines left. A kernel whose numbers add to zero can only see change");
      api.explain("Why zero works", "<p>On a flat area all nine pixels are the same value <b>v</b>, so the answer is v × (the sum of your numbers). If they add to zero, the answer is zero, however bright the area is. Only places where neighbours <b>differ</b> survive, and that's what an edge is.</p>");
    }
  }

  function lay(w, h) {
    if (w < 620) {
      const top = 42, pw = (w - 10) / 2, ph = (pw * H) / W, g = Math.min(h - ph - top - 12, w * 0.72);
      return { a: { x: 0, y: top, w: pw, h: ph }, b: { x: pw + 10, y: top, w: pw, h: ph }, grid: { x: (w - g) / 2 + 8, y: top + ph + 8, s: g - 16 } };
    }
    const g = Math.min(186, h - 60, w * 0.26), pw = (w - g - 40) / 2, ph = Math.min((pw * H) / W, h - 40);
    const y = 24 + (h - 24 - ph) / 2 - 8;
    return { a: { x: 0, y, w: pw, h: ph }, b: { x: w - pw, y, w: pw, h: ph }, grid: { x: pw + 20, y: 24 + (h - 24 - g) / 2 - 8, s: g } };
  }
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const L = lay(w, h), ink = api.color("ink"), muted = api.color("muted"), line = api.color("line"), c1 = api.color("c1"), c2 = api.color("c2");
    g.imageSmoothingEnabled = true;
    g.drawImage(a, L.a.x, L.a.y, L.a.w, L.a.h);
    g.drawImage(b, L.b.x, L.b.y, L.b.w, L.b.h);
    g.font = "11px 'IBM Plex Mono', monospace"; g.textAlign = "left"; g.fillStyle = muted;
    g.fillText("before", L.a.x, L.a.y - 6); g.fillText(wide || "after", L.b.x, L.b.y - 6);
    for (const R of [L.a, L.b]) {
      const s = R.w / W;
      g.strokeStyle = c1; g.lineWidth = 1.5;
      g.strokeRect(R.x + (probe[0] - 1) * s, R.y + (probe[1] - 1) * s, 3 * s, 3 * s);
    }
    const G = L.grid, c = G.s / 3;
    g.textAlign = "center";
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const x = G.x + i * c, y = G.y + j * c, v = k[j * 3 + i];
      g.strokeStyle = line; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, c - 1, c - 1);
      g.fillStyle = v ? (v > 0 ? c2 : c1) : muted;
      g.font = `600 ${Math.round(c * 0.3)}px 'IBM Plex Mono', monospace`;
      g.fillText(String(v), x + c / 2, y + c * 0.5);
      g.fillStyle = muted; g.font = "10px 'IBM Plex Mono', monospace";
      g.fillText(`× ${Math.round(src[clampI(probe[1] + j - 1, H) * W + clampI(probe[0] + i - 1, W)])}`, x + c / 2, y + c * 0.82);
    }
    g.fillStyle = ink; g.font = "11px 'IBM Plex Mono', monospace";
    g.fillText(`= ${Math.round(out[probe[1] * W + probe[0]])}`, G.x + G.s / 2, G.y + G.s + 14);
  });
  cv.canvas.style.touchAction = "manipulation";
  cv.canvas.style.cursor = "crosshair";

  const at = (e) => { const r = cv.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function moveProbe(p) {
    const L = lay(cv.w, cv.h);
    for (const R of [L.a, L.b]) if (p[0] >= R.x && p[0] < R.x + R.w && p[1] >= R.y && p[1] < R.y + R.h) {
      probe = [clampI(Math.floor(((p[0] - R.x) / R.w) * W), W), clampI(Math.floor(((p[1] - R.y) / R.h) * H), H)];
      cv.redraw();
      return true;
    }
    return false;
  }
  cv.canvas.addEventListener("pointermove", (e) => { if (cv.w) moveProbe(at(e)); });
  cv.canvas.addEventListener("pointerdown", (e) => {
    if (!cv.w) return;
    const p = at(e);
    if (moveProbe(p)) return;
    const G = lay(cv.w, cv.h).grid, c = G.s / 3, i = Math.floor((p[0] - G.x) / c), j = Math.floor((p[1] - G.y) / c);
    if (i < 0 || j < 0 || i > 2 || j > 2) return;
    const up = (p[1] - G.y - j * c) < c / 2;
    k[j * 3 + i] = Math.max(-9, Math.min(9, k[j * 3 + i] + (up ? 1 : -1)));
    edited = true;
    filter(); judge();
  });

  let ready = false;
  api.loop(() => { if (cv.w && !ready) { ready = true; paint(); filter(); judge(); } });

  const row = api.row();
  const pick = (name, why) => api.button(name, () => {
    if (!ready) return;
    k = PRESETS[name].slice(); edited = false;
    filter(); judge();
    api.explain(name, why);
  }, { row });
  pick("No change", "<p>A single 1 in the middle: each pixel is just itself. It's the starting point for every kernel.</p>");
  pick("Blur", "<p>All ones: each pixel becomes the average of its neighbourhood. Differences get smoothed away. In sound, that's a low-pass filter: fine detail in a picture is its high frequencies.</p>");
  pick("Sharpen", "<p>Boost yourself, subtract your neighbours. Where a pixel already matches its neighbours nothing changes, because the numbers add to 1. At an edge, the difference gets exaggerated. Sharpening adds no detail: it only raises contrast at edges.</p>");
  pick("Emboss", "<p>Negative on one side, positive on the other: it measures slope in one direction, so edges look lit from a corner.</p>");
  pick("Edges", "<p>Eight neighbours against the centre. Flat areas cancel, and only change survives. Now try making your own detector by tapping the numbers.</p>");
  const row2 = api.row();
  function wideBlur(two) {
    if (!ready) return;
    const r = 7, n = 2 * r + 1, t0 = performance.now();
    if (!two) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let t = 0;
        for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) t += src[clampI(y + j, H) * W + clampI(x + i, W)];
        out[y * W + x] = t / (n * n);
      }
    } else {
      const mid = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let t = 0;
        for (let i = -r; i <= r; i++) t += src[y * W + clampI(x + i, W)];
        mid[y * W + x] = t / n;
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let t = 0;
        for (let j = -r; j <= r; j++) t += mid[clampI(y + j, H) * W + x];
        out[y * W + x] = t / n;
      }
    }
    const ms = performance.now() - t0;
    wide = two ? "15 × 15 blur, two passes" : "15 × 15 blur, every neighbour";
    show();
    api.status(`${two ? 2 * n : n * n} sums per pixel, ${ms < 1 ? "under 1" : Math.round(ms)} ms.`);
    api.explain(two ? "Two thin passes" : "Every neighbour", two
      ? "<p>Blur each row, then blur the result's columns. The picture is the same, because averaging a square is the same as averaging rows and then averaging those. That's 30 sums a pixel, not 225. The wider the blur, the bigger the saving, and it's why your phone can blur a background live.</p>"
      : "<p>A 15 × 15 window needs 225 sums for every single pixel, and a 12-megapixel photo has 12 million pixels. Now press the other one, and compare the pictures and the numbers.</p>");
  }
  api.button("Wide blur: every neighbour", () => wideBlur(false), { row: row2 });
  api.button("Wide blur: two passes", () => wideBlur(true), { row: row2 });
  api.explain("A picture is a grid of numbers", "<p>The nine numbers in the middle slide across the picture. For every pixel, multiply each neighbour by its number and add them up.</p><p>Tap the <b>top half</b> of a number to raise it, the <b>bottom half</b> to lower it. Move over the picture to see the sum for one pixel.</p>");
  api.status("Tap the numbers. Top half adds one, bottom half takes one away.");
});
