/* Build your own X, chapter 48: a real JPEG pipeline, running live.
   Colour is split into brightness and two colour channels, colour is stored at quarter resolution,
   each 8×8 block is turned into waves, the waves are rounded (coarsely for the fast ones, which your
   eye barely sees), and the size is worked out from the real symbols a JPEG would store.
   The "why": JPEG isn't a clever way of storing pixels. It's a model of your eye. The same blur that
   ruins a picture when it hits brightness is nearly invisible when it hits colour, because your
   vision has far less resolution for colour than for brightness. */
VIZ.register("bx-jpeg", async (api) => {
  const W = 256, H = 176, RAW = W * H * 3;
  const LUMA = [16,11,10,16,24,40,51,61,12,12,14,19,26,58,60,55,14,13,16,24,40,57,69,56,14,17,22,29,51,87,80,62,18,22,37,56,68,109,103,77,24,35,55,64,81,104,113,92,49,64,78,87,103,121,120,101,72,92,95,98,112,100,103,99];
  const CHROMA = [17,18,24,47,99,99,99,99,18,21,26,66,99,99,99,99,24,26,56,99,99,99,99,99,47,66,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99,99];
  const ZZ = (() => { const r = []; for (let s = 0; s < 15; s++) { const list = []; for (let y = 0; y <= s; y++) { const x = s - y; if (x < 8 && y < 8) list.push(y * 8 + x); } if (s % 2 === 0) list.reverse(); r.push(...list); } return r; })();
  const C = []; for (let u = 0; u < 8; u++) { C[u] = []; for (let x = 0; x < 8; x++) C[u][x] = u ? 0.5 * Math.cos(((2 * x + 1) * u * Math.PI) / 16) : 1 / Math.sqrt(8); }
  let quality = 90, shrink = false, view = "file", probe = [140, 96], reached = api.wasDone, saw = { colour: false, bright: false };
  let size = 0, rms = 0;
  const src = document.createElement("canvas"), dst = document.createElement("canvas");
  src.width = dst.width = W; src.height = dst.height = H;
  const sg = src.getContext("2d", { willReadFrequently: true }), dg = dst.getContext("2d");
  const Y = new Float32Array(W * H), Cb = new Float32Array(W * H), Cr = new Float32Array(W * H);
  let rgb = null;
  const pic = dg.createImageData(W, H);

  function paint() {
    const sky = sg.createLinearGradient(0, 0, 0, 110);
    sky.addColorStop(0, "#1e3f8a"); sky.addColorStop(0.6, "#e0785a"); sky.addColorStop(1, "#f6cf7a");
    sg.fillStyle = sky; sg.fillRect(0, 0, W, H);
    sg.fillStyle = "#fff4cf"; sg.beginPath(); sg.arc(190, 74, 17, 0, 6.2832); sg.fill();
    sg.fillStyle = "#3a4a7c"; sg.beginPath(); sg.moveTo(0, 104); sg.lineTo(60, 66); sg.lineTo(112, 102); sg.lineTo(160, 80); sg.lineTo(256, 108); sg.lineTo(256, 130); sg.lineTo(0, 130); sg.fill();
    sg.fillStyle = "#2f6b3a"; sg.fillRect(0, 106, W, 70);
    const cols = ["#d8283c", "#efb40f", "#c43a9c", "#ec6f1c"];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 18; c++) {
      const x = c * 15 + (r % 2) * 7 - 4, y = 114 + r * 16;
      sg.fillStyle = "#1c4a26"; sg.fillRect(x + 4, y + 8, 2, 8);
      sg.fillStyle = cols[(r + (c >> 1)) % 4];
      sg.beginPath(); sg.ellipse(x + 5, y + 5, 5.5, 6.5, 0, 0, 6.2832); sg.fill();
      sg.fillStyle = "rgba(255,255,255,.28)"; sg.fillRect(x + 3, y + 1, 2, 7);
    }
    sg.font = "700 22px 'IBM Plex Sans', Arial, sans-serif"; sg.fillStyle = "#e0233a"; sg.fillText("TULIP", 12, 32);
    sg.fillStyle = "#ffffff"; sg.font = "600 11px 'IBM Plex Mono', monospace"; sg.fillText("fine print 8×8", 14, 48);
    rgb = sg.getImageData(0, 0, W, H).data;
    for (let i = 0; i < W * H; i++) {
      const r = rgb[i * 4], g = rgb[i * 4 + 1], b = rgb[i * 4 + 2];
      Y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      Cb[i] = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b;
      Cr[i] = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b;
    }
  }
  const scaled = (table) => {
    const s = quality < 50 ? 5000 / quality : 200 - 2 * quality;
    return table.map((q) => Math.max(1, Math.min(255, Math.floor((q * s + 50) / 100))));
  };
  // Codes one plane: returns the rebuilt plane, and adds the JPEG symbols to `hist` / the extra bits
  function code(plane, w, h, table, hist, stats) {
    const out = new Float32Array(w * h), q = scaled(table), blk = new Float64Array(64), tmp = new Float64Array(64), co = new Int32Array(64);
    let prev = 0;
    for (let by = 0; by < h; by += 8) for (let bx = 0; bx < w; bx += 8) {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) blk[y * 8 + x] = plane[(by + y) * w + bx + x] - 128;
      for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) { let s = 0; for (let x = 0; x < 8; x++) s += blk[y * 8 + x] * C[u][x]; tmp[y * 8 + u] = s; }
      for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) { let s = 0; for (let y = 0; y < 8; y++) s += tmp[y * 8 + u] * C[v][y]; co[v * 8 + u] = Math.round(s / q[v * 8 + u]); }
      const cat = (n) => (n ? 32 - Math.clz32(Math.abs(n)) : 0);
      const d = co[0] - prev; prev = co[0];
      hist.set(`d${cat(d)}`, (hist.get(`d${cat(d)}`) || 0) + 1); stats.extra += cat(d);
      let run = 0;
      for (let i = 1; i < 64; i++) {
        const v = co[ZZ[i]];
        if (!v) { run++; continue; }
        while (run > 15) { hist.set("zrl", (hist.get("zrl") || 0) + 1); run -= 16; }
        const key = `${run}/${cat(v)}`;
        hist.set(key, (hist.get(key) || 0) + 1); stats.extra += cat(v); run = 0;
      }
      if (run) hist.set("end", (hist.get("end") || 0) + 1);
      for (let v = 0; v < 8; v++) for (let x = 0; x < 8; x++) { let s = 0; for (let u = 0; u < 8; u++) s += co[v * 8 + u] * q[v * 8 + u] * C[u][x]; tmp[v * 8 + x] = s; }
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { let s = 0; for (let v = 0; v < 8; v++) s += tmp[v * 8 + x] * C[v][y]; out[(by + y) * w + bx + x] = s + 128; }
    }
    return out;
  }
  const half = (p) => { const o = new Float32Array((W / 2) * (H / 2)); for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) o[(y / 2) * (W / 2) + x / 2] = (p[y * W + x] + p[y * W + x + 1] + p[(y + 1) * W + x] + p[(y + 1) * W + x + 1]) / 4; return o; };
  const grow = (p) => { const o = new Float32Array(W * H), w2 = W / 2; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[y * W + x] = p[(y >> 1) * w2 + (x >> 1)]; return o; };
  function blur(p, r) {
    const a = new Float32Array(W * H), o = new Float32Array(W * H), n = 2 * r + 1, cl = (v, m) => (v < 0 ? 0 : v >= m ? m - 1 : v);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let i = -r; i <= r; i++) s += p[y * W + cl(x + i, W)]; a[y * W + x] = s / n; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let i = -r; i <= r; i++) s += a[cl(y + i, H) * W + x]; o[y * W + x] = s / n; }
    return o;
  }
  function draw(y, b, r) {
    let e = 0;
    for (let i = 0; i < W * H; i++) {
      const cb = b[i] - 128, cr = r[i] - 128;
      const R = y[i] + 1.402 * cr, G = y[i] - 0.3441 * cb - 0.7141 * cr, B = y[i] + 1.772 * cb;
      pic.data[i * 4] = R; pic.data[i * 4 + 1] = G; pic.data[i * 4 + 2] = B; pic.data[i * 4 + 3] = 255;
      e += (pic.data[i * 4] - rgb[i * 4]) ** 2 + (pic.data[i * 4 + 1] - rgb[i * 4 + 1]) ** 2 + (pic.data[i * 4 + 2] - rgb[i * 4 + 2]) ** 2;
    }
    dg.putImageData(pic, 0, 0);
    rms = Math.sqrt(e / (W * H * 3));
  }
  function run() {
    if (!rgb) return;
    if (view === "colour") { draw(Y, blur(Cb, 3), blur(Cr, 3)); api.hud(`Colour blurred · error <b>${rms.toFixed(1)}</b>`); cv.redraw(); return; }
    if (view === "bright") { draw(blur(Y, 3), Cb, Cr); api.hud(`Brightness blurred · error <b>${rms.toFixed(1)}</b>`); cv.redraw(); return; }
    const hist = new Map(), stats = { extra: 0 };
    const y = code(Y, W, H, LUMA, hist, stats);
    const b = shrink ? grow(code(half(Cb), W / 2, H / 2, CHROMA, hist, stats)) : code(Cb, W, H, CHROMA, hist, stats);
    const r = shrink ? grow(code(half(Cr), W / 2, H / 2, CHROMA, hist, stats)) : code(Cr, W, H, CHROMA, hist, stats);
    draw(y, b, r);
    let total = 0, bits = stats.extra;
    for (const c of hist.values()) total += c;
    for (const c of hist.values()) bits += c * -Math.log2(c / total);
    size = bits / 8;
    const pct = (100 * size) / RAW;
    api.hud(`About <b>${(size / 1024).toFixed(1)} KB</b>, ${pct < 10 ? pct.toFixed(1) : Math.round(pct)}% of ${Math.round(RAW / 1024)} KB · error ${rms.toFixed(1)}`);
    if (!reached && saw.colour && saw.bright && shrink && pct <= 8 && rms <= 14) {
      reached = true;
      api.done("Under a twelfth of the size, and it still looks like the same picture. JPEG is a model of your eye");
      api.explain("What you threw away", "<p>Over 90% of the numbers are gone. Most were fine detail in colour, and fast waves, which your eye barely registers. Now take the quality down to 5 and look at the zoom on the right: each 8×8 block is falling back to a few waves.</p>");
    }
    cv.redraw();
  }

  function lay(w, h) {
    if (w < 560) { const pw = w, ph = Math.min((pw * H) / W, h * 0.6), iw = (ph * W) / H, z = h - ph - 52; return { a: { x: (w - iw) / 2, y: 26, w: iw, h: ph }, z: { x: (w - z) / 2, y: 26 + ph + 20, s: z } }; }
    const z = Math.min(h - 40, w * 0.34), iw = Math.min(w - z - 20, ((h - 40) * W) / H), ih = (iw * H) / W;
    return { a: { x: 0, y: 30, w: iw, h: ih }, z: { x: w - z, y: 30, s: z } };
  }
  const ZOOM = 40;
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    if (!rgb) return;
    const L = lay(w, h), muted = api.color("muted");
    g.imageSmoothingEnabled = true; g.drawImage(dst, L.a.x, L.a.y, L.a.w, L.a.h);
    const s = L.a.w / W, px = Math.max(0, Math.min(W - ZOOM, probe[0] - ZOOM / 2)), py = Math.max(0, Math.min(H - ZOOM, probe[1] - ZOOM / 2));
    g.strokeStyle = api.color("c1"); g.lineWidth = 1.5; g.strokeRect(L.a.x + px * s, L.a.y + py * s, ZOOM * s, ZOOM * s);
    g.imageSmoothingEnabled = false; g.drawImage(dst, px, py, ZOOM, ZOOM, L.z.x, L.z.y, L.z.s, L.z.s);
    g.strokeStyle = "rgba(255,255,255,.28)"; g.lineWidth = 1;
    const c = L.z.s / ZOOM;
    for (let i = Math.ceil(px / 8) * 8; i < px + ZOOM; i += 8) { const x = L.z.x + (i - px) * c; g.beginPath(); g.moveTo(x, L.z.y); g.lineTo(x, L.z.y + L.z.s); g.stroke(); }
    for (let i = Math.ceil(py / 8) * 8; i < py + ZOOM; i += 8) { const y = L.z.y + (i - py) * c; g.beginPath(); g.moveTo(L.z.x, y); g.lineTo(L.z.x + L.z.s, y); g.stroke(); }
    g.fillStyle = muted; g.font = "11px 'IBM Plex Mono', monospace"; g.textAlign = "left";
    g.fillText("zoomed, with the 8×8 blocks", L.z.x, L.z.y - 6);
  });
  cv.canvas.style.touchAction = "manipulation";
  cv.canvas.style.cursor = "crosshair";
  const move = (e) => {
    if (!cv.w) return;
    const r = cv.canvas.getBoundingClientRect(), A = lay(cv.w, cv.h).a, x = e.clientX - r.left - A.x, y = e.clientY - r.top - A.y;
    if (x >= 0 && y >= 0 && x < A.w && y < A.h) { probe = [Math.floor((x / A.w) * W), Math.floor((y / A.h) * H)]; cv.redraw(); }
  };
  cv.canvas.addEventListener("pointerdown", move);
  cv.canvas.addEventListener("pointermove", (e) => { if (e.buttons || e.pointerType === "mouse") move(e); });
  api.loop(() => { if (cv.w && !rgb) { paint(); run(); } });

  api.seg([{ label: "The file", value: "file" }, { label: "Blur the colour", value: "colour" }, { label: "Blur the brightness", value: "bright" }], "file", (v) => {
    view = v;
    if (v === "colour") { saw.colour = true; api.explain("Colour, smeared", "<p>Every colour has been smeared across 7 pixels. The shapes stay crisp and the fine print is still easy to read. Look closely and you'll find the cost: the red letters suffer, because only colour marks their edge, and the flowers have pale fringes.</p><p>Remember the error number on the picture.</p>"); }
    if (v === "bright") { saw.bright = true; api.explain("Brightness, smeared", "<p>The same blur on brightness. Everything goes soft and the fine print can't be read. Your eye gets shape from brightness, and it has much less resolution for colour.</p><p>Now look at the error number: it's <b>lower</b> than it was for the colour blur. By plain arithmetic this picture is the better one, and your eye disagrees. Error counts numbers, and it doesn't know what eyes care about.</p>"); }
    if (v === "file") api.explain("The file", "<p>Back to the file. Turn on <b>Shrink the colour</b>, and bring the quality down.</p>");
    run();
  });
  api.seg([{ label: "Full colour", value: 0 }, { label: "Shrink the colour", value: 1 }], 0, (v) => {
    shrink = !!v; run();
    api.status(v ? "Colour is now stored at a quarter of the pixels. Half the numbers are gone." : "Colour is stored at full resolution.");
  });
  api.slider("Quality", { min: 1, max: 100, step: 1, value: quality }, (v) => { quality = v; run(); });
  api.explain("Which numbers can you lose?", "<p>This is a real JPEG pipeline. Before you squeeze it, find out what your eye cares about: try <b>Blur the colour</b>, then <b>Blur the brightness</b>. It's the same blur.</p>");
  api.status("Try both blurs first. Move over the picture to choose what to zoom in on.");
});
