/* DSA, chapter 56: Euler paths.
   A little house: four walls, two diagonals, and a roof. Draw every line once without lifting the pen.
   The "why": walking to the first unused line and hoping gets stuck at the far corner with the roof
   still undrawn. Hierholzer's algorithm keeps the walk on a stack; when the current corner has no
   lines left, it pops that corner onto the finished path and backs up to the last corner that still
   has some, and starts a detour there. The detour always comes back to where it started, so it slots
   into the path. Every line is pushed once and popped once: O(E). */
VIZ.register("ds-euler", async (api) => {
  const W = await api.world3d();
  const P = [[-1.5, -1.6], [1.5, -1.6], [-1.5, 1.0], [1.5, 1.0], [0, 2.6]];
  const E = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3], [2, 4], [3, 4]];
  const deg = P.map((_, v) => E.filter(([a, b]) => a === v || b === v).length);
  let mode = "greedy", gen = null, used = [], order = [], stack = [], path = [], at = -1, ops = 0, running = false, ran = {}, reached = false, line = "";
  const next = (v) => E.map((e, i) => [e[0] === v ? e[1] : e[1] === v ? e[0] : -1, i]).filter(([u, i]) => u >= 0 && !used[i]).sort((x, y) => x[0] - y[0])[0];
  function* greedy() {
    at = 0; stack = [0];
    yield `corners 0 and 1 touch an odd number of lines, so the pen must start at one and end at the other. Start at 0`;
    while (true) {
      const nx = next(at); ops++;
      if (!nx) break;
      used[nx[1]] = true; order.push(nx[1]); stack.push(nx[0]);
      yield `${at} → ${nx[0]}: the first line not drawn yet`;
      at = nx[0];
    }
    const left = E.length - order.length;
    yield `stuck at ${at} with ${left} line${left === 1 ? "" : "s"} undrawn: every line here is used, and the roof was never reached`;
  }
  function* hierholzer() {
    at = 0; stack = [0];
    yield `corners 0 and 1 touch an odd number of lines, so start at 0. The stack holds the walk so far`;
    while (stack.length) {
      const v = stack[stack.length - 1], nx = next(v); ops++; at = v;
      if (nx) {
        used[nx[1]] = true; order.push(nx[1]); stack.push(nx[0]); at = nx[0];
        yield `push ${nx[0]}: walk ${v} → ${nx[0]}`;
      } else {
        path.push(stack.pop()); at = stack.length ? stack[stack.length - 1] : v;
        yield `${v} has no lines left: pop it onto the finished path${stack.length && next(at) ? `. Back at ${at}, which still has a line: a detour starts here` : ""}`;
      }
    }
    path.reverse();
    yield `done: ${path.join(" → ")}, all ${E.length} lines once each, ${ops} steps`;
  }
  function draw() {
    const done = mode === "hier" && !stack.length && path.length;
    P.forEach(([x, y], v) => W.box("v" + v, { x, y, z: 0, sx: 0.6, sy: 0.6, sz: 0.4, color: deg[v] % 2 ? "c4" : "c5", glow: v === at ? 0.5 : 0, opacity: 0.92,
      label: `${v}`, labelSize: 0.24, labelUp: 0,
      info: { title: `Corner ${v}`, html: `<p>Touches ${deg[v]} lines: ${deg[v] % 2 ? "odd, so the pen has to start or finish here" : "even, so every time the pen arrives it can leave again"}.</p>` } }));
    E.forEach(([a, b], i) => {
      const k = order.indexOf(i);
      W.line("e" + i, "v" + a, "v" + b, { color: !used[i] ? "line" : done ? "c3" : k === order.length - 1 ? "c1" : "c2" });
      W.label("n" + i, k >= 0 ? `${k + 1}` : "", [(P[a][0] + P[b][0]) / 2 + 0.18, (P[a][1] + P[b][1]) / 2 + 0.18, 0.2], { color: "muted", size: 0.17 });
    });
    W.label("st", mode === "hier" ? `stack: ${stack.join(" ")}` : "", [-1.9, -2.5, 0], { color: "ink", size: 0.2 });
    W.label("pa", mode === "hier" && path.length ? `path: ${(done ? path : [...path].reverse()).join(" ")}` : "", [1.9, -2.5, 0], { color: "c3", size: 0.2 });
  }
  function show() { api.status(`${mode === "greedy" ? "walk until stuck" : "Hierholzer"} · ${order.length} of ${E.length} lines drawn\n${line}`); }
  function reset() { used = new Array(E.length).fill(false); order = []; stack = []; path = []; at = -1; ops = 0; line = ""; gen = mode === "greedy" ? greedy() : hierholzer(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = order.length;
    if (mode === "greedy") api.explain(`Stuck after ${order.length} lines`, `<p>The walk wandered back to corner 1 before visiting the roof. Starting again with different choices might work here, but on a big graph guessing is hopeless.</p><p>Switch to <b>Hierholzer</b> and run it.</p>`);
    else if (ran.greedy !== undefined && !reached) { reached = true; api.explain("Detours slot in", `<p>The same first walk got stuck at 1, but the stack remembered it. Popping back to corner 3 found unused lines, and the detour 3 → 2 → 4 → 3 came back to where it began, so it fits into the path.</p><p>Each line is pushed once and popped once: O(E).</p>`); api.done("You drew the house in one stroke"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(900); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "walk until stuck", value: "greedy" }, { label: "Hierholzer", value: "hier" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.2, 0], dist: 10, theta: 0, phi: 1.5, instant: true });
  api.hud("draw every line once without lifting the pen · amber corners = odd number of lines · numbers = drawing order · red = latest line");
  reset();
  api.explain("How to read this", `<p>Trace the house in one stroke. <b>Run all</b> with <b>walk until stuck</b>, then with <b>Hierholzer</b>.</p>`);
});
