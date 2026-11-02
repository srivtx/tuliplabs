/* DSA, chapter 29: the 0/1 knapsack.
   A 10 kg bag and four items. Each item is taken whole or left. Maximise the value.
   The "why": greedy by value per kilo grabs the "best deal" first (the 6 kg item), and then nothing
   else fits well: 36. A DP table asks, for every prefix of items and every capacity 0..10, "best
   value?", and each cell is max(skip the item, take it + best for the capacity left). It finds 40
   (the two 5 kg items). n × W cells, each O(1): pseudo-polynomial and exact. */
VIZ.register("ds-knap", async (api) => {
  const W = await api.world3d();
  const CAP = 10;
  const IT = [{ n: "A", w: 6, v: 30, col: "c2" }, { n: "B", w: 5, v: 20, col: "c4" }, { n: "C", w: 5, v: 20, col: "c3" }, { n: "D", w: 2, v: 6, col: "c1" }];
  let mode = "greedy", gen = null, steps = 0, dp = [], cur = null, reads = [], verdict = {}, bag = [], path = new Set(), running = false, ran = {}, reached = false, line = "";
  const value = () => bag.reduce((s, i) => s + IT[i].v, 0), weight = () => bag.reduce((s, i) => s + IT[i].w, 0);
  function* greedy() {
    const order = [...IT.keys()].sort((a, b) => IT[b].v / IT[b].w - IT[a].v / IT[a].w);
    for (const i of order) {
      steps++; const it = IT[i]; cur = null;
      if (weight() + it.w <= CAP) { bag.push(i); verdict[i] = "in"; yield `${it.n}: £${it.v / it.w}/kg, best deal left, and it fits. Take it (${weight()} kg used)`; }
      else { verdict[i] = "out"; yield `${it.n}: £${it.v / it.w}/kg, but ${it.w} kg won't fit in the ${CAP - weight()} kg left. Leave it`; }
    }
    yield `greedy bag: ${bag.map((i) => IT[i].n).join(" + ")} = £${value()}`;
  }
  function* table() {
    dp = [Array(CAP + 1).fill(0)];
    for (let r = 1; r <= IT.length; r++) {
      dp[r] = [];
      const it = IT[r - 1];
      for (let c = 0; c <= CAP; c++) {
        steps++; cur = [r, c];
        const skip = dp[r - 1][c];
        if (it.w > c) { dp[r][c] = skip; reads = [[r - 1, c]]; yield `row ${it.n}, capacity ${c}: ${it.n} (${it.w} kg) doesn't fit, copy £${skip} from above`; continue; }
        const take = dp[r - 1][c - it.w] + it.v;
        dp[r][c] = Math.max(skip, take); reads = [[r - 1, c], [r - 1, c - it.w]];
        yield `row ${it.n}, capacity ${c}: max(skip £${skip}, take £${dp[r - 1][c - it.w]} + £${it.v} = £${take}) = £${dp[r][c]}`;
      }
    }
    reads = []; cur = null;
    let c = CAP;
    for (let r = IT.length; r >= 1; r--) {
      steps++; path.add(`${r}_${c}`); cur = [r, c];
      if (dp[r][c] !== dp[r - 1][c]) { bag.unshift(r - 1); verdict[r - 1] = "in"; c -= IT[r - 1].w; yield `walk back: £${dp[r][c + IT[r - 1].w]} differs from the row above, so ${IT[r - 1].n} was taken`; }
      else { verdict[r - 1] = "out"; yield `walk back: same as the row above, so ${IT[r - 1].n} wasn't needed`; }
    }
    cur = null;
    yield `best bag: ${bag.map((i) => IT[i].n).join(" + ")} = £${value()}`;
  }
  function draw() {
    const tb = mode === "table";
    for (let r = 0; r <= IT.length; r++) {
      if (r) W.label("h" + r, `${IT[r - 1].n}  ${IT[r - 1].w}kg £${IT[r - 1].v}`, [-5, 2.2 - r * 0.9, 0.3], { color: verdict[r - 1] === "in" ? "c3" : verdict[r - 1] === "out" ? "bad" : "ink", size: 0.26 });
      for (let c = 0; c <= CAP; c++) {
        const v = dp[r] && dp[r][c], hot = cur && cur[0] === r && cur[1] === c, rd = reads.some(([a, b]) => a === r && b === c);
        W.box(`t${r}_${c}`, { x: -3.2 + c * 0.82, y: 2.2 - r * 0.9, z: 0, sx: 0.76, sy: 0.8, sz: 0.3, color: hot ? "c1" : rd ? "c4" : path.has(`${r}_${c}`) ? "c3" : v !== undefined ? "c5" : "muted", glow: hot || rd ? 0.35 : 0, opacity: tb ? 0.95 : 0.15,
          label: tb && v !== undefined ? String(v) : "", labelSize: 0.22, labelUp: 0,
          info: { title: r ? `Items up to ${IT[r - 1].n}, capacity ${c} kg` : `No items, capacity ${c} kg`, html: `<p>Best value: ${v ?? "not filled yet"}.</p>` } });
      }
    }
    for (let c = 0; c <= CAP; c++) W.label("cap" + c, String(c), [-3.2 + c * 0.82, 2.85, 0.3], { color: "muted", size: 0.22 });
    let at = 0;
    for (let k = 0; k < CAP; k++) W.box("slot" + k, { x: -3.2 + (k + 0.5) * 0.82, y: -2.6, z: 0, sx: 0.8, sy: 0.6, sz: 0.2, color: "muted", opacity: 0.2 });
    IT.forEach((it, i) => {
      const inBag = bag.includes(i), x0 = at;
      if (inBag) at += it.w;
      W.box("item" + i, { x: -3.2 + (x0 + it.w / 2) * 0.82, y: -2.6, z: 0.2, sx: it.w * 0.82 - 0.06, sy: 0.6, sz: 0.4, color: it.col, visible: inBag, opacity: 0.95,
        label: `${it.n} £${it.v}`, labelSize: 0.24, labelUp: 0, info: { title: `Item ${it.n}`, html: `<p>${it.w} kg, worth £${it.v}.</p>` } });
    });
    W.label("bagl", `bag: ${weight()}/${CAP} kg, £${value()}`, [0.9, -3.3, 0.3], { color: "ink", size: 0.24 });
  }
  function show() { api.status(`${mode === "greedy" ? "greedy: best £ per kg first" : "DP table"} · ${steps} step${steps === 1 ? "" : "s"} · bag £${value()}\n${line}`); }
  function reset() { steps = 0; dp = []; cur = null; reads = []; verdict = {}; bag = []; path = new Set(); line = ""; gen = mode === "greedy" ? greedy() : table(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = value();
    if (mode === "greedy") api.explain(`£${value()}`, `<p>Greedy took A first because it's the best deal per kilo. But A's 6 kg left 4 kg that only D could use.</p><p>Switch to <b>DP table</b> and run it.</p>`);
    else if (ran.greedy && !reached) { reached = true; api.explain("Every capacity, every prefix", `<p>The table found £${value()} against greedy's £${ran.greedy}: B + C fill the bag exactly.</p><p>Each cell is max(skip the item, take it + the best for the capacity left). 5 × 11 cells, each O(1). Walking back from the corner tells you which items were taken.</p>`); api.done("You solved a 0/1 knapsack with a DP table"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(mode === "greedy" ? 700 : 170); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "greedy: best £ per kg", value: "greedy" }, { label: "DP table", value: "table" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, -0.1, 0], dist: 18, theta: 0, phi: 1.5, instant: true });
  api.hud("table: rows = items allowed so far, columns = capacity in kg, number = best value · red = filling now · amber = the cells it reads · bottom: the bag");
  reset();
  api.explain("How to read this", `<p>Fill a ${CAP} kg bag with the most value. Each item is taken whole or not at all. <b>Run all</b> with <b>greedy</b>, then with <b>DP table</b>.</p>`);
});
