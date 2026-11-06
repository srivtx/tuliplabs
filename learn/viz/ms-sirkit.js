/* Shared SIR engine for the ModSim epidemic sims (chapters 11 to 14).
   run({beta, gamma, s0, i0, r0, days, noS}) steps the model one day at a time, as in the chapter:
   infected = beta·i·s, recovered = gamma·i. With noS the s factor is dropped (a naive version).
   Returns rows [day, s, i, r]. drawClass paints 90 students coloured by compartment. */
(function () {
  "use strict";
  function run({ beta, gamma, s0 = 89 / 90, i0 = 1 / 90, r0 = 0, days = 98, noS = false }) {
    let s = s0, i = i0, r = r0; const out = [[0, s, i, r]];
    for (let d = 1; d <= days; d++) {
      let inf = beta * i * (noS ? 1 : s); inf = Math.min(inf, s);
      const rec = gamma * i;
      s -= inf; i += inf - rec; r += rec; out.push([d, s, i, r]);
    }
    return out;
  }
  const total = (rows) => rows[0][1] - rows[rows.length - 1][1];
  const peak = (rows) => rows.reduce((b, q) => (q[2] > b[2] ? q : b), rows[0]);
  function drawClass(g, api, box, row, n = 90) {
    const { x0, y0, x1, y1 } = box, cols = 10, rows = Math.ceil(n / cols);
    const cell = Math.min((x1 - x0) / cols, (y1 - y0) / rows), ox = x0 + ((x1 - x0) - cell * cols) / 2;
    const nS = Math.round(row[1] * n), nI = Math.round(row[2] * n);
    for (let k = 0; k < n; k++) {
      const col = k < nI ? "bad" : k < nI + nS ? "c2" : "c3";
      g.fillStyle = api.color(col);
      g.beginPath(); g.arc(ox + (k % cols + 0.5) * cell, y0 + (Math.floor(k / cols) + 0.5) * cell, cell * 0.36, 0, 7); g.fill();
    }
  }
  window.MSSIR = { run, total, peak, drawClass };
})();
