/* Complexity, chapter 5: build a rule by hand.
   The 8 tiles at the top are the whole rule: for each pattern of left, self and right, click the
   cell underneath to choose whether the middle cell is on next time. The tiles spell the rule's
   number in binary, and the picture below redraws at once, one row per time step.
   The "why": 8 bits is the whole program. Some settings give stripes, some give triangles
   (Rule 90), and one gives something that looks random forever (Rule 30). */
VIZ.register("tc-ca", async (api) => {
  const W = 121, ROWS = 60;
  let bits = [0, 0, 1, 0, 0, 0, 0, 0], start = "one", seen = new Set(), reached = api.wasDone;
  // bits[k] is the output for pattern k, where k = 4*left + 2*self + right; tiles show k = 7..0
  const rule = () => bits.reduce((s, b, k) => s + (b << k), 0);
  function rows() {
    let row = new Array(W).fill(0);
    if (start === "one") row[W >> 1] = 1;
    else { let s = 9; for (let i = 0; i < W; i++) { s = (s * 16807) % 2147483647; row[i] = s % 2; } }
    const out = [row];
    for (let t = 1; t < ROWS; t++) {
      const nx = row.map((_, i) => bits[4 * row[(i - 1 + W) % W] + 2 * row[i] + row[(i + 1) % W]]);
      out.push(nx); row = nx;
    }
    return out;
  }
  let tiles = [];
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    const on = api.color("c2"), off = api.color("card"), edge = api.color("line");
    // tiles
    const tw = Math.min(64, (w - 24) / 8 - 6), cs = tw / 3, x0 = (w - 8 * (tw + 6) + 6) / 2, y0 = 16;
    tiles = [];
    for (let j = 0; j < 8; j++) {
      const k = 7 - j, x = x0 + j * (tw + 6);
      const pat = [(k >> 2) & 1, (k >> 1) & 1, k & 1];
      pat.forEach((b, i) => { g.fillStyle = b ? on : off; g.fillRect(x + i * cs, y0, cs - 1, cs - 1); g.strokeStyle = edge; g.strokeRect(x + i * cs + 0.5, y0 + 0.5, cs - 2, cs - 2); });
      const bx = x + cs, by = y0 + cs + 3;
      g.fillStyle = bits[k] ? api.color("c1") : off; g.fillRect(bx, by, cs - 1, cs - 1);
      g.strokeStyle = api.color("c4"); g.lineWidth = 1.5; g.strokeRect(bx + 0.5, by + 0.5, cs - 2, cs - 2); g.lineWidth = 1;
      g.fillStyle = api.color("muted"); g.font = "11px 'IBM Plex Mono', monospace"; g.textAlign = "center";
      g.fillText(bits[k], x + tw / 2, by + cs + 13);
      tiles.push([x, y0, tw, by + cs - y0, k]);
    }
    g.fillStyle = api.color("ink"); g.font = "600 14px 'IBM Plex Mono', monospace"; g.textAlign = "center";
    const ty = y0 + 2 * cs + 34;
    g.fillText(`Rule ${rule()}  =  ${[...bits].reverse().join("")} in binary`, w / 2, ty);
    // space-time picture
    const top = ty + 12, R = rows(), c = Math.min((w - 16) / W, (h - top - 6) / ROWS), px = (w - c * W) / 2;
    R.forEach((row, t) => row.forEach((v, i) => { if (v) { g.fillStyle = t ? on : api.color("c1"); g.fillRect(px + i * c, top + t * c, c, c); } }));
    g.strokeStyle = edge; g.strokeRect(px - 0.5, top - 0.5, c * W + 1, c * ROWS + 1);
  });
  cv.canvas.addEventListener("click", (e) => {
    const b = cv.canvas.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    for (const [tx, ty, tw, th, k] of tiles) if (x >= tx && x <= tx + tw && y >= ty && y <= ty + th) { bits[k] ^= 1; changed(); }
  });
  function changed() {
    cv.redraw(); const r = rule(); seen.add(r); report();
    const named = { 30: "Rule 30: chaos from one cell. The left edge is regular, but the middle column passes tests for randomness.", 90: "Rule 90: each cell is left XOR right. One cell grows into Sierpiński's triangle.", 110: "Rule 110: structures that move and collide. It can compute anything a computer can.", 184: "Rule 184: a traffic rule. A car moves right if the cell ahead is empty." };
    if (named[r]) api.explain(`Rule ${r}`, `<p>${named[r]}</p>`);
    if (!reached && seen.has(30) && seen.has(90)) {
      reached = true;
      api.explain("Two rules, two worlds", "<p>Rule 90 and Rule 30 differ in just two of eight bits. One draws a perfectly ordered fractal; the other never repeats in any way you can predict.</p><p>Simple rules don't promise simple behaviour. That is Wolfram's point, and why a whole row of these is worth studying.</p>");
      api.done("Built Rule 30 and Rule 90 by hand");
    }
  }
  function report() {
    const r = rule();
    api.status(`Rule ${r}\nmade so far: ${[...seen].sort((a, b) => a - b).slice(-8).join(", ") || "none"}\n${seen.has(30) ? "✓" : "·"} Rule 30   ${seen.has(90) ? "✓" : "·"} Rule 90`);
  }
  api.seg([{ label: "One cell", value: "one" }, { label: "Random row", value: "random" }], start, (v) => { start = v; cv.redraw(); });
  api.button("Clear all", () => { bits = bits.map(() => 0); changed(); });
  api.button("Random rule", () => { let s = Date.now() % 2147483647 || 1; bits = bits.map(() => ((s = (s * 16807) % 2147483647), s % 2)); changed(); });
  report();
  api.explain("How to read this", "<p>Each tile is a pattern of three cells: left, self, right. The amber box under it is what the middle cell becomes next. Click it to flip.</p><p>The eight answers, read as binary, are the rule number. Can you make <b>Rule 30</b> (00011110) and <b>Rule 90</b> (01011010)?</p>");
});
