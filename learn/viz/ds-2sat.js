/* DSA, chapter 55: 2-SAT.
   Four yes/no choices a, b, c, d and six rules, each "at least one of these two".
   The "why": trying every assignment costs 2^n. A rule (p or q) is the same as two implications:
   not p → q and not q → p. Put the 2n literals in a graph with those arrows. If x and not x land in
   the same strongly connected component, each forces the other and there's no answer. Otherwise
   answer from the component order: x is true when its component comes after not-x's (Kosaraju
   numbers components in topological order). O(n + m) instead of 2^n. */
VIZ.register("ds-2sat", async (api) => {
  const W = await api.world3d();
  const V = ["a", "b", "c", "d"], n = 4;
  // each rule is two literals [variable, wanted value]
  const R = [[[2, 1], [1, 1]], [[2, 1], [0, 0]], [[1, 1], [2, 0]], [[0, 1], [1, 0]], [[1, 0], [3, 1]], [[2, 0], [0, 1]]];
  const lit = (v, val) => 2 * v + (val ? 0 : 1), name = (L) => (L % 2 ? "¬" : "") + V[L >> 1];
  const E = [];
  for (const [[a, va], [b, vb]] of R) { E.push([lit(a, !va), lit(b, vb)]); E.push([lit(b, !vb), lit(a, va)]); }
  const COL = ["c3", "c2", "c4", "c1", "ink", "muted", "ok", "bad"];
  let mode = "brute", gen = null, ops = 0, shown = 0, comp = [], val = [], tried = -1, bad = -1, running = false, ran = {}, reached = false, line = "";
  const ruleText = ([[a, va], [b, vb]]) => `${va ? "" : "¬"}${V[a]} or ${vb ? "" : "¬"}${V[b]}`;
  function* brute() {
    for (let k = 0; k < 1 << n; k++) {
      tried = k; val = V.map((_, i) => (k >> i) & 1);
      let fail = -1;
      for (let r = 0; r < R.length; r++) { ops++; const [[a, va], [b, vb]] = R[r]; if (val[a] !== va && val[b] !== vb) { fail = r; break; } }
      bad = fail;
      const words = V.map((x, i) => `${x}=${val[i] ? "T" : "F"}`).join(" ");
      if (fail < 0) { yield `try ${k + 1} of ${1 << n}: ${words}. Every rule holds!`; return; }
      yield `try ${k + 1} of ${1 << n}: ${words}. Rule "${ruleText(R[fail])}" fails`;
    }
  }
  function* twosat() {
    for (let i = 0; i < E.length; i += 2) { shown = i + 2; ops += 2; const [[a, va], [b, vb]] = R[i / 2]; yield `rule "${ruleText(R[i / 2])}" = two arrows: ${name(E[i][0])} → ${name(E[i][1])} and ${name(E[i + 1][0])} → ${name(E[i + 1][1])}`; }
    // Kosaraju on the 8 literals
    const N = 2 * n, out = [...Array(N)].map(() => []), inn = [...Array(N)].map(() => []);
    for (const [x, y] of E) { out[x].push(y); inn[y].push(x); }
    const seen = new Array(N).fill(false), order = [];
    for (let s = 0; s < N; s++) {
      if (seen[s]) continue; seen[s] = true; const st = [[s, 0]];
      while (st.length) { const top = st[st.length - 1]; if (top[1] < out[top[0]].length) { const y = out[top[0]][top[1]++]; ops++; if (!seen[y]) { seen[y] = true; st.push([y, 0]); } } else { order.push(top[0]); st.pop(); } }
    }
    comp = new Array(N).fill(-1); let c = 0;
    for (let t = N - 1; t >= 0; t--) { const s = order[t]; if (comp[s] >= 0) continue; comp[s] = c; const st = [s]; while (st.length) { const x = st.pop(); for (const y of inn[x]) { ops++; if (comp[y] < 0) { comp[y] = c; st.push(y); } } } c++; }
    yield `strongly connected components (chapter 51): ${c} groups, numbered in arrow order`;
    for (let v = 0; v < n; v++) if (comp[2 * v] === comp[2 * v + 1]) { yield `${V[v]} and ¬${V[v]} share a group: each forces the other, so there's no answer`; return; }
    yield `no letter shares a group with its opposite, so an answer exists`;
    val = [];
    for (let v = 0; v < n; v++) { val[v] = comp[2 * v] > comp[2 * v + 1] ? 1 : 0; yield `${V[v]} = ${val[v] ? "true" : "false"}: ${val[v] ? V[v] : "¬" + V[v]}'s group comes later in arrow order (group ${Math.max(comp[2 * v], comp[2 * v + 1])} vs ${Math.min(comp[2 * v], comp[2 * v + 1])})`; }
    yield `answer ${V.map((x, i) => `${x}=${val[i] ? "T" : "F"}`).join(" ")} with ${ops} steps, every rule holds`;
  }
  function draw() {
    const ts = mode === "twosat";
    for (let L = 0; L < 2 * n; L++) {
      const v = L >> 1, neg = L % 2, c = comp[L];
      const chosen = val[v] !== undefined && (val[v] === 1) === !neg;
      W.box("L" + L, { x: -3 + v * 2, y: neg ? -1.4 : 1.4, z: 0, sx: 0.8, sy: 0.6, sz: 0.4, visible: ts || !neg,
        color: ts && c >= 0 ? COL[c % COL.length] : !ts && val[v] !== undefined ? (val[v] ? "c3" : "c5") : "c5", glow: ts && chosen ? 0.4 : 0, opacity: ts && val[v] !== undefined && !chosen ? 0.35 : 0.92,
        label: ts ? name(L) : val[v] === undefined ? V[v] : `${V[v]}=${val[v] ? "T" : "F"}`, labelSize: 0.24, labelUp: 0,
        info: { title: ts ? `Literal ${name(L)}` : `Choice ${V[v]}`, html: ts ? `<p>Arrows out of ${name(L)} say what must also be true if ${name(L)} is.</p>${c >= 0 ? `<p>In group ${c}. If ${name(L)} and its opposite were in one group, each would force the other.</p>` : ""}` : `<p>True or false. Four of these make 16 combinations; 30 would make a billion.</p>` } });
    }
    E.forEach(([x, y], i) => {
      if (!ts || i >= shown) { W.unline("e" + i); W.box("h" + i, { visible: false }); return; }
      const fresh = i >= shown - 2;
      W.line("e" + i, "L" + x, "L" + y, { color: fresh ? "c1" : "line" });
      const ax = -3 + (x >> 1) * 2, ay = x % 2 ? -1.4 : 1.4, bx = -3 + (y >> 1) * 2, by = y % 2 ? -1.4 : 1.4;
      W.box("h" + i, { x: ax + (bx - ax) * 0.78, y: ay + (by - ay) * 0.78, z: 0, sx: 0.14, sy: 0.14, sz: 0.14, color: fresh ? "c1" : "c5", visible: true });
    });
    R.forEach((r, i) => W.label("r" + i, mode === "brute" ? ruleText(r) : "", [-3.6 + i * 1.45, -2.3, 0.2], { color: i === bad ? "c1" : "muted", size: 0.17 }));
  }
  function show() { api.status(`${mode === "brute" ? "try every assignment" : "implication graph + SCC"} · ${ops} steps\n${line}`); }
  function reset() { ops = 0; shown = 0; comp = []; val = []; tried = -1; bad = -1; line = ""; gen = mode === "brute" ? brute() : twosat(); draw(); show(); }
  function step() {
    const r = gen.next();
    if (r.done) { draw(); show(); finish(); return false; }
    line = r.value; draw(); show(); return true;
  }
  function finish() {
    if (ran[mode]) return;
    ran[mode] = ops;
    if (mode === "brute") api.explain(`${tried + 1} of ${1 << n} tries`, `<p>The only answer was the very last combination. With n choices that's up to 2ⁿ tries: hopeless past about 30.</p><p>Switch to <b>implication graph + SCC</b> and run it.</p>`);
    else if (ran.brute && !reached) { reached = true; api.explain("Rules become arrows", `<p>Each "p or q" is two arrows: if not p then q, if not q then p. A choice and its opposite in the same group would force each other, so there'd be no answer. Otherwise each letter takes the side whose group comes later.</p><p>O(n + m), whatever n is.</p>`); api.done("You solved 2-SAT"); }
  }
  api.button("Step", () => { if (!running) step(); }, { primary: true });
  api.button("Run all", async () => { if (running) return; running = true; while (step()) await api.sleep(900); running = false; });
  api.button("Reset", () => { if (!running) reset(); });
  api.seg([{ label: "try every assignment", value: "brute" }, { label: "implication graph + SCC", value: "twosat" }], mode, (m) => { if (running) return; mode = m; reset(); });
  W.camera({ target: [0, -0.2, 0], dist: 10.5, theta: 0, phi: 1.5, instant: true });
  api.hud("six rules, each \"at least one of two\" · top row: a b c d · bottom row: their opposites · arrows: if this, then that · colours: groups");
  reset();
  api.explain("How to read this", `<p>Pick true or false for a, b, c, d so every rule holds. <b>Run all</b> with <b>try every assignment</b>, then with <b>implication graph + SCC</b>.</p>`);
});
