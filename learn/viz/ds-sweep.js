/* DSA, chapter 14: the sweep line.
   Nine meetings on a 20-hour timeline. What's the most that ever overlap (how many rooms)?
   The "why": checking every hour against every meeting costs hours × meetings, and with times up
   to 10⁹ you can't even list the hours. Turn each meeting into two events, +1 at its start and -1
   at its end, sort them, and sweep a line left to right keeping a running count. Only 2n events
   matter, whatever the times are: O(n log n) for the sort. */
VIZ.register("ds-sweep", async (api) => {
  const W = await api.world3d();
  const M = [[1, 5], [2, 7], [4, 9], [6, 10], [8, 13], [11, 15], [12, 18], [14, 16], [17, 20]];
  const T = 20, X = (t) => -8 + t * 0.8, ROW = (i) => 0.5 + i * 0.55;
  const EV = M.flatMap(([s, e], i) => [[s, 1, i], [e, -1, i]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let mode = "naive", gen = null, steps = 0, depth = {}, best = 0, look = -1, at = -1, live = new Set(), running = false, ran = {}, reached = false, line = "";
  function* naive() {
    for (let t = 0; t < T; t++) {
      at = t; let c = 0;
      for (let i = 0; i < M.length; i++) {
        steps++; look = i;
        if (M[i][0] <= t && t < M[i][1]) c++;
        yield `hour ${t}: meeting ${i} (${M[i][0]}–${M[i][1]}) ${M[i][0] <= t && t < M[i][1] ? "is on" : "isn't on"}, ${c} so far`;
      }
      depth[t] = c; best = Math.max(best, c); look = -1;
    }
    at = -1;
  }
  function* sweep() {
    let c = 0, prev = 0;
    for (const [t, d, i] of EV) {
      for (let h = prev; h < t; h++) depth[h] = c;
      prev = t; at = t; steps++; look = i;
      c += d; d > 0 ? live.add(i) : live.delete(i); best = Math.max(best, c);
      yield `time ${t}: meeting ${i} ${d > 0 ? "starts, +1" : "ends, −1"} → ${c} in progress${c === best && d > 0 ? " (most so far)" : ""}`;
    }
    look = -1; at = -1;
  }
  function draw() {
    M.forEach(([s, e], i) => {
      const on = mode === "naive" ? at >= s && at < e : live.has(i);
      W.box("m" + i, { x: (X(s) + X(e)) / 2, y: ROW(i), z: 0, sx: (e - s) * 0.8 - 0.08, sy: 0.4, sz: 0.5, color: i === look ? "c1" : on ? "c2" : "c5", glow: i === look ? 0.35 : 0, opacity: on || i === look ? 0.95 : 0.45,
        label: `${s}–${e}`, labelSize: 0.22, labelUp: 0,
        info: { title: `Meeting ${i}: ${s}:00 to ${e}:00`, html: `<p>Two events in the sweep: <b>+1</b> at ${s}, <b>−1</b> at ${e}. It ends at ${e}, so a meeting starting at ${e} can use the same room.</p>` } });
    });
    for (let t = 0; t < T; t++) {
      const d = depth[t];
      if (d === undefined) { W.remove("d" + t); continue; }
      W.box("d" + t, { x: X(t + 0.5), y: -0.9 - d * 0.25, z: 0, sx: 0.74, sy: Math.max(0.04, d * 0.5), sz: 0.5, color: d === best && best > 0 ? "c3" : "c4", opacity: 0.85,
        label: d ? String(d) : "", labelSize: 0.22, labelUp: -0.1 - d * 0.25,
        info: { title: `Hour ${t}`, html: `<p>${d} meeting${d === 1 ? "" : "s"} in progress.</p>` } });
    }
    W.box("line", { x: X(Math.max(at, 0)), y: 2.6, z: 0.3, sx: 0.06, sy: 6.6, sz: 0.06, color: "c1", opacity: 0.8, visible: at >= 0 });
    for (const t of [0, 5, 10, 15, 20]) W.label("t" + t, `${t}`, [X(t), -0.35, 0.5], { color: "muted", size: 0.24 });
  }
  function show() { api.status(`${mode === "naive" ? "check every hour" : "sweep the events"} · ${steps} step${steps === 1 ? "" : "s"} · most at once: ${best}\n${line}`); }
  function reset() { steps = 0; depth = {}; best = 0; look = -1; at = -1; live = new Set(); line = ""; for (let t = 0; t < T; t++) W.remove("d" + t); gen = mode === "naive" ? naive() : sweep(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = steps;
    if (mode === "naive") api.explain(`${steps} checks`, `<p>Every hour against every meeting: ${T} × ${M.length}. If times were in milliseconds over a year, there'd be 3·10¹⁰ "hours" to check.</p><p>Switch to <b>sweep the events</b> and step through it.</p>`);
    else if (ran.naive && !reached) { reached = true; api.explain("Only the events matter", `<p>${steps} events instead of ${ran.naive} checks, and the same answer: ${best} rooms. The count only changes at a start or an end, so you only look there. Sort the 2n events (ends before starts at the same time), sweep, keep the running count: O(n log n), whatever the times are.</p>`); api.done("You swept a line over events"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "naive" ? 28 : 500); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "check every hour", value: "naive" }, { label: "sweep the events", value: "sweep" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 1.2, 0], dist: 24, theta: 0, phi: 1.45, instant: true });
  api.hud("one row per meeting · blue = in progress · red = being checked / the sweep line · bars below = meetings in progress each hour · green = the most");
  reset();
  api.explain("How to read this", `<p>Each row is a meeting. How many rooms do you need, i.e. what's the most meetings happening at once? <b>Run all</b> with <b>check every hour</b>, then switch to <b>sweep the events</b>.</p>`);
});
