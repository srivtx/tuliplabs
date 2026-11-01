/* Build your own X, chapter 3: a math engine.
   An expression tree; "Differentiate" grows the derivative tree one rule at a time.
   The "why": derivative rules only look at the top node, so recursion does the rest,
   and without simplification the tree explodes. */
VIZ.register("bx-symdiff", async (api) => {
  const W = await api.world3d();
  W.camera({ target: [0, -2, 0], dist: 18, theta: 0.12, phi: 1.33, instant: true });
  const GOAL_N = 12;
  let nid = 0;
  const N = (o) => Object.assign({ id: "n" + nid++ }, o);
  const num = (v, rule) => N({ t: "num", v, rule });
  const X = (rule) => N({ t: "x", rule });
  const op = (o, a, b, rule) => N({ t: "op", op: o, a, b, rule });
  const fn = (f, a, rule) => N({ t: "fn", fn: f, a, rule });
  const D = (u) => N({ t: "d", u });

  // ---------------------------------------------------------------- parsing --
  function parse(src) {
    const toks = src.match(/\d+\.?\d*|[a-z]+|[-+*/^()]/g) || [];
    if (toks.join("") !== src.replace(/\s+/g, "")) throw new Error("I only understand numbers, x, sin, cos, exp and + - * / ^ ( )");
    let p = 0;
    const peek = () => toks[p], take = () => toks[p++];
    function expr() { let n = term(); while (peek() === "+" || peek() === "-") { const o = take(); n = op(o, n, term()); } return n; }
    function term() { let n = unary(); while (peek() === "*" || peek() === "/") { const o = take(); n = op(o, n, unary()); } return n; }
    function unary() { if (peek() === "-") { take(); return op("neg", unary()); } return power(); }
    function power() { const b = atom(); if (peek() === "^") { take(); return op("^", b, unary()); } return b; }
    function atom() {
      const t = take();
      if (t == null) throw new Error("The expression ends too early");
      if (/^\d/.test(t)) return num(parseFloat(t));
      if (t === "x") return X();
      if (["sin", "cos", "exp"].includes(t)) { if (take() !== "(") throw new Error(t + " needs ( )"); const a = expr(); if (take() !== ")") throw new Error("missing )"); return fn(t, a); }
      if (t === "(") { const a = expr(); if (take() !== ")") throw new Error("missing )"); return a; }
      throw new Error(`Didn't expect "${t}" (only the variable x is allowed)`);
    }
    const e = expr();
    if (p < toks.length) throw new Error(`Leftover "${toks[p]}"`);
    return e;
  }
  const fmt = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(3)));
  const PREC = { "+": 1, "-": 1, "*": 2, "/": 2, neg: 3, "^": 4 };
  function show(e) {
    if (e.t === "num") return fmt(e.v);
    if (e.t === "x") return "x";
    if (e.t === "d") return `d[${show(e.u)}]`;
    if (e.t === "fn") return `${e.fn}(${show(e.a)})`;
    const wrap = (c, right) => { const s = show(c); if (c.t !== "op") return s; const pc = PREC[c.op], pp = PREC[e.op]; return pc < pp || (pc === pp && right && e.op !== "+" && e.op !== "*") || (e.op === "^" && !right && pc <= pp) ? `(${s})` : s; };
    if (e.op === "neg") return "-" + wrap(e.a, true);
    return `${wrap(e.a, false)}${e.op === "*" || e.op === "^" ? e.op : " " + e.op + " "}${wrap(e.b, true)}`;
  }
  const copy = (e) => e.t === "num" ? num(e.v, "copy") : e.t === "x" ? X("copy") : e.t === "fn" ? fn(e.fn, copy(e.a), "copy") : op(e.op, copy(e.a), e.b && copy(e.b), "copy");
  const count = (e) => (e.t === "op" || e.t === "fn" ? 1 + count(e.a) + (e.b ? count(e.b) : 0) : 1);
  const kids = (e) => (e.t === "op" ? (e.b ? [e.a, e.b] : [e.a]) : e.t === "fn" ? [e.a] : []);

  // --------------------------------------------- one derivative rule at a time --
  // Each rule only looks at the TOP of u and leaves new d[...] placeholders for the parts.
  function expand(u) {
    if (u.t === "num") return [num(0, "constant"), "constant"];
    if (u.t === "x") return [num(1, "x"), "x"];
    if (u.t === "fn") {
      const outer = u.fn === "sin" ? fn("cos", copy(u.a), "chain") : u.fn === "exp" ? fn("exp", copy(u.a), "chain") : op("neg", fn("sin", copy(u.a), "chain"), null, "chain");
      return [op("*", outer, D(u.a), "chain"), "chain"];
    }
    const { a, b } = u;
    switch (u.op) {
      case "+": case "-": return [op(u.op, D(a), D(b), "sum"), "sum"];
      case "neg": return [op("neg", D(a), null, "sum"), "sum"];
      case "*": return [op("+", op("*", D(a), copy(b), "product"), op("*", copy(a), D(b), "product"), "product"), "product"];
      case "/": return [op("/", op("-", op("*", D(a), copy(b), "quotient"), op("*", copy(a), D(b), "quotient"), "quotient"), op("^", copy(b), num(2, "quotient"), "quotient"), "quotient"), "quotient"];
      case "^":
        if (b.t !== "num") throw new Error("Only number exponents (like x^3) are supported");
        return [op("*", op("*", num(b.v, "power"), op("^", copy(a), num(b.v - 1, "power"), "power"), "power"), D(a), "power"), "power"];
    }
  }
  function firstD(e, parent, side) {
    if (e.t === "d") return { e, parent, side };
    if (e.a) { const r = firstD(e.a, e, "a"); if (r) return r; }
    if (e.b) { const r = firstD(e.b, e, "b"); if (r) return r; }
    return null;
  }

  // ------------------------------------------------------------ simplification --
  const isN = (e, v) => e.t === "num" && (v === undefined || Math.abs(e.v - v) < 1e-12);
  const FOLD = { "+": (x, y) => x + y, "-": (x, y) => x - y, "*": (x, y) => x * y, "/": (x, y) => x / y, "^": (x, y) => x ** y };
  function simp(e) {
    if (e.t === "num" || e.t === "x") return e;
    if (e.t === "fn") { const a = simp(e.a); return a === e.a ? e : fn(e.fn, a, e.rule); }
    if (e.op === "neg") {
      const a = simp(e.a);
      if (isN(a)) return num(-a.v, "folded");
      if (a.t === "op" && a.op === "neg") return a.a;
      return a === e.a ? e : op("neg", a, null, e.rule);
    }
    const a = simp(e.a), b = simp(e.b);
    if (isN(a) && isN(b) && !(e.op === "/" && b.v === 0)) return num(FOLD[e.op](a.v, b.v), "folded");
    switch (e.op) {
      case "+": if (isN(a, 0)) return b; if (isN(b, 0)) return a; break;
      case "-": if (isN(b, 0)) return a; if (isN(a, 0)) return op("neg", b, null, "folded"); break;
      case "*":
        if (isN(a, 0) || isN(b, 0)) return num(0, "folded");
        if (isN(a, 1)) return b; if (isN(b, 1)) return a;
        if (isN(b)) return op("*", b, a, "folded");                       // numbers go in front
        if (isN(a) && b.t === "op" && b.op === "*" && isN(b.a)) return op("*", num(a.v * b.a.v, "folded"), b.b, "folded"); // 2*(3*x) → 6*x
        break;
      case "/": if (isN(a, 0)) return num(0, "folded"); if (isN(b, 1)) return a; break;
      case "^": if (isN(b, 1)) return a; if (isN(b, 0)) return num(1, "folded"); break;
    }
    return a === e.a && b === e.b ? e : op(e.op, a, b, e.rule);
  }
  const simplifyAll = (e) => { let cur = e; for (let i = 0; i < 6; i++) { const nx = simp(cur); if (nx === cur) break; cur = nx; } return cur; };

  // ------------------------------------------------------------------ drawing --
  const RULE_WHY = {
    constant: `<p><b>Constant rule:</b> a number never changes as x changes, so its rate of change is <b>0</b>.</p>`,
    x: `<p><b>x rule:</b> x changes exactly as fast as x: the derivative of x is <b>1</b>. This is where every branch of the recursion stops.</p>`,
    sum: `<p><b>Sum rule:</b> d(u + v) = du + dv. If two things change, their total changes by both amounts. The rule only looks at the top <code>+</code> and leaves two smaller jobs: that's why recursion works.</p>`,
    product: `<p><b>Product rule:</b> d(u·v) = du·v + u·dv.</p><p>Why not just du·dv? Try u = v = x: x·x = x² has derivative 2x, but du·dv = 1·1 = 1. Wrong! Think of a rectangle u wide and v tall: growing u adds a strip du·v, growing v adds u·dv.</p>`,
    quotient: `<p><b>Quotient rule:</b> d(u/v) = (du·v − u·dv) / v². It's the product rule applied to u·v⁻¹, written out.</p>`,
    power: `<p><b>Power rule + chain:</b> d(uⁿ) = n·uⁿ⁻¹ · du. The exponent comes down, the power drops by one, and the trailing <code>d[u]</code> is the chain rule: if the inside is itself changing, multiply by how fast.</p>`,
    chain: `<p><b>Chain rule:</b> d(sin u) = cos u · du (and exp u · du, −sin u · du).</p><p>Why the extra <code>· du</code>? sin(x²) changes because x² changes. The outer function's rate (cos) is "per unit of u", so you multiply by how fast u moves. Forget it and d/dx sin(3x) would be cos(3x), three times too small.</p>`,
    copy: `<p>A <b>copy</b> of part of the original expression. The product and chain rules need the original <i>u</i> itself, not only its derivative. This copying is why derivative trees grow so fast.</p>`,
    folded: `<p>Made by <b>simplification</b>: constant folding (2·3 → 6) or an identity (x·1 → x, x+0 → x, 0·x → 0).</p>`,
  };
  const NODE_WHY = {
    num: (e) => `<p>The number <b>${fmt(e.v)}</b>, a leaf.</p>`,
    x: () => `<p>The variable <b>x</b>, a leaf. Evaluate it by looking x up in an environment, like <code>{"x": 2}</code>.</p>`,
    op: (e) => `<p>The operator <b>${e.op === "neg" ? "unary −" : e.op}</b>. Its children are worked out first.</p>`,
    fn: (e) => `<p>The function <b>${e.fn}</b> with one child, its argument.</p>`,
  };
  let src = "x*sin(x)", input = null, deriv = null, used = new Set(), lastStep = new Set(), simplifyOn = false, steps = 0, drawn = new Set(), drawnLines = new Set(), running = false;
  const doneOnce = { v: false };

  function labelOf(e) {
    if (e.t === "num") return fmt(e.v);
    if (e.t === "x") return "x";
    if (e.t === "fn") return e.fn;
    if (e.t === "d") { const s = show(e.u); return s.length <= 12 ? `d[${s}]` : "d[…]"; }
    return e.op === "neg" ? "−" : e.op === "*" ? "×" : e.op;
  }
  function infoOf(e, isInput) {
    if (e.t === "d") return { title: `d[${show(e.u)}]: still to do`, html: `<p>A <b>placeholder</b>: the derivative of <code>${show(e.u)}</code>, not computed yet.</p><p>Press <b>Step rule</b>: the engine looks only at the <i>top</i> of <code>${show(e.u)}</code> (${e.u.t === "op" ? e.u.op : e.u.t === "fn" ? e.u.fn : e.u.t}), picks one rule, and leaves smaller placeholders for the children. You never need a rule for a whole expression, only for one operator.</p>` };
    const base = NODE_WHY[e.t](e);
    const r = !isInput && e.rule ? RULE_WHY[e.rule] || "" : "";
    return { title: isInput ? `Input: ${labelOf(e)}` : `${labelOf(e)} · made by: ${e.rule || "input"}`, html: base + r };
  }
  function layout(e, depth, ctr, out) {
    const ks = kids(e);
    if (ks.length === 2) { layout(ks[0], depth + 1, ctr, out); e._x = ctr.i++ * 1.35; layout(ks[1], depth + 1, ctr, out); }
    else if (ks.length === 1) { layout(ks[0], depth + 1, ctr, out); e._x = ks[0]._x; ctr.i += 0; }
    else e._x = ctr.i++ * 1.35;
    e._y = -depth * 1.6;
    out.push(e);
    return out;
  }
  function placeTree(e, x0, isInput, fromKey) {
    const nodes = layout(e, 0, { i: 0 }, []);
    const xs = nodes.map((n) => n._x), mn = Math.min(...xs), mx = Math.max(...xs);
    const keys = [];
    for (const n of nodes) {
      const k = (isInput ? "i" : "") + n.id;
      const from = fromKey && W.pos(fromKey);
      const col = n.t === "d" ? "c4" : n.t === "num" || n.t === "x" ? "c2" : "c1";
      const fresh = lastStep.has(n.id);
      W.box(k, { x: x0 + n._x - mn, y: n._y, z: 0, s: n.t === "d" ? 0.95 : 0.85, color: col, glow: fresh ? 0.35 : 0, opacity: isInput && deriv ? 0.55 : 1,
        label: fresh && n === freshRoot ? `${labelOf(n)}\n${n.rule}` : labelOf(n), labelSize: 0.36, info: infoOf(n, isInput),
        ...(from && !W.has(k) ? { fromX: from.x, fromY: from.y, fromZ: 0 } : {}) });
      keys.push(k);
      for (const c of kids(n)) { const lk = k + "-" + c.id; W.line(lk, k, (isInput ? "i" : "") + c.id); keys.push("L:" + lk); }
    }
    return { keys, width: mx - mn, depth: Math.max(...nodes.map((n) => -n._y)) };
  }
  let freshRoot = null, freshFrom = null;
  function shown() { return deriv && !firstD(deriv) && simplifyOn ? simplifyAll(deriv) : deriv; }
  function draw() {
    const now = new Set(), lines = new Set();
    const A = placeTree(input, 0, true);
    let total = A.width, depth = A.depth;
    A.keys.forEach((k) => (k.startsWith("L:") ? lines.add(k.slice(2)) : now.add(k)));
    W.label("lin", "f(x) = " + show(input), [A.width / 2, 1.5, 0], { color: "muted", size: 0.42 });
    if (deriv) {
      const x0 = A.width + 3.2;
      const B = placeTree(shown(), x0, false, freshFrom);
      B.keys.forEach((k) => (k.startsWith("L:") ? lines.add(k.slice(2)) : now.add(k)));
      total = x0 + B.width; depth = Math.max(depth, B.depth);
      W.label("lde", simplifyOn && !firstD(deriv) ? "f'(x), simplified" : "f'(x)", [x0 + B.width / 2, 1.5, 0], { color: "muted", size: 0.42 });
    } else W.label("lde", null);
    for (const k of drawn) if (!now.has(k)) W.remove(k);
    for (const k of drawnLines) if (!lines.has(k)) W.unline(k);
    drawn = now; drawnLines = lines;
    const span = Math.max(total, depth * 1.9);
    W.camera({ target: [total / 2, -depth / 2 + 0.3, 0], dist: Math.max(13, span * 1.15 + 6) });
    report();
  }
  function report(extra) {
    let s = `f(x)  = ${show(input)}   (${count(input)} nodes)`;
    if (deriv) {
      const pending = firstD(deriv);
      s += `\nf'(x) = ${show(deriv)}\n\nrules applied: ${steps}   used: ${[...used].join(", ") || "none yet"}`;
      if (pending) s += `\nstill to do: ${show(pending.e)}`;
      else {
        const raw = count(deriv), sm = count(simplifyAll(deriv));
        s += `\n\nraw derivative:  ${raw} nodes\nsimplified:      ${sm} nodes   = ${show(simplifyAll(deriv))}`;
      }
    }
    if (extra) s += "\n" + extra;
    api.status(s);
    const raw = deriv ? count(deriv) : 0;
    api.hud(deriv ? `nodes: f <b>${count(input)}</b> · f' raw <b>${raw}</b>${!firstD(deriv) ? ` · simplified <b>${count(simplifyAll(deriv))}</b>` : ""}` : `nodes: <b>${count(input)}</b>`);
  }
  function checkGoal() {
    if (!deriv || firstD(deriv) || !simplifyOn || doneOnce.v) return;
    const raw = count(deriv), sm = count(simplifyAll(deriv));
    if ((used.has("product") || used.has("chain")) && sm <= GOAL_N && sm < raw) {
      doneOnce.v = true;
      api.explain("Simplified!", `<p>The rules produced <b>${raw}</b> nodes; simplification brought it down to <b>${sm}</b>: <code>${show(simplifyAll(deriv))}</code>.</p><p>The rules are mechanical, so they leave junk like <code>×1</code> and <code>0×x</code>. Simplifying isn't cosmetic: take the derivative again without it and the junk gets copied and differentiated too. Try <b>d/dx again</b> with simplify off.</p>`);
      api.done(`Derivative simplified from ${raw} to ${sm} nodes`);
    }
  }
  function load(s) {
    try {
      input = parse(s); src = s; deriv = null; used = new Set(); lastStep = new Set(); steps = 0; freshRoot = null; freshFrom = null;
      draw();
      api.explain("The expression tree", `<p>This is <code>${show(input)}</code> as a tree, exactly like the calculator in chapter 2, except a leaf can be the variable <b>x</b>.</p><p>Press <b>Differentiate</b> to watch the derivative grow one rule at a time.</p>`);
    } catch (e) { api.status("⚠ " + e.message); }
  }
  function stepRule() {
    if (!input) return false;
    if (!deriv) { deriv = D(input); lastStep = new Set([deriv.id]); freshRoot = null; freshFrom = null; draw(); report("Started: f'(x) = d[f]. Each Step applies one rule."); return true; }
    const hole = firstD(deriv);
    if (!hole) return false;
    let made, rule;
    try { [made, rule] = expand(hole.e.u); } catch (e) { api.status("⚠ " + e.message); return false; }
    used.add(rule); steps++;
    lastStep = new Set(); (function mark(n) { if (n.t !== "d" && n.rule !== "copy") lastStep.add(n.id); if (n.a) mark(n.a); if (n.b) mark(n.b); })(made);
    freshRoot = made; freshFrom = hole.e.id;
    if (hole.parent) hole.parent[hole.side] = made; else deriv = made;
    draw();
    W.flash(made.id);
    const info = infoOf(made, false);
    api.explain(`Step ${steps}: ${rule} rule on ${show(hole.e.u)}`, info.html);
    if (!firstD(deriv)) { report(simplifyOn ? "" : "Done! Now switch Simplify on."); checkGoal(); }
    return true;
  }

  const inputBox = api.text("f(x) =", src, (v) => load(v));
  api.button("Differentiate (step rule)", () => { if (!running) stepRule(); }, { primary: true });
  api.button("Run all rules", async () => { if (running) return; running = true; try { let g = 0; while (stepRule() && g++ < 400) await api.sleep(420); } finally { running = false; } });
  api.button("d/dx again", () => {
    if (!deriv || firstD(deriv)) { api.status("Finish the derivative first, then differentiate the result again."); return; }
    const next = shown();
    if (count(next) > 160) { api.status("That tree is already huge. This is the explosion: turn Simplify on and try again."); return; }
    const s = show(next); inputBox.set(s); load(s);
    report(`Now differentiating f'(x). With simplify ${simplifyOn ? "on" : "OFF"} the input has ${count(input)} nodes.`);
  });
  api.seg([{ label: "Simplify: off", value: false }, { label: "Simplify: on", value: true }], false, (v) => {
    simplifyOn = v;
    if (!deriv || firstD(deriv)) { report(v ? "Simplification runs once the derivative is complete." : ""); return; }
    lastStep = new Set(); freshRoot = null; draw(); checkGoal();
  });
  const r = api.row();
  for (const ex of ["x*sin(x)", "sin(x^2)", "x^3+2*x", "exp(3*x)", "sin(x)*exp(x^2)"]) api.button(ex, () => { if (!running) { inputBox.set(ex); load(ex); } }, { row: r });
  load(src);
  api.explain("How to read this", `<p><b>Left:</b> the expression tree for f(x). Blue leaves are numbers and x, red blocks are operators and functions.</p><p>Press <b>Differentiate</b> repeatedly. An orange <code>d[…]</code> block is a derivative still to compute; each press replaces one with the rule for its top operator (glowing blocks are new, tagged with the rule). Then flip <b>Simplify</b> and compare node counts.</p>`);
});
