/* DSA, chapter 22: union-find (disjoint set union).
   Sixteen people; friendships arrive one at a time. Which friend group is each person in?
   The "why": keeping a group label on every person means each merge must scan everyone to relabel
   one group: O(n) per merge, O(n²) for a stream of them. Union-find stores only a parent pointer
   per person; a group is a tree and its root names it. Union by size hangs the smaller tree under
   the bigger one, and path compression points everyone on a find path straight at the root, so a
   merge costs a handful of hops: nearly O(1) each. */
VIZ.register("ds-dsu", async (api) => {
  const W = await api.world3d();
  const n = 16;
  const OPS = [[0, 1], [2, 3], [1, 3], [4, 5], [6, 7], [5, 7], [3, 7], [8, 9], [10, 11], [9, 11], [12, 13], [14, 15], [13, 15], [11, 15], [7, 15], [0, 14]];
  let mode = "label", gen = null, steps = 0, par = [], size = [], hot = [], k = 0, running = false, ran = {}, reached = false, line = "";
  function* quick() {
    for (const [a, b] of OPS) {
      const la = par[a], lb = par[b]; k++; hot = [a, b];
      if (la === lb) { steps++; yield `friends ${a} and ${b}: both already labelled ${la}, nothing to do`; continue; }
      for (let v = 0; v < n; v++) { steps++; if (par[v] === lb) par[v] = la; }
      yield `friends ${a} and ${b}: scan all ${n} people, relabel group ${lb} as ${la}`;
    }
    hot = [];
  }
  function find(x) {
    let r = x; while (par[r] !== r) { r = par[r]; steps++; }
    steps++;
    while (par[x] !== r) { const nx = par[x]; par[x] = r; x = nx; }
    return r;
  }
  function* dsu() {
    for (const [a, b] of OPS) {
      k++; hot = [a, b];
      let ra = find(a), rb = find(b);
      if (ra === rb) { yield `friends ${a} and ${b}: both lead to root ${ra}, already one group`; continue; }
      if (size[ra] < size[rb]) [ra, rb] = [rb, ra];
      par[rb] = ra; size[ra] += size[rb];
      yield `friends ${a} and ${b}: find roots, hang the smaller tree (root ${rb}) under the bigger (root ${ra})`;
    }
    hot = [];
  }
  function draw() {
    const kids = Array.from({ length: n }, () => []);
    for (let v = 0; v < n; v++) if (par[v] !== v) kids[par[v]].push(v);
    const pos = {}; let col = 0;
    const place = (v, d) => {
      if (!kids[v].length) { pos[v] = [col++, d]; return; }
      kids[v].forEach((c) => place(c, d + 1));
      const xs = kids[v].map((c) => pos[c][0]);
      pos[v] = [(Math.min(...xs) + Math.max(...xs)) / 2, d];
    };
    for (let v = 0; v < n; v++) if (par[v] === v) place(v, 0);
    for (let v = 0; v < n; v++) {
      const root = par[v] === v;
      W.box("p" + v, { x: -7.1 + pos[v][0] * 0.95, y: 3 - pos[v][1] * 1.6, z: 0, sx: 0.7, sy: 0.7, sz: 0.7, color: hot.includes(v) ? "c1" : root ? "c3" : "c5", glow: hot.includes(v) ? 0.4 : 0, opacity: 0.95,
        label: String(v), labelSize: 0.28, labelUp: 0,
        info: { title: `Person ${v}`, html: root ? `<p>A root: the name of a group of ${mode === "dsu" ? size[v] : par.filter((p) => p === v).length}.</p>` : `<p>${mode === "dsu" ? "Points at" : "Labelled"} ${par[v]}.</p>` } });
      if (root) W.unline("e" + v); else W.line("e" + v, "p" + v, "p" + par[v], { color: "line" });
    }
  }
  function show() { api.status(`${mode === "label" ? "relabel everyone" : "union-find"} · ${k} / ${OPS.length} friendships · ${steps} step${steps === 1 ? "" : "s"}\n${line}`); }
  function reset() { steps = 0; k = 0; hot = []; line = ""; par = [...Array(n).keys()]; size = Array(n).fill(1); gen = mode === "label" ? quick() : dsu(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = steps;
    if (mode === "label") api.explain(`${steps} steps`, `<p>Every merge scanned all ${n} people to rewrite one group's label. A million people and a million friendships would be 10¹² steps.</p><p>Switch to <b>union-find</b> and run it.</p>`);
    else if (ran.label && !reached) { reached = true; api.explain("Follow pointers to the root", `<p>${steps} steps instead of ${ran.label}. Each person keeps one pointer; a group is a tree and its root is its name. Union by size keeps trees shallow, and path compression flattens them every time you look something up.</p><p>Together they make each operation almost constant time, about α(n) ≤ 4 for any real input.</p>`); api.done("You merged groups with union-find"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(500); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "relabel everyone", value: "label" }, { label: "union-find", value: "dsu" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, 0.8, 0], dist: 20.5, theta: 0, phi: 1.5, instant: true });
  api.hud("each line points from a person to their parent · green = a root, the group's name · red = the two people just made friends");
  reset();
  api.explain("How to read this", `<p>Friendships arrive one by one; keep track of who is in which friend group. <b>Run all</b> with <b>relabel everyone</b>, then with <b>union-find</b>.</p>`);
});
