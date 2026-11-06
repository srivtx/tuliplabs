/* Complexity, chapter 6: the Game of Life, by hand.
   Paint cells by dragging on the grid, or stamp a pattern. Step or Run. The grid wraps at the edges.
   The naive comparison: "update in place" writes each new cell straight into the grid while it is
   still being read, so later cells see a half-updated world. Gliders fall apart. Updating all at
   once from a copy is what makes Life's rules mean what they say.
   The "why": every cell must see the same moment. */
VIZ.register("tc-life", async (api) => {
  const C = 48, R = 30;
  let grid, gen = 0, mode = "copy", running = false, triedNaive = false, gliderAt = -1, reached = api.wasDone;
  const blank = () => Array.from({ length: R }, () => new Uint8Array(C));
  const count = (gr, r, c) => {
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) n += gr[(r + dr + R) % R][(c + dc + C) % C];
    return n;
  };
  function step() {
    if (mode === "copy") {
      const nx = blank();
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const n = count(grid, r, c); nx[r][c] = n === 3 || (n === 2 && grid[r][c]) ? 1 : 0; }
      grid = nx;
    } else {
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const n = count(grid, r, c); grid[r][c] = n === 3 || (n === 2 && grid[r][c]) ? 1 : 0; }
    }
    gen++;
  }
  const pop = () => grid.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0);
  const PATS = {
    Glider: [[0, 1], [1, 2], [2, 0], [2, 1], [2, 2]],
    Blinker: [[0, 0], [0, 1], [0, 2]],
    "R-pentomino": [[0, 1], [0, 2], [1, 0], [1, 1], [2, 1]],
    Gun: [[4,0],[4,1],[5,0],[5,1],[4,10],[5,10],[6,10],[3,11],[7,11],[2,12],[8,12],[2,13],[8,13],[5,14],[3,15],[7,15],[4,16],[5,16],[6,16],[5,17],[2,20],[3,20],[4,20],[2,21],[3,21],[4,21],[1,22],[5,22],[0,24],[1,24],[5,24],[6,24],[2,34],[3,34],[2,35],[3,35]],
  };
  function stamp(name) {
    grid = blank(); gen = 0;
    const cells = PATS[name], r0 = name === "Gun" ? 2 : (R >> 1) - 1, c0 = name === "Gun" ? 2 : name === "Glider" ? 4 : (C >> 1) - 1;
    for (const [r, c] of cells) grid[r0 + r][c0 + c] = 1;
    gliderAt = name === "Glider" ? 0 : -1;
    cv.redraw(); report();
  }
  let geo = { x: 0, y: 0, s: 10 };
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    if (!grid) return;
    const top = 26, s = Math.min((w - 8) / C, (h - top - 6) / R), x0 = (w - s * C) / 2;
    geo = { x: x0, y: top, s };
    g.strokeStyle = api.color("line"); g.lineWidth = 1; g.globalAlpha = 0.5;
    g.beginPath();
    for (let c = 0; c <= C; c++) { g.moveTo(x0 + c * s, top); g.lineTo(x0 + c * s, top + R * s); }
    for (let r = 0; r <= R; r++) { g.moveTo(x0, top + r * s); g.lineTo(x0 + C * s, top + r * s); }
    g.stroke(); g.globalAlpha = 1;
    g.fillStyle = mode === "copy" ? api.color("c2") : api.color("bad");
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (grid[r][c]) g.fillRect(x0 + c * s + 1, top + r * s + 1, s - 2, s - 2);
    g.fillStyle = api.color("ink"); g.font = "600 13px 'IBM Plex Mono', monospace"; g.textAlign = "left";
    g.fillText(`generation ${gen} · ${pop()} alive · ${mode === "copy" ? "all at once" : "in place (naive)"}`, x0, 17);
  });
  let painting = -1;
  const cellAt = (e) => {
    const b = cv.canvas.getBoundingClientRect(), c = Math.floor((e.clientX - b.left - geo.x) / geo.s), r = Math.floor((e.clientY - b.top - geo.y) / geo.s);
    return r >= 0 && r < R && c >= 0 && c < C ? [r, c] : null;
  };
  cv.canvas.addEventListener("pointerdown", (e) => { const p = cellAt(e); if (!p) return; painting = grid[p[0]][p[1]] ? 0 : 1; grid[p[0]][p[1]] = painting; gliderAt = -1; cv.canvas.setPointerCapture(e.pointerId); cv.redraw(); report(); });
  cv.canvas.addEventListener("pointermove", (e) => { if (painting < 0) return; const p = cellAt(e); if (p && grid[p[0]][p[1]] !== painting) { grid[p[0]][p[1]] = painting; cv.redraw(); report(); } });
  cv.canvas.addEventListener("pointerup", () => (painting = -1));
  function report() {
    const n = pop();
    api.status(`generation ${gen}, ${n} cells alive\nrule: born with 3 neighbours, survives with 2 or 3\n${mode === "copy" ? "every cell reads the same moment" : "cells read a grid that is changing under them"}`);
    if (!reached && mode === "copy" && triedNaive && gliderAt === 0 && gen >= 20 && n === 5) {
      reached = true;
      api.explain("The glider keeps going", `<p>Twenty generations on, still five cells, moved ${Math.floor(gen / 4)} squares diagonally. In place, the same five cells fell apart, because each cell saw some neighbours from the future.</p><p>Nothing in the rules says "move". The motion belongs to the pattern, not to any cell: a small case of <b>emergence</b>.</p>`);
      api.done("A glider flew for 20 generations");
    }
  }
  api.seg([{ label: "All at once", value: "copy" }, { label: "In place (naive)", value: "inplace" }], mode, (v) => {
    mode = v; if (v === "inplace") triedNaive = true; cv.redraw(); report();
    api.explain(v === "copy" ? "All at once" : "In place", v === "copy"
      ? "<p>The next generation is built in a fresh grid from the current one, so every cell counts neighbours at the same moment.</p>"
      : "<p>Each new value overwrites the old one straight away, scanning left to right, top to bottom. Cells further on count neighbours that have already moved to the next generation. Stamp a glider and watch.</p>");
  });
  api.button("Step", () => { step(); cv.redraw(); report(); }, { primary: true });
  api.button("Run", async () => {
    if (running) { running = false; return; }
    running = true;
    for (let k = 0; k < 400 && running; k++) { step(); cv.redraw(); report(); await api.sleep(70); }
    running = false;
  });
  for (const name of Object.keys(PATS)) api.button(name, () => { running = false; stamp(name); });
  api.button("Clear", () => { running = false; grid = blank(); gen = 0; gliderAt = -1; cv.redraw(); report(); });
  stamp("Glider");
  api.explain("How to read this", "<p>Drag on the grid to paint or erase cells. A live cell with 2 or 3 live neighbours lives; a dead cell with exactly 3 is born.</p><p>Try the glider <b>in place</b> first, then <b>all at once</b>, and let it fly for 20 generations.</p>");
});
