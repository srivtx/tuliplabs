/* Build your own X, chapter 2: a calculator.
   Type an expression, watch it become tokens, then a tree, then one number.
   The "why": precedence lives in the shape of the tree, not in the order you read it. */
VIZ.register("bx-calc", async (api) => {
  const W = await api.world3d();
  W.camera({ target: [0, -1.2, 0], dist: 18, theta: 0.25, phi: 1.25, instant: true });

  // ---- the same three stages the chapter has you write in Python
  function tokenize(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === " ") { i++; continue; }
      if (/[0-9.]/.test(c)) { let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++; out.push({ kind: "num", text: src.slice(i, j) }); i = j; continue; }
      if ("+-*/^()".includes(c)) { out.push({ kind: c === "(" || c === ")" ? "paren" : "op", text: c }); i++; continue; }
      throw new Error(`I don't know the character "${c}" (position ${i + 1})`);
    }
    return out;
  }
  function parse(tokens) {
    let p = 0;
    const peek = () => tokens[p] && tokens[p].text;
    const take = () => tokens[p++];
    function expr() { let n = term(); while (peek() === "+" || peek() === "-") { const op = take().text; n = { op, a: n, b: term() }; } return n; }
    function term() { let n = power(); while (peek() === "*" || peek() === "/") { const op = take().text; n = { op, a: n, b: power() }; } return n; }
    function power() { const base = unary(); if (peek() === "^") { take(); return { op: "^", a: base, b: power() }; } return base; }
    function unary() { if (peek() === "-") { take(); return { op: "neg", a: unary() }; } return atom(); }
    function atom() {
      const t = take();
      if (!t) throw new Error("The expression ends too early");
      if (t.kind === "num") return { num: parseFloat(t.text) };
      if (t.text === "(") { const n = expr(); if (take()?.text !== ")") throw new Error("A ( is never closed"); return n; }
      throw new Error(`Didn't expect "${t.text}" here`);
    }
    const tree = expr();
    if (p < tokens.length) throw new Error(`Leftover "${tokens[p].text}": is an operator missing?`);
    return tree;
  }
  const apply = (op, a, b) => ({ "+": a + b, "-": a - b, "*": a * b, "/": a / b, "^": a ** b, neg: -a })[op];
  function naive(tokens) { // what a "read left to right" calculator does: no precedence at all
    let acc = null, op = "+";
    for (const t of tokens) {
      if (t.kind === "num") acc = acc == null ? +t.text : apply(op, acc, +t.text);
      else if (t.kind === "op") op = t.text;
    }
    return acc;
  }
  const fmt = (v) => (Number.isInteger(v) ? String(v) : (+v.toFixed(4)).toString());

  // ---- drawing
  let tokens = [], tree = null, order = [], stepI = 0, triedDiff = false;
  const WHY = {
    num: (n) => `<p>A <b>leaf</b>. Numbers have no children, so they are already "evaluated".</p><p>Every path from the root ends in a number like this one: that's why evaluation always finishes.</p>`,
    "+": `<p><b>+</b> sits <i>high</i> in the tree because it binds loosely. Its children must be fully worked out first.</p><p>Why a tree and not a list? Because <code>2+3*4</code> must do the <code>*</code> first, and the tree says so by putting <code>*</code> lower.</p>`,
    "-": `<p><b>−</b> is left-associative: <code>8-3-2</code> means <code>(8-3)-2</code>. The parser's <i>while</i> loop builds the tree leaning left to get that right.</p>`,
    "*": `<p><b>*</b> binds tighter than + and −, so <code>term()</code> builds it <i>before</i> <code>expr()</code> sees the +. Deeper in the tree means computed earlier.</p>`,
    "/": `<p><b>/</b> lives at the same level as *. Same left-leaning rule: <code>8/4/2</code> is <code>(8/4)/2 = 1</code>, not 4.</p>`,
    "^": `<p><b>^</b> is right-associative: <code>2^3^2</code> is <code>2^(3^2) = 512</code>. That's why <code>power()</code> calls <i>itself</i> for the right side instead of looping.</p>`,
    neg: `<p>Unary minus. It has <b>one</b> child. Handling it in its own function stops <code>-2^2</code> from becoming 4 (the tree gives −4, like maths does).</p>`,
  };
  function layout(n, depth, ctr, list) {
    if (n.a) layout(n.a, depth + 1, ctr, list);
    n.x = ctr.i++ * 1.5; n.y = -depth * 1.7;
    if (n.b) layout(n.b, depth + 1, ctr, list);
    list.push(n);
    return list;
  }
  function draw() {
    W.clear();
    const span = (tokens.length - 1) * 1.25;
    tokens.forEach((t, i) => {
      W.box("t" + i, { x: i * 1.25 - span / 2, y: 2.6, z: 0, s: 0.9, color: t.kind === "num" ? "c2" : t.kind === "op" ? "c1" : "c5", label: t.text,
        info: { title: `Token: ${t.text} (${t.kind})`, html: `<p>The <b>tokenizer</b> turns characters into words. <code>12</code> is one token, not two, because digits that touch belong together.</p><p>Why bother? The parser can then ask "is the next thing an operator?" instead of fiddling with characters.</p>` } });
    });
    W.label("tl", "tokens", [-span / 2 - 1.8, 2.6, 0], { color: "muted", size: 0.4 });
    if (!tree) return;
    const nodes = layout(tree, 0, { i: 0 }, []);
    const mid = (Math.max(...nodes.map((n) => n.x)) + Math.min(...nodes.map((n) => n.x))) / 2;
    nodes.forEach((n, k) => {
      n.key = "n" + k;
      n.x -= mid;
      W.box(n.key, { x: n.x, y: n.y, z: 0, fromY: 2.6, s: 0.95, color: n.num != null ? "c2" : "c1", label: n.num != null ? fmt(n.num) : n.op === "neg" ? "−x" : n.op,
        info: { title: n.num != null ? `Number ${fmt(n.num)}` : `Operator ${n.op === "neg" ? "unary −" : n.op}`, html: n.num != null ? WHY.num(n) : WHY[n.op] } });
    });
    nodes.forEach((n) => { if (n.a) W.line(n.key + "a", n.key, n.a.key); if (n.b) W.line(n.key + "b", n.key, n.b.key); });
    order = nodes.filter((n) => n.num == null); // post-order: children always come before parents
    stepI = 0;
  }
  function step() {
    if (!tree || stepI >= order.length) return false;
    const n = order[stepI++];
    n.val = apply(n.op, n.a.val ?? n.a.num, n.b ? n.b.val ?? n.b.num : undefined);
    for (const c of [n.a, n.b]) if (c) W.box(c.key, { opacity: 0.25 });
    W.box(n.key, { color: "c3", label: fmt(n.val) }).flash(n.key);
    const left = fmt(n.a.val ?? n.a.num), right = n.b ? fmt(n.b.val ?? n.b.num) : "";
    api.status(`step ${stepI}/${order.length}:  ${n.op === "neg" ? "−" + left : left + " " + n.op + " " + right} = ${fmt(n.val)}` + (stepI === order.length ? `\n\nTree answer:      ${fmt(n.val)}\nLeft-to-right:    ${fmt(naive(tokens))}` : ""));
    if (stepI === order.length) finish(n.val);
    return true;
  }
  function finish(v) {
    const nv = naive(tokens);
    if (Math.abs(nv - v) > 1e-9) {
      api.explain("They disagree!", `<p>Reading left to right gives <b>${fmt(nv)}</b>, the tree gives <b>${fmt(v)}</b>.</p><p>That gap is exactly why calculators build a tree. Precedence isn't a rule you remember; it's the <i>shape</i> the parser builds.</p>`);
      if (!triedDiff) { triedDiff = true; api.done("You found where precedence matters"); }
    } else {
      api.explain("Same answer both ways", `<p>For this expression, reading left to right happens to work. Try one where a <code>*</code> or <code>^</code> comes <i>after</i> a <code>+</code>, like <code>1+2*3</code>.</p>`);
    }
  }
  function load(src) {
    try {
      tokens = tokenize(src);
      tree = null;
      draw();
      api.status(`${tokens.length} tokens: ` + tokens.map((t) => t.text).join("  "));
      api.hud("1 · tokenized");
    } catch (e) { api.status("⚠ " + e.message); }
  }
  function build() {
    try { tree = parse(tokens); draw(); api.hud("2 · parsed into a tree (deeper = computed first)"); api.status("Now press Step: each operator runs only once both its children are numbers."); }
    catch (e) { api.status("⚠ " + e.message); }
  }

  const input = api.text("Expression", "2+3*4^2", (v) => { load(v); build(); });
  api.button("1 · Tokenize", () => load(input.get()));
  api.button("2 · Parse", () => { if (!tokens.length) load(input.get()); build(); });
  api.button("3 · Step", () => { if (!tree) { load(input.get()); build(); } if (!step()) api.status("Done. Edit the expression and press Enter to try another."); }, { primary: true });
  api.button("Run all", async () => { if (!tree) { load(input.get()); build(); } while (step()) await api.sleep(450); });
  const r = api.row();
  for (const ex of ["1+2*3", "(1+2)*3", "8-3-2", "2^3^2", "-2^2"]) api.button(ex, () => { input.set(ex); load(ex); build(); }, { row: r });
  api.explain("How to read this", "<p><b>Top row:</b> tokens (blue numbers, red operators). <b>Below:</b> the parse tree. Press <b>Step</b> to evaluate from the bottom up.</p><p>Click any block to ask why it's there.</p>");
  load(input.get());
  build();
});
