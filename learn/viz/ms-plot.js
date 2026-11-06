/* Shared plotting helper for the ModSim sims. Load with `await VIZ.lib("ms-plot")`, then
   MSPLOT.plot(g, api, box, opts) draws axes, ticks, labels and line series into box
   {x0, y0, x1, y1} and returns {X, Y} to map data to pixels.
   opts: xlim [a, b], ylim [a, b], xlabel, ylabel, title,
         series [{pts: [[x, y]…], col: "c1", width, dash, dots, label, alpha}],
         hlines / vlines [{v, col, label, dash}], band {x: [a, b]} or {y: [a, b]} to shade. */
(function () {
  "use strict";
  function ticks(a, b, n = 5) {
    const span = b - a; if (!(span > 0)) return [a];
    const raw = span / n, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
    const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag;
    const out = []; for (let t = Math.ceil(a / step - 1e-9) * step; t <= b + 1e-9; t += step) out.push(+t.toFixed(10));
    return out;
  }
  const fmt = (v) => (Math.abs(v) >= 10000 ? (v / 1000).toFixed(0) + "k" : Math.abs(v) < 1e-9 ? "0" : +v.toPrecision(4) + "");
  function plot(g, api, box, o) {
    const { x0, y0, x1, y1 } = box, [xa, xb] = o.xlim, [ya, yb] = o.ylim;
    const X = (v) => x0 + ((v - xa) / (xb - xa)) * (x1 - x0), Y = (v) => y1 - ((v - ya) / (yb - ya)) * (y1 - y0);
    const C = (n) => (n && n.startsWith("#") ? n : api.color(n || "c1"));
    g.save();
    g.font = "11px 'IBM Plex Sans', sans-serif";
    if (o.band) {
      g.fillStyle = C(o.band.col || "ok"); g.globalAlpha = 0.12;
      if (o.band.x) g.fillRect(X(o.band.x[0]), y0, X(o.band.x[1]) - X(o.band.x[0]), y1 - y0);
      if (o.band.y) g.fillRect(x0, Y(o.band.y[1]), x1 - x0, Y(o.band.y[0]) - Y(o.band.y[1]));
      g.globalAlpha = 1;
    }
    g.strokeStyle = api.color("line"); g.lineWidth = 1; g.globalAlpha = 0.45;
    g.beginPath();
    for (const t of ticks(ya, yb)) { g.moveTo(x0, Y(t)); g.lineTo(x1, Y(t)); }
    g.stroke(); g.globalAlpha = 1;
    g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = api.color("muted"); g.textAlign = "center";
    for (const t of ticks(xa, xb, Math.max(3, Math.floor((x1 - x0) / 70)))) g.fillText(o.xfmt ? o.xfmt(t) : fmt(t), X(t), y1 + 13);
    g.textAlign = "right";
    for (const t of ticks(ya, yb)) g.fillText(o.yfmt ? o.yfmt(t) : fmt(t), x0 - 4, Y(t) + 4);
    if (o.xlabel) { g.textAlign = "center"; g.fillText(o.xlabel, (x0 + x1) / 2, y1 + 26); }
    if (o.ylabel) { g.textAlign = "left"; g.fillText(o.ylabel, x0, y0 - 7); }
    const clip = () => { g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip(); };
    clip();
    for (const l of o.hlines || []) line(g, C(l.col || "muted"), l.dash ?? [4, 4], [[x0, Y(l.v)], [x1, Y(l.v)]]);
    for (const l of o.vlines || []) line(g, C(l.col || "c4"), l.dash ?? [], [[X(l.v), y0], [X(l.v), y1]]);
    for (const s of o.series || []) {
      if (!s.pts || !s.pts.length) continue;
      g.globalAlpha = s.alpha ?? 1;
      if (s.dots) {
        g.fillStyle = C(s.col);
        for (const [a, b] of s.pts) { g.beginPath(); g.arc(X(a), Y(b), s.r || 3, 0, 7); g.fill(); }
      }
      if (!s.dots || s.line) {
        g.strokeStyle = C(s.col); g.lineWidth = s.width || 2; g.setLineDash(s.dash || []);
        g.beginPath(); s.pts.forEach(([a, b], i) => (i ? g.lineTo(X(a), Y(b)) : g.moveTo(X(a), Y(b)))); g.stroke(); g.setLineDash([]);
      }
      g.globalAlpha = 1;
    }
    g.restore();
    // labels for hlines and the legend
    g.textAlign = "left";
    for (const l of o.hlines || []) if (l.label) { g.fillStyle = C(l.col || "muted"); g.fillText(l.label, x0 + 4, Y(l.v) - 4); }
    for (const l of o.vlines || []) if (l.label) { g.fillStyle = C(l.col || "c4"); g.fillText(l.label, Math.min(X(l.v) + 4, x1 - 90), y0 + 13); }
    const named = (o.series || []).filter((s) => s.label);
    if (named.length) {
      let lx = x0 + 8, ly = y0 + 14;
      if (o.legend === "right") lx = x1 - 8 - Math.max(...named.map((s) => g.measureText(s.label).width)) - 18;
      for (const s of named) {
        g.fillStyle = C(s.col); g.fillRect(lx, ly - 8, 12, 3 + (s.dots ? 4 : 0));
        g.fillStyle = api.color("ink"); g.fillText(s.label, lx + 17, ly - 2); ly += 15;
      }
    }
    g.restore();
    return { X, Y, ticks };
  }
  function line(g, col, dash, pts) {
    g.strokeStyle = col; g.lineWidth = 1.5; g.setLineDash(dash);
    g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.stroke(); g.setLineDash([]);
  }
  // A left "scene" box and a right plot box, stacked on narrow screens.
  function split(w, h, frac = 0.42, top = 30) {
    if (w < 560) {
      const sh = Math.round(h * 0.42);
      return { scene: { x0: 6, y0: top, x1: w - 6, y1: sh }, plot: { x0: 48, y0: sh + 26, x1: w - 12, y1: h - 32 } };
    }
    const sx = Math.round(w * frac);
    return { scene: { x0: 6, y0: top, x1: sx, y1: h - 8 }, plot: { x0: sx + 52, y0: top + 16, x1: w - 14, y1: h - 34 } };
  }
  function title(g, api, text, x = 8, y = 18) {
    g.fillStyle = api.color("ink"); g.font = "600 13px 'IBM Plex Mono', monospace"; g.textAlign = "left"; g.fillText(text, x, y);
  }
  // Seeded random numbers, so every learner sees the same "random" run.
  function rng(seed = 1) { let s = seed; return () => ((s = (s * 16807) % 2147483647), s / 2147483647); }
  window.MSPLOT = { plot, ticks, split, title, rng, fmt };
})();
