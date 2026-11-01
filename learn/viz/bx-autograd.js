/* Build your own X, chapter 13: a neural-network framework (autograd from scratch).
   Graph mode: a neuron's computation graph; forward fills values (blue), backward sends gradients
   (amber) from the output back to every input in one pass.
   Train mode: a 2-2-1 network learning XOR; every weight is a block that grows and changes colour.
   The "why": one reverse pass gives every gradient, instead of one nudge per parameter. */
VIZ.register("bx-autograd", async (api) => {
  const W = await api.world3d();

  // ---- a tiny Value class, the same shape as the one you write in Python
  let uid = 0;
  class V {
    constructor(data, kids = [], op = "", name = "") { this.data = data; this.grad = 0; this.kids = kids; this.op = op; this.name = name; this.id = uid++; this.back = () => {}; }
    add(o) { o = o instanceof V ? o : new V(o); const out = new V(this.data + o.data, [this, o], "+"); out.back = () => { this.grad += out.grad; o.grad += out.grad; }; return out; }
    mul(o) { o = o instanceof V ? o : new V(o); const out = new V(this.data * o.data, [this, o], "*"); out.back = () => { this.grad += o.data * out.grad; o.grad += this.data * out.grad; }; return out; }
    tanh() { const t = Math.tanh(this.data), out = new V(t, [this], "tanh"); out.back = () => { this.grad += (1 - t * t) * out.grad; }; return out; }
    topo() { const seen = new Set(), order = []; const visit = (v) => { if (seen.has(v)) return; seen.add(v); v.kids.forEach(visit); order.push(v); }; visit(this); return order; }
    backward() { const order = this.topo(); order.forEach((v) => (v.grad = 0)); this.grad = 1; for (const v of order.reverse()) v.back(); }
  }
  const f2 = (x) => (Math.abs(x) < 1e-12 ? "0" : x.toFixed(2));

  // ---- graph mode
  const EXPRS = {
    neuron: { label: "neuron: tanh(x1·w1 + x2·w2 + b)", build(L) { const n = L.x1.mul(L.w1).add(L.x2.mul(L.w2)).add(L.b); return n.tanh(); }, leaves: { x1: 2, w1: -3, x2: 0, w2: 1, b: 6.8814 } },
    reuse: { label: "reuse: a·b + a", build(L) { return L.a.mul(L.b).add(L.a); }, leaves: { a: 3, b: -2 } },
  };
  let exprKey = "neuron", out = null, nodes = [], phase = "empty", ranBackward = false, busy = false, view = "graph";
  function buildGraph() {
    uid = 0;
    const E = EXPRS[exprKey], L = {};
    for (const [k, v] of Object.entries(E.leaves)) L[k] = new V(v, [], "", k);
    out = E.build(L);
    nodes = out.topo();
    // depth = longest path from a leaf, so data always flows left to right
    const depth = new Map();
    for (const v of nodes) depth.set(v, v.kids.length ? 1 + Math.max(...v.kids.map((k) => depth.get(k))) : 0);
    const maxD = Math.max(...depth.values()), cols = {};
    for (const v of nodes) (cols[depth.get(v)] = cols[depth.get(v)] || []).push(v);
    for (const [d, list] of Object.entries(cols)) list.forEach((v, i) => { v.x = (d - maxD / 2) * 2.7; v.y = ((list.length - 1) / 2 - i) * 1.9; });
    W.clear();
    for (const v of nodes) drawNode(v, false, false);
    for (const v of nodes) v.kids.forEach((k, i) => W.line(`e${v.id}_${i}`, "n" + k.id, "n" + v.id, { color: "line" }));
    W.camera({ target: [0, 0, 0], dist: 15, theta: 0.18, phi: 1.35 });
    phase = "empty";
    api.hud(EXPRS[exprKey].label + "<br>press <b>Forward</b>, then <b>Backward</b>");
  }
  function nodeName(v) { return v.name || (v.op === "tanh" ? "tanh" : v.op); }
  function drawNode(v, showData, showGrad) {
    const leaf = !v.kids.length;
    let label = nodeName(v);
    if (showData) label += `\ndata ${f2(v.data)}`;
    if (showGrad) label += `\ngrad ${f2(v.grad)}`;
    W.box("n" + v.id, { x: v.x, y: v.y, z: 0, s: 0.9, color: showGrad ? "c4" : showData ? "c2" : leaf ? "c5" : "c1", glow: showGrad ? 0.25 : 0, label, labelSize: 0.3, info: { title: nodeTitle(v), html: nodeWhy(v) } });
  }
  function nodeTitle(v) { return v.kids.length ? `Operation ${nodeName(v)}` : `Input ${v.name}`; }
  function nodeWhy(v) {
    const g = phase === "backward" ? ` Here: ` : "";
    if (!v.kids.length) {
      const reused = nodes.filter((p) => p.kids.includes(v)).length + nodes.filter((p) => p.kids.filter((k) => k === v).length > 1).length;
      return `<p>A leaf: a number you supply (an input or a weight). data = <b>${f2(v.data)}</b>${phase === "backward" ? `, grad = <b>${f2(v.grad)}</b>` : ""}.</p><p><b>grad</b> answers: if I nudge this number up by a tiny h, how much does the output move? About <code>grad × h</code>. Training follows that arrow downhill.</p>` +
        (reused > 1 ? `<p>This value is used <b>twice</b>, so it receives gradient from both uses. That's why <code>backward</code> does <code>grad +=</code>, not <code>grad =</code>: with <code>=</code> the second path would overwrite the first.</p>` : "");
    }
    const [a, b] = v.kids;
    const done = phase === "backward";
    if (v.op === "+") return `<p><b>Rule for +</b>: <code>out = a + b</code>, so ∂out/∂a = 1 and ∂out/∂b = 1.</p><p>A plus node just <b>copies</b> its gradient to both inputs.${done ? ` Here both get <b>${f2(v.grad)}</b>.` : ""}</p>`;
    if (v.op === "*") return `<p><b>Rule for ×</b>: <code>out = a · b</code>, so ∂out/∂a = b and ∂out/∂b = a.</p><p>Each input's gradient is the <b>other</b> input times the gradient coming in.${done ? ` Here: ${nodeName(a)} gets ${f2(b.data)} × ${f2(v.grad)} = ${f2(b.data * v.grad)}, ${nodeName(b)} gets ${f2(a.data)} × ${f2(v.grad)} = ${f2(a.data * v.grad)}.` : ""}</p><p>Why multiply by the incoming gradient? That's the <b>chain rule</b>: effects along a path multiply.</p>`;
    if (v.op === "tanh") return `<p><b>Rule for tanh</b>: <code>t = tanh(x)</code>, ∂t/∂x = 1 − t².</p><p>When the neuron is saturated (t near ±1) this is near 0, so almost no gradient gets through. That's the "vanishing gradient" problem; ReLU avoids it for positive inputs.${done ? ` Here 1 − ${f2(v.data)}² = ${f2(1 - v.data * v.data)}.` : ""}</p>`;
    return "";
  }
  async function forward() {
    if (busy) return;
    busy = true;
    for (const v of nodes) drawNode(v, false, false);
    phase = "forward";
    for (const v of nodes) { // topological order: every node after its inputs
      drawNode(v, true, false);
      W.flash("n" + v.id);
      api.status(v.kids.length ? `${nodeName(v)}(${v.kids.map((k) => f2(k.data)).join(", ")}) = ${f2(v.data)}` : `${v.name} = ${f2(v.data)}`);
      await api.sleep(320);
    }
    api.status(`Forward pass done: output = ${f2(out.data)}.\nEvery node now remembers its value: the backward pass needs them.`);
    phase = "forwarded";
    busy = false;
  }
  async function backward() {
    if (busy) return;
    if (phase === "empty") await forward();
    busy = true;
    out.backward();
    const order = out.topo().reverse();
    const shown = new Set();
    for (const v of nodes) drawNode(v, true, false);
    phase = "backward";
    for (const v of order) {
      drawNode(v, true, true); shown.add(v);
      W.flash("n" + v.id);
      api.status(v === out ? "Start: grad of the output with respect to itself is 1." : `${nodeName(v)}.grad = ${f2(v.grad)}`);
      v.kids.forEach((k, i) => W.box(`pk${v.id}_${i}`, { x: k.x, y: k.y, z: 0, fromX: v.x, fromY: v.y, fromZ: 0, s: 0.3, color: "c4", glow: 0.6 }));
      await api.sleep(420);
      v.kids.forEach((k, i) => W.remove(`pk${v.id}_${i}`));
    }
    const leaves = nodes.filter((v) => !v.kids.length);
    api.status(`One backward pass gave all ${leaves.length} gradients:\n` + leaves.map((v) => `  ∂out/∂${v.name} = ${f2(v.grad)}`).join("\n") + "\nClick any node to see its local rule.");
    ranBackward = true;
    busy = false;
    checkGoal();
  }
  function gradCheck() {
    if (phase !== "backward") { api.status("Run Backward first, then check it."); return; }
    const E = EXPRS[exprKey], h = 1e-5, lines = [];
    let worst = 0;
    for (const name of Object.keys(E.leaves)) {
      const f = (dx) => { const L = {}; for (const [k, v] of Object.entries(E.leaves)) L[k] = new V(v + (k === name ? dx : 0)); return E.build(L).data; };
      const num = (f(h) - f(-h)) / (2 * h), an = nodes.find((v) => v.name === name).grad;
      worst = Math.max(worst, Math.abs(num - an));
      lines.push(`  ${name.padEnd(3)} backprop ${an.toFixed(5).padStart(9)}   nudge ${num.toFixed(5).padStart(9)}`);
    }
    api.status("Gradient check: (f(x+h) − f(x−h)) / 2h with h = 1e-5\n" + lines.join("\n") + `\nworst difference ${worst.toExponential(1)} ✓`);
    api.explain("Why check with nudges?", `<p>Nudging each input and re-running the whole expression gives the gradient too, with no calculus. But it costs <b>2 forward passes per parameter</b>: ${Object.keys(E.leaves).length * 2} here, 2 million for a million-weight network.</p><p>Backprop got all of them from <b>one</b> backward pass. We use the slow way only as a test that the fast way has no bugs.</p>`);
  }

  // ---- train mode: a 2-2-1 net on XOR
  const XS = [[0, 0], [0, 1], [1, 0], [1, 1]], YS = [-1, 1, 1, -1];
  let params = [], seed = 3, lr = 0.3, epoch = 0, loss = NaN, history = [], training = false, bestLoss = Infinity;
  function rng(s) { return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function initNet() {
    const r = rng(seed);
    const mk = (name) => new V(r() * 2 - 1, [], "", name);
    params = ["w11", "w12", "b1", "w21", "w22", "b2", "v1", "v2", "c"].map(mk);
    epoch = 0; history = []; loss = NaN; bestLoss = Infinity;
  }
  function netOut(x) {
    const [w11, w12, b1, w21, w22, b2, v1, v2, c] = params;
    const h1 = w11.mul(x[0]).add(w12.mul(x[1])).add(b1).tanh();
    const h2 = w21.mul(x[0]).add(w22.mul(x[1])).add(b2).tanh();
    return { o: v1.mul(h1).add(v2.mul(h2)).add(c).tanh(), h1, h2 };
  }
  function trainStep() {
    let L = new V(0);
    for (let i = 0; i < 4; i++) { const d = netOut(XS[i]).o.add(-YS[i]); L = L.add(d.mul(d)); }
    L = L.mul(0.25);
    L.backward();
    for (const p of params) p.data -= lr * p.grad; // gradient descent: step downhill
    loss = L.data; epoch++;
    bestLoss = Math.min(bestLoss, loss);
    history.push(loss);
  }
  const NPOS = { x1: [-4.5, 1.2], x2: [-4.5, -1.2], h1: [0, 1.6], h2: [0, -1.6], o: [4.5, 0] };
  const WMAP = { w11: ["x1", "h1"], w12: ["x2", "h1"], w21: ["x1", "h2"], w22: ["x2", "h2"], v1: ["h1", "o"], v2: ["h2", "o"] };
  const BMAP = { b1: "h1", b2: "h2", c: "o" };
  function drawNet(first) {
    if (first) {
      W.clear();
      for (const [k, [x, y]] of Object.entries(NPOS)) W.box("N" + k, { x, y, z: 0, s: 0.8, color: k[0] === "x" ? "c5" : "c1", label: k, labelSize: 0.32,
        info: { title: k[0] === "x" ? `Input ${k}` : `Neuron ${k}`, html: k[0] === "x" ? "<p>One of the two bits of the XOR question. Inputs are fixed data, so they get no update.</p>" : "<p>A <b>Neuron</b> object: it owns its weights and bias and computes <code>tanh(Σ wᵢxᵢ + b)</code>. A <b>Layer</b> is a list of neurons, an <b>MLP</b> a list of layers.</p><p>Why a hidden layer at all? XOR isn't linearly separable: no single straight line splits the 1s from the 0s, so one neuron alone can never learn it. Two hidden neurons each draw a line, and the output combines them.</p>" } });
      for (const [k, [a, b]] of Object.entries(WMAP)) { W.line("L" + k + "a", "N" + a, "W" + k, { color: "line" }); W.line("L" + k + "b", "W" + k, "N" + b, { color: "line" }); }
      for (const [k, n] of Object.entries(BMAP)) W.line("L" + k, "W" + k, "N" + n, { color: "line" });
      W.camera({ target: [2.2, -0.4, 0], dist: 21, theta: 0.1, phi: 1.3 });
    }
    params.forEach((p) => {
      const k = p.name;
      let x, y;
      if (WMAP[k]) { const [a, b] = WMAP[k]; x = (NPOS[a][0] + NPOS[b][0]) / 2; y = (NPOS[a][1] + NPOS[b][1]) / 2 + (k === "w12" ? -0.5 : k === "w21" ? 0.5 : 0); }
      else { const n = NPOS[BMAP[k]]; x = n[0]; y = n[1] + (n[1] >= 0 ? 1.3 : -1.3); }
      const s = 0.22 + Math.min(1, Math.abs(p.data) / 4) * 0.75;
      W.box("W" + k, { x, y, z: 0, s, color: p.data >= 0 ? "c2" : "c1", label: `${k} ${p.data.toFixed(2)}`, labelSize: 0.24,
        info: { title: `Parameter ${k}`, html: `<p>Value <b>${p.data.toFixed(3)}</b>, last gradient <b>${p.grad.toFixed(3)}</b>. Blue = positive, red = negative, size = how big.</p><p>Each training step does <code>p.data -= lr * p.grad</code>: move against the gradient, because the gradient points uphill on the loss.</p>` } });
    });
    XS.forEach((x, i) => {
      const o = params.length ? netOut(x).o.data : 0, good = Math.sign(o) === Math.sign(YS[i]) && Math.abs(o - YS[i]) < 0.5;
      W.box("P" + i, { x: 8, y: 1.9 - i * 1.25, z: 0, sx: 0.25 + Math.abs(o) * 1.2, sy: 0.6, sz: 0.6, color: good ? "c3" : "c5", label: `${x[0]},${x[1]} → ${o.toFixed(2)} (want ${YS[i]})`, labelSize: 0.24,
        info: { title: `XOR(${x[0]}, ${x[1]})`, html: `<p>The network's answer for this input is <b>${o.toFixed(3)}</b>; the target is <b>${YS[i]}</b>. Green once it's close.</p><p>The loss averages <code>(answer − target)²</code> over all four cases, so one backward pass of the loss gives the gradient for all four at once.</p>` } });
    });
    const bar = history.length ? "▁▂▃▄▅▆▇█" : "";
    const recent = history.filter((_, i) => i % Math.max(1, Math.floor(history.length / 30)) === 0).slice(-30);
    const mx = Math.max(...recent, 1e-9);
    api.hud(`XOR · epoch ${epoch} · lr ${lr}<br>loss <b>${isNaN(loss) ? "–" : loss.toFixed(4)}</b> ${recent.map((l) => bar[Math.min(7, Math.floor((l / mx) * 7.99))]).join("")}`);
  }
  async function train(n, until) {
    if (training) { training = false; return; }
    training = true;
    for (let i = 0; i < n && training; i++) {
      for (let k = 0; k < 10; k++) trainStep();
      if (i % 2 === 0 || i === n - 1) { drawNet(false); await api.sleep(16); }
      if (until && loss < 0.02) break;
      if (!isFinite(loss)) break;
    }
    training = false;
    drawNet(false);
    api.status(`epoch ${epoch}, loss ${loss.toFixed(4)}` + (loss < 0.05 ? "  ✓ below 0.05" : "") + (lr > 1.5 ? "\nlr is big: steps overshoot, so the loss can bounce around." : lr < 0.05 ? "\nlr is tiny: each step is safe but it takes forever." : ""));
    checkGoal();
  }
  function checkGoal() {
    if (ranBackward && loss < 0.05) api.done("Backprop, then a trained XOR network");
    else if (!ranBackward && loss < 0.05) api.status(api.root.querySelector(".vz-status").textContent + "\nNow go to Graph and run Backward too.");
  }

  // ---- controls
  let graphCtl = [], trainCtl = [];
  api.seg([{ label: "Graph", value: "graph" }, { label: "Train XOR", value: "train" }], view, (v) => {
    view = v; training = false;
    if (v === "graph") { buildGraph(); api.status("Forward fills values, Backward fills gradients."); }
    else { if (!params.length) initNet(); drawNet(true); api.status("Press Train. Each tick runs forward over all 4 cases, backward once, then nudges every weight."); }
  });
  api.seg([{ label: "Neuron", value: "neuron" }, { label: "a·b + a", value: "reuse" }], exprKey, (v) => { exprKey = v; if (view === "graph") buildGraph(); });
  api.button("Forward", () => { if (view !== "graph") return; forward(); });
  api.button("Backward", () => { if (view !== "graph") return; backward(); }, { primary: true });
  api.button("Gradient check", () => { if (view === "graph") gradCheck(); });
  const r2 = api.row();
  api.button("Train 100", () => { if (view === "train") train(10, false); }, { row: r2 });
  api.button("Train until loss < 0.02", () => { if (view === "train") train(400, true); }, { row: r2, primary: true });
  api.button("New random weights", () => { if (view === "train") { seed++; initNet(); drawNet(false); api.status(`New starting weights (seed ${seed}). Some starts get stuck in a bad valley: that's real too.`); } }, { row: r2 });
  api.slider("Learning rate", { min: 0.01, max: 3, step: 0.01, value: lr }, (v) => { lr = v; });
  api.explain("How to read this", "<p>Each block is one <b>Value</b>: grey = inputs you give, red = operations. Lines show which values feed which.</p><p><b>Forward</b> computes every value left to right (blue). <b>Backward</b> starts at the output with grad 1 and sends gradients right to left (amber). Click a block for its derivative rule. Then switch to <b>Train XOR</b>.</p>");
  buildGraph();
  initNet();
});
