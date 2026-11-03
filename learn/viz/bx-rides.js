/* Build your own X, chapter 34: a ride-share matcher.
   Four riders ask for a car within a couple of seconds of each other; four drivers are free.
   The "why": giving each rider the nearest free driver, in the order they asked, feels fair, but
   the first rider can take the only driver near the second, who then waits for one from across
   town. Holding requests for a moment and matching the whole batch at once (an assignment problem:
   least total driving) gives everyone a shorter wait, and the worst wait halves. Real dispatchers
   batch every few seconds and use a spatial index so "nearby drivers" doesn't mean checking all. */
VIZ.register("bx-rides", async (api) => {
  const W = await api.world3d();
  const R = [[0, 0], [3, 1], [-3, 2], [5, -2]], D = [[2, 0], [-4, 0], [9, 0], [-1, 4]];
  const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const S = 0.42, at = ([x, y]) => [x * S - 0.6, y * S - 0.3];
  let mode = "greedy", gen = null, pair = [], cur = -1, tried = 0, running = false, ran = {}, reached = false, line = "";
  const total = () => pair.reduce((s, j, i) => s + (j >= 0 ? dist(R[i], D[j]) : 0), 0);
  const worst = () => Math.max(0, ...pair.map((j, i) => (j >= 0 ? dist(R[i], D[j]) : 0)));
  function* greedy() {
    const free = new Set([0, 1, 2, 3]);
    for (let i = 0; i < R.length; i++) {
      cur = i; let j = -1;
      for (const k of free) if (j < 0 || dist(R[i], D[k]) < dist(R[i], D[j])) j = k;
      free.delete(j); pair[i] = j;
      yield `rider ${i + 1} asks: the nearest free driver is ${j + 1}, ${dist(R[i], D[j])} blocks away`;
    }
    cur = -1;
    yield `total driving to pickups: ${total()} blocks. Rider ${pair.map((j, i) => dist(R[i], D[j])).indexOf(worst()) + 1} waits for a car ${worst()} blocks away`;
  }
  function* batch() {
    yield `hold the four requests for two seconds, then match them all at once`;
    const perms = [];
    const go = (p, used) => { if (p.length === 4) { perms.push(p.slice()); return; } for (let k = 0; k < 4; k++) if (!used[k]) { used[k] = true; p.push(k); go(p, used); p.pop(); used[k] = false; } };
    go([], []);
    let best = Infinity;
    for (const p of perms) {
      tried++;
      const t = p.reduce((s, j, i) => s + dist(R[i], D[j]), 0);
      if (t < best) { best = t; pair = p.slice(); yield `assignment ${tried} of 24: total ${t} blocks, the best so far`; }
    }
    yield `all 24 checked: the best total is ${total()} blocks, and nobody waits more than ${worst()}`;
  }
  function draw() {
    R.forEach((p, i) => { const [x, y] = at(p); W.box("r" + i, { x, y, z: 0, sx: 0.32, sy: 0.32, sz: 0.32, color: "c1", glow: i === cur ? 0.5 : 0, opacity: 0.95, label: `R${i + 1}`, labelSize: 0.16, labelUp: 0.3,
      info: { title: `Rider ${i + 1}`, html: `<p>Asked ${["first", "second", "third", "fourth"][i]}.${pair[i] >= 0 ? ` Gets driver ${pair[i] + 1}, ${dist(p, D[pair[i]])} blocks away.` : ""}</p>` } }); });
    D.forEach((p, j) => { const [x, y] = at(p); const taken = pair.includes(j); W.box("d" + j, { x, y, z: 0, sx: 0.34, sy: 0.22, sz: 0.4, color: taken ? "c3" : "c2", opacity: 0.95, label: `D${j + 1}`, labelSize: 0.16, labelUp: 0.3,
      info: { title: `Driver ${j + 1}`, html: `<p>${taken ? `Picking up rider ${pair.indexOf(j) + 1}.` : "Free."}</p>` } }); });
    R.forEach((_, i) => { if (pair[i] >= 0) W.line("m" + i, "r" + i, "d" + pair[i], { color: dist(R[i], D[pair[i]]) >= 7 ? "c1" : "c3" }); else W.unline("m" + i); });
    for (let gx = -4; gx <= 9; gx++) W.box("gx" + gx, { x: at([gx, 0])[0], y: at([0, 1])[1], z: -0.3, sx: 0.02, sy: 7 * S, sz: 0.02, color: "line", opacity: 0.25 });
    for (let gy = -2; gy <= 4; gy++) W.box("gy" + gy, { x: at([2.5, 0])[0], y: at([0, gy])[1], z: -0.3, sx: 13 * S, sy: 0.02, sz: 0.02, color: "line", opacity: 0.25 });
    W.label("tot", pair.some((j) => j >= 0) ? `total ${total()} blocks · worst wait ${worst()}` : "", [0.4, -1.9, 0.2], { color: "ink", size: 0.22 });
  }
  function show() { api.status(`${mode === "greedy" ? "nearest free driver, in order" : "batch and match"} · ${total()} blocks\n${line}`); }
  function reset() { pair = [-1, -1, -1, -1]; cur = -1; tried = 0; line = ""; gen = mode === "greedy" ? greedy() : batch(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = { t: total(), w: worst() };
    if (mode === "greedy") api.explain(`${total()} blocks, worst wait ${worst()}`, `<p>Rider 1 took driver 1, the only car near rider 2, so rider 2 got one from across town, and rider 4 got what was left.</p><p>Switch to <b>batch and match</b> and run it.</p>`);
    else if (ran.greedy && !reached) { reached = true; api.explain("Match the batch", `<p>${total()} blocks against ${ran.greedy.t}, and the worst wait is ${worst()} instead of ${ran.greedy.w}. Rider 1 waits a little longer so everyone else waits much less.</p><p>For bigger batches, the Hungarian algorithm or min-cost flow finds the best assignment without trying every one.</p>`); api.done("You matched riders to drivers"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(1000); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "nearest free driver, in order", value: "greedy" }, { label: "batch and match", value: "batch" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0.4, 0.1, 0], dist: 9, theta: 0, phi: 1.5, instant: true });
  api.hud("red cubes = riders, numbered in the order they asked · blue/green = drivers · lines = who picks up whom, red = a long wait · distance in city blocks");
  reset();
  api.explain("How to read this", `<p>Four riders, four free drivers. <b>Run all</b> with <b>nearest free driver, in order</b>, then with <b>batch and match</b>.</p>`);
});
