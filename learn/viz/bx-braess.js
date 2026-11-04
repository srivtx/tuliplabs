/* Build your own X, chapter 44: the road that made everyone slower.
   Braess's paradox. 4,000 drivers go from Home to Work by the top road or the bottom road. Each
   route has one narrow road (the more cars, the slower) and one wide road (always 45 minutes).
   Open a free shortcut between the two, and each driver's selfish best choice becomes narrow,
   shortcut, narrow. When everybody does that, the trip takes 80 minutes instead of 65.
   The "why": no one can do better by switching, so the bad state is stable. A shared road is a game,
   and adding options to a game can make every player worse off. */
VIZ.register("bx-braess", async (api) => {
  const G = 40, PER = 100;                       // 40 dots of 100 drivers
  const ROUTES = [["S", "A", "E"], ["S", "B", "E"], ["S", "A", "B", "E"]];
  let route = [], open = false, planner = false, dots = [], sawBad = false, reached = api.wasDone, wait = 0;
  const names = ["top road", "bottom road", "the shortcut"];
  function reset() { route = Array.from({ length: G }, (_, i) => i % 2); dots = route.map((_, i) => ({ t: (i / G) * 1, })); }
  function loads() {
    const sa = route.filter((r) => r === 0 || r === 2).length * PER;
    const be = route.filter((r) => r === 1 || r === 2).length * PER;
    return { sa, be };
  }
  function timeOf(r, { sa, be }) {
    if (r === 0) return sa / 100 + 45;
    if (r === 1) return 45 + be / 100;
    return sa / 100 + be / 100;
  }
  function average() { const l = loads(); return route.reduce((s, r) => s + timeOf(r, l), 0) / G; }
  function shift() {
    if (planner) { route = route.map((_, i) => i % 2); return false; }
    const options = open ? [0, 1, 2] : [0, 1], first = (Math.random() * G) | 0;
    for (let k = 0; k < G; k++) {            // the next driver who can do better by switching
      const i = (first + k) % G, cur = route[i], now = timeOf(cur, loads());
      for (const r of options) {
        if (r === cur) continue;
        route[i] = r;
        if (timeOf(r, loads()) < now - 0.001) return true;
        route[i] = cur;
      }
    }
    return false;
  }
  const P = (w, h) => ({ S: [w * 0.09, h * 0.5], A: [w * 0.5, h * 0.16], B: [w * 0.5, h * 0.84], E: [w * 0.91, h * 0.5] });
  const seg = (p, a, b, f) => [p[a][0] + (p[b][0] - p[a][0]) * f, p[a][1] + (p[b][1] - p[a][1]) * f];
  api.wide();
  const cv = api.canvas2d((g, w, h) => {
    if (!route.length) return;
    const p = P(w, h), l = loads();
    const road = (a, b, wd, col) => { g.strokeStyle = col; g.lineWidth = wd; g.lineCap = "round"; g.beginPath(); g.moveTo(...p[a]); g.lineTo(...p[b]); g.stroke(); };
    const c1 = api.color("c1"), line = api.color("line"), c4 = api.color("c4"), ink = api.color("ink"), muted = api.color("muted");
    road("S", "A", 3 + l.sa / 500, c1); road("B", "E", 3 + l.be / 500, c1);
    road("A", "E", 12, line); road("S", "B", 12, line);
    if (open) road("A", "B", 5, c4);
    else { g.setLineDash([3, 7]); road("A", "B", 2, line); g.setLineDash([]); }
    // drivers
    route.forEach((r, i) => {
      const legs = ROUTES[r], d = dots[i];
      const q = d.t * (legs.length - 1), k = Math.min(legs.length - 2, Math.floor(q));
      const [X, Y] = seg(p, legs[k], legs[k + 1], q - k);
      g.fillStyle = r === 2 ? c4 : api.color("c2");
      g.beginPath(); g.arc(X, Y, 4.2, 0, 6.2832); g.fill();
    });
    g.font = "600 13px 'IBM Plex Sans', sans-serif"; g.textAlign = "center"; g.fillStyle = ink;
    const tag = (n, t) => { g.fillStyle = api.color("card"); g.beginPath(); g.arc(p[n][0], p[n][1], 20, 0, 6.2832); g.fill(); g.strokeStyle = line; g.lineWidth = 1; g.stroke(); g.fillStyle = ink; g.fillText(t, p[n][0], p[n][1] + 4); };
    tag("S", "Home"); tag("E", "Work");
    g.font = "12px 'IBM Plex Mono', monospace"; g.fillStyle = muted;
    const mid = (a, b, dx, dy, s) => g.fillText(s, (p[a][0] + p[b][0]) / 2 + dx, (p[a][1] + p[b][1]) / 2 + dy);
    mid("S", "A", -44, -6, `${Math.round(l.sa / 100)} min`); mid("B", "E", 46, 16, `${Math.round(l.be / 100)} min`);
    mid("A", "E", 42, -6, "45 min"); mid("S", "B", -42, 16, "45 min");
    if (open) mid("A", "B", 34, 4, "free");
    g.fillStyle = ink; g.font = "600 26px 'IBM Plex Mono', monospace"; g.textAlign = "right";
    g.fillText(`${Math.round(average())} min`, w - 16, 36);
    g.font = "11px 'IBM Plex Sans', sans-serif"; g.fillStyle = muted;
    g.fillText("average trip", w - 16, 52);
  });
  let tick = 0;
  api.loop((dt) => {
    if (!cv.w) return;
    if (!route.length) reset();
    dots.forEach((d) => { d.t = (d.t + dt * 0.22) % 1; });
    if (tick++ % 5 === 0) shift();
    const mean = average();
    if (open && !planner && mean > 79.5) sawBad = true;
    if (!open && sawBad && mean < 65.5) wait += dt; else wait = 0;
    if (!reached && sawBad && wait > 0.4) {
      reached = true;
      api.done("Closing a road saved everyone 15 minutes. Selfish choices and shared roads can do that");
    }
    const c = [0, 1, 2].map((r) => route.filter((q) => q === r).length * PER);
    api.status(`${c[0]} on the top road · ${c[1]} on the bottom road${open ? ` · ${c[2]} on the shortcut` : ""}`);
    cv.redraw();
  });
  api.seg([{ label: "Shortcut closed", value: 0 }, { label: "Shortcut open", value: 1 }], 0, (v) => {
    open = !!v;
    if (!open) route = route.map((r, i) => (r === 2 ? i % 2 : r));
    api.explain(open ? "A free road" : "Closed", open
      ? "<p>Each driver sees a route that beats their current one, and switches. The more who switch, the worse the narrow roads get, but no single driver can do better by leaving. Everyone ends up on the shortcut at 80 minutes.</p>"
      : "<p>The drivers split evenly: 2,000 on each route, 65 minutes each. Nobody can do better by switching.</p>");
  });
  api.seg([{ label: "Everyone for themselves", value: 0 }, { label: "A planner decides", value: 1 }], 0, (v) => {
    planner = !!v;
    api.explain(planner ? "A planner" : "Everyone for themselves", planner
      ? "<p>A planner keeps the drivers split, whatever roads exist. Everyone takes 65 minutes. Each person would be tempted to cheat, which is why this needs tolls, signals or a routing app, and not just good will.</p>"
      : "<p>Each driver picks the fastest route for themselves, given what everybody else is doing. This is called a Nash equilibrium when no one wants to move.</p>");
  });
  api.explain("Two routes to work", "<p>4,000 drivers. Red roads are narrow: the more cars, the slower. Grey roads are wide: always 45 minutes. Open the free shortcut and watch the average trip.</p>");
});
