/* DSA, chapter 17: depth-first against breadth-first.
   How shallow is the nearest leaf of this tree? (A leaf has no children.)
   The "why": depth-first search dives down the left side first and has to see every leaf before
   it can be sure which one is shallowest. Breadth-first search visits the tree level by level with
   a queue, so the first leaf it meets is the shallowest, and it stops right there. Both are O(n)
   in the worst case; picking the right order decides how much of the tree you actually touch. */
VIZ.register("ds-tree", async (api) => {
  const W = await api.world3d();
  const T = { 1: [2, 3], 2: [4, 5], 3: [], 4: [8, 9], 5: [10, 11], 8: [12, 13], 9: [], 10: [], 11: [], 12: [], 13: [] };
  const pos = {}, depth = { 1: 1 };
  let col = 0;
  (function place(v) { const [l, r] = T[v]; if (l) { depth[l] = depth[v] + 1; place(l); } pos[v] = [-6.4 + col++ * 1.28, 5 - depth[v] * 1.25]; if (r) { depth[r] = depth[v] + 1; place(r); } })(1);
  const IDS = Object.keys(T).map(Number);
  let mode = "dfs", gen = null, visits = 0, seen = new Set(), front = [], cur = 0, best = Infinity, bestNode = 0, running = false, ran = {}, reached = false, line = "";
  function* dfs() {
    front = [1];
    while (front.length) {
      const v = front.pop(); cur = v; visits++; seen.add(v);
      const leaf = !T[v].length;
      if (leaf && depth[v] < best) { best = depth[v]; bestNode = v; }
      for (const c of [...T[v]].reverse()) front.push(c);
      yield leaf ? `pop ${v} off the stack: a leaf at depth ${depth[v]}${bestNode === v ? " (shallowest so far, but there may be others)" : ""}` : `pop ${v} off the stack, push its children`;
    }
    cur = 0;
    yield `stack empty: every node seen, so the shallowest leaf is ${bestNode} at depth ${best}`;
  }
  function* bfs() {
    front = [1];
    while (front.length) {
      const v = front.shift(); cur = v; visits++; seen.add(v);
      if (!T[v].length) { best = depth[v]; bestNode = v; front = []; yield `take ${v} from the queue: a leaf at depth ${depth[v]}. Everything shallower is already done, so stop`; return; }
      front.push(...T[v]);
      yield `take ${v} from the queue (depth ${depth[v]}), add its children to the back`;
    }
  }
  function draw() {
    for (const v of IDS) {
      W.box("n" + v, { x: pos[v][0], y: pos[v][1], z: 0, sx: 0.7, sy: 0.7, sz: 0.7, color: v === bestNode && !running ? "c3" : v === cur ? "c1" : front.includes(v) ? "c4" : seen.has(v) ? "c2" : "c5", glow: v === cur ? 0.4 : 0, opacity: seen.has(v) || front.includes(v) ? 0.95 : 0.4,
        label: String(v), labelSize: 0.28, labelUp: 0,
        info: { title: `Node ${v}`, html: `<p>Depth ${depth[v]}. ${T[v].length ? `Children: ${T[v].join(", ")}.` : "A <b>leaf</b>: no children."}</p>` } });
      for (const c of T[v]) W.line(`e${v}_${c}`, "n" + v, "n" + c, { color: "line" });
    }
    for (let k = 0; k < 8; k++) {
      const v = front[k];
      if (v === undefined) { W.remove("f" + k); continue; }
      W.box("f" + k, { x: 0.8 + k * 0.75, y: -2.6, z: 0, sx: 0.62, sy: 0.62, sz: 0.62, color: "c4", label: String(v), labelSize: 0.26, labelUp: 0,
        info: { title: mode === "dfs" ? "The stack" : "The queue", html: mode === "dfs" ? "<p>Depth-first takes from the <b>right end</b> (the top of the stack): the newest node, so it dives deep.</p>" : "<p>Breadth-first takes from the <b>left end</b> (the front of the queue): the oldest node, so it finishes each level first.</p>" } });
    }
    W.label("fl", mode === "dfs" ? "stack (top on the right)" : "queue (front on the left)", [2.6, -3.4, 0.4], { color: "muted", size: 0.26 });
  }
  function show() { api.status(`${mode === "dfs" ? "depth-first (stack)" : "breadth-first (queue)"} · ${visits} node${visits === 1 ? "" : "s"} visited of ${IDS.length}${best < Infinity ? ` · shallowest leaf so far: depth ${best}` : ""}\n${line}`); }
  function reset() { visits = 0; seen = new Set(); front = []; cur = 0; best = Infinity; bestNode = 0; line = ""; gen = mode === "dfs" ? dfs() : bfs(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { cur = 0; draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = visits;
    if (mode === "dfs") api.explain(`${visits} nodes visited`, `<p>Depth-first found a leaf at depth ${depth[12]} early, but couldn't trust it until it had seen the whole tree. A tree with a million nodes on its left side means a million visits.</p><p>Switch to <b>breadth-first</b> and step through it.</p>`);
    else if (ran.dfs && !reached) { reached = true; api.explain("Level by level", `<p>${visits} nodes instead of ${ran.dfs}. A queue hands out nodes in order of depth, so the first leaf out is the shallowest one, and you can stop.</p><p>Use <b>breadth-first</b> for "nearest", "fewest steps" and "level by level". Use <b>depth-first</b> (recursion) for "whole subtree" answers like height, sums and paths.</p>`); api.done("You searched a tree both ways"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(650); running = false; draw(); });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "depth-first", value: "dfs" }, { label: "breadth-first", value: "bfs" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.8, 0], dist: 22, theta: 0, phi: 1.5, instant: true });
  api.hud("find the shallowest leaf · red = visiting · amber = waiting in the stack/queue · blue = visited · green = the answer");
  reset();
  api.explain("How to read this", `<p>How deep is the nearest leaf (a node with no children)? <b>Run all</b> with <b>depth-first</b>, then switch to <b>breadth-first</b>.</p>`);
});
