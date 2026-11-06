/* Shared engine for the ModSim bike-share sims (chapters 2, 3 and 4).
   Two stations, Olin and Wellesley. Each minute a rider turns up at Olin with chance p1 and rides
   to Wellesley; one turns up at Wellesley with chance p2 and rides the other way.
   MSBIKE.run(p1, p2, minutes, guard, rnd) runs one afternoon and returns the history and the
   count of riders who found an empty station. MSBIKE.draw paints the two stations. */
(function () {
  "use strict";
  function run(p1, p2, minutes, guard, rnd, start = [10, 2]) {
    let olin = start[0], wel = start[1], oe = 0, we = 0;
    const hist = [[0, olin, wel]];
    for (let t = 1; t <= minutes; t++) {
      if (rnd() < p1) { if (guard && olin === 0) oe++; else { olin--; wel++; } }
      if (rnd() < p2) { if (guard && wel === 0) we++; else { wel--; olin++; } }
      hist.push([t, olin, wel]);
    }
    return { hist, olinEmpty: oe, welEmpty: we, minOlin: Math.min(...hist.map((r) => r[1])), minWel: Math.min(...hist.map((r) => r[2])) };
  }
  // Two racks of bikes; a negative count is drawn as red "missing" bikes below the rack.
  function draw(g, api, box, olin, wel) {
    const { x0, y0, x1, y1 } = box, mid = (x0 + x1) / 2;
    const one = (x, name, n) => {
      const cols = 4, size = Math.min(16, (x1 - x0) / 2 / (cols + 2)), base = y0 + (y1 - y0) * 0.62;
      g.fillStyle = api.color("ink"); g.font = "600 12px 'IBM Plex Sans', sans-serif"; g.textAlign = "center";
      g.fillText(name, x, y0 + 12);
      g.font = "600 22px 'IBM Plex Mono', monospace"; g.fillStyle = n < 0 ? api.color("bad") : api.color("ink");
      g.fillText(n, x, y0 + 40);
      g.fillStyle = api.color("line"); g.fillRect(x - cols * size / 2 - 4, base, cols * size + 8, 2);
      for (let i = 0; i < Math.abs(n) && i < 24; i++) {
        const r = Math.floor(i / cols), c = i % cols, bx = x - cols * size / 2 + c * size + size / 2;
        const by = n >= 0 ? base - 6 - r * size - size / 2 : base + 8 + r * size + size / 2;
        g.strokeStyle = n >= 0 ? api.color("c2") : api.color("bad"); g.lineWidth = 1.6;
        if (n < 0) g.setLineDash([2, 2]);
        g.beginPath(); g.arc(bx - size * 0.22, by, size * 0.2, 0, 7); g.arc(bx + size * 0.22, by, size * 0.2, 0, 7); g.stroke(); g.setLineDash([]);
      }
    };
    one(x0 + (mid - x0) / 2, "Olin", olin); one(mid + (x1 - mid) / 2, "Wellesley", wel);
  }
  window.MSBIKE = { run, draw };
})();
